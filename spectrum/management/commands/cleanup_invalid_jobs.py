"""
Management command to clean up invalid job records from the database.

This command removes SpectrumJob records that:
1. Have job numbers that don't match the xx-xxxx pattern (e.g., 20-1140)

Usage:
    python manage.py cleanup_invalid_jobs
    python manage.py cleanup_invalid_jobs --dry-run  # Preview what would be deleted
"""
import re
import logging
from django.core.management.base import BaseCommand
from spectrum.models import SpectrumJob

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Clean up invalid job records from the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be deleted without actually deleting',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed information about each job being deleted',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        verbose = options['verbose']

        self.stdout.write(self.style.WARNING('=' * 80))
        self.stdout.write(self.style.WARNING('Cleaning up invalid job records from database'))
        self.stdout.write(self.style.WARNING('=' * 80))
        
        if dry_run:
            self.stdout.write(self.style.WARNING('\nDRY RUN MODE - No changes will be made\n'))
        else:
            self.stdout.write(self.style.WARNING('\nLIVE MODE - Changes will be permanent\n'))

        # Pattern for valid job numbers: xx-xxxx (e.g., 20-1140)
        valid_job_pattern = re.compile(r'^\d{2}-\d{4}$')

        # Get all jobs
        all_jobs = SpectrumJob.objects.all()
        total_jobs = all_jobs.count()
        self.stdout.write(f"Total jobs in database: {total_jobs}")

        # Find jobs with invalid job number patterns
        self.stdout.write(self.style.SUCCESS('\nChecking for jobs with invalid job number patterns...'))
        invalid_jobs = []
        for job in all_jobs:
            if not valid_job_pattern.match(job.job_number):
                invalid_jobs.append(job)
                if verbose:
                    self.stdout.write(
                        f"  - Job {job.job_number} (Company: {job.company_code}, Description: {job.job_description or 'N/A'}) - Invalid pattern"
                    )

        invalid_count = len(invalid_jobs)
        self.stdout.write(
            self.style.WARNING(f"Found {invalid_count} jobs with invalid job number patterns")
        )

        # Summary
        self.stdout.write(self.style.SUCCESS('\n' + '=' * 80))
        self.stdout.write(self.style.SUCCESS('SUMMARY'))
        self.stdout.write(self.style.SUCCESS('=' * 80))
        self.stdout.write(f"Total jobs in database: {total_jobs}")
        self.stdout.write(f"Jobs with invalid patterns: {invalid_count}")

        # Delete jobs
        if invalid_jobs:
            if dry_run:
                self.stdout.write(
                    self.style.WARNING(f'\nDRY RUN: Would delete {invalid_count} jobs')
                )
                if verbose:
                    self.stdout.write('\nJobs that would be deleted:')
                    for job in invalid_jobs[:20]:  # Show first 20
                        self.stdout.write(
                            f"  - Job {job.job_number} (Company: {job.company_code}, Description: {job.job_description or 'N/A'})"
                        )
                    if len(invalid_jobs) > 20:
                        self.stdout.write(f"  ... and {len(invalid_jobs) - 20} more")
            else:
                self.stdout.write(self.style.WARNING(f'\nDeleting {invalid_count} jobs...'))
                
                # Delete in batches to avoid memory issues
                batch_size = 100
                deleted_count = 0
                for i in range(0, len(invalid_jobs), batch_size):
                    batch = invalid_jobs[i:i + batch_size]
                    job_ids = [j.id for j in batch]
                    deleted = SpectrumJob.objects.filter(id__in=job_ids).delete()
                    deleted_count += deleted[0]
                    self.stdout.write(f"  Deleted batch {i // batch_size + 1}: {deleted[0]} jobs")
                
                self.stdout.write(
                    self.style.SUCCESS(f'\nSuccessfully deleted {deleted_count} jobs!')
                )
                self.stdout.write(
                    self.style.WARNING('\nNote: Associated phases, dates, UDFs, and contacts for these jobs will also need to be cleaned up.')
                )
        else:
            self.stdout.write(self.style.SUCCESS('\nNo invalid jobs found. Database is clean!'))

        self.stdout.write(self.style.SUCCESS('\n' + '=' * 80))
        self.stdout.write(self.style.SUCCESS('Cleanup complete!'))
        self.stdout.write(self.style.SUCCESS('=' * 80))
