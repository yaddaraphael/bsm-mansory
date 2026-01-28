"""
Django management command to sync jobs from Spectrum (fast upsert version).
"""
import logging
from django.core.management.base import BaseCommand
from spectrum.sync_engine import run_spectrum_sync
from spectrum.models import SpectrumSyncRun

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Sync Spectrum data into local database (Jobs, Dates, UDF, Phases, Contacts)"

    def add_arguments(self, parser):
        parser.add_argument("--company-code", type=str, default=None, help="Spectrum company code override")
        parser.add_argument("--divisions", type=str, default=None, help="Comma-separated divisions (default settings.SPECTRUM_DIVISIONS)")
        parser.add_argument("--status-code", type=str, default="", help="Status code filter: A/I/C, '' for A+I, or None for Spectrum default")

    def handle(self, *args, **options):
        company_code = options.get("company_code")
        divisions_raw = options.get("divisions")
        status_code = options.get("status_code")

        divisions = None
        if divisions_raw:
            divisions = [d.strip() for d in divisions_raw.split(",") if d.strip()]

        self.stdout.write(self.style.SUCCESS("Starting Spectrum sync..."))
        try:
            stats = run_spectrum_sync(
                company_code=company_code,
                divisions=divisions,
                status_code=status_code,
                run_type=SpectrumSyncRun.RUN_AUTO,
            )
            self.stdout.write(self.style.SUCCESS("Spectrum sync completed."))
            self.stdout.write(str(stats))
        except Exception as e:
            logger.error(f"Spectrum sync failed: {e}", exc_info=True)
            self.stdout.write(self.style.ERROR(f"Spectrum sync failed: {e}"))
            raise
