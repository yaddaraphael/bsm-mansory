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
from .utils import safe_strip, truncate_field, parse_date_robust, parse_decimal

logger = logging.getLogger(__name__)


DEFAULT_DIVISIONS = ["111", "121", "131", "135", "145"]
DEFAULT_STATUS_CODES = ["A", "I", "C"]


def _coerce_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


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

            # 3) Pull + upsert UDF (bulk by division/status)
            stats["udf"] = self._sync_job_udf(run)

            # 4) Pull + upsert Enhanced Phases (bulk by status, can be large)
            stats["phases_enhanced"] = self._sync_phases_enhanced(run)

            # 5) Pull + upsert Contacts (per job, parallel)
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

        jobs = self.client.get_all_jobs_by_division(company_code=company_code, divisions=divisions, status_code=status_code or "")
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
                "superintendent": safe_strip(row.get("Superintendent")),
                "estimator": safe_strip(row.get("Estimator")),
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

        rows = self.client.get_all_job_dates_by_division(company_code=company_code, divisions=divisions, status_code=status_code or "")
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

        rows = self.client.get_all_job_udf_by_division(company_code=company_code, divisions=divisions, status_code=status_code or "")
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

    def _sync_phases_enhanced(self, run: SpectrumSyncRun) -> Dict[str, Any]:
        company_code = self.config.company_code or self.client.company_code
        status_code = self.config.status_code
        sync_time = timezone.now()

        # PhaseEnhanced can be huge, so fetch status codes in parallel
        if status_code is None:
            status_codes = [None]
        elif status_code == "":
            status_codes = ["A", "I"]
        else:
            status_codes = [status_code]

        def fetch(sc):
            rows = self.client.get_phase_enhanced(company_code=company_code, status_code=sc)
            return sc, rows

        all_rows: List[Dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=max(2, self.config.max_workers // 2)) as ex:
            futures = [ex.submit(fetch, sc) for sc in status_codes]
            for f in as_completed(futures):
                sc, rows = f.result()
                self._maybe_store_raw(run, "GetPhaseEnhanced", {"company_code": company_code, "status_code": sc}, rows)
                all_rows.extend(rows)
                logger.info(f"Fetched {len(rows)} enhanced phases for status {sc}")

        from decimal import Decimal

        objs: List[SpectrumPhaseEnhanced] = []
        agg_by_job: Dict[str, Dict[str, Any]] = {}
        for p in all_rows:
            company = safe_strip(p.get("Company_Code")) or company_code or ""
            job_number = safe_strip(p.get("Job_Number")) or ""
            phase_code = safe_strip(p.get("Phase_Code")) or ""
            cost_type = safe_strip(p.get("Cost_Type")) or ""
            if not company or not job_number or not phase_code:
                continue

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
            if cost_type:
                agg["cost_types"].add(cost_type)

            defaults: Dict[str, Any] = {
                "company_code": company,
                "job_number": job_number,
                "phase_code": phase_code,
                "cost_type": cost_type,
                "description": truncate_field(safe_strip(p.get("Description")), 25),
                "status_code": safe_strip(p.get("Status_Code")),
                "unit_of_measure": truncate_field(safe_strip(p.get("Unit_of_Measure")), 25),
                "jtd_quantity": parse_decimal(p.get("JTD_Quantity")),
                "jtd_hours": parse_decimal(p.get("JTD_Hours")),
                "jtd_actual_dollars": jtd_dollars,
                "projected_quantity": parse_decimal(p.get("Projected_Quantity")),
                "projected_hours": parse_decimal(p.get("Projected_Hours")),
                "projected_dollars": projected_dollars,
                "estimated_quantity": parse_decimal(p.get("Estimated_Quantity")),
                "estimated_hours": parse_decimal(p.get("Estimated_Hours")),
                "current_estimated_dollars": estimated_dollars,
                "cost_center": truncate_field(safe_strip(p.get("Cost_Center")), 25),
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
            objs.append(SpectrumPhaseEnhanced(**defaults))

        with transaction.atomic():
            upserted = _bulk_upsert(
                SpectrumPhaseEnhanced,
                objs,
                unique_fields=["company_code", "job_number", "phase_code", "cost_type"],
                batch_size=5000,
            )
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

        return {"fetched": len(all_rows), "upserted": upserted, "project_updates": len(agg_by_job)}

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
                            "superintendent": safe_strip(r.get("Superintendent")),
                            "estimator": safe_strip(r.get("Estimator")),
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


def run_spectrum_sync(
    *,
    company_code: Optional[str] = None,
    divisions: Optional[List[str]] = None,
    status_code: Optional[str] = "",
    run_type: str = SpectrumSyncRun.RUN_AUTO,
) -> Dict[str, Any]:
    """
    Convenience function used by views/commands/tasks.
    """
    cfg = SyncConfig(
        company_code=company_code,
        divisions=divisions or getattr(settings, "SPECTRUM_DIVISIONS", DEFAULT_DIVISIONS),
        status_code=status_code,
        store_raw_payloads=getattr(settings, "SPECTRUM_STORE_RAW_PAYLOADS", False),
        max_workers=getattr(settings, "SPECTRUM_MAX_WORKERS", 8),
    )
    engine = SpectrumSyncEngine(cfg)
    return engine.run(run_type=run_type)
