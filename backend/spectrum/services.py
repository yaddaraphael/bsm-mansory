# backend/spectrum/services.py
"""
Spectrum SOAP/WSDL Service Client
Handles communication with Spectrum Data Exchange services.

Key fixes:
- Correctly unwrap Zeep responses like {'value': <lxml Element>} and {'_value_1': <lxml Element>}
- Parse Spectrum XML that returns many <response> nodes (not just 1)
- Reuse a single requests.Session + Zeep Transport (keep-alive)
- Cache Zeep clients per WSDL URL to avoid repeated WSDL downloads/parsing
- Detect possible API row limits and optionally split by cost_center for "fetch all"
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Mapping
from collections import OrderedDict
from threading import Lock
from typing import Any, Dict, List, Optional, Tuple, Iterable

import requests
import xml.etree.ElementTree as ET

from django.conf import settings
from zeep import Client, Settings
from zeep.exceptions import Fault
from zeep.helpers import serialize_object
from zeep.transports import Transport

from .utils import filter_divisions, normalize_statuses, ALLOWED_PHASE_COST_TYPES

logger = logging.getLogger(__name__)


class SpectrumSOAPClient:
    """
    Client for interacting with Spectrum SOAP/WSDL web services.
    """

    # If an endpoint returns >= this many rows for a given filter, it's a strong signal of truncation.
    # You observed 502 rows, so treat ~500 as "possible cap".
    POSSIBLE_CAP_THRESHOLD = 500

    def __init__(self) -> None:
        self.endpoint = getattr(settings, "SPECTRUM_ENDPOINT", "").rstrip("/")
        self.authorization_id = getattr(settings, "SPECTRUM_AUTHORIZATION_ID", "")
        self.company_code = getattr(settings, "SPECTRUM_COMPANY_CODE", "")
        self.timeout = getattr(settings, "SPECTRUM_TIMEOUT", 60)

        # Optional SSL verify override
        self.verify_ssl = getattr(settings, "SPECTRUM_VERIFY_SSL", True)

        # Divisions to loop when you say "all divisions".
        # Put the real list in settings.py:
        # SPECTRUM_DIVISIONS = ["111", "121", ...]
        self.default_divisions = filter_divisions(
            list(getattr(settings, "SPECTRUM_DIVISIONS", ["111", "121", "131", "135"]))
        )

        if not self.endpoint:
            logger.warning("SPECTRUM_ENDPOINT not configured")
        if not self.authorization_id:
            logger.warning("SPECTRUM_AUTHORIZATION_ID not configured")
        if not self.company_code:
            logger.warning("SPECTRUM_COMPANY_CODE not configured")

        # Keep-alive HTTP
        self._session = requests.Session()
        self._session.verify = self.verify_ssl

        # Zeep settings + transport
        self._transport = Transport(session=self._session, timeout=self.timeout)
        self._zeep_settings = Settings(strict=False, xml_huge_tree=True)

        # Cache zeep clients per exact WSDL URL
        self._client_cache: Dict[str, Client] = {}
        self._cache_lock = Lock()
        self._job_contact_wsdl_failed = False

    # -----------------------
    # Core WSDL helpers
    # -----------------------

    def _get_guid(self) -> str:
        return str(uuid.uuid4())


    def _normalize_base(self) -> str:
        if not self.endpoint:
            raise ValueError("SPECTRUM_ENDPOINT not configured")

        base = self.endpoint.rstrip("/")
        # If endpoint ends with /ws, strip it because WSDLs are usually under /wsdls/
        if base.endswith("/ws"):
            base = base[:-3]
        return base

    def _candidate_wsdl_urls(self, wsdl_name: str) -> List[str]:
        base = self._normalize_base()
        return [
            f"{base}/wsdls/{wsdl_name}.jws",
            f"{base}/wsdls/{wsdl_name}.jws?wsdl",
            f"{base}/ws/{wsdl_name}.jws",
            f"{base}/ws/{wsdl_name}.jws?wsdl",
        ]

    def _get_soap_client(self, wsdl_name: str) -> Client:
        """
        Create or reuse a zeep SOAP client for the given WSDL.
        """
        last_error: Optional[Exception] = None

        for url in self._candidate_wsdl_urls(wsdl_name):
            with self._cache_lock:
                cached = self._client_cache.get(url)
            if cached is not None:
                return cached

            try:
                logger.info("Trying WSDL URL: %s", url)
                client = Client(url, transport=self._transport, settings=self._zeep_settings)
                with self._cache_lock:
                    self._client_cache[url] = client
                logger.info("Created SOAP client for %s at %s", wsdl_name, url)
                return client
            except Exception as e:
                last_error = e
                logger.warning("Failed WSDL URL %s: %s", url, e)
                continue

        raise RuntimeError(
            f"Failed to create SOAP client for {wsdl_name}. "
            f"Last error: {last_error}"
        )

    def _get_client_with_fallback(self, wsdl_candidates: List[str]) -> Tuple[Client, str]:
        last_err: Optional[Exception] = None
        for name in wsdl_candidates:
            try:
                return self._get_soap_client(name), name
            except Exception as e:
                last_err = e
                logger.warning("Failed creating client for %s: %s", name, e)
        raise RuntimeError(f"Failed to create SOAP client. Tried {wsdl_candidates}. Last error: {last_err}")

    # -----------------------
    # XML / Zeep parsing
    # -----------------------

    def _localname(self, tag: Any) -> str:
        if not isinstance(tag, str):
            return str(tag)
        return tag.split("}", 1)[-1] if "}" in tag else tag

    def _unwrap_zeep(self, obj: Any) -> Any:
        """
        Unwrap common Zeep shapes, INCLUDING your failing case:

          {'value': <Element getJob at 0x...>}
          {'_value_1': <Element ...>}
          [OrderedDict({'_value_1': <Element ...>})]
        """
        try:
            ser = serialize_object(obj)
        except Exception:
            ser = obj

        # list -> single mapping -> unwrap value
        if isinstance(ser, list) and len(ser) == 1:
            first = ser[0]
            if isinstance(first, Mapping):
                if "_value_1" in first:
                    return first["_value_1"]
                if "value" in first and len(first.keys()) == 1:
                    return first["value"]
            return first

        # mapping -> unwrap special keys
        if isinstance(ser, Mapping):
            if "_value_1" in ser:
                return ser["_value_1"]
            # this is the one you hit: {'value': <Element ...>}
            if "value" in ser and len(ser.keys()) == 1:
                return ser["value"]

        return ser

    def _element_to_etree(self, element: Any) -> Optional[ET.Element]:
        """
        Convert lxml Element or ElementTree Element into xml.etree.ElementTree.Element.
        """
        if element is None:
            return None

        if isinstance(element, ET.Element):
            return element

        # lxml element
        if hasattr(element, "tag") and element.__class__.__module__.startswith("lxml"):
            try:
                from lxml import etree as LET  # type: ignore
                xml_bytes = LET.tostring(element, encoding="utf-8")
                return ET.fromstring(xml_bytes)
            except Exception as e:
                logger.warning("Failed converting lxml element to ET.Element: %s", e)
                return None

        return None

    def _deep_text(self, node: ET.Element) -> str:
        """
        Extract text from a node; if node contains exactly one child with the same tag name,
        unwrap it (Spectrum sometimes nests same-key structures).
        """
        children = list(node)
        if not children:
            return (node.text or "").strip()

        # unwrap same-tag single child
        if len(children) == 1 and self._localname(children[0].tag).lower() == self._localname(node.tag).lower():
            return self._deep_text(children[0])

        # if it has multiple children, we keep it empty here (fields are expected to be leaf nodes)
        return (node.text or "").strip()

    def _extract_rows_from_root(self, root: ET.Element, *, hint: str = "") -> List[Dict[str, Any]]:
        """
        Spectrum responses usually look like:
          <getJobMain> <response>...</response> <response>...</response> ... </getJobMain>
        """
        # Find ALL <response> nodes regardless of namespace
        rows_nodes: List[ET.Element] = [
            el for el in root.iter()
            if self._localname(el.tag).lower() == "response" and len(list(el)) > 0
        ]

        # Some services might use other row tags, but for your endpoints <response> is correct.
        # If none found, fallback: treat root children as rows if they look record-like.
        if not rows_nodes:
            # Heuristic: find repeating children with same tag and with children.
            counts: Dict[str, int] = {}
            by_tag: Dict[str, List[ET.Element]] = {}
            for el in root.iter():
                if len(list(el)) == 0:
                    continue
                name = self._localname(el.tag)
                counts[name] = counts.get(name, 0) + 1
                by_tag.setdefault(name, []).append(el)
            # pick most frequent repeating tag with count > 1
            best = None
            best_count = 0
            for k, c in counts.items():
                if c > best_count and c > 1:
                    best, best_count = k, c
            if best:
                logger.info("[%s] Auto-detected row tag '%s' (count=%s)", hint, best, best_count)
                rows_nodes = by_tag.get(best, [])

        rows: List[Dict[str, Any]] = []
        for row_el in rows_nodes:
            row: Dict[str, Any] = {}
            for child in list(row_el):
                key = self._localname(child.tag)
                row[key] = self._deep_text(child)
            # keep non-empty rows
            if any((v or "").strip() for v in row.values()):
                rows.append(row)
        return rows

    def _parse_to_rows(self, response: Any, *, hint: str = "") -> List[Dict[str, Any]]:
        """
        Normalize Spectrum responses into a list of dict rows.
        """
        if response is None:
            return []

        unwrapped = self._unwrap_zeep(response)

        # lxml / ET element
        if hasattr(unwrapped, "tag"):
            # preview for debugging only (not truncation of actual data)
            try:
                if unwrapped.__class__.__module__.startswith("lxml"):
                    from lxml import etree as LET  # type: ignore
                    preview = LET.tostring(unwrapped, encoding="utf-8")[:800].decode("utf-8", "ignore")
                    logger.info("%s XML preview (first 800 chars): %s", hint or "Spectrum", preview)
            except Exception:
                pass

            root = self._element_to_etree(unwrapped)
            if root is not None:
                return self._extract_rows_from_root(root, hint=hint)

        # XML string/bytes
        if isinstance(unwrapped, (str, bytes)):
            s = unwrapped.decode("utf-8", "ignore") if isinstance(unwrapped, bytes) else unwrapped
            s_strip = s.strip()
            if s_strip.startswith("<"):
                try:
                    root = ET.fromstring(s_strip.encode("utf-8"))
                    return self._extract_rows_from_root(root, hint=hint)
                except Exception as e:
                    logger.warning("[%s] Failed parsing XML string response: %s", hint, e)
                    return []
            # not XML
            return []

        # list
        if isinstance(unwrapped, list):
            out: List[Dict[str, Any]] = []
            for item in unwrapped:
                out.extend(self._parse_to_rows(item, hint=hint))
            return out

        # mapping
        if isinstance(unwrapped, Mapping):
            # typical wrapper: {"response": [...]}
            if "response" in unwrapped:
                return self._parse_to_rows(unwrapped.get("response"), hint=hint)

            # if mapping itself is a record
            lowered = {str(k).lower() for k in unwrapped.keys()}
            if {"company_code", "job_number"} & lowered:
                return [dict(unwrapped)]

            # last resort: try unwrap again (sometimes nested)
            if "value" in unwrapped and len(unwrapped.keys()) == 1:
                return self._parse_to_rows(unwrapped["value"], hint=hint)

            logger.warning("[%s] Unknown mapping structure keys=%s", hint, list(unwrapped.keys()))
            return [dict(unwrapped)]

        logger.warning("[%s] Unknown response type: %s", hint, type(unwrapped))
        return []

    # -----------------------
    # Error / cap detection helpers
    # -----------------------

    def _looks_like_warning_row(self, row: Dict[str, Any]) -> bool:
        """
        Spectrum sometimes returns an extra row with Error_Code / Error_Description.
        """
        code = (row.get("Error_Code") or "").strip()
        desc = (row.get("Error_Description") or "").strip()
        if not (code or desc):
            return False
        # Treat W or any "exceeds maximum" as truncation signal
        if code.upper() == "W":
            return True
        if "EXCEEDS MAX" in desc.upper():
            return True
        return False

    def _dedupe_company_job(self, rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen = set()
        out: List[Dict[str, Any]] = []
        for r in rows:
            cc = (r.get("Company_Code") or r.get("company_code") or "").strip()
            jn = (r.get("Job_Number") or r.get("job_number") or "").strip()
            key = (cc, jn)
            if not (cc and jn):
                continue
            if key in seen:
                continue
            seen.add(key)
            out.append(r)
        return out

    # -----------------------
    # Public endpoints
    # -----------------------

    def get_jobs(
        self,
        company_code: Optional[str] = None,
        division: Optional[str] = None,
        status_code: Optional[str] = None,
        project_manager: Optional[str] = None,
        superintendent: Optional[str] = None,
        estimator: Optional[str] = None,
        customer_code: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        GetJob.
        Note: If pStatus_Code is blank, Spectrum returns Active + Inactive ONLY (not Complete). :contentReference[oaicite:1]{index=1}
        """
        client = self._get_soap_client("GetJob")
        method = getattr(client.service, "GetJob")

        params: Dict[str, Any] = {
            "Authorization_ID": self.authorization_id,
            "GUID": self._get_guid(),
            "pCompany_Code": company_code or self.company_code or "",
            "pDivision": division or "",
            "pStatus_Code": status_code or "",
            "pProject_Manager": project_manager or "",
            "pSuperintendent": superintendent or "",
            "pEstimator": estimator or "",
            "pCustomer_Code": customer_code or "",
            "pCost_Center": cost_center or "",
            "pSort_By": sort_by or "",
        }

        try:
            logger.info("Calling GetJob with division=%s status=%s cost_center=%s", division, status_code, cost_center)
            resp = method(**params)
            rows = self._parse_to_rows(resp, hint="GetJob")

            # remove trailing warning row if present
            if rows and self._looks_like_warning_row(rows[-1]):
                logger.warning("GetJob returned warning row (possible truncation): %s", rows[-1])
                rows = rows[:-1]

            logger.info("GetJob parsed %s rows", len(rows))
            return rows
        except Fault as e:
            logger.error("SOAP Fault calling GetJob: %s", e, exc_info=True)
            raise
        except Exception as e:
            logger.error("Error calling GetJob: %s", e, exc_info=True)
            raise

    def get_job_main(
        self,
        company_code: Optional[str] = None,
        division: Optional[str] = None,
        status_code: Optional[str] = None,
        project_manager: Optional[str] = None,
        superintendent: Optional[str] = None,
        estimator: Optional[str] = None,
        customer_code: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        GetJobMain.
        """
        client = self._get_soap_client("GetJobMain")
        method = getattr(client.service, "GetJobMain")

        params: Dict[str, Any] = {
            "Authorization_ID": self.authorization_id,
            "GUID": self._get_guid(),
            "pCompany_Code": company_code or self.company_code or "",
            "pDivision": division or "",
            "pStatus_Code": status_code or "",
            "pProject_Manager": project_manager or "",
            "pSuperintendent": superintendent or "",
            "pEstimator": estimator or "",
            "pCustomer_Code": customer_code or "",
            "pCost_Center": cost_center or "",
            "pSort_By": sort_by or "",
        }

        try:
            logger.info("Calling GetJobMain with division=%s status=%s cost_center=%s", division, status_code, cost_center)
            resp = method(**params)
            rows = self._parse_to_rows(resp, hint="GetJobMain")

            if rows and self._looks_like_warning_row(rows[-1]):
                logger.warning("GetJobMain returned warning row (possible truncation): %s", rows[-1])
                rows = rows[:-1]

            logger.info("GetJobMain parsed %s rows", len(rows))
            return rows
        except Fault as e:
            logger.error("SOAP Fault calling GetJobMain: %s", e, exc_info=True)
            raise
        except Exception as e:
            logger.error("Error calling GetJobMain: %s", e, exc_info=True)
            raise

    def get_job_dates(
        self,
        company_code: Optional[str] = None,
        division: Optional[str] = None,
        status_code: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        client = self._get_soap_client("GetJobDates")
        method = getattr(client.service, "GetJobDates")

        params: Dict[str, Any] = {
            "Authorization_ID": self.authorization_id,
            "GUID": self._get_guid(),
            "pCompany_Code": company_code or self.company_code or "",
            "pDivision": division or "",
            "pStatus_Code": status_code or "",
            "pProject_Manager": "",
            "pSuperintendent": "",
            "pEstimator": "",
            "pCustomer_Code": "",
            "pCost_Center": cost_center or "",
            "pSort_By": sort_by or "",
        }

        try:
            logger.info("Calling GetJobDates with division=%s status=%s cost_center=%s", division, status_code, cost_center)
            resp = method(**params)
            rows = self._parse_to_rows(resp, hint="GetJobDates")

            if rows and self._looks_like_warning_row(rows[-1]):
                logger.warning("GetJobDates returned warning row (possible truncation): %s", rows[-1])
                rows = rows[:-1]

            logger.info("GetJobDates parsed %s rows", len(rows))
            return rows
        except Fault as e:
            logger.error("SOAP Fault calling GetJobDates: %s", e, exc_info=True)
            raise
        except Exception as e:
            logger.error("Error calling GetJobDates: %s", e, exc_info=True)
            raise

    def get_job_contacts(self, company_code: Optional[str] = None, job_number: Optional[str] = None) -> List[Dict[str, Any]]:
        method = None
        used_wsdl = "GetJobContact"
        try:
            client, used_wsdl = self._get_client_with_fallback(["GetJobContact"])
            service = client.service
            if hasattr(service, "GetJobContact"):
                method = getattr(service, "GetJobContact")
        except Exception as e:
            if not self._job_contact_wsdl_failed:
                logger.warning("GetJobContact WSDL unavailable, falling back to GetJobContacts. Error: %s", e)
                self._job_contact_wsdl_failed = True
            client, used_wsdl = self._get_client_with_fallback(["GetJobContacts"])
            service = client.service
            if hasattr(service, "GetJobContacts"):
                method = getattr(service, "GetJobContacts")

        if method is None:
            available = [m for m in dir(service) if not m.startswith("_")]
            raise RuntimeError(f"No GetJobContact(s) method found. Available: {available}")

        params: Dict[str, Any] = {
            "Authorization_ID": self.authorization_id,
            "GUID": self._get_guid(),
            "pCompany_Code": company_code or self.company_code or "",
            "pJob_Number": job_number or "",
            "pStatus_Code": "",
            "pProject_Manager": "",
            "pSuperintendent": "",
            "pEstimator": "",
            "pFirst_Name": "",
            "pLast_Name": "",
            "pPhone_Number": "",
            "pTitle": "",
            "pCost_Center": "",
            "pSort_By": "",
        }

        try:
            logger.info("Calling %s for job contacts job_number=%s", used_wsdl, job_number)
            resp = method(**params)
            rows = self._parse_to_rows(resp, hint=used_wsdl)
            if rows and self._looks_like_warning_row(rows[-1]):
                rows = rows[:-1]
            logger.info("JobContacts parsed %s rows", len(rows))
            return rows
        except Fault as e:
            logger.error("SOAP Fault calling %s: %s", used_wsdl, e, exc_info=True)
            raise
        except Exception as e:
            logger.error("Error calling %s: %s", used_wsdl, e, exc_info=True)
            raise

    def get_job_udf(
        self,
        company_code: Optional[str] = None,
        division: Optional[str] = None,
        status_code: Optional[str] = None,
        cost_center: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        client = self._get_soap_client("GetJobUDF")
        method = getattr(client.service, "GetJobUDF")

        params: Dict[str, Any] = {
            "Authorization_ID": self.authorization_id,
            "GUID": self._get_guid(),
            "pCompany_Code": company_code or self.company_code or "",
            "pDivision": division or "",
            "pStatus_Code": status_code or "",
            "pProject_Manager": "",
            "pSuperintendent": "",
            "pEstimator": "",
            "pCustomer_Code": "",
            "pCost_Center": cost_center or "",
        }

        try:
            logger.info("Calling GetJobUDF with division=%s status=%s cost_center=%s", division, status_code, cost_center)
            resp = method(**params)
            rows = self._parse_to_rows(resp, hint="GetJobUDF")
            if rows and self._looks_like_warning_row(rows[-1]):
                rows = rows[:-1]
            logger.info("GetJobUDF parsed %s rows", len(rows))
            return rows
        except Fault as e:
            logger.error("SOAP Fault calling GetJobUDF: %s", e, exc_info=True)
            raise
        except Exception as e:
            logger.error("Error calling GetJobUDF: %s", e, exc_info=True)
            raise


    # -----------------------
    # "Fetch all" utilities (division + A/I/C)
    # -----------------------

    def get_all_jobs_by_division(
        self,
        company_code: Optional[str] = None,
        divisions: Optional[List[str]] = None,
        status_code: Optional[str] = None,
        statuses: Optional[List[str]] = None,
        project_manager: Optional[str] = None,
        superintendent: Optional[str] = None,
        estimator: Optional[str] = None,
        customer_code: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        divs = filter_divisions(divisions or self.default_divisions)
        
        # Handle status_code (single value) or statuses (list)
        stats = normalize_statuses(status_code=status_code, statuses=statuses)

        logger.info("Fetching all jobs by divisions=%s statuses=%s", divs, stats)

        all_rows: List[Dict[str, Any]] = []
        if not divs or not stats:
            logger.info("No divisions or statuses to fetch; returning empty jobs list.")
            return []
        for div in divs:
            for st in stats:
                rows = self.get_jobs(
                    company_code=company_code,
                    division=div,
                    status_code=st,
                    project_manager=project_manager,
                    superintendent=superintendent,
                    estimator=estimator,
                    customer_code=customer_code,
                    cost_center=cost_center,
                    sort_by=sort_by,
                )
                all_rows.extend(rows)
                logger.info("Fetched %s jobs for division %s status %s", len(rows), div, st)

        unique = self._dedupe_company_job(all_rows)
        logger.info("Total jobs fetched: %s (unique=%s)", len(all_rows), len(unique))
        return unique

    def get_all_job_main_by_division(
        self,
        company_code: Optional[str] = None,
        divisions: Optional[List[str]] = None,
        status_code: Optional[str] = None,
        statuses: Optional[List[str]] = None,
        project_manager: Optional[str] = None,
        superintendent: Optional[str] = None,
        estimator: Optional[str] = None,
        customer_code: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None,
        *,
        split_on_possible_cap: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Fetch all job main records looping divisions + statuses (A/I/C).

        If a division+status returns >= POSSIBLE_CAP_THRESHOLD rows, we *may* be truncated.
        Since you can't use PM/customer filters, the best extra "paging-like" handle you
        still have is cost_center (if your Spectrum has it populated).

        This tries:
          1) GetJobMain(div, status)
          2) If rowcount looks capped: collect Cost_Center values from those rows
          3) Re-fetch GetJobMain(div, status, cost_center=each) and union by (Company_Code, Job_Number)
        """
        divs = filter_divisions(divisions or self.default_divisions)
        
        # Handle status_code (single value) or statuses (list)
        stats = normalize_statuses(status_code=status_code, statuses=statuses)

        logger.info("Fetching all job main by divisions=%s statuses=%s", divs, stats)

        all_rows: List[Dict[str, Any]] = []
        if not divs or not stats:
            logger.info("No divisions or statuses to fetch; returning empty job main list.")
            return []

        for div in divs:
            for st in stats:
                base_rows = self.get_job_main(
                    company_code=company_code,
                    division=div,
                    status_code=st,
                    project_manager=project_manager,
                    superintendent=superintendent,
                    estimator=estimator,
                    customer_code=customer_code,
                    cost_center=cost_center,
                    sort_by=sort_by,
                )
                all_rows.extend(base_rows)
                logger.info("Fetched %s job main rows for division %s status %s", len(base_rows), div, st)

                # Possible truncation handling
                if (
                    split_on_possible_cap
                    and len(base_rows) >= self.POSSIBLE_CAP_THRESHOLD
                ):
                    logger.warning(
                        "Possible API cap hit for division=%s status=%s (rows=%s). "
                        "Attempting cost_center split.",
                        div, st, len(base_rows)
                    )
                    cost_centers = sorted({
                        (r.get("Cost_Center") or r.get("cost_center") or "").strip()
                        for r in base_rows
                        if (r.get("Cost_Center") or r.get("cost_center") or "").strip()
                    })

                    if not cost_centers:
                        logger.warning(
                            "No Cost_Center values found in base rows; cannot split further for div=%s status=%s",
                            div, st
                        )
                        continue

                    # Pull per cost center and merge unique
                    existing = {(r.get("Company_Code", "").strip(), r.get("Job_Number", "").strip()) for r in all_rows}
                    for cc in cost_centers:
                        cc_rows = self.get_job_main(
                            company_code=company_code,
                            division=div,
                            status_code=st,
                            project_manager=project_manager,
                            superintendent=superintendent,
                            estimator=estimator,
                            customer_code=customer_code,
                            cost_center=cc,  # Use the specific cost_center from the split
                            sort_by=sort_by,
                        )
                        new_count = 0
                        for r in cc_rows:
                            key = ((r.get("Company_Code") or "").strip(), (r.get("Job_Number") or "").strip())
                            if key[0] and key[1] and key not in existing:
                                all_rows.append(r)
                                existing.add(key)
                                new_count += 1
                        logger.info(
                            "Cost center split: div=%s status=%s cost_center=%s -> %s rows (%s new)",
                            div, st, cc, len(cc_rows), new_count
                        )

        unique = self._dedupe_company_job(all_rows)
        logger.info("Total job main rows fetched: %s (unique=%s)", len(all_rows), len(unique))
        return unique

    def get_all_job_dates_by_division(
        self,
        company_code: Optional[str] = None,
        divisions: Optional[List[str]] = None,
        status_code: Optional[str] = None,
        statuses: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        divs = filter_divisions(divisions or self.default_divisions)
        
        # Handle status_code (single value) or statuses (list)
        stats = normalize_statuses(status_code=status_code, statuses=statuses)

        logger.info("Fetching all job dates by divisions=%s statuses=%s", divs, stats)

        all_rows: List[Dict[str, Any]] = []
        if not divs or not stats:
            logger.info("No divisions or statuses to fetch; returning empty job dates list.")
            return []
        for div in divs:
            for st in stats:
                rows = self.get_job_dates(company_code=company_code, division=div, status_code=st)
                all_rows.extend(rows)
                logger.info("Fetched %s job dates rows for division %s status %s", len(rows), div, st)

        unique = self._dedupe_company_job(all_rows)
        logger.info("Total job dates rows fetched: %s (unique=%s)", len(all_rows), len(unique))
        return unique

    def get_all_job_udf_by_division(
        self,
        company_code: Optional[str] = None,
        divisions: Optional[List[str]] = None,
        status_code: Optional[str] = None,
        statuses: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        divs = filter_divisions(divisions or self.default_divisions)
        
        # Handle status_code (single value) or statuses (list)
        stats = normalize_statuses(status_code=status_code, statuses=statuses)

        logger.info("Fetching all job UDF by divisions=%s statuses=%s", divs, stats)

        all_rows: List[Dict[str, Any]] = []
        if not divs or not stats:
            logger.info("No divisions or statuses to fetch; returning empty job UDF list.")
            return []
        for div in divs:
            for st in stats:
                rows = self.get_job_udf(company_code=company_code, division=div, status_code=st)
                all_rows.extend(rows)
                logger.info("Fetched %s job UDF rows for division %s status %s", len(rows), div, st)

        unique = self._dedupe_company_job(all_rows)
        logger.info("Total job UDF rows fetched: %s (unique=%s)", len(all_rows), len(unique))
        return unique
    

    

    def get_phase_enhanced(
        self,
        company_code: Optional[str] = None,
        job_number: Optional[str] = None,
        status_code: Optional[str] = None,
        cost_type: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get enhanced phase information from Spectrum using the GetPhaseEnhanced web service.
        """
        # GetPhaseEnhanced service expects parameters with 'p' prefix and requires GUID
        params: Dict[str, Any] = {
            "Authorization_ID": self.authorization_id,
            "GUID": self._get_guid(),
        }
        
        # Use provided company_code or default to configured company_code
        company_to_use = company_code or self.company_code
        if company_to_use:
            params["pCompany_Code"] = company_to_use
        if job_number:
            params["pJob_Number"] = job_number
        else:
            params["pJob_Number"] = ""  # Required parameter
        if status_code is not None:
            params["pStatus_Code"] = status_code
        else:
            params["pStatus_Code"] = ""  # Required parameter
        if cost_type:
            params["pCost_Type"] = cost_type
        else:
            params["pCost_Type"] = ""  # Required parameter
        if cost_center:
            params["pCost_Center"] = cost_center
        else:
            params["pCost_Center"] = ""  # Required parameter
        if sort_by:
            params["pSort_By"] = sort_by
        else:
            params["pSort_By"] = ""  # Required parameter

        # Call GetPhaseEnhanced service directly
        client = self._get_soap_client("GetPhaseEnhanced")
        service = getattr(client.service, "GetPhaseEnhanced")
        
        try:
            logger.info(f"Calling GetPhaseEnhanced with company={company_to_use}, job_number={job_number}, cost_type={cost_type}")
            response = service(**params)
            rows = self._parse_to_rows(response, hint="GetPhaseEnhanced")
            logger.info(f"GetPhaseEnhanced parsed {len(rows)} rows")
            return rows
        except Fault as fault:
            logger.error(f"Spectrum SOAP Fault calling GetPhaseEnhanced.GetPhaseEnhanced: {fault}", exc_info=True)
            raise
        except Exception as e:
            logger.error(f"Error calling Spectrum service GetPhaseEnhanced.GetPhaseEnhanced: {e}", exc_info=True)
            raise

    def get_phase(
        self,
        company_code: Optional[str] = None,
        job_number: Optional[str] = None,
        status_code: Optional[str] = None,
        cost_type: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get phase information from Spectrum using the GetPhase web service.
        """
        params: Dict[str, Any] = {
            "Authorization_ID": self.authorization_id,
            "GUID": self._get_guid(),
        }

        company_to_use = company_code or self.company_code
        if company_to_use:
            params["pCompany_Code"] = company_to_use
        if job_number:
            params["pJob_Number"] = job_number
        else:
            params["pJob_Number"] = ""
        if status_code is not None:
            params["pStatus_Code"] = status_code
        else:
            params["pStatus_Code"] = ""
        if cost_type:
            params["pCost_Type"] = cost_type
        else:
            params["pCost_Type"] = ""
        if cost_center:
            params["pCost_Center"] = cost_center
        else:
            params["pCost_Center"] = ""
        if sort_by:
            params["pSort_By"] = sort_by
        else:
            params["pSort_By"] = ""

        client = self._get_soap_client("GetPhase")
        service = getattr(client.service, "GetPhase")

        try:
            logger.info(
                "Calling GetPhase with company=%s job_number=%s status=%s cost_type=%s",
                company_to_use,
                job_number,
                status_code,
                cost_type,
            )
            response = service(**params)
            rows = self._parse_to_rows(response, hint="GetPhase")
            logger.info("GetPhase parsed %s rows", len(rows))
            return rows
        except Fault as fault:
            logger.error("Spectrum SOAP Fault calling GetPhase.GetPhase: %s", fault, exc_info=True)
            raise
        except Exception as e:
            logger.error("Error calling Spectrum service GetPhase.GetPhase: %s", e, exc_info=True)
            raise

    def get_all_phases_by_status(
        self,
        company_code: Optional[str] = None,
        status_code: Optional[str] = None,
        statuses: Optional[List[str]] = None,
        cost_type: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        stats = normalize_statuses(status_code=status_code, statuses=statuses)
        logger.info("Fetching all phases by statuses=%s", stats)

        if not stats:
            return []

        all_rows: List[Dict[str, Any]] = []
        for st in stats:
            rows = self.get_phase(
                company_code=company_code,
                status_code=st,
                cost_type=cost_type,
                cost_center=cost_center,
                sort_by=sort_by,
            )
            all_rows.extend(rows)
            logger.info("Fetched %s phase rows for status %s", len(rows), st)
        return all_rows

    def get_all_phases_enhanced_by_status(
        self,
        company_code: Optional[str] = None,
        status_code: Optional[str] = None,
        statuses: Optional[List[str]] = None,
        cost_type: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        stats = normalize_statuses(status_code=status_code, statuses=statuses)
        logger.info("Fetching all enhanced phases by statuses=%s", stats)

        if not stats:
            return []

        if cost_type:
            cost_types = [cost_type]
        else:
            cost_types = sorted(ALLOWED_PHASE_COST_TYPES)

        all_rows: List[Dict[str, Any]] = []
        for st in stats:
            for ct in cost_types:
                rows = self.get_phase_enhanced(
                    company_code=company_code,
                    status_code=st,
                    cost_type=ct,
                    cost_center=cost_center,
                    sort_by=sort_by,
                )
                all_rows.extend(rows)
                logger.info(
                    "Fetched %s enhanced phase rows for status %s cost_type %s",
                    len(rows),
                    st,
                    ct,
                )
        return all_rows
