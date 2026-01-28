"""
Management command to clean up invalid phases from the database.

This command removes phases that:
1. Have job numbers that don't match the xx-xxxx pattern (e.g., 20-1140)
2. Have job numbers that don't exist in SpectrumJob table
3. Have mismatched job numbers (phases that don't belong to their assigned job)

Usage:
    python manage.py cleanup_invalid_phases
    python manage.py cleanup_invalid_phases --dry-run  # Preview what would be deleted
    python manage.py cleanup_invalid_phases --delete-orphaned  # Also delete phases for non-existent jobs
"""
import re
import logging
from django.core.management.base import BaseCommand
from django.db.models import Q
from spectrum.models import SpectrumPhaseEnhanced, SpectrumJob

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Clean up invalid phases from the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be deleted without actually deleting',
        )
        parser.add_argument(
            '--delete-orphaned',
            action='store_true',
            help='Also delete phases for jobs that no longer exist in SpectrumJob table',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed information about each phase being deleted',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        delete_orphaned = options['delete_orphaned']
        verbose = options['verbose']

        self.stdout.write(self.style.WARNING('=' * 80))
        self.stdout.write(self.style.WARNING('Cleaning up invalid phases from database'))
        self.stdout.write(self.style.WARNING('=' * 80))
        
        if dry_run:
            self.stdout.write(self.style.WARNING('\nDRY RUN MODE - No changes will be made\n'))
        else:
            self.stdout.write(self.style.WARNING('\nLIVE MODE - Changes will be permanent\n'))

        # Pattern for valid job numbers: xx-xxxx (e.g., 20-1140)
        valid_job_pattern = re.compile(r'^\d{2}-\d{4}$')

        # Statistics
        stats = {
            'invalid_pattern': 0,
            'orphaned': 0,
            'total_deleted': 0,
            'total_phases': 0,
        }

        # Get all phases
        all_phases = SpectrumPhaseEnhanced.objects.all()
        stats['total_phases'] = all_phases.count()
        self.stdout.write(f"Total phases in database: {stats['total_phases']}")

        # 1. Find phases with invalid job number patterns
        self.stdout.write(self.style.SUCCESS('\n1. Checking for phases with invalid job number patterns...'))
        invalid_pattern_phases = []
        for phase in all_phases:
            if not valid_job_pattern.match(phase.job_number):
                invalid_pattern_phases.append(phase)
                stats['invalid_pattern'] += 1
                if verbose:
                    self.stdout.write(
                        f"  - Phase {phase.phase_code} (Job: {phase.job_number}, Company: {phase.company_code}) - Invalid pattern"
                    )

        self.stdout.write(
            self.style.WARNING(f"Found {stats['invalid_pattern']} phases with invalid job number patterns")
        )

        # 2. Find orphaned phases (phases for jobs that don't exist in SpectrumJob)
        if delete_orphaned:
            self.stdout.write(self.style.SUCCESS('\n2. Checking for orphaned phases (jobs not in SpectrumJob)...'))
            
            # Get all valid job numbers from SpectrumJob
            valid_job_numbers = set(
                SpectrumJob.objects.values_list('job_number', flat=True).distinct()
            )
            
            orphaned_phases = []
            for phase in all_phases:
                # Only check phases with valid patterns
                if valid_job_pattern.match(phase.job_number):
                    if phase.job_number not in valid_job_numbers:
                        orphaned_phases.append(phase)
                        stats['orphaned'] += 1
                        if verbose:
                            self.stdout.write(
                                f"  - Phase {phase.phase_code} (Job: {phase.job_number}, Company: {phase.company_code}) - Orphaned"
                            )

            self.stdout.write(
                self.style.WARNING(f"Found {stats['orphaned']} orphaned phases")
            )
        else:
            self.stdout.write(self.style.SUCCESS('\n2. Skipping orphaned phase check (use --delete-orphaned to enable)'))
            orphaned_phases = []

        # Combine all phases to delete
        phases_to_delete = list(set(invalid_pattern_phases + orphaned_phases))
        stats['total_deleted'] = len(phases_to_delete)

        # Summary
        self.stdout.write(self.style.SUCCESS('\n' + '=' * 80))
        self.stdout.write(self.style.SUCCESS('SUMMARY'))
        self.stdout.write(self.style.SUCCESS('=' * 80))
        self.stdout.write(f"Total phases in database: {stats['total_phases']}")
        self.stdout.write(f"Phases with invalid patterns: {stats['invalid_pattern']}")
        if delete_orphaned:
            self.stdout.write(f"Orphaned phases: {stats['orphaned']}")
        self.stdout.write(f"Total phases to delete: {stats['total_deleted']}")

        # Delete phases
        if phases_to_delete:
            if dry_run:
                self.stdout.write(
                    self.style.WARNING(f'\nDRY RUN: Would delete {stats["total_deleted"]} phases')
                )
                if verbose:
                    self.stdout.write('\nPhases that would be deleted:')
                    for phase in phases_to_delete[:20]:  # Show first 20
                        self.stdout.write(
                            f"  - Phase {phase.phase_code} (Job: {phase.job_number}, Company: {phase.company_code})"
                        )
                    if len(phases_to_delete) > 20:
                        self.stdout.write(f"  ... and {len(phases_to_delete) - 20} more")
            else:
                self.stdout.write(self.style.WARNING(f'\nDeleting {stats["total_deleted"]} phases...'))
                
                # Delete in batches to avoid memory issues
                batch_size = 100
                deleted_count = 0
                for i in range(0, len(phases_to_delete), batch_size):
                    batch = phases_to_delete[i:i + batch_size]
                    phase_ids = [p.id for p in batch]
                    deleted = SpectrumPhaseEnhanced.objects.filter(id__in=phase_ids).delete()
                    deleted_count += deleted[0]
                    self.stdout.write(f"  Deleted batch {i // batch_size + 1}: {deleted[0]} phases")
                
                self.stdout.write(
                    self.style.SUCCESS(f'\nSuccessfully deleted {deleted_count} phases!')
                )
        else:
            self.stdout.write(self.style.SUCCESS('\nNo invalid phases found. Database is clean!'))

        self.stdout.write(self.style.SUCCESS('\n' + '=' * 80))
        self.stdout.write(self.style.SUCCESS('Cleanup complete!'))
        self.stdout.write(self.style.SUCCESS('=' * 80))
