"""
Django management command to sync jobs from Spectrum.
Can be run manually or scheduled to run every hour.
"""
import logging
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from django.conf import settings
from spectrum.services import SpectrumSOAPClient
from spectrum.models import SpectrumJob

logger = logging.getLogger(__name__)


def safe_strip(value):
    """Safely strip a value, returning None if value is None or empty."""
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    return value


class Command(BaseCommand):
    help = 'Sync jobs from Spectrum API and update the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--company-code',
            type=str,
            default=None,
            help='Company code to filter jobs (defaults to SPECTRUM_COMPANY_CODE setting)',
        )
        parser.add_argument(
            '--division',
            type=str,
            default=None,
            help='Division to filter jobs',
        )
        parser.add_argument(
            '--status-code',
            type=str,
            default=None,
            help='Status code to filter jobs (A/I/C or blank for Active and Inactive)',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting Spectrum job sync...'))
        
        try:
            client = SpectrumSOAPClient()
            
            if not client.authorization_id:
                self.stdout.write(
                    self.style.ERROR('SPECTRUM_AUTHORIZATION_ID not configured')
                )
                return
            
            # Get filter parameters
            company_code = options.get('company_code') or getattr(settings, 'SPECTRUM_COMPANY_CODE', 'BSM')
            division = options.get('division')
            status_code = options.get('status_code')
            
            self.stdout.write(f'Fetching jobs from Spectrum (Company: {company_code})...')
            
            # Fetch jobs from GetJob service
            jobs = client.get_jobs(
                company_code=company_code,
                division=division,
                status_code=status_code,
            )
            
            self.stdout.write(f'Fetched {len(jobs)} jobs from GetJob service')
            
            # Fetch job main data from GetJobMain service
            self.stdout.write('Fetching job main data from GetJobMain service...')
            jobs_main = client.get_job_main(
                company_code=company_code,
                division=division,
                status_code=status_code,
            )
            
            self.stdout.write(f'Fetched {len(jobs_main)} jobs from GetJobMain service')
            
            # Create a dictionary to merge GetJobMain data with GetJob data
            # Key: (company_code, job_number)
            jobs_main_dict = {}
            for job_main in jobs_main:
                company = safe_strip(job_main.get('Company_Code'))
                job_num = safe_strip(job_main.get('Job_Number'))
                if company and job_num:
                    jobs_main_dict[(company, job_num)] = job_main
            
            # Import/update jobs in database
            imported_count = 0
            updated_count = 0
            errors = []
            sync_time = timezone.now()
            
            with transaction.atomic():
                for job_data in jobs:
                    try:
                        # Extract required fields
                        company = safe_strip(job_data.get('Company_Code'))
                        job_number = safe_strip(job_data.get('Job_Number'))
                        
                        if not company or not job_number:
                            errors.append(f"Skipping job with missing Company_Code or Job_Number")
                            continue
                        
                        # Merge with GetJobMain data if available
                        job_main_data = jobs_main_dict.get((company, job_number), {})
                        
                        # Prepare defaults for update_or_create
                        defaults = {
                            # GetJob fields
                            'job_description': safe_strip(job_data.get('Job_Description')),
                            'division': safe_strip(job_data.get('Division')),
                            'address_1': safe_strip(job_data.get('Address_1')),
                            'address_2': safe_strip(job_data.get('Address_2')),
                            'city': safe_strip(job_data.get('City')),
                            'state': safe_strip(job_data.get('State')),
                            'zip_code': safe_strip(job_data.get('Zip_Code')),
                            'project_manager': safe_strip(job_data.get('Project_Manager')),
                            'superintendent': safe_strip(job_data.get('Superintendent')),
                            'estimator': safe_strip(job_data.get('Estimator')),
                            'certified_flag': safe_strip(job_data.get('Certified_Flag')),
                            'customer_code': safe_strip(job_data.get('Customer_Code')),
                            'status_code': safe_strip(job_data.get('Status_Code')),
                            'work_state_tax_code': safe_strip(job_data.get('Work_State_Tax_Code')),
                            'contract_number': safe_strip(job_data.get('Contract_Number')),
                            'cost_center': safe_strip(job_data.get('Cost_Center')),
                            # Error fields from GetJob
                            'error_code': safe_strip(job_data.get('Error_Code')),
                            'error_description': safe_strip(job_data.get('Error_Description')),
                            'error_column': safe_strip(job_data.get('Error_Column')),
                            # GetJobMain fields
                            'phone': safe_strip(job_main_data.get('Phone')),
                            'fax_phone': safe_strip(job_main_data.get('Fax_Phone')),
                            'job_site_phone': safe_strip(job_main_data.get('Job_Site_Phone')),
                            'customer_name': safe_strip(job_main_data.get('Customer_Name')),
                            'owner_name': safe_strip(job_main_data.get('Owner_Name')),
                            'wo_site': safe_strip(job_main_data.get('WO_Site')),
                            'comment': safe_strip(job_main_data.get('Comment')),
                            'price_method_code': safe_strip(job_main_data.get('Price_Method_Code')),
                            'unit_of_measure': safe_strip(job_main_data.get('Unit_of_Measure')),
                            'legal_desc': safe_strip(job_main_data.get('Legal_Desc')),
                            'field_1': safe_strip(job_main_data.get('Field_1')),
                            'field_2': safe_strip(job_main_data.get('Field_2')),
                            'field_3': safe_strip(job_main_data.get('Field_3')),
                            'field_4': safe_strip(job_main_data.get('Field_4')),
                            'field_5': safe_strip(job_main_data.get('Field_5')),
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
                        
                        # Create or update job
                        job, created = SpectrumJob.objects.update_or_create(
                            company_code=company,
                            job_number=job_number,
                            defaults=defaults
                        )
                        
                        if created:
                            imported_count += 1
                        else:
                            updated_count += 1
                            
                    except Exception as e:
                        error_msg = f"Error importing job {job_data.get('Job_Number', 'unknown')}: {str(e)}"
                        logger.error(error_msg)
                        errors.append(error_msg)
            
            # Summary
            self.stdout.write(
                self.style.SUCCESS(
                    f'\nSync completed successfully!\n'
                    f'  - Imported: {imported_count} new jobs\n'
                    f'  - Updated: {updated_count} existing jobs\n'
                    f'  - Total processed: {imported_count + updated_count}\n'
                    f'  - Errors: {len(errors)}'
                )
            )
            
            if errors:
                self.stdout.write(self.style.WARNING(f'\nErrors encountered:\n' + '\n'.join(errors[:10])))
                if len(errors) > 10:
                    self.stdout.write(self.style.WARNING(f'... and {len(errors) - 10} more errors'))
                    
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Error syncing jobs from Spectrum: {str(e)}')
            )
            logger.error(f"Error in sync_spectrum_jobs command: {e}", exc_info=True)
            raise
