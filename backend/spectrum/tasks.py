"""
Celery tasks for Spectrum integration.
"""
import logging
from celery import shared_task
from spectrum.sync_engine import run_spectrum_sync
from spectrum.models import SpectrumSyncRun

logger = logging.getLogger(__name__)


@shared_task
def sync_spectrum_jobs_task():
    """
    Periodic task to sync Spectrum data.
    """
    try:
        logger.info("Starting automatic Spectrum sync...")
        run_spectrum_sync(run_type=SpectrumSyncRun.RUN_AUTO)
        logger.info("Automatic Spectrum sync completed successfully")
    except Exception as e:
        logger.error(f"Error in automatic Spectrum sync: {e}", exc_info=True)
        raise
