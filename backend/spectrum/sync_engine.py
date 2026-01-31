# backend/spectrum/sync_engine.py
"""
High-performance Spectrum sync engine (PostgreSQL optimized).

Design goals:
- Pull from Spectrum endpoints in bulk (divisions / statuses)
- Save into local Spectrum* tables using Postgres upserts (bulk_create + update_conflicts)
- Optionally store raw payloads (compressed) for auditing
- Provide structured stats for manual and scheduled runs

This module does NOT depend on DRF views. Both management commands and API views call this.
"""
from __future__ import annotations

import gzip
import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import (
    SpectrumJob,
    SpectrumJobDates,
    SpectrumPhaseEnhanced,
    SpectrumJobUDF,
    SpectrumJobContact,
    SpectrumSyncRun,
    SpectrumRawPayload,
)
from .services import SpectrumSOAPClient
from .utils import (
    safe_strip,
    truncate_field,
    parse_date_robust,
    parse_decimal,
    filter_divisions,
    ALLOWED_PHASE_COST_TYPES,
    ALLOWED_STATUS_CODES,
)

logger = logging.getLogger(__name__)


DEFAULT_DIVISIONS = ["111", "121", "131", "135"]
DEFAULT_STATUS_CODES = ["A", "I"]


def _coerce_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _normalize_status_code(status_code: Optional[str]) -> tuple[Optional[str], list[Optional[str]]]:
    """
    Normalize status_code for Spectrum calls.
    Returns (status_code_for_division_calls, status_codes_for_phase_calls).
    - None or "ALL" => active + inactive only (A/I)
    - "" => active + inactive only (A/I)
    - "A"/"I" => specific status
    - "C" or other values are ignored (no complete jobs)
    """
    if status_code is None:
        return "", DEFAULT_STATUS_CODES
    text = str(status_code).strip().upper()
    if text == "ALL":
        return "", DEFAULT_STATUS_CODES
    if text == "":
        return "", ["A", "I"]
    if text in ALLOWED_STATUS_CODES:
        return text, [text]
    return "", DEFAULT_STATUS_CODES


def _normalize_cost_type(cost_type: Optional[str]) -> Optional[str]:
    if not cost_type:
        return None
    ct = str(cost_type).strip().upper()
    return ct if ct in ALLOWED_PHASE_COST_TYPES else None


def _is_error_row(row: Dict[str, Any]) -> bool:
    return bool(
        safe_strip(row.get("Error_Code"))
        or safe_strip(row.get("Error_Description"))
        or safe_strip(row.get("Error_Column"))
    )


def _chunked(items: List[Any], size: int) -> Iterable[List[Any]]:
    if size <= 0:
        yield items
        return
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _existing_phase_keys(keys: List[Tuple[str, str, str, str]]) -> set[Tuple[str, str, str, str]]:
    if not keys:
        return set()
    company_codes = {k[0] for k in keys}
    job_numbers = {k[1] for k in keys}
    phase_codes = {k[2] for k in keys}
    cost_types = {k[3] for k in keys}
    qs = SpectrumPhaseEnhanced.objects.filter(
        company_code__in=company_codes,
        job_number__in=job_numbers,
        phase_code__in=phase_codes,
        cost_type__in=cost_types,
    ).values_list("company_code", "job_number", "phase_code", "cost_type")
    existing = set(qs)
    return existing.intersection(set(keys))


def _existing_phase_uom_map(keys: List[Tuple[str, str, str, str]]) -> Dict[Tuple[str, str, str, str], str]:
    if not keys:
        return {}
    company_codes = {k[0] for k in keys}
    job_numbers = {k[1] for k in keys}
    phase_codes = {k[2] for k in keys}
    cost_types = {k[3] for k in keys}
    qs = (
        SpectrumPhaseEnhanced.objects.filter(
            company_code__in=company_codes,
            job_number__in=job_numbers,
            phase_code__in=phase_codes,
            cost_type__in=cost_types,
        )
        .exclude(unit_of_measure__isnull=True)
        .exclude(unit_of_measure="")
        .values_list("company_code", "job_number", "phase_code", "cost_type", "unit_of_measure")
    )
    return {(c, j, p, ct): uom for c, j, p, ct, uom in qs if uom}


@dataclass(frozen=True)
class SyncConfig:
    company_code: Optional[str]
    divisions: List[str]
    status_code: Optional[str]  # None = Spectrum default, "" = active+inactive, "A"/"I"/"C" = specific
    store_raw_payloads: bool
    max_workers: int


def _gzip_text(text: str) -> bytes:
    return gzip.compress(text.encode("utf-8"), compresslevel=6)


def _get_update_fields(model, unique_fields: Sequence[str]) -> List[str]:
    """
    Determine fields to update during ON CONFLICT DO UPDATE.
    Excludes PK, unique fields, and auto_now_add fields.
    """
    update_fields: List[str] = []
    for f in model._meta.fields:
        if getattr(f, "primary_key", False):
            continue
        name = f.name
        if name in unique_fields:
            continue
        if getattr(f, "auto_now_add", False):
            continue
        # Don't overwrite created_at even if defined without auto_now_add in some legacy models
        if name == "created_at":
            continue
        update_fields.append(name)
    return update_fields


def _bulk_upsert(model, objs: List[Any], unique_fields: Sequence[str], batch_size: int = 1000) -> int:
    if not objs:
        return 0
    update_fields = _get_update_fields(model, unique_fields)
    model.objects.bulk_create(
        objs,
        batch_size=batch_size,
        update_conflicts=True,
        unique_fields=list(unique_fields),
        update_fields=update_fields,
    )
    return len(objs)


class SpectrumSyncEngine:
    def __init__(self, config: SyncConfig):
        self.config = config
        self.client = SpectrumSOAPClient()

    def run(self, run_type: str = SpectrumSyncRun.RUN_AUTO) -> Dict[str, Any]:
        """
        Run a full sync: Jobs, JobMain, JobDates, JobUDF, PhaseEnhanced, Contacts.

        Returns stats dict.
        """
        run = SpectrumSyncRun.objects.create(
            run_type=run_type,
            status=SpectrumSyncRun.STATUS_RUNNING,
            company_code=self.config.company_code or self.client.company_code,
            divisions=self.config.divisions,
            status_code=self.config.status_code,
            stats={},
        )

        started = timezone.now()
        stats: Dict[str, Any] = {"started_at": started.isoformat()}

        try:
            # 1) Pull + upsert Jobs (merged GetJob + GetJobMain)
            job_stats = self._sync_jobs_and_main(run)
            stats["jobs"] = job_stats

            # job keys for per-job endpoints (contacts)
            job_keys = job_stats.get("job_keys", [])
            job_numbers = [jk[1] for jk in job_keys]

            # 2) Pull + upsert Dates (bulk by division/status)
            stats["dates"] = self._sync_job_dates(run)

            # 3) Pull + upsert Enhanced Phases (bulk by status, can be large)
            stats["phases_enhanced"] = self._sync_phases_enhanced(run)

            # 4) Pull + upsert Contacts (per job, parallel)
            sync_contacts = getattr(settings, "SPECTRUM_SYNC_CONTACTS", True)
            if sync_contacts:
                stats["contacts"] = self._sync_job_contacts(run, job_numbers)
            else:
                stats["contacts"] = {"skipped": True}

            finished = timezone.now()
            stats["finished_at"] = finished.isoformat()
            stats["duration_seconds"] = (finished - started).total_seconds()

            run.status = SpectrumSyncRun.STATUS_SUCCESS
            run.finished_at = finished
            run.stats = stats
            run.save(update_fields=["status", "finished_at", "stats"])

            return stats

        except Exception as e:
            finished = timezone.now()
            run.status = SpectrumSyncRun.STATUS_FAILED
            run.finished_at = finished
            run.error = str(e)
            run.stats = stats
            run.save(update_fields=["status", "finished_at", "error", "stats"])
            logger.error("Spectrum sync failed", exc_info=True)
            raise

    # -----------------------------
    # Individual sync steps
    # -----------------------------

    def _maybe_store_raw(self, run: SpectrumSyncRun, endpoint: str, request_params: Dict[str, Any], items: List[Dict[str, Any]]) -> None:
        if not self.config.store_raw_payloads:
            return
        # Store only a compact representation; raw XML isn't always available at this layer.
        # If you want raw XML per call, modify services._call_service to return (items, raw_xml).
        try:
            text = str(items)
            SpectrumRawPayload.objects.create(
                run=run,
                endpoint=endpoint,
                request_params=request_params,
                raw_xml_gzip=_gzip_text(text),
                item_count=len(items),
            )
        except Exception:
            logger.warning("Failed to store raw payload", exc_info=True)

    def _sync_jobs_and_main(self, run: SpectrumSyncRun) -> Dict[str, Any]:
        """
        Fetch GetJob (per division/status breakdown) and GetJobMain (per division),
        merge on (Company_Code, Job_Number), then bulk upsert SpectrumJob.
        """
        company_code = self.config.company_code or self.client.company_code
        divisions = self.config.divisions
        status_code = self.config.status_code

        sync_time = timezone.now()

        status_code_param, _ = _normalize_status_code(status_code)
        jobs = self.client.get_all_jobs_by_division(company_code=company_code, divisions=divisions, status_code=status_code_param)
        self._maybe_store_raw(run, "GetJob", {"company_code": company_code, "divisions": divisions, "status_code": status_code}, jobs)

        mains = self.client.get_all_job_main_by_division(company_code=company_code, divisions=divisions)
        self._maybe_store_raw(run, "GetJobMain", {"company_code": company_code, "divisions": divisions}, mains)

        main_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for row in mains:
            c = safe_strip(row.get("Company_Code")) or company_code or ""
            jn = safe_strip(row.get("Job_Number")) or ""
            if jn:
                main_map[(c, jn)] = row

        jobs_by_key: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for row in jobs:
            company = safe_strip(row.get("Company_Code")) or company_code or ""
            job_number = safe_strip(row.get("Job_Number")) or ""
            if not company or not job_number:
                continue
            jobs_by_key[(company, job_number)] = row

        objs: List[SpectrumJob] = []
        job_keys: List[Tuple[str, str]] = list(jobs_by_key.keys())

        for (company, job_number), row in jobs_by_key.items():
            job_main = main_map.get((company, job_number), {})

            defaults: Dict[str, Any] = {
                # GetJob fields
                "company_code": company,
                "job_number": job_number,
                "job_description": truncate_field(safe_strip(row.get("Job_Description")), 50),
                "division": safe_strip(row.get("Division")),
                "address_1": truncate_field(safe_strip(row.get("Address_1")), 50),
                "address_2": truncate_field(safe_strip(row.get("Address_2")), 50),
                "city": truncate_field(safe_strip(row.get("City")), 50),
                "state": safe_strip(row.get("State")),
                "zip_code": safe_strip(row.get("Zip_Code")),
                "project_manager": safe_strip(row.get("Project_Manager")),
                "certified_flag": safe_strip(row.get("Certified_Flag")),
                "customer_code": safe_strip(row.get("Customer_Code")),
                "status_code": safe_strip(row.get("Status_Code")),
                "work_state_tax_code": safe_strip(row.get("Work_State_Tax_Code")),
                "contract_number": truncate_field(safe_strip(row.get("Contract_Number")), 30),
                "cost_center": safe_strip(row.get("Cost_Center")),
                "error_code": safe_strip(row.get("Error_Code")),
                "error_description": safe_strip(row.get("Error_Description")),
                "error_column": safe_strip(row.get("Error_Column")),
                # GetJobMain fields (merge)
                # Note: address_3 and county are not in SpectrumJob model - removed
                "phone": safe_strip(job_main.get("Phone")),
                "fax_phone": safe_strip(job_main.get("Fax_Phone")),
                "job_site_phone": safe_strip(job_main.get("Job_Site_Phone")),
                "customer_name": truncate_field(safe_strip(job_main.get("Customer_Name")), 30),
                "owner_name": truncate_field(safe_strip(job_main.get("Owner_Name")), 50),
                "wo_site": truncate_field(safe_strip(job_main.get("WO_Site")), 10),
                "comment": safe_strip(job_main.get("Comment")),
                "price_method_code": truncate_field(safe_strip(job_main.get("Price_Method_Code")), 1),
                "unit_of_measure": truncate_field(safe_strip(job_main.get("Unit_of_Measure")), 5),
                "legal_desc": safe_strip(job_main.get("Legal_Desc")),
                "field_1": truncate_field(safe_strip(job_main.get("Field_1")), 30),
                "field_2": truncate_field(safe_strip(job_main.get("Field_2")), 30),
                "field_3": truncate_field(safe_strip(job_main.get("Field_3")), 30),
                "field_4": truncate_field(safe_strip(job_main.get("Field_4")), 30),
                "field_5": truncate_field(safe_strip(job_main.get("Field_5")), 30),
                "last_synced_at": sync_time,
            }

            # numeric fields (safe)
            oc = parse_decimal(job_main.get("Original_Contract"))
            if oc is not None:
                defaults["original_contract"] = oc

            # Note: current_contract is not in SpectrumJob model - removed
            # Note: Date fields (contract_date, start_date, est_complete_date, complete_date) 
            # are not in SpectrumJob model - they should be stored in SpectrumJobDates instead
            # Removing them from defaults to avoid TypeError

            objs.append(SpectrumJob(**defaults))

        with transaction.atomic():
            upserted = _bulk_upsert(SpectrumJob, objs, unique_fields=["company_code", "job_number"], batch_size=2000)

        project_stats = self._sync_projects_from_jobs(jobs_by_key, main_map)

        return {
            "fetched_jobs": len(jobs),
            "fetched_job_main": len(mains),
            "upserted": upserted,
            "job_keys": job_keys,  # used for contacts
            "projects": project_stats,
        }

    def _sync_projects_from_jobs(
        self,
        jobs_by_key: Dict[Tuple[str, str], Dict[str, Any]],
        main_map: Dict[Tuple[str, str], Dict[str, Any]],
    ) -> Dict[str, Any]:
        from accounts.models import User
        from branches.models import Branch
        from projects.models import Project

        division_names = {
            "111": "Kansas City / Nebraska",
            "121": "Denver",
            "131": "SLC Commercial",
            "135": "Utah Commercial",
            "145": "St George",
        }

        branches_cache: Dict[str, Branch] = {}
        for branch in Branch.objects.all():
            if branch.spectrum_division_code:
                branches_cache[branch.spectrum_division_code] = branch

        default_branch = Branch.objects.filter(status="ACTIVE").first()
        if not default_branch:
            default_branch = Branch.objects.create(
                name="Unassigned",
                code="UNASSIGNED",
                spectrum_division_code=None,
                status="ACTIVE",
            )

        pm_users = list(User.objects.filter(role="PROJECT_MANAGER"))
        pm_index: Dict[Tuple[str, str], User] = {}
        for user in pm_users:
            first = _coerce_text(user.first_name)
            last = _coerce_text(user.last_name)
            if first and last:
                pm_index[(first.lower(), last.lower())] = user

        def match_pm(pm_name: Optional[str]) -> Optional[User]:
            if not pm_name:
                return None
            cleaned = pm_name.replace(",", " ").strip()
            parts = [p for p in cleaned.split() if p]
            if len(parts) < 2:
                return None
            first = parts[0].lower()
            last = " ".join(parts[1:]).lower()
            direct = pm_index.get((first, last))
            if direct:
                return direct
            if len(parts) == 2:
                swapped = pm_index.get((parts[1].lower(), parts[0].lower()))
                if swapped:
                    return swapped
            for user in pm_users:
                uf = (user.first_name or "").lower()
                ul = (user.last_name or "").lower()
                if first in uf and last in ul:
                    return user
            return None

        created = 0
        updated = 0
        matched_pms = 0

        for (company, job_number), job_row in jobs_by_key.items():
            job_main = main_map.get((company, job_number), {})

            division_code = safe_strip(job_row.get("Division"))
            branch = None
            if division_code:
                branch = branches_cache.get(division_code)
                if not branch:
                    division_name = division_names.get(division_code, f"Division {division_code}")
                    branch = Branch.objects.create(
                        name=division_name,
                        code=division_code,
                        spectrum_division_code=division_code,
                        status="ACTIVE",
                    )
                    branches_cache[division_code] = branch

            if not branch:
                branch = default_branch

            project_name = safe_strip(job_row.get("Job_Description")) or f"Job {job_number}"

            spectrum_status = safe_strip(job_row.get("Status_Code"))
            if spectrum_status == "A":
                project_status = "ACTIVE"
            elif spectrum_status == "C":
                project_status = "COMPLETED"
            elif spectrum_status == "I":
                project_status = "INACTIVE"
            else:
                project_status = "PENDING"

            project_defaults: Dict[str, Any] = {
                "name": project_name,
                "branch": branch,
                "spectrum_division_code": division_code,
                "client_name": safe_strip(job_main.get("Customer_Name")) or safe_strip(job_row.get("Customer_Code")),
                "work_location": f"{safe_strip(job_row.get('Address_1')) or ''} {safe_strip(job_row.get('City')) or ''} {safe_strip(job_row.get('State')) or ''}".strip(),
                "status": project_status,
                "start_date": timezone.now().date(),
                "duration": 30,
                "is_public": True,
            }

            original_contract = parse_decimal(job_main.get("Original_Contract"))
            if original_contract is not None:
                project_defaults["contract_value"] = original_contract
                project_defaults["spectrum_original_contract"] = original_contract

            pm_name = safe_strip(job_row.get("Project_Manager")) or safe_strip(job_main.get("Project_Manager"))
            matched_pm = match_pm(pm_name) if pm_name else None
            if pm_name:
                project_defaults["spectrum_project_manager"] = pm_name
            if matched_pm:
                project_defaults["project_manager"] = matched_pm
                matched_pms += 1

            project, was_created = Project.objects.update_or_create(
                job_number=job_number,
                defaults=project_defaults,
            )
            if was_created:
                created += 1
            else:
                updated += 1

        return {"created": created, "updated": updated, "pm_matched": matched_pms}

    def _sync_job_dates(self, run: SpectrumSyncRun) -> Dict[str, Any]:
        company_code = self.config.company_code or self.client.company_code
        divisions = self.config.divisions
        status_code = self.config.status_code
        sync_time = timezone.now()

        status_code_param, _ = _normalize_status_code(status_code)
        rows = self.client.get_all_job_dates_by_division(
            company_code=company_code,
            divisions=divisions,
            status_code=status_code_param,
        )
        self._maybe_store_raw(run, "GetJobDates", {"company_code": company_code, "divisions": divisions, "status_code": status_code}, rows)

        objs: List[SpectrumJobDates] = []
        project_updates: List[Tuple[str, Dict[str, Any]]] = []
        for r in rows:
            company = safe_strip(r.get("Company_Code")) or company_code or ""
            job_number = safe_strip(r.get("Job_Number")) or ""
            if not company or not job_number:
                continue

            defaults: Dict[str, Any] = {
                "company_code": company,
                "job_number": job_number,
                "job_description": truncate_field(safe_strip(r.get("Job_Description")), 25),
                "est_start_date": parse_date_robust(r.get("Est_Start_Date")),
                "est_complete_date": parse_date_robust(r.get("Est_Complete_Date")),
                "projected_complete_date": parse_date_robust(r.get("Projected_Complete_Date")),
                "create_date": parse_date_robust(r.get("Create_Date")),
                "start_date": parse_date_robust(r.get("Start_Date")),
                "complete_date": parse_date_robust(r.get("Complete_Date")),
                "field_1": safe_strip(r.get("Field_1")),
                "field_2": safe_strip(r.get("Field_2")),
                "field_3": safe_strip(r.get("Field_3")),
                "field_4": safe_strip(r.get("Field_4")),
                "field_5": safe_strip(r.get("Field_5")),
                "error_code": safe_strip(r.get("Error_Code")),
                "error_description": safe_strip(r.get("Error_Description")),
                "error_column": safe_strip(r.get("Error_Column")),
                "last_synced_at": sync_time,
            }
            objs.append(SpectrumJobDates(**defaults))

            project_update_fields: Dict[str, Any] = {}
            if defaults["est_start_date"]:
                project_update_fields["spectrum_est_start_date"] = defaults["est_start_date"]
            if defaults["est_complete_date"]:
                project_update_fields["spectrum_est_complete_date"] = defaults["est_complete_date"]
            if defaults["projected_complete_date"]:
                project_update_fields["spectrum_projected_complete_date"] = defaults["projected_complete_date"]
            if defaults["start_date"]:
                project_update_fields["spectrum_start_date"] = defaults["start_date"]
            if defaults["complete_date"]:
                project_update_fields["spectrum_complete_date"] = defaults["complete_date"]
            if defaults["create_date"]:
                project_update_fields["spectrum_create_date"] = defaults["create_date"]
            if project_update_fields:
                project_updates.append((job_number, project_update_fields))

        with transaction.atomic():
            upserted = _bulk_upsert(SpectrumJobDates, objs, unique_fields=["company_code", "job_number"], batch_size=2000)

        if project_updates:
            from projects.models import Project
            for job_number, update_fields in project_updates:
                try:
                    Project.objects.filter(job_number=job_number).update(**update_fields)
                except Exception:
                    logger.warning(f"Failed to update project dates for {job_number}", exc_info=True)

        return {"fetched": len(rows), "upserted": upserted, "project_updates": len(project_updates)}

    def _sync_job_udf(self, run: SpectrumSyncRun) -> Dict[str, Any]:
        company_code = self.config.company_code or self.client.company_code
        divisions = self.config.divisions
        status_code = self.config.status_code
        sync_time = timezone.now()

        status_code_param, _ = _normalize_status_code(status_code)
        rows = self.client.get_all_job_udf_by_division(
            company_code=company_code,
            divisions=divisions,
            status_code=status_code_param,
        )
        self._maybe_store_raw(run, "GetJobUDF", {"company_code": company_code, "divisions": divisions, "status_code": status_code}, rows)

        objs: List[SpectrumJobUDF] = []
        for r in rows:
            company = safe_strip(r.get("Company_Code")) or company_code or ""
            job_number = safe_strip(r.get("Job_Number")) or ""
            if not company or not job_number:
                continue

            defaults: Dict[str, Any] = {"company_code": company, "job_number": job_number}
            # UDF1..UDF20
            for i in range(1, 21):
                key = f"UDF{i}"
                defaults[f"udf{i}"] = safe_strip(r.get(key))
            defaults["error_code"] = safe_strip(r.get("Error_Code"))
            defaults["error_description"] = safe_strip(r.get("Error_Description"))
            defaults["error_column"] = safe_strip(r.get("Error_Column"))
            defaults["last_synced_at"] = sync_time

            objs.append(SpectrumJobUDF(**defaults))

        with transaction.atomic():
            upserted = _bulk_upsert(SpectrumJobUDF, objs, unique_fields=["company_code", "job_number"], batch_size=2000)
        return {"fetched": len(rows), "upserted": upserted}

    def _build_phase_enhanced_objects(
        self,
        rows: List[Dict[str, Any]],
        *,
        company_code: Optional[str],
        sync_time,
        uom_fallback: Optional[Dict[Tuple[str, str, str, str], str]] = None,
    ) -> Tuple[List[SpectrumPhaseEnhanced], Dict[str, Any], Dict[str, Dict[str, Any]], Dict[Tuple[str, str, str, str], str]]:
        stats = {
            "rows_received": len(rows),
            "rows_valid": 0,
            "skipped_errors": 0,
            "skipped_invalid": 0,
            "warnings": 0,
        }
        objs_by_key: Dict[Tuple[str, str, str, str], SpectrumPhaseEnhanced] = {}
        agg_by_job: Dict[str, Dict[str, Any]] = {}
        parsed_uom_map: Dict[Tuple[str, str, str, str], str] = {}

        for p in rows:
            if _is_error_row(p):
                stats["skipped_errors"] += 1
                logger.warning(
                    "Phase error row skipped job=%s phase=%s cost_type=%s error_code=%s error_desc=%s error_col=%s",
                    safe_strip(p.get("Job_Number")),
                    safe_strip(p.get("Phase_Code")),
                    safe_strip(p.get("Cost_Type")),
                    safe_strip(p.get("Error_Code")),
                    safe_strip(p.get("Error_Description")),
                    safe_strip(p.get("Error_Column")),
                )
                continue

            company = safe_strip(p.get("Company_Code")) or company_code or ""
            job_number = safe_strip(p.get("Job_Number")) or ""
            phase_code = safe_strip(p.get("Phase_Code")) or ""
            cost_type = _normalize_cost_type(p.get("Cost_Type"))
            if not (company and job_number and phase_code and cost_type):
                stats["skipped_invalid"] += 1
                continue

            unit_of_measure = safe_strip(p.get("Unit_of_Measure"))
            uom_missing = not unit_of_measure
            if uom_missing:
                stats["warnings"] += 1
                logger.warning(
                    "Phase UOM missing; quantities may be invalid job=%s phase=%s cost_type=%s",
                    job_number,
                    phase_code,
                    cost_type,
                )

            projected_dollars = parse_decimal(p.get("Projected_Dollars"))
            estimated_dollars = parse_decimal(p.get("Current_Estimated_Dollars"))
            jtd_dollars = parse_decimal(p.get("JTD_Actual_Dollars"))

            agg = agg_by_job.setdefault(
                job_number,
                {"projected": Decimal("0"), "estimated": Decimal("0"), "jtd": Decimal("0"), "cost_types": set()},
            )
            if projected_dollars is not None:
                agg["projected"] += projected_dollars
            if estimated_dollars is not None:
                agg["estimated"] += estimated_dollars
            if jtd_dollars is not None:
                agg["jtd"] += jtd_dollars
            agg["cost_types"].add(cost_type)

            jtd_quantity = parse_decimal(p.get("JTD_Quantity"))
            projected_quantity = parse_decimal(p.get("Projected_Quantity"))
            estimated_quantity = parse_decimal(p.get("Estimated_Quantity"))

            key = (company, job_number, phase_code, cost_type)
            parsed_uom_map[key] = unit_of_measure or ""
            if (not unit_of_measure) and uom_fallback:
                unit_of_measure = uom_fallback.get(key) or unit_of_measure
            defaults: Dict[str, Any] = {
                "company_code": company,
                "job_number": job_number,
                "phase_code": phase_code,
                "cost_type": cost_type,
                "description": truncate_field(safe_strip(p.get("Description")), 25),
                "status_code": safe_strip(p.get("Status_Code")),
                "unit_of_measure": truncate_field(unit_of_measure, 3),
                "jtd_quantity": jtd_quantity,
                "jtd_hours": parse_decimal(p.get("JTD_Hours")),
                "jtd_actual_dollars": jtd_dollars,
                "projected_quantity": projected_quantity,
                "projected_hours": parse_decimal(p.get("Projected_Hours")),
                "projected_dollars": projected_dollars,
                "estimated_quantity": estimated_quantity,
                "estimated_hours": parse_decimal(p.get("Estimated_Hours")),
                "current_estimated_dollars": estimated_dollars,
                "cost_center": truncate_field(safe_strip(p.get("Cost_Center")), 10),
                "price_method_code": safe_strip(p.get("Price_Method_Code")),
                "complete_date": parse_date_robust(p.get("Complete_Date")),
                "start_date": parse_date_robust(p.get("Start_Date")),
                "end_date": parse_date_robust(p.get("End_Date")),
                "comment": safe_strip(p.get("Comment")),
                "error_code": safe_strip(p.get("Error_Code")),
                "error_description": safe_strip(p.get("Error_Description")),
                "error_column": safe_strip(p.get("Error_Column")),
                "last_synced_at": sync_time,
            }

            objs_by_key[key] = SpectrumPhaseEnhanced(**defaults)
            stats["rows_valid"] += 1

        return list(objs_by_key.values()), stats, agg_by_job, parsed_uom_map

    def _sync_phases_enhanced(self, run: SpectrumSyncRun) -> Dict[str, Any]:
        company_code = self.config.company_code or self.client.company_code
        status_code = self.config.status_code
        sync_time = timezone.now()

        # PhaseEnhanced can be huge, so fetch status codes in parallel
        _, status_codes = _normalize_status_code(status_code)

        errors: List[str] = []
        totals = {
            "fetched": 0,
            "created": 0,
            "updated": 0,
            "skipped_errors": 0,
            "skipped_invalid": 0,
            "warnings": 0,
        }
        agg_by_job: Dict[str, Dict[str, Any]] = {}
        uom_fallback: Optional[Dict[Tuple[str, str, str, str], str]] = None

        job_qs = SpectrumJob.objects.filter(company_code=company_code)
        if status_codes:
            job_qs = job_qs.filter(status_code__in=status_codes)
        if self.config.divisions:
            job_qs = job_qs.filter(division__in=self.config.divisions)
        job_numbers = list(job_qs.values_list("job_number", flat=True).distinct())

        if job_numbers:
            batch_size = 20

            def fetch_job(job_number: str) -> Tuple[str, List[Dict[str, Any]], Dict[Tuple[str, str, str, str], str]]:
                uom_map: Dict[Tuple[str, str, str, str], str] = {}
                try:
                    base_rows = self.client.get_phase(
                        company_code=company_code,
                        job_number=job_number,
                        status_code="",
                        cost_type="",
                    )
                    for row in base_rows:
                        company = safe_strip(row.get("Company_Code")) or company_code or ""
                        job = safe_strip(row.get("Job_Number")) or ""
                        phase = safe_strip(row.get("Phase_Code")) or ""
                        ct = _normalize_cost_type(row.get("Cost_Type"))
                        if not (company and job and phase and ct):
                            continue
                        uom = truncate_field(safe_strip(row.get("Unit_of_Measure")), 3)
                        if uom:
                            uom_map[(company, job, phase, ct)] = uom
                    logger.info("Loaded %s UOM values from GetPhase for job=%s", len(uom_map), job_number)
                except Exception:
                    logger.warning("Failed to load UOM fallback from GetPhase for job=%s", job_number, exc_info=True)

                rows = self.client.get_phase_enhanced(
                    company_code=company_code,
                    job_number=job_number,
                    status_code="",
                    cost_type="",
                )
                return job_number, rows, uom_map

            for batch in _chunked(job_numbers, batch_size):
                with ThreadPoolExecutor(max_workers=max(2, self.config.max_workers // 2)) as ex:
                    futures = [ex.submit(fetch_job, jn) for jn in batch if jn]
                    for f in as_completed(futures):
                        try:
                            job_number, rows, uom_fallback = f.result()
                        except Exception as exc:
                            errors.append(str(exc))
                            logger.warning("GetPhaseEnhanced failed for job=%s: %s", job_number, exc)
                            continue

                        self._maybe_store_raw(
                            run,
                            "GetPhaseEnhanced",
                            {"company_code": company_code, "job_number": job_number},
                            rows,
                        )
                        totals["fetched"] += len(rows)
                        objs, stats, agg, parsed_uom_map = self._build_phase_enhanced_objects(
                            rows,
                            company_code=company_code,
                            sync_time=sync_time,
                            uom_fallback=uom_fallback,
                        )
                        totals["skipped_errors"] += stats["skipped_errors"]
                        totals["skipped_invalid"] += stats["skipped_invalid"]
                        totals["warnings"] += stats["warnings"]

                        for job_key, job_agg in agg.items():
                            existing = agg_by_job.setdefault(
                                job_key,
                                {"projected": Decimal("0"), "estimated": Decimal("0"), "jtd": Decimal("0"), "cost_types": set()},
                            )
                            existing["projected"] += job_agg["projected"]
                            existing["estimated"] += job_agg["estimated"]
                            existing["jtd"] += job_agg["jtd"]
                            existing["cost_types"].update(job_agg["cost_types"])

                        if not objs:
                            continue

                        for chunk in _chunked(objs, 2000):
                            keys = [(o.company_code, o.job_number, o.phase_code, o.cost_type or "") for o in chunk]
                            existing_keys = _existing_phase_keys(keys)
                            existing_uoms = _existing_phase_uom_map(keys)
                            for obj in chunk:
                                key = (obj.company_code, obj.job_number, obj.phase_code, obj.cost_type or "")
                                enhanced_uom = parsed_uom_map.get(key, "")
                                getphase_uom = (uom_fallback or {}).get(key, "")
                                if not obj.unit_of_measure:
                                    existing_uom = existing_uoms.get(key)
                                    if existing_uom:
                                        obj.unit_of_measure = existing_uom
                                logger.info(
                                    "Phase UOM merge job=%s phase=%s cost_type=%s enhanced_uom=%s getphase_uom=%s final_uom=%s",
                                    obj.job_number,
                                    obj.phase_code,
                                    obj.cost_type,
                                    enhanced_uom,
                                    getphase_uom,
                                    obj.unit_of_measure or "",
                                )
                            with transaction.atomic():
                                _bulk_upsert(
                                    SpectrumPhaseEnhanced,
                                    chunk,
                                    unique_fields=["company_code", "job_number", "phase_code", "cost_type"],
                                    batch_size=2000,
                                )
                            totals["created"] += len(keys) - len(existing_keys)
                            totals["updated"] += len(existing_keys)

                        try:
                            uom_count = SpectrumPhaseEnhanced.objects.filter(
                                company_code=company_code,
                                job_number=job_number,
                            ).exclude(unit_of_measure__isnull=True).exclude(unit_of_measure="").count()
                            logger.info("Phase UOM summary job=%s non_empty_uom=%s", job_number, uom_count)
                        except Exception:
                            logger.warning("Failed to compute UOM summary for job=%s", job_number, exc_info=True)

            if agg_by_job:
                from projects.models import Project
                for job_number, agg in agg_by_job.items():
                    update_fields: Dict[str, Any] = {}
                    if agg["projected"]:
                        update_fields["spectrum_total_projected_dollars"] = agg["projected"]
                    if agg["estimated"]:
                        update_fields["spectrum_total_estimated_dollars"] = agg["estimated"]
                    if agg["jtd"]:
                        update_fields["spectrum_total_jtd_dollars"] = agg["jtd"]
                    cost_types = sorted(agg["cost_types"]) if agg["cost_types"] else None
                    if cost_types:
                        update_fields["spectrum_cost_types"] = ", ".join(cost_types)
                    if update_fields:
                        try:
                            Project.objects.filter(job_number=job_number).update(**update_fields)
                        except Exception:
                            logger.warning(f"Failed to update project phase aggregates for {job_number}", exc_info=True)

            logger.info(
                "Phase enhanced sync summary fetched=%s created=%s updated=%s skipped_errors=%s warnings=%s",
                totals["fetched"],
                totals["created"],
                totals["updated"],
                totals["skipped_errors"],
                totals["warnings"],
            )

            return {
                "fetched": totals["fetched"],
                "created": totals["created"],
                "updated": totals["updated"],
                "skipped_errors": totals["skipped_errors"],
                "skipped_invalid": totals["skipped_invalid"],
                "warnings": totals["warnings"],
                "project_updates": len(agg_by_job),
                "errors": errors[:20] if errors else None,
            }

        cost_types = sorted(ALLOWED_PHASE_COST_TYPES)

        def fetch(sc, ct):
            try:
                rows = self.client.get_phase_enhanced(company_code=company_code, status_code=sc, cost_type=ct)
                return sc, ct, rows
            except Exception as exc:
                errors.append(f"{sc}:{ct} -> {exc}")
                logger.warning("GetPhaseEnhanced failed for status=%s cost_type=%s: %s", sc, ct, exc)
                return sc, ct, []

        with ThreadPoolExecutor(max_workers=max(2, self.config.max_workers // 2)) as ex:
            futures = [ex.submit(fetch, sc, ct) for sc in status_codes for ct in cost_types]
            for f in as_completed(futures):
                sc, ct, rows = f.result()
                self._maybe_store_raw(
                    run,
                    "GetPhaseEnhanced",
                    {"company_code": company_code, "status_code": sc, "cost_type": ct},
                    rows,
                )
                logger.info("Fetched %s enhanced phases for status %s cost_type %s", len(rows), sc, ct)

                totals["fetched"] += len(rows)
                objs, stats, agg, parsed_uom_map = self._build_phase_enhanced_objects(
                    rows,
                    company_code=company_code,
                    sync_time=sync_time,
                    uom_fallback=uom_fallback,
                )
                totals["skipped_errors"] += stats["skipped_errors"]
                totals["skipped_invalid"] += stats["skipped_invalid"]
                totals["warnings"] += stats["warnings"]

                if not objs:
                    continue

                for job_number, job_agg in agg.items():
                    existing = agg_by_job.setdefault(
                        job_number,
                        {"projected": Decimal("0"), "estimated": Decimal("0"), "jtd": Decimal("0"), "cost_types": set()},
                    )
                    existing["projected"] += job_agg["projected"]
                    existing["estimated"] += job_agg["estimated"]
                    existing["jtd"] += job_agg["jtd"]
                    existing["cost_types"].update(job_agg["cost_types"])

                for chunk in _chunked(objs, 2000):
                    keys = [(o.company_code, o.job_number, o.phase_code, o.cost_type or "") for o in chunk]
                    existing_keys = _existing_phase_keys(keys)
                    existing_uoms = _existing_phase_uom_map(keys)
                    for obj in chunk:
                        key = (obj.company_code, obj.job_number, obj.phase_code, obj.cost_type or "")
                        enhanced_uom = parsed_uom_map.get(key, "")
                        getphase_uom = (uom_fallback or {}).get(key, "")
                        if not obj.unit_of_measure:
                            existing_uom = existing_uoms.get(key)
                            if existing_uom:
                                obj.unit_of_measure = existing_uom
                        logger.info(
                            "Phase UOM merge job=%s phase=%s cost_type=%s enhanced_uom=%s getphase_uom=%s final_uom=%s",
                            obj.job_number,
                            obj.phase_code,
                            obj.cost_type,
                            enhanced_uom,
                            getphase_uom,
                            obj.unit_of_measure or "",
                        )
                    with transaction.atomic():
                        _bulk_upsert(
                            SpectrumPhaseEnhanced,
                            chunk,
                            unique_fields=["company_code", "job_number", "phase_code", "cost_type"],
                            batch_size=2000,
                        )
                    totals["created"] += len(keys) - len(existing_keys)
                    totals["updated"] += len(existing_keys)

        if agg_by_job:
            from projects.models import Project
            for job_number, agg in agg_by_job.items():
                update_fields: Dict[str, Any] = {}
                if agg["projected"]:
                    update_fields["spectrum_total_projected_dollars"] = agg["projected"]
                if agg["estimated"]:
                    update_fields["spectrum_total_estimated_dollars"] = agg["estimated"]
                if agg["jtd"]:
                    update_fields["spectrum_total_jtd_dollars"] = agg["jtd"]
                cost_types = sorted(agg["cost_types"]) if agg["cost_types"] else None
                if cost_types:
                    update_fields["spectrum_cost_types"] = ", ".join(cost_types)
                if update_fields:
                    try:
                        Project.objects.filter(job_number=job_number).update(**update_fields)
                    except Exception:
                        logger.warning(f"Failed to update project phase aggregates for {job_number}", exc_info=True)

        logger.info(
            "Phase enhanced sync summary fetched=%s created=%s updated=%s skipped_errors=%s warnings=%s",
            totals["fetched"],
            totals["created"],
            totals["updated"],
            totals["skipped_errors"],
            totals["warnings"],
        )

        return {
            "fetched": totals["fetched"],
            "created": totals["created"],
            "updated": totals["updated"],
            "skipped_errors": totals["skipped_errors"],
            "skipped_invalid": totals["skipped_invalid"],
            "warnings": totals["warnings"],
            "project_updates": len(agg_by_job),
            "errors": errors[:20] if errors else None,
        }

    def _sync_job_contacts(self, run: SpectrumSyncRun, job_numbers: List[str]) -> Dict[str, Any]:
        company_code = self.config.company_code or self.client.company_code
        sync_time = timezone.now()

        # Pull contacts in parallel per job
        max_workers = max(4, self.config.max_workers)
        objs: List[SpectrumJobContact] = []
        fetched_total = 0
        errors: List[str] = []

        def fetch(job_number: str) -> Tuple[str, List[Dict[str, Any]]]:
            rows = self.client.get_job_contacts(company_code=company_code, job_number=job_number)
            return job_number, rows

        with ThreadPoolExecutor(max_workers=max_workers) as ex:
            futures = [ex.submit(fetch, jn) for jn in job_numbers if jn]
            for f in as_completed(futures):
                try:
                    job_number, rows = f.result()
                    fetched_total += len(rows)
                    # store raw per job can be huge; only store aggregated payload per job if enabled
                    self._maybe_store_raw(run, "GetJobContact", {"company_code": company_code, "job_number": job_number}, rows)

                    for r in rows:
                        contact_id = safe_strip(r.get("Contact_ID") or r.get("Contact_Id") or r.get("ContactID"))
                        if not contact_id:
                            continue
                        defaults: Dict[str, Any] = {
                            "company_code": safe_strip(r.get("Company_Code")) or company_code or "",
                            "job_number": safe_strip(r.get("Job_Number")) or job_number,
                            "job_description": truncate_field(safe_strip(r.get("Job_Description")), 25),
                            "status_code": safe_strip(r.get("Status_Code")),
                            "project_manager": safe_strip(r.get("Project_Manager")),
                            "cost_center": truncate_field(safe_strip(r.get("Cost_Center")), 10),

                            "contact_id": int(contact_id) if str(contact_id).isdigit() else int(float(contact_id)) if contact_id else 0,
                            "first_name": truncate_field(safe_strip(r.get("First_Name")), 20),
                            "last_name": truncate_field(safe_strip(r.get("Last_Name")), 30),
                            "title": truncate_field(safe_strip(r.get("Title")), 50),

                            "addr_1": truncate_field(safe_strip(r.get("Addr_1") or r.get("Address_1")), 30),
                            "addr_2": truncate_field(safe_strip(r.get("Addr_2") or r.get("Address_2")), 30),
                            "addr_city": truncate_field(safe_strip(r.get("Addr_City") or r.get("City")), 25),
                            "addr_state": truncate_field(safe_strip(r.get("Addr_State") or r.get("State")), 2),
                            "addr_zip": truncate_field(safe_strip(r.get("Addr_Zip") or r.get("Zip_Code")), 10),
                            "addr_country": truncate_field(safe_strip(r.get("Addr_Country") or r.get("Country")), 25),

                            "phone_number": truncate_field(safe_strip(r.get("Phone_Number") or r.get("Phone")), 14),
                            "email1": truncate_field(safe_strip(r.get("Email1") or r.get("Email_1") or r.get("Email")), 80),
                            "email2": truncate_field(safe_strip(r.get("Email2") or r.get("Email_2")), 80),
                            "email3": truncate_field(safe_strip(r.get("Email3") or r.get("Email_3")), 80),
                            "remarks": truncate_field(safe_strip(r.get("Remarks")), 250),

                            "status": safe_strip(r.get("Status")),
                            "otype": safe_strip(r.get("Otype") or r.get("OType")),
                            "oname": truncate_field(safe_strip(r.get("Oname") or r.get("OName") or r.get("Company_Name")), 40),
                            "ocity": truncate_field(safe_strip(r.get("Ocity") or r.get("OCity")), 25),
                            "ostate": truncate_field(safe_strip(r.get("Ostate") or r.get("OState")), 2),
                            "ostatus": safe_strip(r.get("Ostatus") or r.get("OStatus")),

                            "error_code": safe_strip(r.get("Error_Code")),
                            "error_description": safe_strip(r.get("Error_Description")),
                            "error_column": safe_strip(r.get("Error_Column")),
                            "last_synced_at": sync_time,
                        }
                        objs.append(SpectrumJobContact(**defaults))
                except Exception as e:
                    msg = str(e)
                    errors.append(msg)
                    logger.warning(f"Contact fetch failed: {e}")

        with transaction.atomic():
            upserted = _bulk_upsert(
                SpectrumJobContact,
                objs,
                unique_fields=["company_code", "job_number", "contact_id"],
                batch_size=5000,
            )

        return {"jobs": len(job_numbers), "fetched_contacts": fetched_total, "upserted": upserted, "errors": errors[:20] if errors else None}

    def sync_phases_enhanced_filtered(
        self,
        *,
        company_code: Optional[str] = None,
        job_number: Optional[str] = None,
        status_code: Optional[str] = None,
        cost_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        company_to_use = company_code or self.config.company_code or self.client.company_code
        _, status_codes = _normalize_status_code(status_code)
        cost_types = [_normalize_cost_type(cost_type)] if cost_type else sorted(ALLOWED_PHASE_COST_TYPES)
        cost_types = [ct for ct in cost_types if ct]

        if not status_codes or not cost_types:
            return {
                "jobs_processed": 0,
                "rows_received": 0,
                "created": 0,
                "updated": 0,
                "skipped_errors": 0,
                "skipped_invalid": 0,
                "warnings": 0,
                "job_number": job_number,
            }

        totals = {
            "rows_received": 0,
            "created": 0,
            "updated": 0,
            "skipped_errors": 0,
            "skipped_invalid": 0,
            "warnings": 0,
        }
        agg_by_job: Dict[str, Dict[str, Any]] = {}
        jobs_seen: set[str] = set()
        sync_time = timezone.now()
        uom_fallback: Optional[Dict[Tuple[str, str, str, str], str]] = None
        if job_number:
            try:
                base_rows = self.client.get_phase(
                    company_code=company_to_use,
                    job_number=job_number,
                    status_code=status_code or "",
                )
                uom_fallback = {}
                for row in base_rows:
                    company = safe_strip(row.get("Company_Code")) or company_to_use or ""
                    job = safe_strip(row.get("Job_Number")) or ""
                    phase = safe_strip(row.get("Phase_Code")) or ""
                    ct = _normalize_cost_type(row.get("Cost_Type"))
                    if not (company and job and phase and ct):
                        continue
                    uom = truncate_field(safe_strip(row.get("Unit_of_Measure")), 3)
                    if uom:
                        uom_fallback[(company, job, phase, ct)] = uom
                logger.info(
                    "Loaded %s UOM values from GetPhase for job=%s",
                    len(uom_fallback),
                    job_number,
                )
            except Exception:
                logger.warning("Failed to load UOM fallback from GetPhase for job=%s", job_number, exc_info=True)

        for sc in status_codes:
            for ct in cost_types:
                rows = self.client.get_phase_enhanced(
                    company_code=company_to_use,
                    job_number=job_number,
                    status_code=sc,
                    cost_type=ct,
                )
                totals["rows_received"] += len(rows)
                objs, stats, agg, parsed_uom_map = self._build_phase_enhanced_objects(
                    rows,
                    company_code=company_to_use,
                    sync_time=sync_time,
                    uom_fallback=uom_fallback,
                )
                totals["skipped_errors"] += stats["skipped_errors"]
                totals["skipped_invalid"] += stats["skipped_invalid"]
                totals["warnings"] += stats["warnings"]

                for job_key, job_agg in agg.items():
                    jobs_seen.add(job_key)
                    existing = agg_by_job.setdefault(
                        job_key,
                        {"projected": Decimal("0"), "estimated": Decimal("0"), "jtd": Decimal("0"), "cost_types": set()},
                    )
                    existing["projected"] += job_agg["projected"]
                    existing["estimated"] += job_agg["estimated"]
                    existing["jtd"] += job_agg["jtd"]
                    existing["cost_types"].update(job_agg["cost_types"])

                if not objs:
                    continue

                for chunk in _chunked(objs, 2000):
                    keys = [(o.company_code, o.job_number, o.phase_code, o.cost_type or "") for o in chunk]
                    existing_keys = _existing_phase_keys(keys)
                    existing_uoms = _existing_phase_uom_map(keys)
                    for obj in chunk:
                        key = (obj.company_code, obj.job_number, obj.phase_code, obj.cost_type or "")
                        if not obj.unit_of_measure:
                            existing_uom = existing_uoms.get(key)
                            if existing_uom:
                                obj.unit_of_measure = existing_uom
                        logger.info(
                            "Phase UOM parsed/saved job=%s phase=%s cost_type=%s parsed_uom=%s saved_uom=%s",
                            obj.job_number,
                            obj.phase_code,
                            obj.cost_type,
                            parsed_uom_map.get(key, ""),
                            obj.unit_of_measure or "",
                        )
                    with transaction.atomic():
                        _bulk_upsert(
                            SpectrumPhaseEnhanced,
                            chunk,
                            unique_fields=["company_code", "job_number", "phase_code", "cost_type"],
                            batch_size=2000,
                        )
                    totals["created"] += len(keys) - len(existing_keys)
                    totals["updated"] += len(existing_keys)

        if agg_by_job:
            from projects.models import Project
            for job_number_key, agg in agg_by_job.items():
                update_fields: Dict[str, Any] = {}
                if agg["projected"]:
                    update_fields["spectrum_total_projected_dollars"] = agg["projected"]
                if agg["estimated"]:
                    update_fields["spectrum_total_estimated_dollars"] = agg["estimated"]
                if agg["jtd"]:
                    update_fields["spectrum_total_jtd_dollars"] = agg["jtd"]
                cost_types_str = ", ".join(sorted(agg["cost_types"])) if agg["cost_types"] else None
                if cost_types_str:
                    update_fields["spectrum_cost_types"] = cost_types_str
                if update_fields:
                    try:
                        Project.objects.filter(job_number=job_number_key).update(**update_fields)
                    except Exception:
                        logger.warning("Failed to update project phase aggregates for %s", job_number_key, exc_info=True)

        jobs_processed = len(jobs_seen)
        if job_number and jobs_processed == 0:
            jobs_processed = 1

        if job_number:
            try:
                uom_count = SpectrumPhaseEnhanced.objects.filter(
                    company_code=company_to_use,
                    job_number=job_number,
                ).exclude(unit_of_measure__isnull=True).exclude(unit_of_measure="").count()
                logger.info("Phase UOM summary job=%s non_empty_uom=%s", job_number, uom_count)
            except Exception:
                logger.warning("Failed to compute UOM summary for job=%s", job_number, exc_info=True)

        logger.info(
            "Manual phase sync summary jobs=%s rows_received=%s created=%s updated=%s skipped_errors=%s warnings=%s",
            jobs_processed,
            totals["rows_received"],
            totals["created"],
            totals["updated"],
            totals["skipped_errors"],
            totals["warnings"],
        )

        return {
            "jobs_processed": jobs_processed,
            "rows_received": totals["rows_received"],
            "created": totals["created"],
            "updated": totals["updated"],
            "skipped_errors": totals["skipped_errors"],
            "skipped_invalid": totals["skipped_invalid"],
            "warnings": totals["warnings"],
            "job_number": job_number,
        }


def run_spectrum_sync(
    *,
    company_code: Optional[str] = None,
    divisions: Optional[List[str]] = None,
    status_code: Optional[str] = None,
    run_type: str = SpectrumSyncRun.RUN_AUTO,
) -> Dict[str, Any]:
    """
    Convenience function used by views/commands/tasks.
    """
    cfg = SyncConfig(
        company_code=company_code,
        divisions=filter_divisions(divisions or getattr(settings, "SPECTRUM_DIVISIONS", DEFAULT_DIVISIONS)),
        status_code=status_code,
        store_raw_payloads=getattr(settings, "SPECTRUM_STORE_RAW_PAYLOADS", False),
        max_workers=getattr(settings, "SPECTRUM_MAX_WORKERS", 8),
    )
    engine = SpectrumSyncEngine(cfg)
    return engine.run(run_type=run_type)


def run_spectrum_phase_sync(
    *,
    company_code: Optional[str] = None,
    job_number: Optional[str] = None,
    cost_type: Optional[str] = None,
    status_code: Optional[str] = None,
    run_type: str = SpectrumSyncRun.RUN_MANUAL,
) -> Dict[str, Any]:
    cfg = SyncConfig(
        company_code=company_code,
        divisions=filter_divisions(getattr(settings, "SPECTRUM_DIVISIONS", DEFAULT_DIVISIONS)),
        status_code=status_code,
        store_raw_payloads=getattr(settings, "SPECTRUM_STORE_RAW_PAYLOADS", False),
        max_workers=getattr(settings, "SPECTRUM_MAX_WORKERS", 8),
    )
    engine = SpectrumSyncEngine(cfg)

    run = SpectrumSyncRun.objects.create(
        run_type=run_type,
        status=SpectrumSyncRun.STATUS_RUNNING,
        company_code=company_code or engine.client.company_code,
        divisions=cfg.divisions,
        status_code=status_code,
        stats={},
    )
    started = timezone.now()
    stats: Dict[str, Any] = {"started_at": started.isoformat()}

    try:
        phase_stats = engine.sync_phases_enhanced_filtered(
            company_code=company_code,
            job_number=job_number,
            status_code=status_code,
            cost_type=cost_type,
        )
        finished = timezone.now()
        stats.update(phase_stats)
        stats["finished_at"] = finished.isoformat()
        stats["duration_seconds"] = (finished - started).total_seconds()

        run.status = SpectrumSyncRun.STATUS_SUCCESS
        run.finished_at = finished
        run.stats = stats
        run.save(update_fields=["status", "finished_at", "stats"])
        return stats
    except Exception as e:
        finished = timezone.now()
        run.status = SpectrumSyncRun.STATUS_FAILED
        run.finished_at = finished
        run.error = str(e)
        run.stats = stats
        run.save(update_fields=["status", "finished_at", "error", "stats"])
        logger.error("Spectrum phase sync failed", exc_info=True)
        raise
