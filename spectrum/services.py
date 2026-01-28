"""
Spectrum SOAP/WSDL Service Client
Handles communication with Spectrum Data Exchange services.
"""
import logging
from typing import Dict, List, Optional, Any, Tuple
from collections.abc import Mapping
from collections import OrderedDict
from django.conf import settings
from django.core.cache import cache
from zeep import Client, Settings
from zeep.helpers import serialize_object
from zeep.exceptions import Fault
from zeep.transports import Transport
import requests
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)


class SpectrumSOAPClient:
    """
    Client for interacting with Spectrum's SOAP/WSDL web services.
    """
    
    def __init__(self):
        self.endpoint = getattr(settings, 'SPECTRUM_ENDPOINT', '')
        self.authorization_id = getattr(settings, 'SPECTRUM_AUTHORIZATION_ID', '')
        self.company_code = getattr(settings, 'SPECTRUM_COMPANY_CODE', 'BSM')
        self.timeout = getattr(settings, 'SPECTRUM_TIMEOUT', 30)
        
        if not self.endpoint:
            logger.warning("SPECTRUM_ENDPOINT not configured")
        if not self.authorization_id:
            logger.warning("SPECTRUM_AUTHORIZATION_ID not configured")
    
    def _get_guid(self) -> str:
        """
        Generate a new GUID for Spectrum authentication.
        GUIDs are generated per call to avoid conflicts.
        """
        import uuid
        guid = str(uuid.uuid4())
        logger.info(f"Generated new GUID: {guid}")
        return guid
    
    def _get_soap_client(self, wsdl_name: str) -> Client:
        """
        Create a zeep SOAP client for the given WSDL.
        
        Args:
            wsdl_name: Name of the WSDL service (e.g., 'GetJob', 'GetJobMain')
                      Should NOT include .jws extension
        
        Returns:
            zeep.Client instance
        """
        if not self.endpoint:
            raise ValueError("SPECTRUM_ENDPOINT not configured")
        
        # Get base endpoint and strip trailing slashes
        base = self.endpoint.rstrip("/")
        
        # If endpoint ends with /ws, strip it because WSDLs are under /wsdls/
        if base.endswith("/ws"):
            base = base[:-3]
        
        # Build candidate WSDL URLs (try common Spectrum patterns)
        candidates = [
            f"{base}/wsdls/{wsdl_name}.jws",          # ✅ Spectrum documented format
            f"{base}/wsdls/{wsdl_name}.jws?wsdl",     # some servers require this
            f"{base}/ws/{wsdl_name}.jws",             # less common
            f"{base}/ws/{wsdl_name}.jws?wsdl",        # less common
        ]
        
        # Create transport with timeout
        session = requests.Session()
        # If your Spectrum server uses a private cert and you get SSL errors, you can disable verify:
        # session.verify = False
        transport = Transport(session=session, timeout=self.timeout)
        
        # Create settings for zeep
        settings_obj = Settings(strict=False, xml_huge_tree=True)
        
        # Try each candidate URL
        last_error = None
        for url in candidates:
            try:
                logger.info(f"Trying WSDL URL: {url}")
                client = Client(url, transport=transport, settings=settings_obj)
                logger.info(f"Created SOAP client for {wsdl_name} at {url}")
                return client
            except Exception as e:
                last_error = e
                logger.warning(f"Failed WSDL URL {url}: {e}")
                continue
        
        # If all candidates failed, raise exception
        error_msg = f"Failed to create SOAP client for {wsdl_name}. Tried: {candidates}. Last error: {last_error}"
        logger.error(error_msg)
        raise Exception(error_msg)
    
    def _get_client_with_fallback(self, wsdl_candidates: List[str]) -> Tuple[Client, str]:
        """
        Try multiple WSDL names and return the first successful client.
        
        Args:
            wsdl_candidates: List of WSDL names to try (e.g., ['GetJobContact', 'GetJobContacts'])
        
        Returns:
            Tuple of (client, used_wsdl_name)
        """
        last_err = None
        for wsdl_name in wsdl_candidates:
            try:
                client = self._get_soap_client(wsdl_name)
                logger.info(f"Successfully created SOAP client with WSDL name: {wsdl_name}")
                return client, wsdl_name
            except Exception as e:
                last_err = e
                logger.warning(f"Failed to create client with WSDL name {wsdl_name}: {e}")
                continue
        raise Exception(f"Failed to create SOAP client. Tried {wsdl_candidates}. Last error: {last_err}")
    
    def _xml_to_dict(self, elem: ET.Element) -> Any:
        """
        Convert an xml.etree.ElementTree element into Python dict/list.
        - Strips namespaces
        - If repeated tags occur, stores them as lists
        - If no children, returns text
        """
        if elem is None:
            logger.warning("[_xml_to_dict] Element is None")
            return None
        
        def strip_ns(tag: str) -> str:
            return tag.split('}', 1)[-1] if '}' in tag else tag

        children = list(elem)
        if not children:
            text = elem.text.strip() if elem.text else None
            return text

        out = {}
        for child in children:
            key = strip_ns(child.tag)
            val = self._xml_to_dict(child)

            if key in out:
                if not isinstance(out[key], list):
                    out[key] = [out[key]]
                out[key].append(val)
            else:
                out[key] = val

        return out
    
    def _parse_response(self, response: Any) -> Any:
        """
        Robust Spectrum response parser.
        Handles:
        - list with single OrderedDict {'_value_1': <lxml Element>}
        - raw lxml Element
        - xml string/bytes
        Always returns dict/list (never plain str for XML).
        """
        if response is None:
            return {}

        # --- Step 1: unwrap the common Zeep "list -> OrderedDict -> _value_1" pattern ---
        try:
            serialized = serialize_object(response)
        except Exception:
            serialized = response

        # If Spectrum returns: [OrderedDict({'_value_1': <Element>})]
        if isinstance(serialized, list) and len(serialized) == 1:
            first = serialized[0]
            if isinstance(first, dict) and "_value_1" in first:
                serialized = first["_value_1"]
            else:
                serialized = first

        # --- Step 2: if we have an XML element (lxml or ElementTree), convert to dict ---
        def strip_ns(tag: str) -> str:
            return tag.split("}", 1)[-1] if "}" in tag else tag

        def xml_to_dict(elem):
            children = list(elem)
            if not children:
                txt = elem.text.strip() if elem.text else None
                return txt

            out = {}
            for child in children:
                k = strip_ns(child.tag)
                v = xml_to_dict(child)

                if k in out:
                    if not isinstance(out[k], list):
                        out[k] = [out[k]]
                    out[k].append(v)
                else:
                    out[k] = v
            return out

        def flatten_spectrum_kv(obj):
            # Flatten {"Field":{"Field":"value"}} recursively
            if isinstance(obj, list):
                return [flatten_spectrum_kv(x) for x in obj]
            if isinstance(obj, dict):
                new = {}
                for k, v in obj.items():
                    v = flatten_spectrum_kv(v)
                    if isinstance(v, dict) and len(v) == 1 and k in v:
                        v = v[k]
                    new[k] = v
                return new
            return obj

        # lxml Element?
        if hasattr(serialized, "tag") and serialized.__class__.__module__.startswith("lxml"):
            try:
                from lxml import etree as LET
                xml_bytes = LET.tostring(serialized, encoding="utf-8")
                preview = xml_bytes[:800].decode("utf-8", errors="ignore")
                logger.info(f"[_parse_response] XML preview (first 800 chars): {preview}")

                root = ET.fromstring(xml_bytes)
                parsed = xml_to_dict(root)

                # Guarantee dict wrapper
                if not isinstance(parsed, (dict, list)):
                    parsed = {"response": parsed}

                return flatten_spectrum_kv(parsed)
            except Exception as e:
                logger.exception(f"[_parse_response] Failed parsing lxml element: {e}")
                return {"error": f"Failed to parse lxml element: {str(e)}"}

        # ElementTree Element?
        if isinstance(serialized, ET.Element):
            parsed = xml_to_dict(serialized)
            if not isinstance(parsed, (dict, list)):
                parsed = {"response": parsed}
            return flatten_spectrum_kv(parsed)

        # XML string?
        if isinstance(serialized, (str, bytes)):
            s = serialized.decode("utf-8", errors="ignore") if isinstance(serialized, bytes) else serialized
            s_strip = s.strip()
            if s_strip.startswith("<") and s_strip.endswith(">"):
                logger.info(f"[_parse_response] XML preview (first 800 chars): {s_strip[:800]}")
                try:
                    root = ET.fromstring(s_strip.encode("utf-8"))
                    parsed = xml_to_dict(root)
                    if not isinstance(parsed, (dict, list)):
                        parsed = {"response": parsed}
                    return flatten_spectrum_kv(parsed)
                except ET.ParseError as e:
                    logger.warning(f"[_parse_response] Failed to parse XML string: {e}")
                    return {"error": f"Failed to parse XML string: {str(e)}"}

            # Non-XML string: return as data safely
            return {"response": s}

        # dict/list already?
        if isinstance(serialized, (dict, list)):
            return flatten_spectrum_kv(serialized)

        # fallback
        return {"response": str(serialized)}
    
    def _extract_from_response_wrapper(self, response: Any) -> List[Any]:
        """
        Extract data from Spectrum's common response wrapper.
        Spectrum often returns: {"response": list(...)} or {"returnData": list(...)}
        """
        if not response:
            return []
        
        # Handle dict with "response" key
        if isinstance(response, dict) and "response" in response:
            items = response["response"]
            if items is None:
                return []
            return items if isinstance(items, list) else [items]
        
        # Handle dict with "returnData" key
        if isinstance(response, dict) and "returnData" in response:
            items = response["returnData"]
            if items is None:
                return []
            return items if isinstance(items, list) else [items]
        
        # Already a list
        if isinstance(response, list):
            return response
        
        # Single item
        return [response]
    
    def _extract_list_from_response(self, parsed: Dict[str, Any], plural_key: str = "response", 
                                     singular_key: str = "Contact", id_field: str = "Contact_ID") -> List[Dict[str, Any]]:
        """
        Extract a list of items from a parsed response dict.
        
        Args:
            parsed: The parsed response dictionary
            plural_key: Key that contains the list (e.g., "response")
            singular_key: Singular form of the item name (e.g., "Contact")
            id_field: Field name that identifies a valid item (e.g., "Contact_ID")
        
        Returns:
            List of item dictionaries
        """
        if not parsed or not isinstance(parsed, dict):
            return []
        
        # Try plural key first (e.g., "response")
        items = parsed.get(plural_key)
        if items is None:
            # Try singular key (e.g., "Contact")
            items = parsed.get(singular_key)
        
        if items is None:
            # Check if the dict itself is an item (has the id_field)
            if id_field in parsed or any(k.lower() in [id_field.lower(), 'job_number', 'jobnumber'] for k in parsed.keys()):
                return [parsed]
            return []
        
        # Normalize to list
        if not isinstance(items, list):
            items = [items] if items else []
        
        # Filter out None values and ensure they're dicts
        result = []
        for item in items:
            if item is None:
                continue
            if isinstance(item, dict):
                result.append(item)
            else:
                logger.warning(f"[_extract_list_from_response] Skipping non-dict item: {type(item)}")
        
        return result
    
    def _flatten_spectrum_kv(self, obj: Any) -> Any:
        """
        Spectrum often returns: {"Field": {"Field": "value"}}
        This flattens those recursively for dicts/lists.
        """
        if isinstance(obj, list):
            return [self._flatten_spectrum_kv(x) for x in obj]

        if isinstance(obj, dict):
            new = {}
            for k, v in obj.items():
                v = self._flatten_spectrum_kv(v)

                # If v is dict with a single key equal to the parent key, unwrap it
                if isinstance(v, dict) and len(v) == 1 and k in v:
                    v = v[k]

                new[k] = v
            return new

        return obj
    
    def _deep_unwrap(self, obj: Any) -> Any:
        """
        Recursively unwrap nested OrderedDict structures.
        Converts: {'Job_Number': {'Job_Number': '41584'}} -> {'Job_Number': '41584'}
        Works recursively for lists/dicts.
        """
        if isinstance(obj, list):
            return [self._deep_unwrap(x) for x in obj]
        
        if isinstance(obj, (dict, OrderedDict)):
            cleaned = {}
            for k, v in obj.items():
                v = self._deep_unwrap(v)
                
                # If value is dict with one key equal to parent key, unwrap it
                if isinstance(v, dict) and len(v) == 1 and k in v:
                    cleaned[k] = v[k]
                else:
                    cleaned[k] = v
            return cleaned
        
        return obj
    
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
        sort_by: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get jobs from Spectrum using the GetJob web service.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            division: Division
            status_code: Status (A/I/C or blank for Active and Inactive only)
            project_manager: Project Manager
            superintendent: Superintendent
            estimator: Estimator
            customer_code: Customer Code
            cost_center: Job Cost Center
            sort_by: Sort By Options (blank=Job number, D=Division, P=Project Manager, 
                     S=Superintendent, E=Estimator, C=Customer Code)
        
        Returns:
            List of job dictionaries
        """
        if not self.authorization_id:
            raise ValueError("SPECTRUM_AUTHORIZATION_ID not configured")
        
        # Use provided company_code or default
        company_to_use = company_code or self.company_code
        
        # Get GUID
        guid = self._get_guid()
        
        # Create SOAP client (pass service name without .jws extension)
        client = self._get_soap_client('GetJob')
        method = client.service.GetJob
        
        # Prepare parameters
        # All optional parameters should be empty strings if not provided
        params = {
            'Authorization_ID': self.authorization_id,
            'GUID': guid,
            'pCompany_Code': company_to_use,
            'pDivision': division or '',
            'pStatus_Code': status_code or '',
            'pProject_Manager': project_manager or '',
            'pSuperintendent': superintendent or '',
            'pEstimator': estimator or '',
            'pCustomer_Code': customer_code or '',
            'pCost_Center': cost_center or '',
            'pSort_By': sort_by or '',
        }
        
        logger.info(f"Calling GetJob with company={company_to_use}, division={division}, status={status_code}, sort_by={sort_by}")
        logger.debug(f"GetJob parameters: {params}")
        
        try:
            # Call the SOAP service
            logger.debug("Making SOAP call to GetJob...")
            response = method(**params)
            logger.debug(f"SOAP call successful, response type: {type(response)}")
            
            # Log raw response structure for debugging
            try:
                raw_serialized = serialize_object(response)
                logger.info(f"Raw response structure: {type(raw_serialized)}")
                if isinstance(raw_serialized, dict):
                    logger.info(f"Raw response keys: {list(raw_serialized.keys())}")
                    # Log first few key-value pairs for debugging
                    for key, value in list(raw_serialized.items())[:5]:
                        if isinstance(value, (list, dict)):
                            logger.info(f"  {key}: {type(value).__name__} with {len(value) if hasattr(value, '__len__') else 'N/A'} items")
                        else:
                            logger.info(f"  {key}: {value}")
                elif isinstance(raw_serialized, list):
                    logger.info(f"Raw response is list with {len(raw_serialized)} items")
                    if len(raw_serialized) > 0:
                        logger.info(f"First item type: {type(raw_serialized[0])}, keys: {list(raw_serialized[0].keys()) if isinstance(raw_serialized[0], dict) else 'N/A'}")
            except Exception as e:
                logger.warning(f"Could not serialize raw response for logging: {e}")
            
            # Parse response
            logger.info("=== STARTING RESPONSE PARSING ===")
            parsed = self._parse_response(response)
            logger.info(f"[get_jobs] Parsed response type: {type(parsed)}")
            if isinstance(parsed, dict):
                logger.info(f"[get_jobs] Parsed response keys: {list(parsed.keys())}")
                # Log all top-level keys and their types
                for key, value in parsed.items():
                    logger.info(f"[get_jobs]   {key}: {type(value).__name__} (len={len(value) if hasattr(value, '__len__') else 'N/A'})")
            elif isinstance(parsed, list):
                logger.info(f"[get_jobs] Parsed response is list with {len(parsed)} items")
            
            # Check for error fields first - Spectrum often returns errors in the response dict
            if isinstance(parsed, dict):
                # Check if response contains a single error record
                if "response" in parsed and isinstance(parsed["response"], dict):
                    err = parsed["response"].get("Error_Description")
                    code = parsed["response"].get("Error_Code")
                    if err or code:
                        err_str = err.strip() if isinstance(err, str) else str(err) if err else ""
                        code_str = code.strip() if isinstance(code, str) else str(code) if code else ""
                        error_msg = f"Spectrum GetJob error: {code_str} - {err_str}"
                        logger.error(error_msg)
                        raise Exception(error_msg)
                
                # Check top-level error fields
                error_code = parsed.get('Error_Code', '').strip() if isinstance(parsed.get('Error_Code'), str) else None
                error_desc = parsed.get('Error_Description', '').strip() if isinstance(parsed.get('Error_Description'), str) else None
                
                # Check if it's a warning about too many records (API limit hit)
                if error_code == 'W' or (error_desc and 'exceeds maximum' in error_desc.upper()):
                    logger.warning(f"Spectrum API returned warning about record limit. Error: {error_code} - {error_desc}")
                    logger.warning("This indicates the API returned a partial result due to record limits. Consider breaking down the request further (by project manager, cost center, etc.)")
                    # Continue processing - we'll get what we can, but this is a partial result
                elif error_code and error_code not in ['', 'W']:  # W is just a warning
                    error_msg = f"Spectrum GetJob error: {error_code} - {error_desc}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
            
            # Extract jobs using the helper method (handles {'response': [jobs...]} pattern)
            jobs = self._extract_list_from_response(
                parsed,
                plural_key="response",
                singular_key="Job",
                id_field="Job_Number"
            )
            
            logger.info(f"[get_jobs] Extracted {len(jobs)} jobs from response structure")
            
            # Check if the last item is an API limit warning
            if jobs and len(jobs) > 0:
                last_item = jobs[-1]
                if isinstance(last_item, dict):
                    error_code = last_item.get('Error_Code')
                    error_desc = last_item.get('Error_Description')
                    # Check if it's an API limit warning
                    if error_code == 'W' or (error_desc and 'exceeds maximum' in str(error_desc).upper()):
                        logger.warning(f"[get_jobs] API limit warning detected in response: {error_code} - {error_desc}")
                        logger.warning("This indicates the API returned a partial result. The last item is a warning, not a job.")
                        # Remove the warning item from jobs list
                        jobs = jobs[:-1]
            
            # Ensure all items are dictionaries and have required fields
            # Also flatten nested OrderedDict structures
            result = []
            for idx, job in enumerate(jobs):
                if job is None:
                    logger.warning(f"[get_jobs] Job item {idx} is None, skipping")
                    continue
                
                # Skip items that are error/warning messages
                if isinstance(job, dict):
                    error_code = job.get('Error_Code')
                    error_desc = job.get('Error_Description')
                    if error_code == 'W' or (error_desc and 'exceeds maximum' in str(error_desc).upper()):
                        logger.debug(f"[get_jobs] Skipping warning item at index {idx}: {error_code} - {error_desc}")
                        continue
                    
                if isinstance(job, dict):
                    # Flatten nested dict structures (e.g., {'Company_Code': {'Company_Code': 'BSM'}} -> {'Company_Code': 'BSM'})
                    flattened_job = {}
                    for key, value in job.items():
                        if isinstance(value, dict):
                            # Check if it's a nested structure like {'Company_Code': {'Company_Code': 'BSM'}}
                            if key in value and len(value) == 1:
                                # Unwrap the nested value
                                flattened_job[key] = value[key]
                            elif '_text' in value:
                                # Has _text field, use that
                                flattened_job[key] = value['_text']
                            else:
                                # Keep as dict if it has multiple keys
                                flattened_job[key] = value
                        elif isinstance(value, (list, tuple)) and len(value) == 1 and isinstance(value[0], dict):
                            # List with single dict - might be nested
                            if key in value[0] and len(value[0]) == 1:
                                flattened_job[key] = value[0][key]
                            else:
                                flattened_job[key] = value
                        else:
                            # Simple value
                            flattened_job[key] = value
                    
                    job_keys = list(flattened_job.keys())
                    logger.debug(f"[get_jobs] Job item {idx} keys: {job_keys}")
                    
                    # Try to find job number field (case-insensitive, try multiple variations)
                    job_number = None
                    job_number_key = None
                    for key in job_keys:
                        key_lower = key.lower()
                        if key_lower in ['job_number', 'jobnumber', 'job', 'job_num', 'jobno']:
                            job_number = flattened_job.get(key)
                            job_number_key = key
                            break
                    
                    # Try to find company code field
                    company_code = None
                    company_code_key = None
                    for key in job_keys:
                        key_lower = key.lower()
                        if key_lower in ['company_code', 'companycode', 'company', 'comp_code', 'comp']:
                            company_code = flattened_job.get(key)
                            company_code_key = key
                            break
                    
                    # Normalize and validate job number format
                    # Accepted formats: xx-xxxx, xx-xxxx-xx, or xx-xxxxx (where x is a digit)
                    # Spectrum returns job numbers with suffixes like "43349 MS", "42036 SID", "10-1002", etc.
                    import re
                    # Pattern for valid job numbers: xx-xxxx, xx-xxxx-xx, xx-xxxxx, xx-xxxx-x, xx-xxxxxx, xx-xxxxxxx, or xx-xxxxxxxx
                    valid_job_patterns = [
                        re.compile(r'^\d{2}-\d{4}$'),           # xx-xxxx (e.g., 10-1002)
                        re.compile(r'^\d{2}-\d{4}-\d{2}$'),     # xx-xxxx-xx (e.g., 10-1002-01)
                        re.compile(r'^\d{2}-\d{5}$'),           # xx-xxxxx (e.g., 10-10020)
                        re.compile(r'^\d{2}-\d{4}-\d{1}$'),     # xx-xxxx-x (e.g., 10-1002-1)
                        re.compile(r'^\d{2}-\d{6}$'),           # xx-xxxxxx (e.g., 10-100200)
                        re.compile(r'^\d{2}-\d{7}$'),           # xx-xxxxxxx (e.g., 10-1002000)
                        re.compile(r'^\d{2}-\d{8}$'),           # xx-xxxxxxxx (e.g., 10-10020000)
                    ]
                    
                    if job_number:
                        if isinstance(job_number, str):
                            original_job_number = job_number.strip()
                            
                            # Extract numeric part - remove everything after first space (suffixes like "MS", "SID", "A", etc.)
                            job_number = original_job_number.split()[0] if ' ' in original_job_number else original_job_number
                            
                            # Validate against accepted patterns
                            is_valid = any(pattern.match(job_number) for pattern in valid_job_patterns)
                            
                            if not is_valid:
                                logger.debug(
                                    f"[get_jobs] Job item {idx} has invalid job number format: '{job_number}' "
                                    f"(from '{original_job_number}'). Accepted formats: xx-xxxx, xx-xxxx-xx, xx-xxxxx, xx-xxxx-x, xx-xxxxxx, xx-xxxxxxx, or xx-xxxxxxxx. Skipping."
                                )
                                continue
                            
                            # Update the flattened job with cleaned and validated job number
                            flattened_job[job_number_key] = job_number
                        else:
                            # Not a string - skip
                            logger.warning(f"[get_jobs] Job item {idx} has non-string job number: {type(job_number)}. Skipping.")
                            continue
                    
                    # Check if it has job-like fields
                    has_job_number = job_number is not None
                    has_company_code = company_code is not None
                    
                    if has_job_number and has_company_code:
                        result.append(flattened_job)
                        logger.debug(f"[get_jobs] Added job {idx} to result. Job_Number={job_number}, Company_Code={company_code}")
                    elif has_job_number:
                        # Has job number but no company code - check if job number is valid format
                        is_valid_format = any(pattern.match(str(job_number)) for pattern in valid_job_patterns)
                        if is_valid_format:
                            result.append(flattened_job)
                            logger.warning(f"[get_jobs] Added job {idx} with missing Company_Code. Job_Number={job_number}")
                        else:
                            logger.warning(f"[get_jobs] Job item {idx} has invalid job number format: '{job_number}'. Skipping.")
                    else:
                        logger.warning(f"[get_jobs] Job item {idx} missing required fields. Job_Number={job_number}, Company_Code={company_code}. Keys: {job_keys}")
                        logger.warning(f"[get_jobs] Job item {idx} sample: {str(flattened_job)[:500]}")
                else:
                    logger.debug(f"[get_jobs] Job item {idx} is not a dict, type: {type(job)}")
                    # Try to serialize if it's a zeep object
                    try:
                        serialized = serialize_object(job)
                        if isinstance(serialized, dict):
                            # Flatten it the same way
                            flattened_serialized = {}
                            for key, value in serialized.items():
                                if isinstance(value, dict) and key in value and len(value) == 1:
                                    flattened_serialized[key] = value[key]
                                elif isinstance(value, dict) and '_text' in value:
                                    flattened_serialized[key] = value['_text']
                                else:
                                    flattened_serialized[key] = value
                            
                            serialized_keys = list(flattened_serialized.keys())
                            has_job_number = any(k.lower() == 'job_number' for k in serialized_keys)
                            has_company_code = any(k.lower() == 'company_code' for k in serialized_keys)
                            if has_job_number or has_company_code:
                                result.append(flattened_serialized)
                                logger.debug(f"[get_jobs] Added serialized job {idx} to result")
                            else:
                                logger.warning(f"[get_jobs] Serialized job {idx} doesn't have Job_Number or Company_Code. Keys: {serialized_keys}")
                        else:
                            logger.warning(f"[get_jobs] Serialized job {idx} is not a dict: {type(serialized)}")
                    except Exception as e:
                        logger.warning(f"[get_jobs] Could not serialize job item {idx}: {e}")
            
            logger.info(f"GetJob returned {len(result)} valid jobs")
            if len(result) == 0:
                if len(jobs) > 0:
                    logger.warning(f"Parsed {len(jobs)} items but none had Job_Number/Company_Code. Sample keys: {list(jobs[0].keys()) if jobs and isinstance(jobs[0], dict) else 'N/A'}")
                else:
                    logger.warning(f"No jobs found in response. Parsed structure: {type(parsed)}")
                    if isinstance(parsed, dict):
                        logger.warning(f"Response dict keys: {list(parsed.keys())}")
                        # Log a sample of the response for debugging
                        import json
                        try:
                            # Try to convert to JSON for logging (limit size)
                            sample = {k: str(v)[:100] if not isinstance(v, (dict, list)) else type(v).__name__ for k, v in list(parsed.items())[:10]}
                            logger.warning(f"Response sample: {json.dumps(sample, indent=2)}")
                        except:
                            pass
            
            return result
            
        except Fault as e:
            logger.error(f"SOAP Fault calling GetJob: {e.message}")
            raise Exception(f"Spectrum SOAP error: {e.message}")
        except Exception as e:
            logger.error(f"Error calling GetJob: {e}", exc_info=True)
            raise
    
    def get_all_jobs_by_division(
        self,
        company_code: Optional[str] = None,
        divisions: Optional[List[str]] = None,
        status_code: Optional[str] = None,
        project_manager: Optional[str] = None,
        superintendent: Optional[str] = None,
        estimator: Optional[str] = None,
        customer_code: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all jobs from Spectrum by looping through divisions.
        This method handles API limits by fetching jobs per division and combining results.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            divisions: List of division codes to fetch (defaults to all: ['111', '121', '131', '135', '145'])
            status_code: Status (A/I/C or blank for Active and Inactive only)
            project_manager: Project Manager
            superintendent: Superintendent
            estimator: Estimator
            customer_code: Customer Code
            cost_center: Job Cost Center
            sort_by: Sort By Options
        
        Returns:
            Combined list of all job dictionaries from all divisions
        """
        # Default divisions if not provided
        if divisions is None:
            divisions = ['111', '121', '131', '135', '145']
        
        all_jobs = []
        total_fetched = 0
        
        logger.info(f"Fetching all jobs by looping through {len(divisions)} divisions: {divisions}")
        
        # If status_code is not specified, we need to fetch by status to avoid API limits
        # Spectrum API might limit results, so we break down by status: A (Active), I (Inactive), C (Complete)
        status_codes_to_fetch = [status_code] if status_code else ['A', 'I', 'C']
        
        for division in divisions:
            for status in status_codes_to_fetch:
                try:
                    logger.info(f"Fetching jobs for division {division}, status {status}...")
                    division_jobs = self.get_jobs(
                        company_code=company_code,
                        division=division,
                        status_code=status,
                        project_manager=project_manager,
                        superintendent=superintendent,
                        estimator=estimator,
                        customer_code=customer_code,
                        cost_center=cost_center,
                        sort_by=sort_by
                    )
                    division_count = len(division_jobs)
                    total_fetched += division_count
                    all_jobs.extend(division_jobs)
                    logger.info(f"Fetched {division_count} jobs for division {division}, status {status}. Total so far: {total_fetched}")
                    
                    # If we got 500+ results, the API might be limiting - try breaking down further by cost center
                    # Note: We don't break down by PM here because that would duplicate the initial fetch
                    # Instead, we'll try cost centers or skip if we already have project_manager filter
                    if division_count >= 500 and not project_manager:
                        logger.warning(f"Got {division_count} jobs for division {division}, status {status}, which suggests API limit. Attempting to fetch by cost centers...")
                        # Get unique cost centers from already fetched jobs
                        cost_centers = set()
                        for job in division_jobs:
                            cc = job.get('Cost_Center') or job.get('cost_center')
                            if cc:
                                cost_centers.add(cc)
                        
                        # Fetch by each cost center to get remaining jobs (only if we have cost centers)
                        if cost_centers:
                            for cc in cost_centers:
                                try:
                                    cc_jobs = self.get_jobs(
                                        company_code=company_code,
                                        division=division,
                                        status_code=status,
                                        project_manager=None,  # Don't use PM filter here
                                        superintendent=superintendent,
                                        estimator=estimator,
                                        customer_code=customer_code,
                                        cost_center=cc,
                                        sort_by=sort_by
                                    )
                                    # Only add jobs we haven't seen before (deduplicate)
                                    existing_keys = {(j.get('Company_Code'), j.get('Job_Number')) for j in all_jobs if j.get('Company_Code') and j.get('Job_Number')}
                                    new_count = 0
                                    for job in cc_jobs:
                                        key = (job.get('Company_Code'), job.get('Job_Number'))
                                        if key and key not in existing_keys:
                                            all_jobs.append(job)
                                            total_fetched += 1
                                            new_count += 1
                                    if new_count > 0:
                                        logger.info(f"Fetched {new_count} additional jobs for division {division}, status {status}, Cost Center {cc}")
                                except Exception as e:
                                    logger.warning(f"Error fetching jobs for division {division}, status {status}, Cost Center {cc}: {e}")
                                    continue
                except Exception as e:
                    logger.error(f"Error fetching jobs for division {division}, status {status}: {e}", exc_info=True)
                    # Continue with other divisions/statuses even if one fails
                    continue
        
        # Skip fetching without division filter if we already have division filters
        # This avoids duplicate API calls - if we're filtering by division, we don't need to fetch without division
        if not divisions or len(divisions) == 0:
            # Only fetch without division filter if we weren't filtering by division
            for status in status_codes_to_fetch:
                try:
                    logger.info(f"Fetching jobs without division filter, status {status}...")
                    no_division_jobs = self.get_jobs(
                        company_code=company_code,
                        division=None,  # No division filter
                        status_code=status,
                        project_manager=project_manager,
                        superintendent=superintendent,
                        estimator=estimator,
                        customer_code=customer_code,
                        cost_center=cost_center,
                        sort_by=sort_by
                    )
                    # Filter out duplicates (jobs that might have been fetched with division filter)
                    existing_keys = {(job.get('Company_Code'), job.get('Job_Number')) for job in all_jobs if job.get('Company_Code') and job.get('Job_Number')}
                    new_jobs = [job for job in no_division_jobs 
                               if (job.get('Company_Code'), job.get('Job_Number')) not in existing_keys]
                    all_jobs.extend(new_jobs)
                    logger.info(f"Fetched {len(new_jobs)} additional jobs without division filter, status {status}. Total: {len(all_jobs)}")
                except Exception as e:
                    logger.warning(f"Error fetching jobs without division filter, status {status}: {e}")
        else:
            logger.info("Skipping fetch without division filter to avoid duplicates (already fetching by divisions)")
        
        # Remove duplicates based on (Company_Code, Job_Number)
        seen = set()
        unique_jobs = []
        for job in all_jobs:
            key = (job.get('Company_Code'), job.get('Job_Number'))
            if key and key not in seen:
                seen.add(key)
                unique_jobs.append(job)
        
        logger.info(f"Total unique jobs fetched: {len(unique_jobs)} (removed {len(all_jobs) - len(unique_jobs)} duplicates)")
        return unique_jobs
    
    def get_all_job_main_by_division(
        self,
        company_code: Optional[str] = None,
        divisions: Optional[List[str]] = None,
        status_code: Optional[str] = None,
        project_manager: Optional[str] = None,
        superintendent: Optional[str] = None,
        estimator: Optional[str] = None,
        customer_code: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all job main data from Spectrum by looping through divisions.
        This method handles API limits by fetching jobs per division and combining results.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            divisions: List of division codes to fetch (defaults to all: ['111', '121', '131', '135', '145'])
            status_code: Status (A/I/C or blank for Active and Inactive only)
            project_manager: Project Manager
            superintendent: Superintendent
            estimator: Estimator
            customer_code: Customer Code
            cost_center: Job Cost Center
            sort_by: Sort By Options
        
        Returns:
            Combined list of all job main dictionaries from all divisions
        """
        # Default divisions if not provided
        if divisions is None:
            divisions = ['111', '121', '131', '135', '145']
        
        all_jobs = []
        total_fetched = 0
        
        logger.info(f"Fetching all job main data by looping through {len(divisions)} divisions: {divisions}")
        
        # If status_code is not specified, we need to fetch by status to avoid API limits
        status_codes_to_fetch = [status_code] if status_code else ['A', 'I', 'C']
        
        for division in divisions:
            for status in status_codes_to_fetch:
                try:
                    logger.info(f"Fetching job main data for division {division}, status {status}...")
                    division_jobs = self.get_job_main(
                        company_code=company_code,
                        division=division,
                        status_code=status,
                        project_manager=project_manager,
                        superintendent=superintendent,
                        estimator=estimator,
                        customer_code=customer_code,
                        cost_center=cost_center,
                        sort_by=sort_by
                    )
                    division_count = len(division_jobs)
                    total_fetched += division_count
                    all_jobs.extend(division_jobs)
                    logger.info(f"Fetched {division_count} job main records for division {division}, status {status}. Total so far: {total_fetched}")
                    
                    # If we got 500+ results, the API might be limiting - try breaking down further by cost center
                    if division_count >= 500 and not project_manager:
                        logger.warning(f"Got {division_count} job main records for division {division}, status {status}, which suggests API limit. Attempting to fetch by cost centers...")
                        # Get unique cost centers from already fetched jobs
                        cost_centers = set()
                        for job in division_jobs:
                            cc = job.get('Cost_Center') or job.get('cost_center')
                            if cc:
                                cost_centers.add(cc)
                        
                        # Fetch by each cost center to get remaining jobs
                        if cost_centers:
                            for cc in cost_centers:
                                try:
                                    cc_jobs = self.get_job_main(
                                        company_code=company_code,
                                        division=division,
                                        status_code=status,
                                        project_manager=None,
                                        superintendent=superintendent,
                                        estimator=estimator,
                                        customer_code=customer_code,
                                        cost_center=cc,
                                        sort_by=sort_by
                                    )
                                    # Only add jobs we haven't seen before (deduplicate)
                                    existing_keys = {(j.get('Company_Code'), j.get('Job_Number')) for j in all_jobs if j.get('Company_Code') and j.get('Job_Number')}
                                    new_count = 0
                                    for job in cc_jobs:
                                        key = (job.get('Company_Code'), job.get('Job_Number'))
                                        if key and key not in existing_keys:
                                            all_jobs.append(job)
                                            total_fetched += 1
                                            new_count += 1
                                    if new_count > 0:
                                        logger.info(f"Fetched {new_count} additional job main records for division {division}, status {status}, Cost Center {cc}")
                                except Exception as e:
                                    logger.warning(f"Error fetching job main data for division {division}, status {status}, Cost Center {cc}: {e}")
                                    continue
                except Exception as e:
                    logger.error(f"Error fetching job main data for division {division}, status {status}: {e}", exc_info=True)
                    # Continue with other divisions/statuses even if one fails
                    continue
        
        # Skip fetching without division filter if we already have division filters
        # This avoids duplicate API calls
        if not divisions or len(divisions) == 0:
            for status in status_codes_to_fetch:
                try:
                    logger.info(f"Fetching job main data without division filter, status {status}...")
                    no_division_jobs = self.get_job_main(
                        company_code=company_code,
                        division=None,
                        status_code=status,
                        project_manager=project_manager,
                        superintendent=superintendent,
                        estimator=estimator,
                        customer_code=customer_code,
                        cost_center=cost_center,
                        sort_by=sort_by
                    )
                    # Filter out duplicates
                    existing_keys = {(job.get('Company_Code'), job.get('Job_Number')) for job in all_jobs if job.get('Company_Code') and job.get('Job_Number')}
                    new_jobs = [job for job in no_division_jobs 
                               if (job.get('Company_Code'), job.get('Job_Number')) not in existing_keys]
                    all_jobs.extend(new_jobs)
                    logger.info(f"Fetched {len(new_jobs)} additional job main records without division filter, status {status}. Total: {len(all_jobs)}")
                except Exception as e:
                    logger.warning(f"Error fetching job main data without division filter, status {status}: {e}")
        else:
            logger.info("Skipping fetch without division filter to avoid duplicates (already fetching by divisions)")
        
        # Remove duplicates based on (Company_Code, Job_Number)
        seen = set()
        unique_jobs = []
        for job in all_jobs:
            key = (job.get('Company_Code'), job.get('Job_Number'))
            if key and key not in seen:
                seen.add(key)
                unique_jobs.append(job)
        
        logger.info(f"Total unique job main records fetched: {len(unique_jobs)} (removed {len(all_jobs) - len(unique_jobs)} duplicates)")
        return unique_jobs
    
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
        sort_by: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get job main properties from Spectrum using the GetJobMain web service.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            division: Division
            status_code: Status (A/I/C or blank for Active and Inactive only)
            project_manager: Project Manager
            superintendent: Superintendent
            estimator: Estimator
            customer_code: Customer Code
            cost_center: Job Cost Center
            sort_by: Sort By Options (blank=Job number, D=Division, P=Project Manager, 
                     S=Superintendent, E=Estimator, C=Customer Code)
        
        Returns:
            List of job main dictionaries
        """
        if not self.authorization_id:
            raise ValueError("SPECTRUM_AUTHORIZATION_ID not configured")
        
        # Use provided company_code or default
        company_to_use = company_code or self.company_code
        
        # Get GUID
        guid = self._get_guid()
        
        # Create SOAP client (pass service name without .jws extension)
        client = self._get_soap_client('GetJobMain')
        method = client.service.GetJobMain
        
        # Prepare parameters
        # All optional parameters should be empty strings if not provided
        params = {
            'Authorization_ID': self.authorization_id,
            'GUID': guid,
            'pCompany_Code': company_to_use,
            'pDivision': division or '',
            'pStatus_Code': status_code or '',
            'pProject_Manager': project_manager or '',
            'pSuperintendent': superintendent or '',
            'pEstimator': estimator or '',
            'pCustomer_Code': customer_code or '',
            'pCost_Center': cost_center or '',
            'pSort_By': sort_by or '',
        }
        
        logger.info(f"Calling GetJobMain with company={company_to_use}, division={division}, status={status_code}, sort_by={sort_by}")
        logger.debug(f"GetJobMain parameters: {params}")
        
        try:
            # Call the SOAP service
            logger.debug("Making SOAP call to GetJobMain...")
            response = method(**params)
            logger.debug(f"SOAP call successful, response type: {type(response)}")
            
            # Parse response (same logic as get_jobs)
            logger.info("=== STARTING GetJobMain RESPONSE PARSING ===")
            parsed = self._parse_response(response)
            logger.info(f"[get_job_main] Parsed response type: {type(parsed)}")
            
            # Check for error fields first
            if isinstance(parsed, dict):
                error_code = parsed.get('Error_Code', '').strip() if isinstance(parsed.get('Error_Code'), str) else None
                error_desc = parsed.get('Error_Description', '').strip() if isinstance(parsed.get('Error_Description'), str) else None
                if error_code or error_desc:
                    error_msg = f"Spectrum returned error: Code={error_code}, Description={error_desc}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
            
            # Handle different response structures (same as get_jobs)
            jobs = []
            
            if isinstance(parsed, list):
                jobs = parsed
                logger.debug(f"Response is a direct list with {len(jobs)} items")
            elif isinstance(parsed, dict):
                # Try various nested structures
                if 'GetJobMainResult' in parsed:
                    result_data = parsed['GetJobMainResult']
                    if isinstance(result_data, dict):
                        if 'Job' in result_data:
                            job_data = result_data['Job']
                            jobs = job_data if isinstance(job_data, list) else [job_data] if job_data else []
                        else:
                            jobs = [result_data] if result_data else []
                    elif isinstance(result_data, list):
                        jobs = result_data
                elif 'Jobs' in parsed:
                    jobs_data = parsed['Jobs']
                    if isinstance(jobs_data, dict) and 'Job' in jobs_data:
                        job_data = jobs_data['Job']
                        jobs = job_data if isinstance(job_data, list) else [job_data] if job_data else []
                    elif isinstance(jobs_data, list):
                        jobs = jobs_data
                    elif jobs_data:
                        jobs = [jobs_data]
                elif 'Job' in parsed:
                    job_data = parsed['Job']
                    jobs = job_data if isinstance(job_data, list) else [job_data] if job_data else []
                elif 'Job_Number' in parsed or 'Company_Code' in parsed:
                    jobs = [parsed]
                else:
                    # Look for any list values in the dict
                    for key, value in parsed.items():
                        if isinstance(value, list) and len(value) > 0:
                            first_item = value[0]
                            if isinstance(first_item, dict):
                                item_keys = list(first_item.keys())
                                has_job_fields = any(
                                    k.lower() in ['job_number', 'jobnumber', 'company_code', 'companycode']
                                    for k in item_keys
                                )
                                if has_job_fields:
                                    jobs = value
                                    logger.info(f"[get_job_main] Found jobs list in key '{key}' with {len(jobs)} items")
                                    break
                    
                    if not jobs and parsed:
                        parsed_keys = list(parsed.keys())
                        has_job_fields = any(
                            k.lower() in ['job_number', 'jobnumber', 'company_code', 'companycode']
                            for k in parsed_keys
                        )
                        if has_job_fields:
                            jobs = [parsed]
            
            logger.info(f"[get_job_main] Extracted {len(jobs)} jobs from response structure")
            
            # Flatten nested structures (same as get_jobs)
            result = []
            for idx, job in enumerate(jobs):
                if job is None:
                    logger.warning(f"[get_job_main] Job item {idx} is None, skipping")
                    continue
                    
                if isinstance(job, dict):
                    # Flatten nested dict structures
                    flattened_job = {}
                    for key, value in job.items():
                        if isinstance(value, dict):
                            if key in value and len(value) == 1:
                                flattened_job[key] = value[key]
                            elif '_text' in value:
                                flattened_job[key] = value['_text']
                            else:
                                flattened_job[key] = value
                        elif isinstance(value, (list, tuple)) and len(value) == 1 and isinstance(value[0], dict):
                            if key in value[0] and len(value[0]) == 1:
                                flattened_job[key] = value[0][key]
                            else:
                                flattened_job[key] = value
                        else:
                            flattened_job[key] = value
                    
                    job_keys = list(flattened_job.keys())
                    has_job_number = any(
                        k.lower() in ['job_number', 'jobnumber', 'job'] 
                        for k in job_keys
                    )
                    has_company_code = any(
                        k.lower() in ['company_code', 'companycode', 'company'] 
                        for k in job_keys
                    )
                    
                    if has_job_number or has_company_code:
                        result.append(flattened_job)
                else:
                    # Try to serialize if it's a zeep object
                    try:
                        serialized = serialize_object(job)
                        if isinstance(serialized, dict):
                            flattened_serialized = {}
                            for key, value in serialized.items():
                                if isinstance(value, dict) and key in value and len(value) == 1:
                                    flattened_serialized[key] = value[key]
                                elif isinstance(value, dict) and '_text' in value:
                                    flattened_serialized[key] = value['_text']
                                else:
                                    flattened_serialized[key] = value
                            
                            serialized_keys = list(flattened_serialized.keys())
                            has_job_number = any(k.lower() == 'job_number' for k in serialized_keys)
                            has_company_code = any(k.lower() == 'company_code' for k in serialized_keys)
                            if has_job_number or has_company_code:
                                result.append(flattened_serialized)
                    except Exception as e:
                        logger.warning(f"[get_job_main] Could not serialize job item {idx}: {e}")
            
            logger.info(f"GetJobMain returned {len(result)} valid jobs")
            return result
            
        except Fault as e:
            logger.error(f"SOAP Fault calling GetJobMain: {e.message}")
            raise Exception(f"Spectrum SOAP error: {e.message}")
        except Exception as e:
            logger.error(f"Error calling GetJobMain: {e}", exc_info=True)
            raise
    
    def get_job_contacts(
        self,
        company_code: Optional[str] = None,
        job_number: Optional[str] = None,
        status_code: Optional[str] = None,
        project_manager: Optional[str] = None,
        superintendent: Optional[str] = None,
        estimator: Optional[str] = None,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        phone_number: Optional[str] = None,
        title: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get job contacts from Spectrum using the GetJobContact web service.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            job_number: Job Number
            status_code: Status (A/I/C or blank for Active and Inactive only)
            project_manager: Project Manager
            superintendent: Superintendent
            estimator: Estimator
            first_name: Contact First Name
            last_name: Contact Last Name
            phone_number: Contact Primary Phone
            title: Contact Title
            cost_center: Job Cost Center
            sort_by: Sort By Options (blank=Company code, C=Contact ID, P=Project Manager, 
                     S=Superintendent, E=Estimator, L=Last name)
        
        Returns:
            List of job contact dictionaries
        """
        if not self.authorization_id:
            raise ValueError("SPECTRUM_AUTHORIZATION_ID not configured")
        
        # Use provided company_code or default
        company_to_use = company_code or self.company_code
        
        # Get GUID
        guid = self._get_guid()
        
        # Create SOAP client with fallback - try both singular and plural WSDL names
        # WSDL file might be GetJobContacts.jws and method might also be GetJobContacts
        client, used_wsdl = self._get_client_with_fallback(["GetJobContact", "GetJobContacts"])
        service = client.service
        
        # Try method name GetJobContact first (as per docs), then fallback to GetJobContacts if needed
        # IMPORTANT: When WSDL is GetJobContacts.jws, the method is also GetJobContacts
        if used_wsdl == "GetJobContacts" and hasattr(service, 'GetJobContacts'):
            method = getattr(service, "GetJobContacts")
            logger.info("Using SOAP method: GetJobContacts (matches WSDL name)")
        elif hasattr(service, 'GetJobContact'):
            method = getattr(service, "GetJobContact")
            logger.info("Using SOAP method: GetJobContact")
        elif hasattr(service, 'GetJobContacts'):
            method = getattr(service, "GetJobContacts")
            logger.info("Using SOAP method: GetJobContacts (fallback)")
        else:
            available_methods = [m for m in dir(service) if not m.startswith('_')]
            raise Exception(f"SOAP service does not have GetJobContact or GetJobContacts method. Available methods: {available_methods}")
        
        # Prepare parameters - ALL parameters must be passed (empty string if not provided)
        params = {
            'Authorization_ID': self.authorization_id,
            'GUID': guid,
            'pCompany_Code': company_to_use or self.company_code,  # REQUIRED
            'pJob_Number': job_number or '',  # optional
            'pStatus_Code': status_code or '',
            'pProject_Manager': project_manager or '',
            'pSuperintendent': superintendent or '',
            'pEstimator': estimator or '',
            'pFirst_Name': first_name or '',
            'pLast_Name': last_name or '',
            'pPhone_Number': phone_number or '',  # IMPORTANT: correct parameter name
            'pTitle': title or '',
            'pCost_Center': cost_center or '',
            'pSort_By': sort_by or '',
        }
        
        logger.info(f"Calling GetJobContact with company={company_to_use}, job_number={job_number}")
        logger.debug(f"GetJobContact parameters: {params}")
        
        try:
            response = method(**params)
            logger.debug(f"SOAP call successful, response type: {type(response)}")
            
            # Parse response using the standard parser
            parsed = self._parse_response(response)
            logger.info(f"[get_job_contacts] Parsed response type: {type(parsed)}")
            
            # Handle None or empty response
            if parsed is None:
                logger.warning("[get_job_contacts] Parsed response is None - no data returned from Spectrum")
                return []
            
            # Check for error fields - Spectrum often returns errors in the response dict
            if isinstance(parsed, dict):
                # Check if response contains a single error record
                if "response" in parsed and isinstance(parsed["response"], dict):
                    err = parsed["response"].get("Error_Description")
                    code = parsed["response"].get("Error_Code")
                    if err or code:
                        err_str = err.strip() if isinstance(err, str) else str(err) if err else ""
                        code_str = code.strip() if isinstance(code, str) else str(code) if code else ""
                        error_msg = f"Spectrum GetJobContacts error: {code_str} - {err_str}"
                        logger.error(error_msg)
                        raise Exception(error_msg)
                
                # Check top-level error fields
                error_code = parsed.get('Error_Code')
                if isinstance(error_code, str):
                    error_code = error_code.strip() or None
                error_desc = parsed.get('Error_Description')
                if isinstance(error_desc, str):
                    error_desc = error_desc.strip() or None
                if error_code or error_desc:
                    error_msg = f"Spectrum GetJobContacts error: Code={error_code}, Description={error_desc}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
            
            # Extract list from response (expects list under 'response' key, same style as GetJob)
            contacts = self._extract_list_from_response(
                parsed, 
                plural_key="response", 
                singular_key="Contact", 
                id_field="Contact_ID"
            )
            
            logger.info(f"[get_job_contacts] Extracted {len(contacts)} contacts from response structure")
            
            # Deep unwrap nested OrderedDict structures to remove "brackets" like {'Job_Number': {'Job_Number': '10-1178'}}
            # Apply _deep_unwrap to all contacts to flatten nested structures
            clean_contacts = [self._deep_unwrap(c) for c in contacts if c is not None]
            
            # Filter to only valid contacts (must have Contact_ID or Job_Number)
            result = []
            for contact in clean_contacts:
                if isinstance(contact, dict):
                    has_contact_id = any(k.lower() in ['contact_id', 'contactid'] for k in contact.keys())
                    has_job_number = any(k.lower() in ['job_number', 'jobnumber'] for k in contact.keys())
                    
                    if has_contact_id or has_job_number:
                        result.append(contact)
                    else:
                        logger.warning(f"[get_job_contacts] Contact missing Contact_ID/Job_Number, keys: {list(contact.keys())}")
                else:
                    logger.warning(f"[get_job_contacts] Contact is not a dict after unwrap, type: {type(contact)}")
            
            logger.info(f"GetJobContact returned {len(result)} valid contacts (after deep unwrap)")
            return result
            
        except Fault as e:
            logger.error(f"SOAP Fault calling GetJobContact: {e.message}")
            raise Exception(f"Spectrum SOAP error: {e.message}")
        except Exception as e:
            logger.error(f"Error calling GetJobContact: {e}", exc_info=True)
            raise
    
    def get_job_dates(
        self,
        company_code: Optional[str] = None,
        division: Optional[str] = None,
        status_code: Optional[str] = None,
        project_manager: Optional[str] = None,
        superintendent: Optional[str] = None,
        estimator: Optional[str] = None,
        customer_code: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get job dates from Spectrum using the GetJobDates web service.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            division: Division
            status_code: Status (A/I/C or blank for Active and Inactive only)
            project_manager: Project Manager
            superintendent: Superintendent
            estimator: Estimator
            customer_code: Customer Code
            cost_center: Job Cost Center
            sort_by: Sort By Options (blank=Job number, D=Division, P=Project Manager, 
                     S=Superintendent, E=Estimator, C=Customer Code)
        
        Returns:
            List of job dates dictionaries
        """
        if not self.authorization_id:
            raise ValueError("SPECTRUM_AUTHORIZATION_ID not configured")
        
        company_to_use = company_code or self.company_code
        guid = self._get_guid()
        client = self._get_soap_client('GetJobDates')
        method = client.service.GetJobDates
        
        params = {
            'Authorization_ID': self.authorization_id,
            'GUID': guid,
            'pCompany_Code': company_to_use,
            'pDivision': division or '',
            'pStatus_Code': status_code or '',
            'pProject_Manager': project_manager or '',
            'pSuperintendent': superintendent or '',
            'pEstimator': estimator or '',
            'pCustomer_Code': customer_code or '',
            'pCost_Center': cost_center or '',
            'pSort_By': sort_by or '',
        }
        
        logger.info(f"Calling GetJobDates with company={company_to_use}, division={division}, status={status_code}")
        
        try:
            response = method(**params)
            parsed = self._parse_response(response)
            
            # Check for errors
            if isinstance(parsed, dict):
                error_code = parsed.get('Error_Code', '').strip() if isinstance(parsed.get('Error_Code'), str) else None
                error_desc = parsed.get('Error_Description', '').strip() if isinstance(parsed.get('Error_Description'), str) else None
                if error_code or error_desc:
                    error_msg = f"Spectrum returned error: Code={error_code}, Description={error_desc}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
            
            # Parse response - try multiple patterns to extract all dates
            dates = []
            if isinstance(parsed, list):
                dates = parsed
            elif isinstance(parsed, dict):
                # Try the helper method first
                dates = self._extract_list_from_response(
                    parsed,
                    plural_key="response",
                    singular_key="Job",
                    id_field="Job_Number"
                )
                # If helper didn't find anything, try other patterns
                if not dates:
                    if 'GetJobDatesResult' in parsed:
                        result_data = parsed['GetJobDatesResult']
                        if isinstance(result_data, dict):
                            if 'Job' in result_data:
                                job_data = result_data['Job']
                                dates = job_data if isinstance(job_data, list) else [job_data] if job_data else []
                            elif 'response' in result_data:
                                dates = result_data['response'] if isinstance(result_data['response'], list) else [result_data['response']] if result_data['response'] else []
                            else:
                                dates = [result_data] if result_data else []
                        elif isinstance(result_data, list):
                            dates = result_data
                    elif 'response' in parsed:
                        response_data = parsed['response']
                        dates = response_data if isinstance(response_data, list) else [response_data] if response_data else []
                    else:
                        # Try to find any list in the dict
                        for key, value in parsed.items():
                            if isinstance(value, list):
                                dates = value
                                break
                            elif isinstance(value, dict) and any(isinstance(v, list) for v in value.values()):
                                for v in value.values():
                                    if isinstance(v, list):
                                        dates = v
                                        break
                                if dates:
                                    break
            
            # Ensure all items are dictionaries
            result = []
            for idx, date_item in enumerate(dates):
                if date_item is None:
                    continue
                try:
                    serialized = serialize_object(date_item) if hasattr(date_item, '__dict__') else date_item
                    if isinstance(serialized, dict):
                        result.append(serialized)
                except Exception as e:
                    logger.warning(f"[get_job_dates] Could not serialize date item {idx}: {e}")
            
            logger.info(f"GetJobDates returned {len(result)} job dates")
            return result
            
        except Fault as e:
            logger.error(f"SOAP Fault calling GetJobDates: {e.message}")
            raise Exception(f"Spectrum SOAP error: {e.message}")
        except Exception as e:
            logger.error(f"Error calling GetJobDates: {e}", exc_info=True)
            raise
    
    def get_all_job_dates_by_division(
        self,
        company_code: Optional[str] = None,
        divisions: Optional[List[str]] = None,
        status_code: Optional[str] = None,
        project_manager: Optional[str] = None,
        superintendent: Optional[str] = None,
        estimator: Optional[str] = None,
        customer_code: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all job dates from Spectrum by looping through divisions.
        This method handles API limits by fetching dates per division and combining results.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            divisions: List of division codes to fetch (defaults to all: ['111', '121', '131', '135', '145'])
            status_code: Status (A/I/C or blank for Active and Inactive only)
            project_manager: Project Manager
            superintendent: Superintendent
            estimator: Estimator
            customer_code: Customer Code
            cost_center: Job Cost Center
            sort_by: Sort By Options
        
        Returns:
            Combined list of all job dates dictionaries from all divisions
        """
        # Default divisions if not provided
        if divisions is None:
            divisions = ['111', '121', '131', '135', '145']
        
        all_dates = []
        total_fetched = 0
        
        logger.info(f"Fetching all job dates by looping through {len(divisions)} divisions: {divisions}")
        
        # If status_code is not specified, we need to fetch by status to avoid API limits
        status_codes_to_fetch = [status_code] if status_code else ['A', 'I', 'C']
        
        for division in divisions:
            for status in status_codes_to_fetch:
                try:
                    logger.info(f"Fetching job dates for division {division}, status {status}...")
                    division_dates = self.get_job_dates(
                        company_code=company_code,
                        division=division,
                        status_code=status,
                        project_manager=project_manager,
                        superintendent=superintendent,
                        estimator=estimator,
                        customer_code=customer_code,
                        cost_center=cost_center,
                        sort_by=sort_by
                    )
                    division_count = len(division_dates)
                    total_fetched += division_count
                    all_dates.extend(division_dates)
                    logger.info(f"Fetched {division_count} job dates for division {division}, status {status}. Total so far: {total_fetched}")
                except Exception as e:
                    logger.error(f"Error fetching job dates for division {division}, status {status}: {e}", exc_info=True)
                    continue
        
        # Remove duplicates based on (company_code, job_number)
        seen = set()
        unique_dates = []
        for date_item in all_dates:
            if not date_item or not isinstance(date_item, dict):
                continue
            company_code_val = date_item.get('Company_Code')
            job_number_val = date_item.get('Job_Number')
            company = (company_code_val or '').strip() if company_code_val else ''
            job_num = (job_number_val or '').strip() if job_number_val else ''
            if company and job_num:
                key = (company, job_num)
                if key not in seen:
                    seen.add(key)
                    unique_dates.append(date_item)
        
        logger.info(f"Total unique job dates fetched: {len(unique_dates)} (removed {len(all_dates) - len(unique_dates)} duplicates)")
        return unique_dates
    
    def get_phase(
        self,
        company_code: Optional[str] = None,
        cost_type: Optional[str] = None,
        job_number: Optional[str] = None,
        status_code: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get phase information from Spectrum using the GetPhase web service.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            cost_type: Cost Type
            job_number: Job Number
            status_code: Status (A/I/C or blank for Active and Inactive only)
            cost_center: Phase Cost Center
            sort_by: Sort By Options (blank=Job number, Phase and Cost type or C=Cost Type, Job number and Phase)
        
        Returns:
            List of phase dictionaries
        """
        if not self.authorization_id:
            raise ValueError("SPECTRUM_AUTHORIZATION_ID not configured")
        
        company_to_use = company_code or self.company_code
        guid = self._get_guid()
        client = self._get_soap_client('GetPhase')
        method = client.service.GetPhase
        
        params = {
            'Authorization_ID': self.authorization_id,
            'GUID': guid,
            'pCompany_Code': company_to_use,
            'pCost_Type': cost_type or '',
            'pJob_Number': job_number or '',
            'pStatus_Code': status_code or '',
            'pCost_Center': cost_center or '',
            'pSort_By': sort_by or '',
        }
        
        logger.info(f"Calling GetPhase with company={company_to_use}, job_number={job_number}, cost_type={cost_type}")
        
        try:
            response = method(**params)
            parsed = self._parse_response(response)
            
            # Check for errors
            if isinstance(parsed, dict):
                error_code = parsed.get('Error_Code', '').strip() if isinstance(parsed.get('Error_Code'), str) else None
                error_desc = parsed.get('Error_Description', '').strip() if isinstance(parsed.get('Error_Description'), str) else None
                if error_code or error_desc:
                    error_msg = f"Spectrum returned error: Code={error_code}, Description={error_desc}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
            
            # Parse response - try multiple patterns to extract all phases
            phases = []
            if isinstance(parsed, list):
                phases = parsed
            elif isinstance(parsed, dict):
                # Try the helper method first
                phases = self._extract_list_from_response(
                    parsed,
                    plural_key="response",
                    singular_key="Phase",
                    id_field="Phase_Code"
                )
                # If helper didn't find anything, try other patterns
                if not phases:
                    if 'GetPhaseResult' in parsed:
                        result_data = parsed['GetPhaseResult']
                        if isinstance(result_data, dict):
                            if 'Phase' in result_data:
                                phase_data = result_data['Phase']
                                phases = phase_data if isinstance(phase_data, list) else [phase_data] if phase_data else []
                            elif 'response' in result_data:
                                phases = result_data['response'] if isinstance(result_data['response'], list) else [result_data['response']] if result_data['response'] else []
                            else:
                                phases = [result_data] if result_data else []
                        elif isinstance(result_data, list):
                            phases = result_data
                    elif 'response' in parsed:
                        response_data = parsed['response']
                        phases = response_data if isinstance(response_data, list) else [response_data] if response_data else []
                    else:
                        # Try to find any list in the dict
                        for key, value in parsed.items():
                            if isinstance(value, list):
                                phases = value
                                break
            
            # Ensure all items are dictionaries
            result = []
            for idx, phase_item in enumerate(phases):
                if phase_item is None:
                    continue
                try:
                    serialized = serialize_object(phase_item) if hasattr(phase_item, '__dict__') else phase_item
                    if isinstance(serialized, dict):
                        result.append(serialized)
                except Exception as e:
                    logger.warning(f"[get_phase] Could not serialize phase item {idx}: {e}")
            
            logger.info(f"GetPhase returned {len(result)} phases")
            return result
            
        except Fault as e:
            logger.error(f"SOAP Fault calling GetPhase: {e.message}")
            raise Exception(f"Spectrum SOAP error: {e.message}")
        except Exception as e:
            logger.error(f"Error calling GetPhase: {e}", exc_info=True)
            raise
    
    def get_phase_enhanced(
        self,
        company_code: Optional[str] = None,
        cost_type: Optional[str] = None,
        job_number: Optional[str] = None,
        status_code: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get enhanced phase information from Spectrum using the GetPhaseEnhanced web service.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            cost_type: Cost Type
            job_number: Job Number
            status_code: Status (A/I/C or blank for Active and Inactive only)
            cost_center: Phase Cost Center
            sort_by: Sort By Options (blank=Job number, Phase and Cost type or C=Cost Type, Job number and Phase)
        
        Returns:
            List of enhanced phase dictionaries
        """
        if not self.authorization_id:
            raise ValueError("SPECTRUM_AUTHORIZATION_ID not configured")
        
        company_to_use = company_code or self.company_code
        guid = self._get_guid()
        client = self._get_soap_client('GetPhaseEnhanced')
        method = client.service.GetPhaseEnhanced
        
        params = {
            'Authorization_ID': self.authorization_id,
            'GUID': guid,
            'pCompany_Code': company_to_use,
            'pCost_Type': cost_type or '',
            'pJob_Number': job_number or '',
            'pStatus_Code': status_code or '',
            'pCost_Center': cost_center or '',
            'pSort_By': sort_by or '',
        }
        
        logger.info(f"Calling GetPhaseEnhanced with company={company_to_use}, job_number={job_number}, cost_type={cost_type}")
        
        try:
            response = method(**params)
            parsed = self._parse_response(response)
            
            # Check for errors
            if isinstance(parsed, dict):
                error_code = parsed.get('Error_Code', '').strip() if isinstance(parsed.get('Error_Code'), str) else None
                error_desc = parsed.get('Error_Description', '').strip() if isinstance(parsed.get('Error_Description'), str) else None
                if error_code or error_desc:
                    error_msg = f"Spectrum returned error: Code={error_code}, Description={error_desc}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
            
            # Parse response - try multiple patterns to extract all phases
            phases = []
            if isinstance(parsed, list):
                phases = parsed
            elif isinstance(parsed, dict):
                # Try the helper method first
                phases = self._extract_list_from_response(
                    parsed,
                    plural_key="response",
                    singular_key="Phase",
                    id_field="Phase_Code"
                )
                # If helper didn't find anything, try other patterns
                if not phases:
                    if 'GetPhaseEnhancedResult' in parsed:
                        result_data = parsed['GetPhaseEnhancedResult']
                        if isinstance(result_data, dict):
                            if 'Phase' in result_data:
                                phase_data = result_data['Phase']
                                phases = phase_data if isinstance(phase_data, list) else [phase_data] if phase_data else []
                            elif 'response' in result_data:
                                phases = result_data['response'] if isinstance(result_data['response'], list) else [result_data['response']] if result_data['response'] else []
                            else:
                                phases = [result_data] if result_data else []
                        elif isinstance(result_data, list):
                            phases = result_data
                    elif 'response' in parsed:
                        response_data = parsed['response']
                        phases = response_data if isinstance(response_data, list) else [response_data] if response_data else []
                    else:
                        # Try to find any list in the dict
                        for key, value in parsed.items():
                            if isinstance(value, list):
                                phases = value
                                break
            
            # Ensure all items are dictionaries
            result = []
            for idx, phase_item in enumerate(phases):
                if phase_item is None:
                    continue
                try:
                    serialized = serialize_object(phase_item) if hasattr(phase_item, '__dict__') else phase_item
                    if isinstance(serialized, dict):
                        result.append(serialized)
                except Exception as e:
                    logger.warning(f"[get_phase_enhanced] Could not serialize phase item {idx}: {e}")
            
            logger.info(f"GetPhaseEnhanced returned {len(result)} enhanced phases")
            return result
            
        except Fault as e:
            logger.error(f"SOAP Fault calling GetPhaseEnhanced: {e.message}")
            raise Exception(f"Spectrum SOAP error: {e.message}")
        except Exception as e:
            logger.error(f"Error calling GetPhaseEnhanced: {e}", exc_info=True)
            raise
    
    def get_all_phases_by_status(
        self,
        company_code: Optional[str] = None,
        status_code: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all phases from Spectrum by looping through status codes.
        This method handles API limits by fetching phases per status and combining results.
        If a single status returns 500+ results, it will continue fetching until all are retrieved.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            status_code: Status (A/I/C or blank for Active and Inactive only)
            cost_center: Phase Cost Center
            sort_by: Sort By Options
        
        Returns:
            Combined list of all phase dictionaries
        """
        all_phases = []
        total_fetched = 0
        
        logger.info(f"Fetching all phases by looping through status codes")
        
        # If status_code is not specified, we need to fetch by status to avoid API limits
        status_codes_to_fetch = [status_code] if status_code else ['A', 'I', 'C']
        
        for status in status_codes_to_fetch:
            try:
                logger.info(f"Fetching phases for status {status}...")
                # Fetch phases for this status
                status_phases = self.get_phase(
                    company_code=company_code,
                    status_code=status,
                    cost_center=cost_center,
                    sort_by=sort_by
                )
                status_count = len(status_phases)
                total_fetched += status_count
                all_phases.extend(status_phases)
                logger.info(f"Fetched {status_count} phases for status {status}. Total so far: {total_fetched}")
                
                # If we got 500 results, the API might be limiting - try fetching by cost_type to get more
                # Spectrum API might limit to ~500 per call, so we need to break it down further
                if status_count >= 500:
                    logger.warning(f"Got {status_count} phases for status {status}, which suggests API limit. Attempting to fetch by cost types...")
                    # Try fetching by common cost types to break down the request
                    cost_types = ['L', 'M', 'E', 'S', 'O']  # Labor, Material, Equipment, Subcontract, Other
                    for cost_type in cost_types:
                        try:
                            cost_type_phases = self.get_phase(
                                company_code=company_code,
                                status_code=status,
                                cost_type=cost_type,
                                cost_center=cost_center,
                                sort_by=sort_by
                            )
                            # Only add phases we haven't seen before (deduplicate)
                            existing_keys = {(p.get('Company_Code'), p.get('Job_Number'), p.get('Phase_Code'), p.get('Cost_Type')) for p in all_phases}
                            for phase in cost_type_phases:
                                key = (phase.get('Company_Code'), phase.get('Job_Number'), phase.get('Phase_Code'), phase.get('Cost_Type'))
                                if key not in existing_keys:
                                    all_phases.append(phase)
                                    existing_keys.add(key)
                            logger.info(f"Fetched {len(cost_type_phases)} phases for status {status}, cost_type {cost_type}")
                        except Exception as e:
                            logger.warning(f"Error fetching phases for status {status}, cost_type {cost_type}: {e}")
                            continue
            except Exception as e:
                logger.error(f"Error fetching phases for status {status}: {e}", exc_info=True)
                continue
        
        logger.info(f"Total phases fetched: {len(all_phases)}")
        return all_phases
    
    def get_all_phases_enhanced_by_status(
        self,
        company_code: Optional[str] = None,
        status_code: Optional[str] = None,
        cost_center: Optional[str] = None,
        sort_by: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all enhanced phases from Spectrum by looping through status codes.
        This method handles API limits by fetching phases per status and combining results.
        If a single status returns 500+ results, it will continue fetching until all are retrieved.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            status_code: Status (A/I/C or blank for Active and Inactive only)
            cost_center: Phase Cost Center
            sort_by: Sort By Options
        
        Returns:
            Combined list of all enhanced phase dictionaries
        """
        all_phases = []
        total_fetched = 0
        
        logger.info(f"Fetching all enhanced phases by looping through status codes")
        
        # If status_code is not specified, we need to fetch by status to avoid API limits
        status_codes_to_fetch = [status_code] if status_code else ['A', 'I', 'C']
        
        for status in status_codes_to_fetch:
            try:
                logger.info(f"Fetching enhanced phases for status {status}...")
                # Fetch phases for this status
                status_phases = self.get_phase_enhanced(
                    company_code=company_code,
                    status_code=status,
                    cost_center=cost_center,
                    sort_by=sort_by
                )
                status_count = len(status_phases)
                total_fetched += status_count
                all_phases.extend(status_phases)
                logger.info(f"Fetched {status_count} enhanced phases for status {status}. Total so far: {total_fetched}")
                
                # If we got 500 results, the API might be limiting - try fetching by cost_type to get more
                # Spectrum API might limit to ~500 per call, so we need to break it down further
                if status_count >= 500:
                    logger.warning(f"Got {status_count} enhanced phases for status {status}, which suggests API limit. Attempting to fetch by cost types...")
                    # Try fetching by common cost types to break down the request
                    cost_types = ['L', 'M', 'E', 'S', 'O']  # Labor, Material, Equipment, Subcontract, Other
                    for cost_type in cost_types:
                        try:
                            cost_type_phases = self.get_phase_enhanced(
                                company_code=company_code,
                                status_code=status,
                                cost_type=cost_type,
                                cost_center=cost_center,
                                sort_by=sort_by
                            )
                            # Only add phases we haven't seen before (deduplicate)
                            existing_keys = {(p.get('Company_Code'), p.get('Job_Number'), p.get('Phase_Code'), p.get('Cost_Type')) for p in all_phases}
                            for phase in cost_type_phases:
                                key = (phase.get('Company_Code'), phase.get('Job_Number'), phase.get('Phase_Code'), phase.get('Cost_Type'))
                                if key not in existing_keys:
                                    all_phases.append(phase)
                                    existing_keys.add(key)
                            logger.info(f"Fetched {len(cost_type_phases)} enhanced phases for status {status}, cost_type {cost_type}")
                        except Exception as e:
                            logger.warning(f"Error fetching enhanced phases for status {status}, cost_type {cost_type}: {e}")
                            continue
            except Exception as e:
                logger.error(f"Error fetching enhanced phases for status {status}: {e}", exc_info=True)
                continue
        
        logger.info(f"Total enhanced phases fetched: {len(all_phases)}")
        return all_phases
    
    def post_job_cost_projection(
        self,
        company_code: Optional[str] = None,
        job_number: str = None,
        phase_code: str = None,
        cost_type: str = None,
        transaction_date: str = None,
        amount: Optional[float] = None,
        projected_hours: Optional[float] = None,
        projected_quantity: Optional[float] = None,
        note: Optional[str] = None,
        operator: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Post job cost projection to Spectrum using the JobCostProjections web service.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            job_number: Job Number (required)
            phase_code: Phase number (required, no dashes)
            cost_type: Cost type (required)
            transaction_date: Transaction Date (required, MM/DD/CCYY format)
            amount: Projected Dollars At Completion (optional, but at least one of amount/projected_hours/projected_quantity required)
            projected_hours: Projected Hours At Completion (optional)
            projected_quantity: Projected Quantity At Completion (optional)
            note: Memo (optional, max 80 chars)
            operator: Operator code (optional, max 3 chars)
        
        Returns:
            Dictionary with response data including error information if any
        """
        if not self.authorization_id:
            raise ValueError("SPECTRUM_AUTHORIZATION_ID not configured")
        
        # Validate required fields
        if not job_number or not phase_code or not cost_type or not transaction_date:
            raise ValueError("job_number, phase_code, cost_type, and transaction_date are required")
        
        # Validate that at least one projection value is provided
        if not amount and not projected_hours and not projected_quantity:
            raise ValueError("At least one of amount, projected_hours, or projected_quantity must be provided")
        
        company_to_use = company_code or self.company_code
        guid = self._get_guid()
        client = self._get_soap_client('JobCostProjections')
        method = client.service.JobCostProjections
        
        # Prepare parameters
        params = {
            'Authorization_ID': self.authorization_id,
            'GUID': guid,
            'Company_Code': company_to_use,
            'Job_Number': job_number,
            'Phase_Code': phase_code,
            'Cost_Type': cost_type,
            'Transaction_Date': transaction_date,
            'Amount': str(amount) if amount is not None else '',
            'Projected_Hours': str(projected_hours) if projected_hours is not None else '',
            'Projected_Quantity': str(projected_quantity) if projected_quantity is not None else '',
            'Note': (note or '')[:80],  # Truncate to 80 chars
            'Operator': (operator or '')[:3],  # Truncate to 3 chars
        }
        
        logger.info(f"Calling JobCostProjections with company={company_to_use}, job={job_number}, phase={phase_code}, cost_type={cost_type}")
        
        try:
            response = method(**params)
            parsed = self._parse_response(response)
            
            # Check for errors
            result = {
                'success': True,
                'error_code': None,
                'error_description': None,
                'error_column': None,
            }
            
            if isinstance(parsed, dict):
                error_code = parsed.get('Error_Code', '').strip() if isinstance(parsed.get('Error_Code'), str) else None
                error_desc = parsed.get('Error_Description', '').strip() if isinstance(parsed.get('Error_Description'), str) else None
                if error_code or error_desc:
                    result['success'] = False
                    result['error_code'] = error_code
                    result['error_description'] = error_desc
                    result['error_column'] = parsed.get('Error_Column', '').strip() if isinstance(parsed.get('Error_Column'), str) else None
                    error_msg = f"Spectrum returned error: Code={error_code}, Description={error_desc}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
            
            logger.info(f"JobCostProjections posted successfully for {company_to_use}-{job_number}")
            return result
            
        except Fault as e:
            logger.error(f"SOAP Fault calling JobCostProjections: {e.message}")
            raise Exception(f"Spectrum SOAP error: {e.message}")
        except Exception as e:
            logger.error(f"Error calling JobCostProjections: {e}", exc_info=True)
            raise
    
    def get_job_udf(
        self,
        company_code: Optional[str] = None,
        division: Optional[str] = None,
        status_code: Optional[str] = None,
        project_manager: Optional[str] = None,
        superintendent: Optional[str] = None,
        estimator: Optional[str] = None,
        customer_code: Optional[str] = None,
        cost_center: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get job user-defined fields from Spectrum using the GetJobUDF web service.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            division: Division
            status_code: Status (A/I/C or blank for Active and Inactive only)
            project_manager: Project Manager
            superintendent: Superintendent
            estimator: Estimator
            customer_code: Customer Code
            cost_center: Job Cost Center
        
        Returns:
            List of job UDF dictionaries
        """
        if not self.authorization_id:
            raise ValueError("SPECTRUM_AUTHORIZATION_ID not configured")
        
        company_to_use = company_code or self.company_code
        guid = self._get_guid()
        client = self._get_soap_client('GetJobUDF')
        method = client.service.GetJobUDF
        
        params = {
            'Authorization_ID': self.authorization_id,
            'GUID': guid,
            'pCompany_Code': company_to_use,
            'pDivision': division or '',
            'pStatus_Code': status_code or '',
            'pProject_Manager': project_manager or '',
            'pSuperintendent': superintendent or '',
            'pEstimator': estimator or '',
            'pCustomer_Code': customer_code or '',
            'pCost_Center': cost_center or '',
        }
        
        logger.info(f"Calling GetJobUDF with company={company_to_use}, division={division}, status={status_code}")
        
        try:
            response = method(**params)
            parsed = self._parse_response(response)
            
            # Check for errors
            if isinstance(parsed, dict):
                error_code = parsed.get('Error_Code', '').strip() if isinstance(parsed.get('Error_Code'), str) else None
                error_desc = parsed.get('Error_Description', '').strip() if isinstance(parsed.get('Error_Description'), str) else None
                if error_code or error_desc:
                    error_msg = f"Spectrum returned error: Code={error_code}, Description={error_desc}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
            
            # Parse response - try multiple patterns to extract all UDFs
            udfs = []
            if isinstance(parsed, list):
                udfs = parsed
            elif isinstance(parsed, dict):
                # Try the helper method first
                udfs = self._extract_list_from_response(
                    parsed,
                    plural_key="response",
                    singular_key="Job",
                    id_field="Job_Number"
                )
                # If helper didn't find anything, try other patterns
                if not udfs:
                    if 'GetJobUDFResult' in parsed:
                        result_data = parsed['GetJobUDFResult']
                        if isinstance(result_data, dict):
                            if 'Job' in result_data:
                                job_data = result_data['Job']
                                udfs = job_data if isinstance(job_data, list) else [job_data] if job_data else []
                            elif 'response' in result_data:
                                udfs = result_data['response'] if isinstance(result_data['response'], list) else [result_data['response']] if result_data['response'] else []
                            else:
                                udfs = [result_data] if result_data else []
                        elif isinstance(result_data, list):
                            udfs = result_data
                    elif 'response' in parsed:
                        response_data = parsed['response']
                        udfs = response_data if isinstance(response_data, list) else [response_data] if response_data else []
                    else:
                        # Try to find any list in the dict
                        for key, value in parsed.items():
                            if isinstance(value, list):
                                udfs = value
                                break
            
            # Ensure all items are dictionaries
            result = []
            for idx, udf_item in enumerate(udfs):
                if udf_item is None:
                    continue
                try:
                    serialized = serialize_object(udf_item) if hasattr(udf_item, '__dict__') else udf_item
                    if isinstance(serialized, dict):
                        result.append(serialized)
                except Exception as e:
                    logger.warning(f"[get_job_udf] Could not serialize UDF item {idx}: {e}")
            
            logger.info(f"GetJobUDF returned {len(result)} job UDFs")
            return result
            
        except Fault as e:
            logger.error(f"SOAP Fault calling GetJobUDF: {e.message}")
            raise Exception(f"Spectrum SOAP error: {e.message}")
        except Exception as e:
            logger.error(f"Error calling GetJobUDF: {e}", exc_info=True)
            raise
    
    def get_all_job_udf_by_division(
        self,
        company_code: Optional[str] = None,
        divisions: Optional[List[str]] = None,
        status_code: Optional[str] = None,
        project_manager: Optional[str] = None,
        superintendent: Optional[str] = None,
        estimator: Optional[str] = None,
        customer_code: Optional[str] = None,
        cost_center: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all job UDFs from Spectrum by looping through divisions.
        This method handles API limits by fetching UDFs per division and combining results.
        
        Args:
            company_code: Company Code (defaults to configured company code)
            divisions: List of division codes to fetch (defaults to all: ['111', '121', '131', '135', '145'])
            status_code: Status (A/I/C or blank for Active and Inactive only)
            project_manager: Project Manager
            superintendent: Superintendent
            estimator: Estimator
            customer_code: Customer Code
            cost_center: Job Cost Center
        
        Returns:
            Combined list of all job UDF dictionaries from all divisions
        """
        # Default divisions if not provided
        if divisions is None:
            divisions = ['111', '121', '131', '135', '145']
        
        all_udfs = []
        total_fetched = 0
        
        logger.info(f"Fetching all job UDFs by looping through {len(divisions)} divisions: {divisions}")
        
        # If status_code is not specified, we need to fetch by status to avoid API limits
        status_codes_to_fetch = [status_code] if status_code else ['A', 'I', 'C']
        
        for division in divisions:
            for status in status_codes_to_fetch:
                try:
                    logger.info(f"Fetching job UDFs for division {division}, status {status}...")
                    division_udfs = self.get_job_udf(
                        company_code=company_code,
                        division=division,
                        status_code=status,
                        project_manager=project_manager,
                        superintendent=superintendent,
                        estimator=estimator,
                        customer_code=customer_code,
                        cost_center=cost_center
                    )
                    division_count = len(division_udfs)
                    total_fetched += division_count
                    all_udfs.extend(division_udfs)
                    logger.info(f"Fetched {division_count} job UDFs for division {division}, status {status}. Total so far: {total_fetched}")
                except Exception as e:
                    logger.error(f"Error fetching job UDFs for division {division}, status {status}: {e}", exc_info=True)
                    continue
        
        # Remove duplicates based on (company_code, job_number)
        seen = set()
        unique_udfs = []
        for udf_item in all_udfs:
            if not udf_item or not isinstance(udf_item, dict):
                continue
            company_code_val = udf_item.get('Company_Code')
            job_number_val = udf_item.get('Job_Number')
            company = (company_code_val or '').strip() if company_code_val else ''
            job_num = (job_number_val or '').strip() if job_number_val else ''
            if company and job_num:
                key = (company, job_num)
                if key not in seen:
                    seen.add(key)
                    unique_udfs.append(udf_item)
        
        logger.info(f"Total unique job UDFs fetched: {len(unique_udfs)} (removed {len(all_udfs) - len(unique_udfs)} duplicates)")
        return unique_udfs
