from django.core.management.base import BaseCommand
from django.db import transaction

from projects.models import Project
from spectrum.models import SpectrumJob


class Command(BaseCommand):
    help = "Set Project.status to INACTIVE when SpectrumJob.status_code is 'I'."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show how many records would be updated without writing changes.",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            help="Update any non-INACTIVE projects (default only updates PENDING).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        update_all = options["all"]

        inactive_job_numbers = SpectrumJob.objects.filter(status_code="I").values_list("job_number", flat=True)

        if update_all:
            projects_qs = Project.objects.filter(job_number__in=inactive_job_numbers).exclude(status="INACTIVE")
        else:
            projects_qs = Project.objects.filter(job_number__in=inactive_job_numbers, status="PENDING")

        to_update = projects_qs.count()

        if dry_run:
            self.stdout.write(self.style.WARNING(f"DRY RUN: {to_update} projects would be updated to INACTIVE."))
            return

        if to_update == 0:
            self.stdout.write(self.style.SUCCESS("No projects needed updates."))
            return

        with transaction.atomic():
            updated = projects_qs.update(status="INACTIVE")

        self.stdout.write(self.style.SUCCESS(f"Updated {updated} projects to INACTIVE."))
