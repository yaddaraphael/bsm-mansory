"""
Cleanup old Spectrum raw payloads to control database growth.
"""
import logging
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings

from spectrum.models import SpectrumRawPayload

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Delete SpectrumRawPayload records older than retention window."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=None,
            help="Retention days (default settings.SPECTRUM_RAW_RETENTION_DAYS or 30).",
        )

    def handle(self, *args, **options):
        days = options.get("days")
        if days is None:
            days = getattr(settings, "SPECTRUM_RAW_RETENTION_DAYS", 30)

        cutoff = timezone.now() - timedelta(days=days)
        qs = SpectrumRawPayload.objects.filter(created_at__lt=cutoff)
        count = qs.count()
        qs.delete()
        self.stdout.write(self.style.SUCCESS(f"Deleted {count} raw payload records older than {days} days."))
