"""
Management command to inspect the raw Spectrum API response structure.

This helps debug parsing issues by showing exactly what fields are returned
from the Spectrum API and how they're structured.

Usage:
    python manage.py inspect_spectrum_response
    python manage.py inspect_spectrum_response --division 115
    python manage.py inspect_spectrum_response --limit 5
"""
import json
import logging
from django.core.management.base import BaseCommand
from spectrum.services import SpectrumSOAPClient

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Inspect raw Spectrum API response structure to debug parsing issues'

    def add_arguments(self, parser):
        parser.add_argument(
            '--division',
            type=str,
            help='Division code to filter by (e.g., 115)',
        )
        parser.add_argument(
            '--status',
            type=str,
            help='Status code to filter by (A/I/C)',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=3,
            help='Number of jobs to show in detail (default: 3)',
        )

    def handle(self, *args, **options):
        division = options.get('division')
        status = options.get('status')
        limit = options.get('limit', 3)

        self.stdout.write(self.style.WARNING('=' * 80))
        self.stdout.write(self.style.WARNING('Inspecting Spectrum API Response Structure'))
        self.stdout.write(self.style.WARNING('=' * 80))
        self.stdout.write('')

        try:
            client = SpectrumSOAPClient()
            
            if not client.authorization_id:
                self.stdout.write(self.style.ERROR('SPECTRUM_AUTHORIZATION_ID not configured'))
                return

            self.stdout.write(f"Fetching jobs from Spectrum...")
            self.stdout.write(f"  Company: {client.company_code}")
            if division:
                self.stdout.write(f"  Division: {division}")
            if status:
                self.stdout.write(f"  Status: {status}")
            self.stdout.write('')

            # Fetch jobs
            jobs = client.get_jobs(
                company_code=None,  # Use default
                division=division,
                status_code=status,
            )

            self.stdout.write(self.style.SUCCESS(f'Fetched {len(jobs)} jobs'))
            self.stdout.write('')

            if len(jobs) == 0:
                self.stdout.write(self.style.WARNING('No jobs returned. Check your filters and Spectrum connection.'))
                return

            # Show summary of all jobs
            self.stdout.write(self.style.SUCCESS('=' * 80))
            self.stdout.write(self.style.SUCCESS('SUMMARY OF ALL JOBS'))
            self.stdout.write(self.style.SUCCESS('=' * 80))
            
            invalid_count = 0
            valid_count = 0
            import re
            valid_pattern = re.compile(r'^\d{2}-\d{4}$')
            
            for idx, job in enumerate(jobs[:20]):  # Show first 20
                job_num = job.get('Job_Number') or job.get('job_number') or job.get('Job') or 'N/A'
                company = job.get('Company_Code') or job.get('company_code') or job.get('Company') or 'N/A'
                
                # Check if job number is valid
                is_valid = valid_pattern.match(str(job_num)) if job_num != 'N/A' else False
                status_icon = '✓' if is_valid else '✗'
                status_style = self.style.SUCCESS if is_valid else self.style.ERROR
                
                if is_valid:
                    valid_count += 1
                else:
                    invalid_count += 1
                
                self.stdout.write(
                    f"{status_icon} Job {idx + 1}: Job_Number='{job_num}', Company_Code='{company}' "
                    f"{status_style('(VALID)' if is_valid else '(INVALID)')}"
                )
            
            if len(jobs) > 20:
                self.stdout.write(f'... and {len(jobs) - 20} more jobs')
            
            self.stdout.write('')
            self.stdout.write(f"Valid jobs (xx-xxxx format): {valid_count}")
            self.stdout.write(f"Invalid jobs: {invalid_count}")
            self.stdout.write('')

            # Show detailed structure of first few jobs
            self.stdout.write(self.style.SUCCESS('=' * 80))
            self.stdout.write(self.style.SUCCESS(f'DETAILED STRUCTURE OF FIRST {limit} JOBS'))
            self.stdout.write(self.style.SUCCESS('=' * 80))
            
            for idx, job in enumerate(jobs[:limit]):
                self.stdout.write('')
                self.stdout.write(self.style.WARNING(f'--- Job {idx + 1} ---'))
                
                # Show all keys
                keys = list(job.keys())
                self.stdout.write(f"Keys ({len(keys)}): {', '.join(keys)}")
                self.stdout.write('')
                
                # Show key-value pairs
                self.stdout.write('Fields:')
                for key, value in job.items():
                    # Truncate long values
                    if isinstance(value, str) and len(value) > 100:
                        display_value = value[:100] + '...'
                    else:
                        display_value = value
                    
                    # Highlight important fields
                    if key.lower() in ['job_number', 'jobnumber', 'job']:
                        self.stdout.write(self.style.ERROR(f"  {key}: {display_value} ⚠ JOB NUMBER"))
                    elif key.lower() in ['company_code', 'companycode', 'company']:
                        self.stdout.write(self.style.SUCCESS(f"  {key}: {display_value} ✓ COMPANY CODE"))
                    else:
                        self.stdout.write(f"  {key}: {display_value}")
                
                # Check job number format
                job_num = job.get('Job_Number') or job.get('job_number') or job.get('Job') or None
                if job_num:
                    if valid_pattern.match(str(job_num)):
                        self.stdout.write(self.style.SUCCESS(f'\n✓ Job number "{job_num}" matches expected pattern (xx-xxxx)'))
                    else:
                        self.stdout.write(self.style.ERROR(f'\n✗ Job number "{job_num}" does NOT match expected pattern (xx-xxxx)'))
                        self.stdout.write(self.style.ERROR('  Expected format: 2 digits, hyphen, 4 digits (e.g., 20-1140)'))
                else:
                    self.stdout.write(self.style.ERROR('\n✗ No job number field found!'))
                
                # Show JSON representation (limited)
                self.stdout.write('')
                self.stdout.write('JSON representation (first 500 chars):')
                try:
                    job_json = json.dumps(job, indent=2, default=str)
                    self.stdout.write(job_json[:500])
                    if len(job_json) > 500:
                        self.stdout.write('... (truncated)')
                except Exception as e:
                    self.stdout.write(f'Could not serialize: {e}')

            self.stdout.write('')
            self.stdout.write(self.style.SUCCESS('=' * 80))
            self.stdout.write(self.style.SUCCESS('Inspection complete!'))
            self.stdout.write(self.style.SUCCESS('=' * 80))
            self.stdout.write('')
            self.stdout.write('If you see invalid job numbers, check:')
            self.stdout.write('  1. The field name might be different (check the "Keys" list above)')
            self.stdout.write('  2. The data might be in a nested structure')
            self.stdout.write('  3. The Spectrum API might be returning data in a different format')
            self.stdout.write('')
            self.stdout.write('Review the logs for more detailed parsing information.')

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error: {e}'))
            import traceback
            self.stdout.write(traceback.format_exc())
