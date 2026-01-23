"""
API views for Spectrum integration.
"""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from django.conf import settings

from .models import (
    SpectrumJob, SpectrumJobDates, SpectrumPhase, SpectrumPhaseEnhanced, 
    SpectrumJobCostProjection, SpectrumJobUDF, SpectrumJobContact
)
from .serializers import SpectrumJobSerializer
from .services import SpectrumSOAPClient
from accounts.permissions import IsRootSuperadmin
from projects.models import Project
from branches.models import Branch

logger = logging.getLogger(__name__)


def parse_date_robust(date_value):
    """
    Robust date parser that handles all possible date formats from Spectrum API.
    Handles: MM/DD/YYYY, YYYY-MM-DD, DD/MM/YYYY, YYYY/MM/DD, MM-DD-YYYY, DD-MM-YYYY,
    datetime objects, date objects, and various other formats.
    """
    if not date_value:
        return None
    
    # If it's already a date object, return it
    from datetime import date, datetime
    if isinstance(date_value, date):
        return date_value
    if isinstance(date_value, datetime):
        return date_value.date()
    
    # If it's not a string, try to convert
    if not isinstance(date_value, str):
        try:
            date_value = str(date_value)
        except:
            return None
    
    # Strip whitespace
    date_str = date_value.strip()
    if not date_str or date_str.lower() in ('none', 'null', ''):
        return None
    
    # List of date formats to try (in order of likelihood)
    date_formats = [
        '%Y-%m-%d',           # YYYY-MM-DD (ISO format, most common from APIs)
        '%m/%d/%Y',            # MM/DD/YYYY (US format)
        '%d/%m/%Y',            # DD/MM/YYYY (European format)
        '%Y/%m/%d',            # YYYY/MM/DD
        '%m-%d-%Y',            # MM-DD-YYYY
        '%d-%m-%Y',            # DD-MM-YYYY
        '%Y.%m.%d',            # YYYY.MM.DD
        '%m.%d.%Y',            # MM.DD.YYYY
        '%d.%m.%Y',            # DD.MM.YYYY
        '%Y%m%d',              # YYYYMMDD (compact format)
        '%m/%d/%y',            # MM/DD/YY (2-digit year)
        '%d/%m/%y',            # DD/MM/YY (2-digit year)
        '%Y-%m-%d %H:%M:%S',   # Datetime format
        '%Y-%m-%dT%H:%M:%S',  # ISO datetime format
        '%Y-%m-%dT%H:%M:%S.%f', # ISO datetime with microseconds
        '%Y-%m-%dT%H:%M:%SZ',  # ISO datetime with Z
    ]
    
    # Try each format
    for fmt in date_formats:
        try:
            parsed = datetime.strptime(date_str, fmt)
            return parsed.date()
        except (ValueError, TypeError):
            continue
    
    # If all formats fail, try using dateutil parser as last resort (if available)
    try:
        from dateutil import parser
        parsed = parser.parse(date_str)
        return parsed.date()
    except ImportError:
        # dateutil not installed, skip this fallback
        pass
    except Exception:
        # dateutil parsing failed, continue
        pass
    
    # Log warning if we couldn't parse
    logger.warning(f"Could not parse date: {date_value} (type: {type(date_value)})")
    return None


def safe_strip(value):
    """Safely strip a value, returning None if value is None or empty."""
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    return value


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def get_jobs_from_spectrum(request):
    """
    Fetch jobs from Spectrum's GetJob service.
    Only accessible to root super admins.
    """
    try:
        client = SpectrumSOAPClient()
        
        # Check if Authorization ID is configured
        if not client.authorization_id:
            return Response(
                {
                    'detail': 'Spectrum Authorization ID not configured. Please set SPECTRUM_AUTHORIZATION_ID in settings.',
                    'error': 'Configuration missing'
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Get query parameters
        company_code = request.query_params.get('company_code', None)
        division = request.query_params.get('division', None)
        status_code = request.query_params.get('status_code', None)
        project_manager = request.query_params.get('project_manager', None)
        superintendent = request.query_params.get('superintendent', None)
        estimator = request.query_params.get('estimator', None)
        customer_code = request.query_params.get('customer_code', None)
        cost_center = request.query_params.get('cost_center', None)
        sort_by = request.query_params.get('sort_by', None)
        
        # Log request parameters
        logger.info(f"=== SPECTRUM FETCH REQUEST ===")
        logger.info(f"Company Code: {company_code}")
        logger.info(f"Division: {division}, Status: {status_code}, Sort By: {sort_by}")
        logger.info(f"Project Manager: {project_manager}, Superintendent: {superintendent}")
        
        # Fetch jobs from Spectrum
        # If no division is specified, fetch all jobs by looping through all divisions
        if division:
            # If a specific division is requested, fetch only that division
            jobs = client.get_jobs(
                company_code=company_code,
                division=division,
                status_code=status_code,
                project_manager=project_manager,
                superintendent=superintendent,
                estimator=estimator,
                customer_code=customer_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
        else:
            # No division specified - fetch all jobs by looping through all divisions
            logger.info("No division specified, fetching all jobs by looping through divisions...")
            jobs = client.get_all_jobs_by_division(
                company_code=company_code,
                divisions=None,  # Will use default: ['111', '121', '131', '135', '145']
                status_code=status_code,
                project_manager=project_manager,
                superintendent=superintendent,
                estimator=estimator,
                customer_code=customer_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
        
        logger.info(f"=== SPECTRUM FETCH RESULT ===")
        logger.info(f"Total jobs returned: {len(jobs)}")
        if len(jobs) > 0:
            logger.info(f"First job sample keys: {list(jobs[0].keys()) if isinstance(jobs[0], dict) else 'N/A'}")
            logger.info(f"First job sample: {str(jobs[0])[:500] if isinstance(jobs[0], dict) else 'N/A'}")
        else:
            logger.warning("ZERO JOBS RETURNED - Check logs above for response structure")
        
        return Response({
            'results': jobs,
            'count': len(jobs)
        }, status=http_status.HTTP_200_OK)
        
    except ValueError as e:
        # Configuration errors
        logger.error(f"Configuration error: {e}")
        return Response(
            {
                'detail': str(e),
                'error': 'Configuration error'
            },
            status=http_status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        logger.error(f"Error fetching jobs from Spectrum: {e}", exc_info=True)
        import traceback
        error_detail = str(e)
        if settings.DEBUG:
            error_detail += f"\n\nTraceback:\n{traceback.format_exc()}"
        return Response(
            {
                'detail': f'Failed to fetch jobs from Spectrum: {error_detail}',
                'error': str(e)
            },
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def import_jobs_to_database(request):
    """
    Import jobs from Spectrum into the local database.
    Only accessible to root super admins.
    """
    try:
        client = SpectrumSOAPClient()
        
        if not client.authorization_id:
            return Response(
                {
                    'detail': 'Spectrum Authorization ID not configured.',
                    'error': 'Configuration missing'
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Get query parameters for filtering
        company_code = request.data.get('company_code', None)
        division = request.data.get('division', None)
        status_code = request.data.get('status_code', None)
        project_manager = request.data.get('project_manager', None)
        superintendent = request.data.get('superintendent', None)
        estimator = request.data.get('estimator', None)
        customer_code = request.data.get('customer_code', None)
        cost_center = request.data.get('cost_center', None)
        sort_by = request.data.get('sort_by', None)
        
        # Fetch jobs from Spectrum GetJob service using division looping to get all jobs
        # If no division is specified, fetch all jobs by looping through all divisions
        if division:
            # If a specific division is requested, fetch only that division
            jobs = client.get_jobs(
                company_code=company_code,
                division=division,
                status_code=status_code,
                project_manager=project_manager,
                superintendent=superintendent,
                estimator=estimator,
                customer_code=customer_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
            jobs_main = client.get_job_main(
                company_code=company_code,
                division=division,
                status_code=status_code,
                project_manager=project_manager,
                superintendent=superintendent,
                estimator=estimator,
                customer_code=customer_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
        else:
            # No division specified - fetch all jobs by looping through all divisions
            logger.info("No division specified, fetching all jobs by looping through divisions...")
            jobs = client.get_all_jobs_by_division(
                company_code=company_code,
                divisions=None,  # Will use default: ['111', '121', '131', '135', '145']
                status_code=status_code,
                project_manager=project_manager,
                superintendent=superintendent,
                estimator=estimator,
                customer_code=customer_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
            jobs_main = client.get_all_job_main_by_division(
                company_code=company_code,
                divisions=None,  # Will use default: ['111', '121', '131', '135', '145']
                status_code=status_code,
                project_manager=project_manager,
                superintendent=superintendent,
                estimator=estimator,
                customer_code=customer_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
        
        # Create a dictionary to merge GetJobMain data with GetJob data
        # Key: (company_code, job_number)
        jobs_main_dict = {}
        for job_main in jobs_main:
            company = safe_strip(job_main.get('Company_Code'))
            job_num = safe_strip(job_main.get('Job_Number'))
            if company and job_num:
                jobs_main_dict[(company, job_num)] = job_main
        
        # Fetch job dates and phases in bulk (by division/status to match jobs being imported)
        job_dates_dict = {}
        phases_dict = {}
        try:
            # Fetch job dates using same filters as jobs
            if division:
                job_dates_list = client.get_job_dates(
                    company_code=company_code,
                    division=division,
                    status_code=status_code,
                )
            else:
                # Fetch all dates by looping through divisions using the new method
                logger.info("Fetching all job dates by looping through divisions...")
                job_dates_list = client.get_all_job_dates_by_division(
                    company_code=company_code,
                    divisions=None,  # Will use default: ['111', '121', '131', '135', '145']
                    status_code=status_code,
                )
            
            # Create dictionary keyed by (company_code, job_number)
            for dates_data in job_dates_list:
                company = safe_strip(dates_data.get('Company_Code'))
                job_num = safe_strip(dates_data.get('Job_Number'))
                if company and job_num:
                    job_dates_dict[(company, job_num)] = dates_data
            
            # Helper function to validate job number pattern (xx-xxxx format)
            def is_valid_job_number(job_num: str) -> bool:
                """Validate job number matches pattern xx-xxxx (e.g., 20-1140)"""
                if not job_num:
                    return False
                job_num = job_num.strip()
                # Pattern: 2 digits, hyphen, 4 digits (e.g., 20-1140)
                import re
                pattern = r'^\d{2}-\d{4}$'
                return bool(re.match(pattern, job_num))
            
            # Fetch phases per job number to ensure we get all phases for each job
            # First, collect all valid job numbers from the jobs we're importing
            valid_job_numbers = set()
            for job_data in jobs:
                job_num = safe_strip(job_data.get('Job_Number'))
                if job_num and is_valid_job_number(job_num):
                    valid_job_numbers.add(job_num)
            
            logger.info(f"Fetching phases for {len(valid_job_numbers)} valid job numbers using parallel requests...")
            
            # Helper function to fetch phases for a single job
            def fetch_job_phases(job_num):
                """Fetch phases for a single job number."""
                try:
                    job_phases = client.get_phase_enhanced(
                        company_code=company_code,
                        job_number=job_num,
                        status_code=status_code,
                    )
                    # Strictly filter to only include phases that match the requested job number
                    filtered_phases = []
                    for phase_data in job_phases:
                        phase_job_num = safe_strip(phase_data.get('Job_Number'))
                        # Triple validation: must be valid pattern, must match requested job, and must have company
                        if (phase_job_num and 
                            is_valid_job_number(phase_job_num) and 
                            phase_job_num == job_num):
                            company = safe_strip(phase_data.get('Company_Code'))
                            if company:
                                filtered_phases.append((company, phase_job_num, phase_data))
                            else:
                                logger.debug(f"Skipping phase {phase_data.get('Phase_Code')} for job {job_num} - missing Company_Code")
                        else:
                            if phase_job_num and phase_job_num != job_num:
                                logger.debug(f"Skipping phase {phase_data.get('Phase_Code')} - job number mismatch: requested {job_num}, got {phase_job_num}")
                    return job_num, filtered_phases, len(job_phases)
                except Exception as e:
                    logger.warning(f"Error fetching phases for job {job_num}: {e}")
                    return job_num, [], 0
            
            # Use ThreadPoolExecutor to fetch phases in parallel (max 10 concurrent requests)
            # This significantly speeds up the import process
            max_workers = min(10, len(valid_job_numbers))  # Limit to 10 concurrent requests to avoid overwhelming the API
            fetched_count = 0
            failed_count = 0
            
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Submit all phase fetch tasks
                future_to_job = {executor.submit(fetch_job_phases, job_num): job_num for job_num in valid_job_numbers}
                
                # Process completed tasks as they finish
                for future in as_completed(future_to_job):
                    job_num = future_to_job[future]
                    try:
                        job_num_result, filtered_phases, total_returned = future.result()
                        fetched_count += 1
                        
                        # Add filtered phases to the dictionary
                        for company, phase_job_num, phase_data in filtered_phases:
                            key = (company, phase_job_num)
                            if key not in phases_dict:
                                phases_dict[key] = []
                            phases_dict[key].append(phase_data)
                        
                        if fetched_count % 50 == 0:
                            logger.info(f"Progress: Fetched phases for {fetched_count}/{len(valid_job_numbers)} jobs...")
                    except Exception as e:
                        failed_count += 1
                        logger.warning(f"Error processing phases for job {job_num}: {e}")
            
            logger.info(f"Completed fetching phases: {fetched_count} succeeded, {failed_count} failed out of {len(valid_job_numbers)} total jobs")
            
            # Fetch ALL UDFs in bulk (this is the key optimization - fetch once, not per job!)
            logger.info("Fetching all job UDFs in bulk...")
            udfs_dict = {}
            try:
                if division:
                    udfs_list = client.get_job_udf(
                        company_code=company_code,
                        division=division,
                        status_code=status_code,
                    )
                else:
                    # Fetch all UDFs by looping through divisions
                    udfs_list = client.get_all_job_udf_by_division(
                        company_code=company_code,
                        divisions=None,  # Will use default: ['111', '121', '131', '135', '145']
                        status_code=status_code,
                    )
                
                # Create dictionary keyed by (company_code, job_number) for fast lookup
                for udf_data in udfs_list:
                    company = safe_strip(udf_data.get('Company_Code'))
                    job_num = safe_strip(udf_data.get('Job_Number'))
                    if company and job_num:
                        udfs_dict[(company, job_num)] = udf_data
                
                logger.info(f"Fetched {len(udfs_dict)} UDFs in bulk")
            except Exception as e:
                logger.warning(f"Error fetching UDFs in bulk: {e}")
            
            logger.info(f"Fetched {len(job_dates_dict)} job dates, {sum(len(v) for v in phases_dict.values())} phases, and {len(udfs_dict)} UDFs")
        except Exception as e:
            logger.warning(f"Error fetching job dates/phases/UDFs in bulk: {e}")
        
        # Import jobs to database
        imported_count = 0
        updated_count = 0
        errors = []
        sync_time = timezone.now()
        
        # Pre-fetch all branches to avoid repeated database queries
        branches_cache = {}
        for branch in Branch.objects.all():
            if branch.spectrum_division_code:
                branches_cache[branch.spectrum_division_code] = branch
        default_branch = Branch.objects.filter(status='ACTIVE').first()
        
        # Track seen job numbers to prevent duplicates in a single import run
        seen_jobs = set()
        
        with transaction.atomic():
            for job_data in jobs:
                try:
                    # Extract required fields
                    company = safe_strip(job_data.get('Company_Code'))
                    job_number = safe_strip(job_data.get('Job_Number'))
                    
                    if not company or not job_number:
                        errors.append(f"Skipping job with missing Company_Code or Job_Number")
                        continue
                    
                    # Check for duplicates in this import run
                    job_key = (company, job_number)
                    if job_key in seen_jobs:
                        logger.debug(f"Skipping duplicate job {job_number} (Company: {company}) in this import run")
                        continue
                    seen_jobs.add(job_key)
                    
                    # Validate job number pattern: xx-xxxx, xx-xxxx-xx, xx-xxxxx, xx-xxxx-x, xx-xxxxxx, xx-xxxxxxx, or xx-xxxxxxxx
                    import re
                    valid_patterns = [
                        re.compile(r'^\d{2}-\d{4}$'),           # xx-xxxx (e.g., 10-1002)
                        re.compile(r'^\d{2}-\d{4}-\d{2}$'),     # xx-xxxx-xx (e.g., 10-1002-01)
                        re.compile(r'^\d{2}-\d{5}$'),           # xx-xxxxx (e.g., 10-10020)
                        re.compile(r'^\d{2}-\d{4}-\d{1}$'),     # xx-xxxx-x (e.g., 10-1002-1)
                        re.compile(r'^\d{2}-\d{6}$'),           # xx-xxxxxx (e.g., 10-100200)
                        re.compile(r'^\d{2}-\d{7}$'),           # xx-xxxxxxx (e.g., 10-1002000)
                        re.compile(r'^\d{2}-\d{8}$'),           # xx-xxxxxxxx (e.g., 10-10020000)
                    ]
                    if not any(pattern.match(job_number) for pattern in valid_patterns):
                        logger.debug(f"Skipping job {job_number} - does not match accepted patterns (xx-xxxx, xx-xxxx-xx, xx-xxxxx, xx-xxxx-x, xx-xxxxxx, xx-xxxxxxx, or xx-xxxxxxxx)")
                        continue
                    
                    # Merge with GetJobMain data if available
                    job_main_data = jobs_main_dict.get((company, job_number), {})
                    
                    # Prepare defaults for update_or_create
                    # Truncate fields to match database max_length constraints
                    def truncate_field(value, max_length):
                        if value and len(value) > max_length:
                            return value[:max_length]
                        return value
                    
                    defaults = {
                        # GetJob fields
                        'job_description': truncate_field(safe_strip(job_data.get('Job_Description')), 50),
                        'division': safe_strip(job_data.get('Division')),
                        'address_1': truncate_field(safe_strip(job_data.get('Address_1')), 50),
                        'address_2': truncate_field(safe_strip(job_data.get('Address_2')), 50),
                        'city': truncate_field(safe_strip(job_data.get('City')), 50),
                        'state': safe_strip(job_data.get('State')),
                        'zip_code': safe_strip(job_data.get('Zip_Code')),
                        'project_manager': safe_strip(job_data.get('Project_Manager')),
                        'superintendent': safe_strip(job_data.get('Superintendent')),
                        'estimator': safe_strip(job_data.get('Estimator')),
                        'certified_flag': safe_strip(job_data.get('Certified_Flag')),
                        'customer_code': safe_strip(job_data.get('Customer_Code')),
                        'status_code': safe_strip(job_data.get('Status_Code')),
                        'work_state_tax_code': safe_strip(job_data.get('Work_State_Tax_Code')),
                        'contract_number': truncate_field(safe_strip(job_data.get('Contract_Number')), 30),
                        'cost_center': safe_strip(job_data.get('Cost_Center')),
                        # Error fields from GetJob
                        'error_code': safe_strip(job_data.get('Error_Code')),
                        'error_description': safe_strip(job_data.get('Error_Description')),
                        'error_column': safe_strip(job_data.get('Error_Column')),
                        # GetJobMain fields
                        'phone': safe_strip(job_main_data.get('Phone')),
                        'fax_phone': safe_strip(job_main_data.get('Fax_Phone')),
                        'job_site_phone': safe_strip(job_main_data.get('Job_Site_Phone')),
                        'customer_name': truncate_field(safe_strip(job_main_data.get('Customer_Name')), 30),
                        'owner_name': truncate_field(safe_strip(job_main_data.get('Owner_Name')), 50),
                        'wo_site': truncate_field(safe_strip(job_main_data.get('WO_Site')), 10),
                        'comment': safe_strip(job_main_data.get('Comment')),
                        'price_method_code': truncate_field(safe_strip(job_main_data.get('Price_Method_Code')), 1),
                        'unit_of_measure': truncate_field(safe_strip(job_main_data.get('Unit_of_Measure')), 5),
                        'legal_desc': safe_strip(job_main_data.get('Legal_Desc')),
                        'field_1': truncate_field(safe_strip(job_main_data.get('Field_1')), 30),
                        'field_2': truncate_field(safe_strip(job_main_data.get('Field_2')), 30),
                        'field_3': truncate_field(safe_strip(job_main_data.get('Field_3')), 30),
                        'field_4': truncate_field(safe_strip(job_main_data.get('Field_4')), 30),
                        'field_5': truncate_field(safe_strip(job_main_data.get('Field_5')), 30),
                        'last_synced_at': sync_time,
                    }
                    
                    # Handle numeric fields
                    try:
                        original_contract = job_main_data.get('Original_Contract')
                        if original_contract:
                            defaults['original_contract'] = float(original_contract)
                    except (ValueError, TypeError):
                        pass
                    
                    try:
                        total_units = job_main_data.get('Total_Units')
                        if total_units:
                            defaults['total_units'] = float(total_units)
                    except (ValueError, TypeError):
                        pass
                    
                    try:
                        latitude = job_main_data.get('Latitude')
                        if latitude:
                            defaults['latitude'] = float(latitude)
                    except (ValueError, TypeError):
                        pass
                    
                    try:
                        longitude = job_main_data.get('Longitude')
                        if longitude:
                            defaults['longitude'] = float(longitude)
                    except (ValueError, TypeError):
                        pass
                    
                    # Create or update SpectrumJob
                    job, created = SpectrumJob.objects.update_or_create(
                        company_code=company,
                        job_number=job_number,
                        defaults=defaults
                    )
                    
                    if created:
                        imported_count += 1
                    else:
                        updated_count += 1
                    
                    # Create or update Project from Spectrum job
                    # Match division code from Spectrum to Branch
                    division_code = safe_strip(job_data.get('Division'))
                    branch = None
                    if division_code:
                        # Use cached branch lookup (much faster than database query per job)
                        branch = branches_cache.get(division_code)
                        if not branch:
                            # Auto-create branch/division from Spectrum data (only if not in cache)
                            # Division name mapping
                            division_names = {
                                '111': 'Kansas City / Nebraska',
                                '121': 'Denver',
                                '131': 'SLC Commercial',
                                '135': 'Utah Commercial',
                                '145': 'St George',
                            }
                            division_name = division_names.get(division_code, f'Division {division_code}')
                            
                            # Create new branch/division
                            branch = Branch.objects.create(
                                name=division_name,
                                code=division_code,
                                spectrum_division_code=division_code,
                                status='ACTIVE'
                            )
                            # Add to cache for future lookups in this sync
                            branches_cache[division_code] = branch
                            logger.info(f"Auto-created branch/division: {division_name} ({division_code}) from Spectrum")
                    
                    # If no branch found, use cached default branch
                    if not branch:
                        if not default_branch:
                            # Create a default "Unassigned" branch if no branches exist
                            default_branch = Branch.objects.create(
                                name='Unassigned',
                                code='UNASSIGNED',
                                spectrum_division_code=None,
                                status='ACTIVE'
                            )
                            logger.info("Created default 'Unassigned' branch for jobs without division codes")
                        branch = default_branch
                        logger.debug(f"Using default branch for job {job_number} (no division code match)")
                    
                    # Create/update Project for ALL imported jobs
                    if branch:
                        # Prepare project data
                        project_name = safe_strip(job_data.get('Job_Description')) or f"Job {job_number}"
                        
                        # Map Spectrum status codes to Project status
                        # Spectrum: 'A' = Active, 'I' = Inactive, 'C' = Complete
                        spectrum_status = safe_strip(job_data.get('Status_Code'))
                        if spectrum_status == 'A':
                            project_status = 'ACTIVE'
                        elif spectrum_status == 'C':
                            project_status = 'COMPLETED'
                        elif spectrum_status == 'I':
                            project_status = 'PENDING'
                        else:
                            project_status = 'PENDING'  # Default for unknown statuses
                        
                        project_defaults = {
                            'name': project_name,
                            'branch': branch,
                            'spectrum_division_code': division_code,
                            'client_name': safe_strip(job_main_data.get('Customer_Name')) or safe_strip(job_data.get('Customer_Code')),
                            'work_location': f"{safe_strip(job_data.get('Address_1')) or ''} {safe_strip(job_data.get('City')) or ''} {safe_strip(job_data.get('State')) or ''}".strip(),
                            'status': project_status,
                            'start_date': timezone.now().date(),  # Default start date
                            'duration': 30,  # Default duration
                            'is_public': True,  # Make all projects public by default
                        }
                        
                        # Handle contract value
                        try:
                            original_contract = job_main_data.get('Original_Contract')
                            if original_contract:
                                project_defaults['contract_value'] = float(original_contract)
                        except (ValueError, TypeError):
                            pass
                        
                        # Match project manager by name from Spectrum
                        pm_name = safe_strip(job_data.get('Project_Manager')) or safe_strip(job_main_data.get('Project_Manager'))
                        matched_pm = None
                        # Store Spectrum PM name even if we can't match to a User
                        if pm_name:
                            project_defaults['spectrum_project_manager'] = pm_name
                            from accounts.models import User
                            # Try to find project manager by matching first name and last name
                            # Spectrum PM names might be in format "LAST, FIRST" or "FIRST LAST" (e.g., "Jacob Randol")
                            pm_name_clean = pm_name.replace(',', ' ').strip()
                            pm_name_parts = pm_name_clean.split()
                            pm = None
                            
                            if len(pm_name_parts) >= 2:
                                # Try "FIRST LAST" format first (e.g., "Jacob Randol") - most common
                                first_name = pm_name_parts[0]
                                last_name = ' '.join(pm_name_parts[1:])  # Handle multi-word last names
                                pm = User.objects.filter(
                                    role='PROJECT_MANAGER',
                                    first_name__iexact=first_name,
                                    last_name__iexact=last_name
                                ).first()
                                
                                # If not found, try case-insensitive contains
                                if not pm:
                                    pm = User.objects.filter(
                                        role='PROJECT_MANAGER',
                                        first_name__icontains=first_name,
                                        last_name__icontains=last_name
                                    ).first()
                                
                                # If not found, try "LAST FIRST" format (e.g., "Randol Jacob")
                                if not pm and len(pm_name_parts) == 2:
                                    last_name = pm_name_parts[0]
                                    first_name = pm_name_parts[1]
                                    pm = User.objects.filter(
                                        role='PROJECT_MANAGER',
                                        first_name__iexact=first_name,
                                        last_name__iexact=last_name
                                    ).first()
                                
                                # If still not found, try case-insensitive contains for reversed format
                                if not pm and len(pm_name_parts) == 2:
                                    pm = User.objects.filter(
                                        role='PROJECT_MANAGER',
                                        first_name__icontains=first_name,
                                        last_name__icontains=last_name
                                    ).first()
                                
                                if pm:
                                    matched_pm = pm
                                    project_defaults['project_manager'] = pm
                                    logger.debug(f"Matched project manager {pm.get_full_name()} to job {job_number}")
                                else:
                                    logger.warning(f"Could not find project manager '{pm_name}' for job {job_number}")
                        
                        # Create or update Project (match by job_number)
                        project, project_created = Project.objects.update_or_create(
                            job_number=job_number,
                            defaults=project_defaults
                        )
                        
                        # If project already existed and we found a PM but project doesn't have one, update it
                        if not project_created and matched_pm and not project.project_manager:
                            project.project_manager = matched_pm
                            project.save(update_fields=['project_manager'])
                            logger.info(f"Updated existing project {job_number} with project manager {matched_pm.get_full_name()}")
                        
                        if project_created:
                            logger.info(f"Created project {project.job_number} from Spectrum job")
                        else:
                            logger.debug(f"Updated project {project.job_number} from Spectrum job")
                        
                        # Import job dates (from pre-fetched data)
                        try:
                            job_dates_data = job_dates_dict.get((company, job_number))
                            if job_dates_data:
                                # Helper function to truncate fields to max_length
                                def truncate_field(value, max_length):
                                    if value and isinstance(value, str) and len(value) > max_length:
                                        return value[:max_length]
                                    return value
                                
                                dates_defaults = {
                                    'job_description': truncate_field(safe_strip(job_dates_data.get('Job_Description')), 25),
                                    'est_start_date': parse_date_robust(job_dates_data.get('Est_Start_Date')),
                                    'est_complete_date': parse_date_robust(job_dates_data.get('Est_Complete_Date')),
                                    'projected_complete_date': parse_date_robust(job_dates_data.get('Projected_Complete_Date')),
                                    'create_date': parse_date_robust(job_dates_data.get('Create_Date')),
                                    'start_date': parse_date_robust(job_dates_data.get('Start_Date')),
                                    'complete_date': parse_date_robust(job_dates_data.get('Complete_Date')),
                                    'field_1': truncate_field(safe_strip(job_dates_data.get('Field_1')), 25),
                                    'field_2': truncate_field(safe_strip(job_dates_data.get('Field_2')), 25),
                                    'field_3': truncate_field(safe_strip(job_dates_data.get('Field_3')), 25),
                                    'field_4': truncate_field(safe_strip(job_dates_data.get('Field_4')), 25),
                                    'field_5': truncate_field(safe_strip(job_dates_data.get('Field_5')), 25),
                                    'error_code': safe_strip(job_dates_data.get('Error_Code')),
                                    'error_description': safe_strip(job_dates_data.get('Error_Description')),
                                    'error_column': safe_strip(job_dates_data.get('Error_Column')),
                                    'last_synced_at': sync_time,
                                }
                                
                                spectrum_job_dates, _ = SpectrumJobDates.objects.update_or_create(
                                    company_code=company,
                                    job_number=job_number,
                                    defaults=dates_defaults
                                )
                                
                                # Update Project with dates from Spectrum
                                project_update_fields = {}
                                if spectrum_job_dates.est_start_date:
                                    project_update_fields['spectrum_est_start_date'] = spectrum_job_dates.est_start_date
                                if spectrum_job_dates.est_complete_date:
                                    project_update_fields['spectrum_est_complete_date'] = spectrum_job_dates.est_complete_date
                                if spectrum_job_dates.projected_complete_date:
                                    project_update_fields['spectrum_projected_complete_date'] = spectrum_job_dates.projected_complete_date
                                if spectrum_job_dates.start_date:
                                    project_update_fields['spectrum_start_date'] = spectrum_job_dates.start_date
                                if spectrum_job_dates.complete_date:
                                    project_update_fields['spectrum_complete_date'] = spectrum_job_dates.complete_date
                                if spectrum_job_dates.create_date:
                                    project_update_fields['spectrum_create_date'] = spectrum_job_dates.create_date
                                
                                if project_update_fields:
                                    Project.objects.filter(job_number=job_number).update(**project_update_fields)
                                
                                logger.debug(f"Imported job dates for {job_number}")
                        except Exception as e:
                            logger.warning(f"Error importing job dates for {job_number}: {e}")
                        
                        # Import phases (enhanced) (from pre-fetched data)
                        try:
                            phases_list = phases_dict.get((company, job_number), [])
                            # Additional validation: ensure all phases match this job number exactly
                            valid_phases = []
                            for phase_data in phases_list:
                                phase_job_num = safe_strip(phase_data.get('Job_Number'))
                                # Strict validation: phase must match the job number exactly
                                if phase_job_num != job_number:
                                    logger.warning(f"Skipping phase {phase_data.get('Phase_Code')} - job number mismatch: expected {job_number}, got {phase_job_num}")
                                    continue
                                
                                phase_code = safe_strip(phase_data.get('Phase_Code'))
                                cost_type = safe_strip(phase_data.get('Cost_Type'))
                                
                                if not phase_code:
                                    continue
                                
                                valid_phases.append(phase_data)
                            
                            # Using centralized parse_date_robust function
                            
                            # Helper function to truncate fields to max_length
                            def truncate_field(value, max_length):
                                if value and isinstance(value, str) and len(value) > max_length:
                                    return value[:max_length]
                                return value
                            
                            # Use only validated phases
                            for phase_data in valid_phases:
                                phase_code = safe_strip(phase_data.get('Phase_Code'))
                                cost_type = safe_strip(phase_data.get('Cost_Type'))
                                
                                phase_defaults = {
                                    'description': truncate_field(safe_strip(phase_data.get('Description')), 25),
                                    'status_code': safe_strip(phase_data.get('Status_Code')),
                                    'unit_of_measure': truncate_field(safe_strip(phase_data.get('Unit_of_Measure')), 25),
                                    'jtd_quantity': phase_data.get('JTD_Quantity'),
                                    'jtd_hours': phase_data.get('JTD_Hours'),
                                    'jtd_actual_dollars': phase_data.get('JTD_Actual_Dollars'),
                                    'projected_quantity': phase_data.get('Projected_Quantity'),
                                    'projected_hours': phase_data.get('Projected_Hours'),
                                    'projected_dollars': phase_data.get('Projected_Dollars'),
                                    'estimated_quantity': phase_data.get('Estimated_Quantity'),
                                    'estimated_hours': phase_data.get('Estimated_Hours'),
                                    'current_estimated_dollars': phase_data.get('Current_Estimated_Dollars'),
                                    'cost_center': truncate_field(safe_strip(phase_data.get('Cost_Center')), 25),
                                    'price_method_code': safe_strip(phase_data.get('Price_Method_Code')),
                                    'complete_date': parse_date_robust(phase_data.get('Complete_Date')),
                                    'start_date': parse_date_robust(phase_data.get('Start_Date')),
                                    'end_date': parse_date_robust(phase_data.get('End_Date')),
                                    'comment': safe_strip(phase_data.get('Comment')),
                                    'error_code': safe_strip(phase_data.get('Error_Code')),
                                    'error_description': safe_strip(phase_data.get('Error_Description')),
                                    'error_column': safe_strip(phase_data.get('Error_Column')),
                                    'last_synced_at': sync_time,
                                }
                                
                                SpectrumPhaseEnhanced.objects.update_or_create(
                                    company_code=company,
                                    job_number=job_number,
                                    phase_code=phase_code,
                                    cost_type=cost_type or '',
                                    defaults=phase_defaults
                                )
                            logger.debug(f"Imported {len(valid_phases)} phases for {job_number} (filtered from {len(phases_list)} total)")
                            
                            # Calculate aggregates from phases and update Project
                            try:
                                from django.db.models import Sum
                                # SpectrumPhaseEnhanced is already imported at the top of the file
                                
                                # Get all phases for this job
                                phases = SpectrumPhaseEnhanced.objects.filter(
                                    company_code=company,
                                    job_number=job_number
                                )
                                
                                # Calculate aggregates
                                aggregates = phases.aggregate(
                                    total_projected=Sum('projected_dollars'),
                                    total_estimated=Sum('current_estimated_dollars'),
                                    total_jtd=Sum('jtd_actual_dollars')
                                )
                                
                                # Get unique cost types
                                cost_types = phases.exclude(cost_type__isnull=True).exclude(cost_type='').values_list('cost_type', flat=True).distinct()
                                cost_types_str = ', '.join(sorted(cost_types)) if cost_types else None
                                
                                # Update Project with phase aggregates
                                project_update_fields = {}
                                if aggregates['total_projected']:
                                    project_update_fields['spectrum_total_projected_dollars'] = aggregates['total_projected']
                                if aggregates['total_estimated']:
                                    project_update_fields['spectrum_total_estimated_dollars'] = aggregates['total_estimated']
                                if aggregates['total_jtd']:
                                    project_update_fields['spectrum_total_jtd_dollars'] = aggregates['total_jtd']
                                if cost_types_str:
                                    project_update_fields['spectrum_cost_types'] = cost_types_str
                                
                                if project_update_fields:
                                    Project.objects.filter(job_number=job_number).update(**project_update_fields)
                                    logger.debug(f"Updated project {job_number} with phase aggregates")
                            except Exception as e:
                                logger.warning(f"Error calculating phase aggregates for {job_number}: {e}")
                        except Exception as e:
                            logger.warning(f"Error importing phases for {job_number}: {e}")
                        
                        # Import job UDFs (from pre-fetched bulk data - no API call needed!)
                        try:
                            udf_data = udfs_dict.get((company, job_number))
                            
                            if udf_data:
                                udf_defaults = {
                                    'udf1': safe_strip(udf_data.get('UDF1')),
                                    'udf2': safe_strip(udf_data.get('UDF2')),
                                    'udf3': safe_strip(udf_data.get('UDF3')),
                                    'udf4': safe_strip(udf_data.get('UDF4')),
                                    'udf5': safe_strip(udf_data.get('UDF5')),
                                    'udf6': safe_strip(udf_data.get('UDF6')),
                                    'udf7': safe_strip(udf_data.get('UDF7')),
                                    'udf8': safe_strip(udf_data.get('UDF8')),
                                    'udf9': safe_strip(udf_data.get('UDF9')),
                                    'udf10': safe_strip(udf_data.get('UDF10')),
                                    'udf11': safe_strip(udf_data.get('UDF11')),
                                    'udf12': safe_strip(udf_data.get('UDF12')),
                                    'udf13': safe_strip(udf_data.get('UDF13')),
                                    'udf14': safe_strip(udf_data.get('UDF14')),
                                    'udf15': safe_strip(udf_data.get('UDF15')),
                                    'udf16': safe_strip(udf_data.get('UDF16')),
                                    'udf17': safe_strip(udf_data.get('UDF17')),
                                    'udf18': safe_strip(udf_data.get('UDF18')),
                                    'udf19': safe_strip(udf_data.get('UDF19')),
                                    'udf20': safe_strip(udf_data.get('UDF20')),
                                    'error_code': safe_strip(udf_data.get('Error_Code')),
                                    'error_description': safe_strip(udf_data.get('Error_Description')),
                                    'error_column': safe_strip(udf_data.get('Error_Column')),
                                    'last_synced_at': sync_time,
                                }
                                
                                SpectrumJobUDF.objects.update_or_create(
                                    company_code=company,
                                    job_number=job_number,
                                    defaults=udf_defaults
                                )
                                logger.debug(f"Imported job UDFs for {job_number}")
                        except Exception as e:
                            logger.warning(f"Error importing job UDFs for {job_number}: {e}")
                        
                except Exception as e:
                    error_msg = f"Error importing job {job_data.get('Job_Number', 'unknown')}: {str(e)}"
                    logger.error(error_msg)
                    errors.append(error_msg)
        
        logger.info(f"=== IMPORT SUMMARY ===")
        logger.info(f"Total jobs fetched from GetJob: {len(jobs)}")
        logger.info(f"Total jobs_main fetched from GetJobMain: {len(jobs_main)}")
        logger.info(f"New SpectrumJob records created: {imported_count}")
        logger.info(f"Existing SpectrumJob records updated: {updated_count}")
        logger.info(f"Total SpectrumJob records processed: {imported_count + updated_count}")
        logger.info(f"Errors encountered: {len(errors)}")
        
        return Response({
            'detail': f'Successfully imported {imported_count} new jobs and updated {updated_count} existing jobs.',
            'imported': imported_count,
            'updated': updated_count,
            'total_fetched': len(jobs),
            'total_jobs_main': len(jobs_main),
            'total_processed': imported_count + updated_count,
            'errors': errors if errors else None
        }, status=http_status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error importing jobs from Spectrum: {e}", exc_info=True)
        return Response(
            {
                'detail': f'Failed to import jobs from Spectrum: {str(e)}',
                'error': str(e)
            },
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def list_imported_jobs(request):
    """
    List all jobs imported from Spectrum.
    Only accessible to root super admins.
    Supports filtering by division via query parameter.
    """
    try:
        jobs = SpectrumJob.objects.all()
        
        # Filter by division if provided
        division = request.query_params.get('division', None)
        if division:
            jobs = jobs.filter(division=division)
        
        jobs = jobs.order_by('-last_synced_at', 'company_code', 'job_number')
        serializer = SpectrumJobSerializer(jobs, many=True)
        return Response({
            'results': serializer.data,
            'count': jobs.count()
        }, status=http_status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error listing imported jobs: {e}", exc_info=True)
        return Response(
            {
                'detail': f'Failed to list imported jobs: {str(e)}',
                'error': str(e)
            },
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def manual_sync_jobs(request):
    """
    Manually trigger a sync of jobs from Spectrum.
    This is the same as the automatic sync but can be triggered on demand.
    Only accessible to root super admins.
    """
    try:
        client = SpectrumSOAPClient()
        
        if not client.authorization_id:
            return Response(
                {
                    'detail': 'Spectrum Authorization ID not configured.',
                    'error': 'Configuration missing'
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Get filter parameters (optional, can use defaults)
        company_code = request.data.get('company_code', None)
        division = request.data.get('division', None)
        status_code = request.data.get('status_code', None)
        
        # Fetch jobs from GetJob service using division looping to get all jobs
        # If no division is specified, fetch all jobs by looping through all divisions
        if division:
            # If a specific division is requested, fetch only that division
            jobs = client.get_jobs(
                company_code=company_code,
                division=division,
                status_code=status_code,
            )
            jobs_main = client.get_job_main(
                company_code=company_code,
                division=division,
                status_code=status_code,
            )
        else:
            # No division specified - fetch all jobs by looping through all divisions
            logger.info("No division specified, fetching all jobs by looping through divisions...")
            jobs = client.get_all_jobs_by_division(
                company_code=company_code,
                divisions=None,  # Will use default: ['111', '121', '131', '135', '145']
                status_code=status_code,
            )
            jobs_main = client.get_all_job_main_by_division(
                company_code=company_code,
                divisions=None,  # Will use default: ['111', '121', '131', '135', '145']
                status_code=status_code,
            )
        
        # Create a dictionary to merge GetJobMain data with GetJob data
        jobs_main_dict = {}
        for job_main in jobs_main:
            company = safe_strip(job_main.get('Company_Code'))
            job_num = safe_strip(job_main.get('Job_Number'))
            if company and job_num:
                jobs_main_dict[(company, job_num)] = job_main
        
        # Fetch job dates, phases, and UDFs in bulk (by division/status to match jobs being imported)
        job_dates_dict = {}
        phases_dict = {}
        udfs_dict = {}
        try:
            # Fetch job dates using same filters as jobs
            if division:
                job_dates_list = client.get_job_dates(
                    company_code=company_code,
                    division=division,
                    status_code=status_code,
                )
            else:
                # Fetch all dates by looping through divisions using the new method
                logger.info("Fetching all job dates by looping through divisions...")
                job_dates_list = client.get_all_job_dates_by_division(
                    company_code=company_code,
                    divisions=None,  # Will use default: ['111', '121', '131', '135', '145']
                    status_code=status_code,
                )
            
            # Create dictionary keyed by (company_code, job_number)
            for dates_data in job_dates_list:
                company = safe_strip(dates_data.get('Company_Code'))
                job_num = safe_strip(dates_data.get('Job_Number'))
                if company and job_num:
                    job_dates_dict[(company, job_num)] = dates_data
            
            # Helper function to validate job number pattern (xx-xxxx format)
            def is_valid_job_number(job_num: str) -> bool:
                """Validate job number matches pattern xx-xxxx (e.g., 20-1140)"""
                if not job_num:
                    return False
                job_num = job_num.strip()
                # Pattern: 2 digits, hyphen, 4 digits (e.g., 20-1140)
                import re
                pattern = r'^\d{2}-\d{4}$'
                return bool(re.match(pattern, job_num))
            
            # Fetch phases per job number to ensure we get all phases for each job
            # First, collect all valid job numbers from the jobs we're importing
            valid_job_numbers = set()
            for job_data in jobs:
                job_num = safe_strip(job_data.get('Job_Number'))
                if job_num and is_valid_job_number(job_num):
                    valid_job_numbers.add(job_num)
            
            logger.info(f"Fetching phases for {len(valid_job_numbers)} valid job numbers using parallel requests...")
            
            # Helper function to fetch phases for a single job
            def fetch_job_phases(job_num):
                """Fetch phases for a single job number."""
                try:
                    job_phases = client.get_phase_enhanced(
                        company_code=company_code,
                        job_number=job_num,
                        status_code=status_code,
                    )
                    # Strictly filter to only include phases that match the requested job number
                    filtered_phases = []
                    for phase_data in job_phases:
                        phase_job_num = safe_strip(phase_data.get('Job_Number'))
                        # Triple validation: must be valid pattern, must match requested job, and must have company
                        if (phase_job_num and 
                            is_valid_job_number(phase_job_num) and 
                            phase_job_num == job_num):
                            company = safe_strip(phase_data.get('Company_Code'))
                            if company:
                                filtered_phases.append((company, phase_job_num, phase_data))
                            else:
                                logger.debug(f"Skipping phase {phase_data.get('Phase_Code')} for job {job_num} - missing Company_Code")
                        else:
                            if phase_job_num and phase_job_num != job_num:
                                logger.debug(f"Skipping phase {phase_data.get('Phase_Code')} - job number mismatch: requested {job_num}, got {phase_job_num}")
                    return job_num, filtered_phases, len(job_phases)
                except Exception as e:
                    logger.warning(f"Error fetching phases for job {job_num}: {e}")
                    return job_num, [], 0
            
            # Use ThreadPoolExecutor to fetch phases in parallel (max 10 concurrent requests)
            # This significantly speeds up the import process
            max_workers = min(10, len(valid_job_numbers))  # Limit to 10 concurrent requests to avoid overwhelming the API
            fetched_count = 0
            failed_count = 0
            
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Submit all phase fetch tasks
                future_to_job = {executor.submit(fetch_job_phases, job_num): job_num for job_num in valid_job_numbers}
                
                # Process completed tasks as they finish
                for future in as_completed(future_to_job):
                    job_num = future_to_job[future]
                    try:
                        job_num_result, filtered_phases, total_returned = future.result()
                        fetched_count += 1
                        
                        # Add filtered phases to the dictionary
                        for company, phase_job_num, phase_data in filtered_phases:
                            key = (company, phase_job_num)
                            if key not in phases_dict:
                                phases_dict[key] = []
                            phases_dict[key].append(phase_data)
                        
                        if fetched_count % 50 == 0:
                            logger.info(f"Progress: Fetched phases for {fetched_count}/{len(valid_job_numbers)} jobs...")
                    except Exception as e:
                        failed_count += 1
                        logger.warning(f"Error processing phases for job {job_num}: {e}")
            
            logger.info(f"Completed fetching phases: {fetched_count} succeeded, {failed_count} failed out of {len(valid_job_numbers)} total jobs")
            
            # Fetch ALL UDFs in bulk (this is the key optimization - fetch once, not per job!)
            logger.info("Fetching all job UDFs in bulk...")
            if division:
                udfs_list = client.get_job_udf(
                    company_code=company_code,
                    division=division,
                    status_code=status_code,
                )
            else:
                # Fetch all UDFs by looping through divisions
                udfs_list = client.get_all_job_udf_by_division(
                    company_code=company_code,
                    divisions=None,  # Will use default: ['111', '121', '131', '135', '145']
                    status_code=status_code,
                )
            
            # Create dictionary keyed by (company_code, job_number) for fast lookup
            for udf_data in udfs_list:
                company = safe_strip(udf_data.get('Company_Code'))
                job_num = safe_strip(udf_data.get('Job_Number'))
                if company and job_num:
                    udfs_dict[(company, job_num)] = udf_data
            
            logger.info(f"Fetched {len(job_dates_dict)} job dates, {sum(len(v) for v in phases_dict.values())} phases, and {len(udfs_dict)} UDFs for manual sync")
        except Exception as e:
            logger.warning(f"Error fetching job dates/phases/UDFs in bulk for manual sync: {e}")
        
        # Import jobs to database
        imported_count = 0
        updated_count = 0
        errors = []
        sync_time = timezone.now()
        
        # Pre-fetch all branches to avoid repeated database queries
        branches_cache = {}
        for branch in Branch.objects.all():
            if branch.spectrum_division_code:
                branches_cache[branch.spectrum_division_code] = branch
        default_branch = Branch.objects.filter(status='ACTIVE').first()
        
        # Track seen job numbers to prevent duplicates in a single import run
        seen_jobs = set()
        
        with transaction.atomic():
            for job_data in jobs:
                try:
                    company = safe_strip(job_data.get('Company_Code'))
                    job_number = safe_strip(job_data.get('Job_Number'))
                    
                    if not company or not job_number:
                        errors.append(f"Skipping job with missing Company_Code or Job_Number")
                        continue
                    
                    # Check for duplicates in this import run
                    job_key = (company, job_number)
                    if job_key in seen_jobs:
                        logger.debug(f"Skipping duplicate job {job_number} (Company: {company}) in this import run")
                        continue
                    seen_jobs.add(job_key)
                    
                    # Validate job number pattern: xx-xxxx, xx-xxxx-xx, xx-xxxxx, xx-xxxx-x, xx-xxxxxx, xx-xxxxxxx, or xx-xxxxxxxx
                    import re
                    valid_patterns = [
                        re.compile(r'^\d{2}-\d{4}$'),           # xx-xxxx (e.g., 10-1002)
                        re.compile(r'^\d{2}-\d{4}-\d{2}$'),     # xx-xxxx-xx (e.g., 10-1002-01)
                        re.compile(r'^\d{2}-\d{5}$'),           # xx-xxxxx (e.g., 10-10020)
                        re.compile(r'^\d{2}-\d{4}-\d{1}$'),     # xx-xxxx-x (e.g., 10-1002-1)
                        re.compile(r'^\d{2}-\d{6}$'),           # xx-xxxxxx (e.g., 10-100200)
                        re.compile(r'^\d{2}-\d{7}$'),           # xx-xxxxxxx (e.g., 10-1002000)
                        re.compile(r'^\d{2}-\d{8}$'),           # xx-xxxxxxxx (e.g., 10-10020000)
                    ]
                    if not any(pattern.match(job_number) for pattern in valid_patterns):
                        logger.debug(f"Skipping job {job_number} - does not match accepted patterns (xx-xxxx, xx-xxxx-xx, xx-xxxxx, xx-xxxx-x, xx-xxxxxx, xx-xxxxxxx, or xx-xxxxxxxx)")
                        continue
                    
                    # Merge with GetJobMain data if available
                    job_main_data = jobs_main_dict.get((company, job_number), {})
                    
                    # Prepare defaults (same as import_jobs_to_database)
                    # Truncate fields to match database max_length constraints
                    def truncate_field(value, max_length):
                        if value and len(value) > max_length:
                            return value[:max_length]
                        return value
                    
                    defaults = {
                        'job_description': truncate_field(safe_strip(job_data.get('Job_Description')), 50),
                        'division': safe_strip(job_data.get('Division')),
                        'address_1': truncate_field(safe_strip(job_data.get('Address_1')), 50),
                        'address_2': truncate_field(safe_strip(job_data.get('Address_2')), 50),
                        'city': truncate_field(safe_strip(job_data.get('City')), 50),
                        'state': safe_strip(job_data.get('State')),
                        'zip_code': safe_strip(job_data.get('Zip_Code')),
                        'project_manager': safe_strip(job_data.get('Project_Manager')),
                        'superintendent': safe_strip(job_data.get('Superintendent')),
                        'estimator': safe_strip(job_data.get('Estimator')),
                        'certified_flag': safe_strip(job_data.get('Certified_Flag')),
                        'customer_code': safe_strip(job_data.get('Customer_Code')),
                        'status_code': safe_strip(job_data.get('Status_Code')),
                        'work_state_tax_code': safe_strip(job_data.get('Work_State_Tax_Code')),
                        'contract_number': truncate_field(safe_strip(job_data.get('Contract_Number')), 30),
                        'cost_center': safe_strip(job_data.get('Cost_Center')),
                        'error_code': safe_strip(job_data.get('Error_Code')),
                        'error_description': safe_strip(job_data.get('Error_Description')),
                        'error_column': safe_strip(job_data.get('Error_Column')),
                        'phone': safe_strip(job_main_data.get('Phone')),
                        'fax_phone': safe_strip(job_main_data.get('Fax_Phone')),
                        'job_site_phone': safe_strip(job_main_data.get('Job_Site_Phone')),
                        'customer_name': truncate_field(safe_strip(job_main_data.get('Customer_Name')), 30),
                        'owner_name': truncate_field(safe_strip(job_main_data.get('Owner_Name')), 50),
                        'wo_site': truncate_field(safe_strip(job_main_data.get('WO_Site')), 10),
                        'comment': safe_strip(job_main_data.get('Comment')),
                        'price_method_code': truncate_field(safe_strip(job_main_data.get('Price_Method_Code')), 1),
                        'unit_of_measure': truncate_field(safe_strip(job_main_data.get('Unit_of_Measure')), 5),
                        'legal_desc': safe_strip(job_main_data.get('Legal_Desc')),
                        'field_1': truncate_field(safe_strip(job_main_data.get('Field_1')), 30),
                        'field_2': truncate_field(safe_strip(job_main_data.get('Field_2')), 30),
                        'field_3': truncate_field(safe_strip(job_main_data.get('Field_3')), 30),
                        'field_4': truncate_field(safe_strip(job_main_data.get('Field_4')), 30),
                        'field_5': truncate_field(safe_strip(job_main_data.get('Field_5')), 30),
                        'last_synced_at': sync_time,
                    }
                    
                    # Handle numeric fields
                    try:
                        original_contract = job_main_data.get('Original_Contract')
                        if original_contract:
                            defaults['original_contract'] = float(original_contract)
                    except (ValueError, TypeError):
                        pass
                    
                    try:
                        total_units = job_main_data.get('Total_Units')
                        if total_units:
                            defaults['total_units'] = float(total_units)
                    except (ValueError, TypeError):
                        pass
                    
                    try:
                        latitude = job_main_data.get('Latitude')
                        if latitude:
                            defaults['latitude'] = float(latitude)
                    except (ValueError, TypeError):
                        pass
                    
                    try:
                        longitude = job_main_data.get('Longitude')
                        if longitude:
                            defaults['longitude'] = float(longitude)
                    except (ValueError, TypeError):
                        pass
                    
                    job, created = SpectrumJob.objects.update_or_create(
                        company_code=company,
                        job_number=job_number,
                        defaults=defaults
                    )
                    
                    if created:
                        imported_count += 1
                    else:
                        updated_count += 1
                    
                    # Create or update Project from Spectrum job (same logic as import_jobs_to_database)
                    division_code = safe_strip(job_data.get('Division'))
                    branch = None
                    if division_code:
                        # Use cached branch lookup (much faster than database query per job)
                        branch = branches_cache.get(division_code)
                        if not branch:
                            # Auto-create branch/division from Spectrum data (only if not in cache)
                            division_names = {
                                '111': 'Kansas City / Nebraska',
                                '121': 'Denver',
                                '131': 'SLC Commercial',
                                '135': 'Utah Commercial',
                                '145': 'St George',
                            }
                            division_name = division_names.get(division_code, f'Division {division_code}')
                            
                            # Create new branch/division
                            branch = Branch.objects.create(
                                name=division_name,
                                code=division_code,
                                spectrum_division_code=division_code,
                                status='ACTIVE'
                            )
                            # Add to cache for future lookups in this sync
                            branches_cache[division_code] = branch
                            logger.info(f"Auto-created branch/division: {division_name} ({division_code}) from Spectrum")
                    
                    # If no branch found, use cached default branch
                    if not branch:
                        if not default_branch:
                            # Create a default "Unassigned" branch if no branches exist
                            default_branch = Branch.objects.create(
                                name='Unassigned',
                                code='UNASSIGNED',
                                spectrum_division_code=None,
                                status='ACTIVE'
                            )
                            logger.info("Created default 'Unassigned' branch for jobs without division codes")
                        branch = default_branch
                        logger.debug(f"Using default branch for job {job_number} (no division code match)")
                    
                    # Create/update Project for ALL imported jobs
                    if branch:
                        # Prepare project data
                        project_name = safe_strip(job_data.get('Job_Description')) or f"Job {job_number}"
                        
                        # Map Spectrum status codes to Project status
                        # Spectrum: 'A' = Active, 'I' = Inactive, 'C' = Complete
                        spectrum_status = safe_strip(job_data.get('Status_Code'))
                        if spectrum_status == 'A':
                            project_status = 'ACTIVE'
                        elif spectrum_status == 'C':
                            project_status = 'COMPLETED'
                        elif spectrum_status == 'I':
                            project_status = 'PENDING'
                        else:
                            project_status = 'PENDING'  # Default for unknown statuses
                        
                        project_defaults = {
                            'name': project_name,
                            'branch': branch,
                            'spectrum_division_code': division_code,
                            'client_name': safe_strip(job_main_data.get('Customer_Name')) or safe_strip(job_data.get('Customer_Code')),
                            'work_location': f"{safe_strip(job_data.get('Address_1')) or ''} {safe_strip(job_data.get('City')) or ''} {safe_strip(job_data.get('State')) or ''}".strip(),
                            'status': project_status,
                            'start_date': timezone.now().date(),  # Default start date
                            'duration': 30,  # Default duration
                            'is_public': True,  # Make all projects public by default
                        }
                        
                        # Handle contract value
                        try:
                            original_contract = job_main_data.get('Original_Contract')
                            if original_contract:
                                contract_value = float(original_contract)
                                project_defaults['contract_value'] = contract_value
                                project_defaults['spectrum_original_contract'] = contract_value
                        except (ValueError, TypeError):
                            pass
                        
                        # Match project manager by name from Spectrum (same logic as import_jobs_to_database)
                        pm_name = safe_strip(job_data.get('Project_Manager')) or safe_strip(job_main_data.get('Project_Manager'))
                        matched_pm = None
                        # Store Spectrum PM name even if we can't match to a User
                        if pm_name:
                            project_defaults['spectrum_project_manager'] = pm_name
                            from accounts.models import User
                            pm_name_clean = pm_name.replace(',', ' ').strip()
                            pm_name_parts = pm_name_clean.split()
                            pm = None
                            
                            if len(pm_name_parts) >= 2:
                                # Try "FIRST LAST" format first (e.g., "Jacob Randol") - most common
                                first_name = pm_name_parts[0]
                                last_name = ' '.join(pm_name_parts[1:])  # Handle multi-word last names
                                pm = User.objects.filter(
                                    role='PROJECT_MANAGER',
                                    first_name__iexact=first_name,
                                    last_name__iexact=last_name
                                ).first()
                                
                                # If not found, try case-insensitive contains
                                if not pm:
                                    pm = User.objects.filter(
                                        role='PROJECT_MANAGER',
                                        first_name__icontains=first_name,
                                        last_name__icontains=last_name
                                    ).first()
                                
                                # If not found, try "LAST FIRST" format (e.g., "Randol Jacob")
                                if not pm and len(pm_name_parts) == 2:
                                    last_name = pm_name_parts[0]
                                    first_name = pm_name_parts[1]
                                    pm = User.objects.filter(
                                        role='PROJECT_MANAGER',
                                        first_name__iexact=first_name,
                                        last_name__iexact=last_name
                                    ).first()
                                
                                # If still not found, try case-insensitive contains for reversed format
                                if not pm and len(pm_name_parts) == 2:
                                    pm = User.objects.filter(
                                        role='PROJECT_MANAGER',
                                        first_name__icontains=first_name,
                                        last_name__icontains=last_name
                                    ).first()
                                
                                if pm:
                                    matched_pm = pm
                                    project_defaults['project_manager'] = pm
                                    logger.debug(f"Matched project manager {pm.get_full_name()} to job {job_number}")
                                else:
                                    logger.warning(f"Could not find project manager '{pm_name}' for job {job_number}")
                        
                        # Create or update Project (match by job_number)
                        project, project_created = Project.objects.update_or_create(
                            job_number=job_number,
                            defaults=project_defaults
                        )
                        
                        # If project already existed and we found a PM but project doesn't have one, update it
                        if not project_created and matched_pm and not project.project_manager:
                            project.project_manager = matched_pm
                            project.save(update_fields=['project_manager'])
                            logger.info(f"Updated existing project {job_number} with project manager {matched_pm.get_full_name()}")
                        
                        if project_created:
                            logger.info(f"Created project {project.job_number} from Spectrum job")
                        else:
                            logger.debug(f"Updated project {project.job_number} from Spectrum job")
                        
                        # Import job dates (from pre-fetched data)
                        try:
                            job_dates_data = job_dates_dict.get((company, job_number))
                            if job_dates_data:
                                # Using centralized parse_date_robust function
                                
                                # Helper function to truncate fields to max_length
                                def truncate_field(value, max_length):
                                    if value and isinstance(value, str) and len(value) > max_length:
                                        return value[:max_length]
                                    return value
                                
                                dates_defaults = {
                                    'job_description': truncate_field(safe_strip(job_dates_data.get('Job_Description')), 25),
                                    'est_start_date': parse_date_robust(job_dates_data.get('Est_Start_Date')),
                                    'est_complete_date': parse_date_robust(job_dates_data.get('Est_Complete_Date')),
                                    'projected_complete_date': parse_date_robust(job_dates_data.get('Projected_Complete_Date')),
                                    'create_date': parse_date_robust(job_dates_data.get('Create_Date')),
                                    'start_date': parse_date_robust(job_dates_data.get('Start_Date')),
                                    'complete_date': parse_date_robust(job_dates_data.get('Complete_Date')),
                                    'field_1': truncate_field(safe_strip(job_dates_data.get('Field_1')), 25),
                                    'field_2': truncate_field(safe_strip(job_dates_data.get('Field_2')), 25),
                                    'field_3': truncate_field(safe_strip(job_dates_data.get('Field_3')), 25),
                                    'field_4': truncate_field(safe_strip(job_dates_data.get('Field_4')), 25),
                                    'field_5': truncate_field(safe_strip(job_dates_data.get('Field_5')), 25),
                                    'error_code': safe_strip(job_dates_data.get('Error_Code')),
                                    'error_description': safe_strip(job_dates_data.get('Error_Description')),
                                    'error_column': safe_strip(job_dates_data.get('Error_Column')),
                                    'last_synced_at': sync_time,
                                }
                                
                                spectrum_job_dates, _ = SpectrumJobDates.objects.update_or_create(
                                    company_code=company,
                                    job_number=job_number,
                                    defaults=dates_defaults
                                )
                                
                                # Update Project with dates from Spectrum
                                project_update_fields = {}
                                if spectrum_job_dates.est_start_date:
                                    project_update_fields['spectrum_est_start_date'] = spectrum_job_dates.est_start_date
                                if spectrum_job_dates.est_complete_date:
                                    project_update_fields['spectrum_est_complete_date'] = spectrum_job_dates.est_complete_date
                                if spectrum_job_dates.projected_complete_date:
                                    project_update_fields['spectrum_projected_complete_date'] = spectrum_job_dates.projected_complete_date
                                if spectrum_job_dates.start_date:
                                    project_update_fields['spectrum_start_date'] = spectrum_job_dates.start_date
                                if spectrum_job_dates.complete_date:
                                    project_update_fields['spectrum_complete_date'] = spectrum_job_dates.complete_date
                                if spectrum_job_dates.create_date:
                                    project_update_fields['spectrum_create_date'] = spectrum_job_dates.create_date
                                
                                if project_update_fields:
                                    Project.objects.filter(job_number=job_number).update(**project_update_fields)
                        except Exception as e:
                            logger.warning(f"Error importing job dates for {job_number}: {e}")
                        
                        # Import phases (enhanced) (from pre-fetched data)
                        try:
                            phases_list = phases_dict.get((company, job_number), [])
                            # Additional validation: ensure all phases match this job number exactly
                            valid_phases = []
                            for phase_data in phases_list:
                                phase_job_num = safe_strip(phase_data.get('Job_Number'))
                                # Strict validation: phase must match the job number exactly
                                if phase_job_num != job_number:
                                    logger.warning(f"Skipping phase {phase_data.get('Phase_Code')} - job number mismatch: expected {job_number}, got {phase_job_num}")
                                    continue
                                
                                phase_code = safe_strip(phase_data.get('Phase_Code'))
                                cost_type = safe_strip(phase_data.get('Cost_Type'))
                                
                                if not phase_code:
                                    continue
                                
                                valid_phases.append(phase_data)
                            
                            # Using centralized parse_date_robust function
                            
                            # Helper function to truncate fields to max_length
                            def truncate_field(value, max_length):
                                if value and isinstance(value, str) and len(value) > max_length:
                                    return value[:max_length]
                                return value
                            
                            # Use only validated phases
                            for phase_data in valid_phases:
                                phase_code = safe_strip(phase_data.get('Phase_Code'))
                                cost_type = safe_strip(phase_data.get('Cost_Type'))
                                
                                phase_defaults = {
                                    'description': truncate_field(safe_strip(phase_data.get('Description')), 25),
                                    'status_code': safe_strip(phase_data.get('Status_Code')),
                                    'unit_of_measure': truncate_field(safe_strip(phase_data.get('Unit_of_Measure')), 25),
                                    'jtd_quantity': phase_data.get('JTD_Quantity'),
                                    'jtd_hours': phase_data.get('JTD_Hours'),
                                    'jtd_actual_dollars': phase_data.get('JTD_Actual_Dollars'),
                                    'projected_quantity': phase_data.get('Projected_Quantity'),
                                    'projected_hours': phase_data.get('Projected_Hours'),
                                    'projected_dollars': phase_data.get('Projected_Dollars'),
                                    'estimated_quantity': phase_data.get('Estimated_Quantity'),
                                    'estimated_hours': phase_data.get('Estimated_Hours'),
                                    'current_estimated_dollars': phase_data.get('Current_Estimated_Dollars'),
                                    'cost_center': truncate_field(safe_strip(phase_data.get('Cost_Center')), 25),
                                    'price_method_code': safe_strip(phase_data.get('Price_Method_Code')),
                                    'complete_date': parse_date_robust(phase_data.get('Complete_Date')),
                                    'start_date': parse_date_robust(phase_data.get('Start_Date')),
                                    'end_date': parse_date_robust(phase_data.get('End_Date')),
                                    'comment': safe_strip(phase_data.get('Comment')),
                                    'error_code': safe_strip(phase_data.get('Error_Code')),
                                    'error_description': safe_strip(phase_data.get('Error_Description')),
                                    'error_column': safe_strip(phase_data.get('Error_Column')),
                                    'last_synced_at': sync_time,
                                }
                                
                                SpectrumPhaseEnhanced.objects.update_or_create(
                                    company_code=company,
                                    job_number=job_number,
                                    phase_code=phase_code,
                                    cost_type=cost_type or '',
                                    defaults=phase_defaults
                                )
                            logger.debug(f"Imported {len(valid_phases)} phases for {job_number} (filtered from {len(phases_list)} total)")
                            
                            # Calculate aggregates from phases and update Project
                            try:
                                from django.db.models import Sum
                                # SpectrumPhaseEnhanced is already imported at the top of the file
                                
                                # Get all phases for this job
                                phases = SpectrumPhaseEnhanced.objects.filter(
                                    company_code=company,
                                    job_number=job_number
                                )
                                
                                # Calculate aggregates
                                aggregates = phases.aggregate(
                                    total_projected=Sum('projected_dollars'),
                                    total_estimated=Sum('current_estimated_dollars'),
                                    total_jtd=Sum('jtd_actual_dollars')
                                )
                                
                                # Get unique cost types
                                cost_types = phases.exclude(cost_type__isnull=True).exclude(cost_type='').values_list('cost_type', flat=True).distinct()
                                cost_types_str = ', '.join(sorted(cost_types)) if cost_types else None
                                
                                # Update Project with phase aggregates
                                project_update_fields = {}
                                if aggregates['total_projected']:
                                    project_update_fields['spectrum_total_projected_dollars'] = aggregates['total_projected']
                                if aggregates['total_estimated']:
                                    project_update_fields['spectrum_total_estimated_dollars'] = aggregates['total_estimated']
                                if aggregates['total_jtd']:
                                    project_update_fields['spectrum_total_jtd_dollars'] = aggregates['total_jtd']
                                if cost_types_str:
                                    project_update_fields['spectrum_cost_types'] = cost_types_str
                                
                                if project_update_fields:
                                    Project.objects.filter(job_number=job_number).update(**project_update_fields)
                                    logger.debug(f"Updated project {job_number} with phase aggregates")
                            except Exception as e:
                                logger.warning(f"Error calculating phase aggregates for {job_number}: {e}")
                        except Exception as e:
                            logger.warning(f"Error importing phases for {job_number}: {e}")
                        
                        # Import job UDFs (from pre-fetched bulk data - no API call needed!)
                        try:
                            udf_data = udfs_dict.get((company, job_number))
                            
                            if udf_data:
                                udf_defaults = {
                                    'udf1': safe_strip(udf_data.get('UDF1')),
                                    'udf2': safe_strip(udf_data.get('UDF2')),
                                    'udf3': safe_strip(udf_data.get('UDF3')),
                                    'udf4': safe_strip(udf_data.get('UDF4')),
                                    'udf5': safe_strip(udf_data.get('UDF5')),
                                    'udf6': safe_strip(udf_data.get('UDF6')),
                                    'udf7': safe_strip(udf_data.get('UDF7')),
                                    'udf8': safe_strip(udf_data.get('UDF8')),
                                    'udf9': safe_strip(udf_data.get('UDF9')),
                                    'udf10': safe_strip(udf_data.get('UDF10')),
                                    'udf11': safe_strip(udf_data.get('UDF11')),
                                    'udf12': safe_strip(udf_data.get('UDF12')),
                                    'udf13': safe_strip(udf_data.get('UDF13')),
                                    'udf14': safe_strip(udf_data.get('UDF14')),
                                    'udf15': safe_strip(udf_data.get('UDF15')),
                                    'udf16': safe_strip(udf_data.get('UDF16')),
                                    'udf17': safe_strip(udf_data.get('UDF17')),
                                    'udf18': safe_strip(udf_data.get('UDF18')),
                                    'udf19': safe_strip(udf_data.get('UDF19')),
                                    'udf20': safe_strip(udf_data.get('UDF20')),
                                    'error_code': safe_strip(udf_data.get('Error_Code')),
                                    'error_description': safe_strip(udf_data.get('Error_Description')),
                                    'error_column': safe_strip(udf_data.get('Error_Column')),
                                    'last_synced_at': sync_time,
                                }
                                
                                SpectrumJobUDF.objects.update_or_create(
                                    company_code=company,
                                    job_number=job_number,
                                    defaults=udf_defaults
                                )
                        except Exception as e:
                            logger.warning(f"Error importing job UDFs for {job_number}: {e}")
                        
                except Exception as e:
                    error_msg = f"Error syncing job {job_data.get('Job_Number', 'unknown')}: {str(e)}"
                    logger.error(error_msg)
                    errors.append(error_msg)
        
        return Response({
            'detail': f'Successfully synced {imported_count} new jobs and updated {updated_count} existing jobs.',
            'imported': imported_count,
            'updated': updated_count,
            'total_fetched': len(jobs),
            'errors': errors if errors else None
        }, status=http_status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error in manual sync: {e}", exc_info=True)
        return Response(
            {
                'detail': f'Failed to sync jobs from Spectrum: {str(e)}',
                'error': str(e)
            },
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def get_job_main_from_spectrum(request):
    """
    Fetch job main data from Spectrum's GetJobMain service.
    Only accessible to root super admins.
    """
    try:
        client = SpectrumSOAPClient()
        
        if not client.authorization_id:
            return Response(
                {
                    'detail': 'Spectrum Authorization ID not configured.',
                    'error': 'Configuration missing'
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Get query parameters
        company_code = request.query_params.get('company_code', None)
        division = request.query_params.get('division', None)
        status_code = request.query_params.get('status_code', None)
        project_manager = request.query_params.get('project_manager', None)
        superintendent = request.query_params.get('superintendent', None)
        estimator = request.query_params.get('estimator', None)
        customer_code = request.query_params.get('customer_code', None)
        cost_center = request.query_params.get('cost_center', None)
        sort_by = request.query_params.get('sort_by', None)
        
        # Fetch jobs from Spectrum GetJobMain service using division looping to get all jobs
        # If no division is specified, fetch all jobs by looping through all divisions
        if division:
            # If a specific division is requested, fetch only that division
            jobs = client.get_job_main(
                company_code=company_code,
                division=division,
                status_code=status_code,
                project_manager=project_manager,
                superintendent=superintendent,
                estimator=estimator,
                customer_code=customer_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
        else:
            # No division specified - fetch all jobs by looping through all divisions
            logger.info("No division specified, fetching all job main data by looping through divisions...")
            jobs = client.get_all_job_main_by_division(
                company_code=company_code,
                divisions=None,  # Will use default: ['111', '121', '131', '135', '145']
                status_code=status_code,
                project_manager=project_manager,
                superintendent=superintendent,
                estimator=estimator,
                customer_code=customer_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
        
        return Response({
            'results': jobs,
            'count': len(jobs)
        }, status=http_status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error fetching job main from Spectrum: {e}", exc_info=True)
        return Response(
            {
                'detail': f'Failed to fetch job main from Spectrum: {str(e)}',
                'error': str(e)
            },
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def get_job_contacts_from_spectrum(request):
    """
    Fetch job contacts from Spectrum's GetJobContact service.
    Only accessible to root super admins.
    
    Requires at least one filter: job_number OR last_name OR project_manager OR first_name
    to avoid empty results.
    """
    try:
        client = SpectrumSOAPClient()
        
        if not client.authorization_id:
            return Response(
                {
                    'detail': 'Spectrum Authorization ID not configured.',
                    'error': 'Configuration missing'
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Get query parameters
        company_code = request.query_params.get('company_code', None)
        job_number = request.query_params.get('job_number', None)
        status_code = request.query_params.get('status_code', None)
        project_manager = request.query_params.get('project_manager', None)
        superintendent = request.query_params.get('superintendent', None)
        estimator = request.query_params.get('estimator', None)
        first_name = request.query_params.get('first_name', None)
        last_name = request.query_params.get('last_name', None)
        phone_number = request.query_params.get('phone_number', None)
        title = request.query_params.get('title', None)
        cost_center = request.query_params.get('cost_center', None)
        sort_by = request.query_params.get('sort_by', None)
        
        # Enforce at least one filter to avoid empty results
        # Either job_number OR at least one search field must be provided
        if not any([job_number, last_name, project_manager, first_name, phone_number]):
            return Response(
                {
                    'detail': 'Provide at least one filter: job_number OR last_name OR project_manager OR first_name OR phone_number',
                    'error': 'Missing required filter'
                },
                status=http_status.HTTP_400_BAD_REQUEST
            )
        
        # Fetch contacts from Spectrum
        contacts = client.get_job_contacts(
            company_code=company_code,
            job_number=job_number,
            status_code=status_code,
            project_manager=project_manager,
            superintendent=superintendent,
            estimator=estimator,
            first_name=first_name,
            last_name=last_name,
            phone_number=phone_number,
            title=title,
            cost_center=cost_center,
            sort_by=sort_by
        )
        
        return Response({
            'results': contacts,
            'count': len(contacts)
        }, status=http_status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error fetching job contacts from Spectrum: {e}", exc_info=True)
        return Response(
            {
                'detail': f'Failed to fetch job contacts from Spectrum: {str(e)}',
                'error': str(e)
            },
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def get_job_dates_from_spectrum(request):
    """
    Fetch job dates from Spectrum's GetJobDates service.
    Only accessible to root super admins.
    """
    try:
        client = SpectrumSOAPClient()
        
        if not client.authorization_id:
            return Response(
                {
                    'detail': 'Spectrum Authorization ID not configured.',
                    'error': 'Configuration missing'
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Get query parameters
        company_code = request.query_params.get('company_code', None)
        division = request.query_params.get('division', None)
        status_code = request.query_params.get('status_code', None)
        project_manager = request.query_params.get('project_manager', None)
        superintendent = request.query_params.get('superintendent', None)
        estimator = request.query_params.get('estimator', None)
        customer_code = request.query_params.get('customer_code', None)
        cost_center = request.query_params.get('cost_center', None)
        sort_by = request.query_params.get('sort_by', None)
        
        # Fetch job dates from Spectrum using looping to get all dates
        if division:
            # If a specific division is requested, fetch only that division
            dates = client.get_job_dates(
                company_code=company_code,
                division=division,
                status_code=status_code,
                project_manager=project_manager,
                superintendent=superintendent,
                estimator=estimator,
                customer_code=customer_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
        else:
            # No division specified - fetch all dates by looping through all divisions
            logger.info("No division specified, fetching all job dates by looping through divisions...")
            dates = client.get_all_job_dates_by_division(
                company_code=company_code,
                divisions=None,  # Will use default: ['111', '121', '131', '135', '145']
                status_code=status_code,
                project_manager=project_manager,
                superintendent=superintendent,
                estimator=estimator,
                customer_code=customer_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
        
        # Add division information to dates by looking up from SpectrumJob
        dates_with_division = []
        for date_item in dates:
            company = safe_strip(date_item.get('Company_Code'))
            job_num = safe_strip(date_item.get('Job_Number'))
            if company and job_num:
                try:
                    job = SpectrumJob.objects.get(company_code=company, job_number=job_num)
                    date_item['Division'] = job.division
                except SpectrumJob.DoesNotExist:
                    date_item['Division'] = None
            dates_with_division.append(date_item)
        
        return Response({
            'results': dates_with_division,
            'count': len(dates_with_division)
        }, status=http_status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error fetching job dates from Spectrum: {e}", exc_info=True)
        return Response(
            {
                'detail': f'Failed to fetch job dates from Spectrum: {str(e)}',
                'error': str(e)
            },
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def get_phase_from_spectrum(request):
    """
    Fetch phase information from Spectrum's GetPhase service.
    Only accessible to root super admins.
    """
    try:
        client = SpectrumSOAPClient()
        
        if not client.authorization_id:
            return Response(
                {
                    'detail': 'Spectrum Authorization ID not configured.',
                    'error': 'Configuration missing'
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Get query parameters
        company_code = request.query_params.get('company_code', None)
        cost_type = request.query_params.get('cost_type', None)
        job_number = request.query_params.get('job_number', None)
        status_code = request.query_params.get('status_code', None)
        cost_center = request.query_params.get('cost_center', None)
        sort_by = request.query_params.get('sort_by', None)
        
        # Fetch phases from Spectrum using looping to get all phases
        if job_number:
            # If a specific job number is requested, fetch only that job
            phases = client.get_phase(
                company_code=company_code,
                cost_type=cost_type,
                job_number=job_number,
                status_code=status_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
        else:
            # No job number specified - fetch all phases by looping through status codes
            logger.info("No job number specified, fetching all phases by looping through status codes...")
            phases = client.get_all_phases_by_status(
                company_code=company_code,
                status_code=status_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
        
        # Add division information to phases by looking up from SpectrumJob
        phases_with_division = []
        for phase_item in phases:
            company = safe_strip(phase_item.get('Company_Code'))
            job_num = safe_strip(phase_item.get('Job_Number'))
            if company and job_num:
                try:
                    job = SpectrumJob.objects.get(company_code=company, job_number=job_num)
                    phase_item['Division'] = job.division
                except SpectrumJob.DoesNotExist:
                    phase_item['Division'] = None
            phases_with_division.append(phase_item)
        
        return Response({
            'results': phases_with_division,
            'count': len(phases_with_division)
        }, status=http_status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error fetching phases from Spectrum: {e}", exc_info=True)
        return Response(
            {
                'detail': f'Failed to fetch phases from Spectrum: {str(e)}',
                'error': str(e)
            },
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def get_phase_enhanced_from_spectrum(request):
    """
    Fetch enhanced phase information from Spectrum's GetPhaseEnhanced service.
    Only accessible to root super admins.
    """
    try:
        client = SpectrumSOAPClient()
        
        if not client.authorization_id:
            return Response(
                {
                    'detail': 'Spectrum Authorization ID not configured.',
                    'error': 'Configuration missing'
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Get query parameters
        company_code = request.query_params.get('company_code', None)
        cost_type = request.query_params.get('cost_type', None)
        job_number = request.query_params.get('job_number', None)
        status_code = request.query_params.get('status_code', None)
        cost_center = request.query_params.get('cost_center', None)
        sort_by = request.query_params.get('sort_by', None)
        
        # Fetch enhanced phases from Spectrum using looping to get all phases
        if job_number:
            # If a specific job number is requested, fetch only that job
            phases = client.get_phase_enhanced(
                company_code=company_code,
                cost_type=cost_type,
                job_number=job_number,
                status_code=status_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
        else:
            # No job number specified - fetch all phases by looping through status codes
            logger.info("No job number specified, fetching all enhanced phases by looping through status codes...")
            phases = client.get_all_phases_enhanced_by_status(
                company_code=company_code,
                status_code=status_code,
                cost_center=cost_center,
                sort_by=sort_by
            )
        
        # Add division information to enhanced phases by looking up from SpectrumJob
        phases_with_division = []
        for phase_item in phases:
            company = safe_strip(phase_item.get('Company_Code'))
            job_num = safe_strip(phase_item.get('Job_Number'))
            if company and job_num:
                try:
                    job = SpectrumJob.objects.get(company_code=company, job_number=job_num)
                    phase_item['Division'] = job.division
                except SpectrumJob.DoesNotExist:
                    phase_item['Division'] = None
            phases_with_division.append(phase_item)
        
        return Response({
            'results': phases_with_division,
            'count': len(phases_with_division)
        }, status=http_status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error fetching enhanced phases from Spectrum: {e}", exc_info=True)
        return Response(
            {
                'detail': f'Failed to fetch enhanced phases from Spectrum: {str(e)}',
                'error': str(e)
            },
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def get_job_details(request, company_code: str, job_number: str):
    """
    Get complete job details by combining GetJob, GetJobMain, and GetJobContact.
    Only accessible to root super admins.
    """
    try:
        client = SpectrumSOAPClient()
        
        if not client.authorization_id:
            return Response(
                {
                    'detail': 'Spectrum Authorization ID not configured.',
                    'error': 'Configuration missing'
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Fetch from all three APIs
        job_data = {}
        job_main_data = {}
        contacts_data = []
        
        # Get basic job info
        try:
            jobs = client.get_jobs(company_code=company_code)
            job = next((j for j in jobs if safe_strip(j.get('Job_Number')) == safe_strip(job_number)), None)
            if job:
                job_data = job
        except Exception as e:
            logger.warning(f"Error fetching GetJob data: {e}")
        
        # Get job main data
        try:
            jobs_main = client.get_job_main(company_code=company_code)
            job_main = next((j for j in jobs_main if safe_strip(j.get('Job_Number')) == safe_strip(job_number)), None)
            if job_main:
                job_main_data = job_main
        except Exception as e:
            logger.warning(f"Error fetching GetJobMain data: {e}")
        
        # Get job contacts - job_number is required for this call
        try:
            if job_number:
                contacts = client.get_job_contacts(company_code=company_code, job_number=job_number)
                contacts_data = contacts
            else:
                logger.warning("Job number not provided, skipping GetJobContact fetch")
                contacts_data = []
        except Exception as e:
            logger.warning(f"Error fetching GetJobContact data: {e}")
            contacts_data = []
        
        # Merge all data
        result = {
            'job': job_data,
            'job_main': job_main_data,
            'contacts': contacts_data,
            'company_code': company_code,
            'job_number': job_number,
        }
        
        return Response(result, status=http_status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error fetching job details: {e}", exc_info=True)
        return Response(
            {
                'detail': f'Failed to fetch job details: {str(e)}',
                'error': str(e)
            },
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def post_job_cost_projection(request):
    """
    Post job cost projection to Spectrum's JobCostProjections service.
    Only accessible to root super admins.
    """
    try:
        client = SpectrumSOAPClient()
        
        if not client.authorization_id:
            return Response(
                {
                    'detail': 'Spectrum Authorization ID not configured.',
                    'error': 'Configuration missing'
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Get request data
        data = request.data
        company_code = data.get('company_code', None)
        job_number = data.get('job_number', None)
        phase_code = data.get('phase_code', None)
        cost_type = data.get('cost_type', None)
        transaction_date = data.get('transaction_date', None)
        amount = data.get('amount', None)
        projected_hours = data.get('projected_hours', None)
        projected_quantity = data.get('projected_quantity', None)
        note = data.get('note', None)
        operator = data.get('operator', None)
        
        # Validate required fields
        if not all([job_number, phase_code, cost_type, transaction_date]):
            return Response(
                {
                    'detail': 'job_number, phase_code, cost_type, and transaction_date are required',
                    'error': 'Missing required fields'
                },
                status=http_status.HTTP_400_BAD_REQUEST
            )
        
        # Validate that at least one projection value is provided
        if not any([amount, projected_hours, projected_quantity]):
            return Response(
                {
                    'detail': 'At least one of amount, projected_hours, or projected_quantity must be provided',
                    'error': 'Missing projection values'
                },
                status=http_status.HTTP_400_BAD_REQUEST
            )
        
        # Post projection to Spectrum
        result = client.post_job_cost_projection(
            company_code=company_code,
            job_number=job_number,
            phase_code=phase_code,
            cost_type=cost_type,
            transaction_date=transaction_date,
            amount=float(amount) if amount is not None else None,
            projected_hours=float(projected_hours) if projected_hours is not None else None,
            projected_quantity=float(projected_quantity) if projected_quantity is not None else None,
            note=note,
            operator=operator
        )
        
        # Save to database
        if result.get('success'):
            defaults = {
                'amount': float(amount) if amount is not None else None,
                'projected_hours': float(projected_hours) if projected_hours is not None else None,
                'projected_quantity': float(projected_quantity) if projected_quantity is not None else None,
                'note': safe_strip(note),
                'operator': safe_strip(operator),
                'error_code': result.get('error_code'),
                'error_description': result.get('error_description'),
                'error_column': result.get('error_column'),
                'last_synced_at': timezone.now(),
            }
            
            # Parse transaction_date (MM/DD/CCYY format)
            from datetime import datetime
            try:
                if isinstance(transaction_date, str):
                    transaction_date_obj = datetime.strptime(transaction_date, '%m/%d/%Y').date()
                else:
                    transaction_date_obj = transaction_date
            except Exception as e:
                logger.error(f"Error parsing transaction_date {transaction_date}: {e}")
                return Response(
                    {
                        'detail': f'Invalid transaction_date format. Expected MM/DD/YYYY',
                        'error': str(e)
                    },
                    status=http_status.HTTP_400_BAD_REQUEST
                )
            
            SpectrumJobCostProjection.objects.update_or_create(
                company_code=company_code or client.company_code,
                job_number=job_number,
                phase_code=phase_code,
                cost_type=cost_type,
                transaction_date=transaction_date_obj,
                defaults=defaults
            )
        
        return Response({
            'success': result.get('success', False),
            'message': 'Job cost projection posted successfully' if result.get('success') else 'Failed to post job cost projection',
            'error_code': result.get('error_code'),
            'error_description': result.get('error_description'),
            'error_column': result.get('error_column'),
        }, status=http_status.HTTP_200_OK if result.get('success') else http_status.HTTP_400_BAD_REQUEST)
        
    except Exception as e:
        logger.error(f"Error posting job cost projection to Spectrum: {e}", exc_info=True)
        return Response(
            {
                'detail': f'Failed to post job cost projection to Spectrum: {str(e)}',
                'error': str(e)
            },
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def get_job_udf_from_spectrum(request):
    """
    Fetch job user-defined fields from Spectrum's GetJobUDF service.
    Only accessible to root super admins.
    """
    try:
        client = SpectrumSOAPClient()
        
        if not client.authorization_id:
            return Response(
                {
                    'detail': 'Spectrum Authorization ID not configured.',
                    'error': 'Configuration missing'
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Get query parameters
        company_code = request.query_params.get('company_code', None)
        division = request.query_params.get('division', None)
        status_code = request.query_params.get('status_code', None)
        project_manager = request.query_params.get('project_manager', None)
        superintendent = request.query_params.get('superintendent', None)
        estimator = request.query_params.get('estimator', None)
        customer_code = request.query_params.get('customer_code', None)
        cost_center = request.query_params.get('cost_center', None)
        
        # Fetch UDFs from Spectrum using looping to get all UDFs
        if division:
            # If a specific division is requested, fetch only that division
            udfs = client.get_job_udf(
                company_code=company_code,
                division=division,
                status_code=status_code,
                project_manager=project_manager,
                superintendent=superintendent,
                estimator=estimator,
                customer_code=customer_code,
                cost_center=cost_center
            )
        else:
            # No division specified - fetch all UDFs by looping through all divisions
            logger.info("No division specified, fetching all job UDFs by looping through divisions...")
            udfs = client.get_all_job_udf_by_division(
                company_code=company_code,
                divisions=None,  # Will use default: ['111', '121', '131', '135', '145']
                status_code=status_code,
                project_manager=project_manager,
                superintendent=superintendent,
                estimator=estimator,
                customer_code=customer_code,
                cost_center=cost_center
            )
        
        # Add division information to UDFs by looking up from SpectrumJob
        udfs_with_division = []
        for udf_item in udfs:
            company = safe_strip(udf_item.get('Company_Code'))
            job_num = safe_strip(udf_item.get('Job_Number'))
            if company and job_num:
                try:
                    job = SpectrumJob.objects.get(company_code=company, job_number=job_num)
                    udf_item['Division'] = job.division
                except SpectrumJob.DoesNotExist:
                    udf_item['Division'] = None
            udfs_with_division.append(udf_item)
        
        return Response({
            'results': udfs_with_division,
            'count': len(udfs_with_division)
        }, status=http_status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error fetching job UDFs from Spectrum: {e}", exc_info=True)
        return Response(
            {
                'detail': f'Failed to fetch job UDFs from Spectrum: {str(e)}',
                'error': str(e)
            },
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def import_job_dates_to_database(request):
    """
    Import job dates from fetched Spectrum data into the database.
    Only accessible to root super admins.
    """
    try:
        data = request.data
        dates_list = data.get('results', [])
        
        if not dates_list:
            return Response(
                {'detail': 'No job dates data provided'},
                status=http_status.HTTP_400_BAD_REQUEST
            )
        
        imported_count = 0
        updated_count = 0
        errors = []
        sync_time = timezone.now()
        
        # Using centralized parse_date_robust function
        
        # Helper function to truncate fields to max_length
        def truncate_field(value, max_length):
            if value and isinstance(value, str) and len(value) > max_length:
                return value[:max_length]
            return value
        
        with transaction.atomic():
            for date_data in dates_list:
                try:
                    company = safe_strip(date_data.get('Company_Code'))
                    job_number = safe_strip(date_data.get('Job_Number'))
                    
                    if not company or not job_number:
                        continue
                    
                    defaults = {
                        'job_description': truncate_field(safe_strip(date_data.get('Job_Description')), 25),
                        'est_start_date': parse_date_robust(date_data.get('Est_Start_Date')),
                        'est_complete_date': parse_date_robust(date_data.get('Est_Complete_Date')),
                        'projected_complete_date': parse_date_robust(date_data.get('Projected_Complete_Date')),
                        'create_date': parse_date_robust(date_data.get('Create_Date')),
                        'start_date': parse_date_robust(date_data.get('Start_Date')),
                        'complete_date': parse_date_robust(date_data.get('Complete_Date')),
                        'field_1': truncate_field(safe_strip(date_data.get('Field_1')), 25),
                        'field_2': truncate_field(safe_strip(date_data.get('Field_2')), 25),
                        'field_3': truncate_field(safe_strip(date_data.get('Field_3')), 25),
                        'field_4': truncate_field(safe_strip(date_data.get('Field_4')), 25),
                        'field_5': truncate_field(safe_strip(date_data.get('Field_5')), 25),
                        'error_code': safe_strip(date_data.get('Error_Code')),
                        'error_description': safe_strip(date_data.get('Error_Description')),
                        'error_column': safe_strip(date_data.get('Error_Column')),
                        'last_synced_at': sync_time,
                    }
                    
                    job_date, created = SpectrumJobDates.objects.update_or_create(
                        company_code=company,
                        job_number=job_number,
                        defaults=defaults
                    )
                    
                    if created:
                        imported_count += 1
                    else:
                        updated_count += 1
                except Exception as e:
                    errors.append(f"Error importing job dates for {date_data.get('Job_Number', 'unknown')}: {str(e)}")
        
        return Response({
            'detail': f'Successfully imported {imported_count} new job dates and updated {updated_count} existing job dates.',
            'imported': imported_count,
            'updated': updated_count,
            'errors': errors if errors else None
        }, status=http_status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error importing job dates: {e}", exc_info=True)
        return Response(
            {'detail': f'Failed to import job dates: {str(e)}', 'error': str(e)},
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def import_phases_to_database(request):
    """
    Import phases from fetched Spectrum data into the database.
    Handles both regular phases (GetPhase) and enhanced phases (GetPhaseEnhanced).
    Only accessible to root super admins.
    """
    try:
        data = request.data
        phases_list = data.get('results', [])
        is_enhanced = data.get('is_enhanced', False)  # Flag to determine if these are enhanced phases
        
        if not phases_list:
            return Response(
                {'detail': 'No phases data provided'},
                status=http_status.HTTP_400_BAD_REQUEST
            )
        
        imported_count = 0
        updated_count = 0
        errors = []
        sync_time = timezone.now()
        
        # Using centralized parse_date_robust function
        
        with transaction.atomic():
            for phase_data in phases_list:
                try:
                    company = safe_strip(phase_data.get('Company_Code'))
                    job_number = safe_strip(phase_data.get('Job_Number'))
                    phase_code = safe_strip(phase_data.get('Phase_Code'))
                    cost_type = safe_strip(phase_data.get('Cost_Type'))
                    
                    if not company or not job_number or not phase_code:
                        continue
                    
                    # Common fields for both regular and enhanced phases
                    common_defaults = {
                        'description': safe_strip(phase_data.get('Description')),
                        'status_code': safe_strip(phase_data.get('Status_Code')),
                        'unit_of_measure': safe_strip(phase_data.get('Unit_of_Measure')),
                        'jtd_quantity': phase_data.get('JTD_Quantity'),
                        'jtd_hours': phase_data.get('JTD_Hours'),
                        'jtd_actual_dollars': phase_data.get('JTD_Actual_Dollars'),
                        'projected_quantity': phase_data.get('Projected_Quantity'),
                        'projected_hours': phase_data.get('Projected_Hours'),
                        'projected_dollars': phase_data.get('Projected_Dollars'),
                        'estimated_quantity': phase_data.get('Estimated_Quantity'),
                        'estimated_hours': phase_data.get('Estimated_Hours'),
                        'current_estimated_dollars': phase_data.get('Current_Estimated_Dollars'),
                        'cost_center': safe_strip(phase_data.get('Cost_Center')),
                        'error_code': safe_strip(phase_data.get('Error_Code')),
                        'error_description': safe_strip(phase_data.get('Error_Description')),
                        'error_column': safe_strip(phase_data.get('Error_Column')),
                        'last_synced_at': sync_time,
                    }
                    
                    if is_enhanced:
                        # Enhanced phases have additional fields
                        defaults = {
                            **common_defaults,
                            'price_method_code': safe_strip(phase_data.get('Price_Method_Code')),
                            'complete_date': parse_date_robust(phase_data.get('Complete_Date')),
                            'start_date': parse_date_robust(phase_data.get('Start_Date')),
                            'end_date': parse_date_robust(phase_data.get('End_Date')),
                            'comment': safe_strip(phase_data.get('Comment')),
                        }
                        
                        phase, created = SpectrumPhaseEnhanced.objects.update_or_create(
                            company_code=company,
                            job_number=job_number,
                            phase_code=phase_code,
                            cost_type=cost_type or '',
                            defaults=defaults
                        )
                    else:
                        # Regular phases (GetPhase) - no enhanced fields
                        phase, created = SpectrumPhase.objects.update_or_create(
                            company_code=company,
                            job_number=job_number,
                            phase_code=phase_code,
                            cost_type=cost_type or '',
                            defaults=common_defaults
                        )
                    
                    if created:
                        imported_count += 1
                    else:
                        updated_count += 1
                except Exception as e:
                    errors.append(f"Error importing phase {phase_data.get('Phase_Code', 'unknown')} for {phase_data.get('Job_Number', 'unknown')}: {str(e)}")
        
        phase_type = "enhanced phases" if is_enhanced else "phases"
        return Response({
            'detail': f'Successfully imported {imported_count} new {phase_type} and updated {updated_count} existing {phase_type}.',
            'imported': imported_count,
            'updated': updated_count,
            'errors': errors if errors else None
        }, status=http_status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error importing phases: {e}", exc_info=True)
        return Response(
            {'detail': f'Failed to import phases: {str(e)}', 'error': str(e)},
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsRootSuperadmin])
def import_job_udfs_to_database(request):
    """
    Import job UDFs from fetched Spectrum data into the database.
    Only accessible to root super admins.
    """
    try:
        data = request.data
        udfs_list = data.get('results', [])
        
        if not udfs_list:
            return Response(
                {'detail': 'No job UDFs data provided'},
                status=http_status.HTTP_400_BAD_REQUEST
            )
        
        imported_count = 0
        updated_count = 0
        errors = []
        sync_time = timezone.now()
        
        with transaction.atomic():
            for udf_data in udfs_list:
                try:
                    company = safe_strip(udf_data.get('Company_Code'))
                    job_number = safe_strip(udf_data.get('Job_Number'))
                    
                    if not company or not job_number:
                        continue
                    
                    defaults = {
                        'udf1': safe_strip(udf_data.get('UDF1')),
                        'udf2': safe_strip(udf_data.get('UDF2')),
                        'udf3': safe_strip(udf_data.get('UDF3')),
                        'udf4': safe_strip(udf_data.get('UDF4')),
                        'udf5': safe_strip(udf_data.get('UDF5')),
                        'udf6': safe_strip(udf_data.get('UDF6')),
                        'udf7': safe_strip(udf_data.get('UDF7')),
                        'udf8': safe_strip(udf_data.get('UDF8')),
                        'udf9': safe_strip(udf_data.get('UDF9')),
                        'udf10': safe_strip(udf_data.get('UDF10')),
                        'udf11': safe_strip(udf_data.get('UDF11')),
                        'udf12': safe_strip(udf_data.get('UDF12')),
                        'udf13': safe_strip(udf_data.get('UDF13')),
                        'udf14': safe_strip(udf_data.get('UDF14')),
                        'udf15': safe_strip(udf_data.get('UDF15')),
                        'udf16': safe_strip(udf_data.get('UDF16')),
                        'udf17': safe_strip(udf_data.get('UDF17')),
                        'udf18': safe_strip(udf_data.get('UDF18')),
                        'udf19': safe_strip(udf_data.get('UDF19')),
                        'udf20': safe_strip(udf_data.get('UDF20')),
                        'error_code': safe_strip(udf_data.get('Error_Code')),
                        'error_description': safe_strip(udf_data.get('Error_Description')),
                        'error_column': safe_strip(udf_data.get('Error_Column')),
                        'last_synced_at': sync_time,
                    }
                    
                    udf, created = SpectrumJobUDF.objects.update_or_create(
                        company_code=company,
                        job_number=job_number,
                        defaults=defaults
                    )
                    
                    if created:
                        imported_count += 1
                    else:
                        updated_count += 1
                except Exception as e:
                    errors.append(f"Error importing job UDFs for {udf_data.get('Job_Number', 'unknown')}: {str(e)}")
        
        return Response({
            'detail': f'Successfully imported {imported_count} new job UDFs and updated {updated_count} existing job UDFs.',
            'imported': imported_count,
            'updated': updated_count,
            'errors': errors if errors else None
        }, status=http_status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error importing job UDFs: {e}", exc_info=True)
        return Response(
            {'detail': f'Failed to import job UDFs: {str(e)}', 'error': str(e)},
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_project_comprehensive_details(request, job_number: str):
    """
    Get comprehensive project details including all related Spectrum data.
    Returns job info, dates, phases, UDFs, cost projections, and contacts.
    """
    try:
        from urllib.parse import unquote
        
        # Decode job number if URL-encoded
        job_number = unquote(job_number)
        
        # Get the Spectrum job - try multiple lookup strategies
        spectrum_job = None
        try:
            # Try exact match first
            spectrum_job = SpectrumJob.objects.get(job_number=job_number)
        except SpectrumJob.DoesNotExist:
            # Try case-insensitive match
            try:
                spectrum_job = SpectrumJob.objects.get(job_number__iexact=job_number)
            except (SpectrumJob.DoesNotExist, SpectrumJob.MultipleObjectsReturned):
                # Try with trimmed spaces
                try:
                    trimmed_job_number = job_number.strip()
                    if trimmed_job_number != job_number:
                        spectrum_job = SpectrumJob.objects.get(job_number=trimmed_job_number)
                except SpectrumJob.DoesNotExist:
                    pass
        
        if not spectrum_job:
            return Response(
                {'detail': f'Project "{job_number}" not found in Spectrum data'},
                status=http_status.HTTP_404_NOT_FOUND
            )
        
        # Get all related data
        job_dates = SpectrumJobDates.objects.filter(
            company_code=spectrum_job.company_code,
            job_number=job_number
        ).first()
        
        phases = SpectrumPhaseEnhanced.objects.filter(
            company_code=spectrum_job.company_code,
            job_number=job_number
        ).order_by('phase_code', 'cost_type')
        
        udf = SpectrumJobUDF.objects.filter(
            company_code=spectrum_job.company_code,
            job_number=job_number
        ).first()
        
        cost_projections = SpectrumJobCostProjection.objects.filter(
            company_code=spectrum_job.company_code,
            job_number=job_number
        ).order_by('-transaction_date')
        
        contacts = SpectrumJobContact.objects.filter(
            company_code=spectrum_job.company_code,
            job_number=job_number
        ).order_by('last_name', 'first_name')
        
        # Get Project if it exists
        try:
            from projects.models import Project
            project = Project.objects.get(job_number=job_number)
            # Get estimated_end_date (it's a property, not a field)
            estimated_end = project.estimated_end_date if hasattr(project, 'estimated_end_date') else None
            project_data = {
                'id': project.id,
                'name': project.name,
                'status': project.status,
                'branch': project.branch.name if project.branch else None,
                'contract_value': float(project.contract_value) if project.contract_value else None,
                'start_date': project.start_date.isoformat() if project.start_date else None,
                'estimated_end_date': estimated_end.isoformat() if estimated_end else None,
            }
        except Project.DoesNotExist:
            project_data = None
        
        # Serialize data
        result = {
            'job': {
                'company_code': spectrum_job.company_code,
                'job_number': spectrum_job.job_number,
                'job_description': spectrum_job.job_description,
                'division': spectrum_job.division,
                'address_1': spectrum_job.address_1,
                'address_2': spectrum_job.address_2,
                'city': spectrum_job.city,
                'state': spectrum_job.state,
                'zip_code': spectrum_job.zip_code,
                'project_manager': spectrum_job.project_manager,
                'superintendent': spectrum_job.superintendent,
                'estimator': spectrum_job.estimator,
                'customer_code': spectrum_job.customer_code,
                'customer_name': spectrum_job.customer_name,
                'status_code': spectrum_job.status_code,
                'contract_number': spectrum_job.contract_number,
                'original_contract': float(spectrum_job.original_contract) if spectrum_job.original_contract else None,
                'phone': spectrum_job.phone,
                'fax_phone': spectrum_job.fax_phone,
                'owner_name': spectrum_job.owner_name,
                'comment': spectrum_job.comment,
                'price_method_code': spectrum_job.price_method_code,
            },
            'project': project_data,
            'dates': {
                'est_start_date': job_dates.est_start_date.isoformat() if job_dates and job_dates.est_start_date else None,
                'est_complete_date': job_dates.est_complete_date.isoformat() if job_dates and job_dates.est_complete_date else None,
                'projected_complete_date': job_dates.projected_complete_date.isoformat() if job_dates and job_dates.projected_complete_date else None,
                'create_date': job_dates.create_date.isoformat() if job_dates and job_dates.create_date else None,
                'start_date': job_dates.start_date.isoformat() if job_dates and job_dates.start_date else None,
                'complete_date': job_dates.complete_date.isoformat() if job_dates and job_dates.complete_date else None,
            } if job_dates else None,
            'phases': [{
                'phase_code': p.phase_code,
                'cost_type': p.cost_type,
                'description': p.description,
                'status_code': p.status_code,
                'jtd_quantity': float(p.jtd_quantity) if p.jtd_quantity else None,
                'jtd_hours': float(p.jtd_hours) if p.jtd_hours else None,
                'jtd_actual_dollars': float(p.jtd_actual_dollars) if p.jtd_actual_dollars else None,
                'projected_quantity': float(p.projected_quantity) if p.projected_quantity else None,
                'projected_hours': float(p.projected_hours) if p.projected_hours else None,
                'projected_dollars': float(p.projected_dollars) if p.projected_dollars else None,
                'estimated_quantity': float(p.estimated_quantity) if p.estimated_quantity else None,
                'estimated_hours': float(p.estimated_hours) if p.estimated_hours else None,
                'current_estimated_dollars': float(p.current_estimated_dollars) if p.current_estimated_dollars else None,
                'start_date': p.start_date.isoformat() if p.start_date else None,
                'end_date': p.end_date.isoformat() if p.end_date else None,
                'complete_date': p.complete_date.isoformat() if p.complete_date else None,
                'comment': p.comment,
            } for p in phases],
            'udf': {
                'udf1': udf.udf1 if udf else None,
                'udf2': udf.udf2 if udf else None,
                'udf3': udf.udf3 if udf else None,
                'udf4': udf.udf4 if udf else None,
                'udf5': udf.udf5 if udf else None,
                'udf6': udf.udf6 if udf else None,
                'udf7': udf.udf7 if udf else None,
                'udf8': udf.udf8 if udf else None,
                'udf9': udf.udf9 if udf else None,
                'udf10': udf.udf10 if udf else None,
                'udf11': udf.udf11 if udf else None,
                'udf12': udf.udf12 if udf else None,
                'udf13': udf.udf13 if udf else None,
                'udf14': udf.udf14 if udf else None,
                'udf15': udf.udf15 if udf else None,
                'udf16': udf.udf16 if udf else None,
                'udf17': udf.udf17 if udf else None,
                'udf18': udf.udf18 if udf else None,
                'udf19': udf.udf19 if udf else None,
                'udf20': udf.udf20 if udf else None,
            } if udf else None,
            'cost_projections': [{
                'phase_code': cp.phase_code,
                'cost_type': cp.cost_type,
                'transaction_date': cp.transaction_date.isoformat() if cp.transaction_date else None,
                'amount': float(cp.amount) if cp.amount else None,
                'projected_hours': float(cp.projected_hours) if cp.projected_hours else None,
                'projected_quantity': float(cp.projected_quantity) if cp.projected_quantity else None,
                'note': cp.note,
                'operator': cp.operator,
            } for cp in cost_projections],
            'contacts': [{
                'contact_id': c.contact_id,
                'first_name': c.first_name,
                'last_name': c.last_name,
                'title': c.title,
                'phone_number': c.phone_number,
                'email1': c.email1,
                'email2': c.email2,
                'email3': c.email3,
                'addr_1': c.addr_1,
                'addr_city': c.addr_city,
                'addr_state': c.addr_state,
            } for c in contacts],
        }
        
        return Response(result, status=http_status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error fetching comprehensive project details: {e}", exc_info=True)
        return Response(
            {'detail': f'Failed to fetch project details: {str(e)}', 'error': str(e)},
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
        )
