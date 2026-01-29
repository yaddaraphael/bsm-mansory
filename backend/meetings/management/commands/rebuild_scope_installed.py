"""
Rebuild ProjectScope installed quantities from completed meetings.
"""
import logging

from django.core.management.base import BaseCommand

from meetings.models import MeetingJobPhase
from meetings.signals import sync_meeting_phase_to_project_scope

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Recalculate ProjectScope installed quantities from completed meetings (cumulative)."

    def handle(self, *args, **options):
        phases = MeetingJobPhase.objects.filter(meeting_job__meeting__status="COMPLETED").select_related(
            "meeting_job__meeting",
            "meeting_job__project",
        )

        total = phases.count()
        updated = 0
        self.stdout.write(self.style.SUCCESS(f"Rebuilding scope installed totals from {total} completed phases..."))

        for phase in phases.iterator():
            try:
                sync_meeting_phase_to_project_scope(phase)
                updated += 1
            except Exception as exc:
                logger.warning("Failed to sync phase %s: %s", phase.id, exc, exc_info=True)

        self.stdout.write(self.style.SUCCESS(f"Done. Processed {updated} phases."))
