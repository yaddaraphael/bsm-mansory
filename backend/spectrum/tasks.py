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
        run_spectrum_sync(status_code="", run_type=SpectrumSyncRun.RUN_AUTO)
        logger.info("Automatic Spectrum sync completed successfully")
    except Exception as e:
        logger.error(f"Error in automatic Spectrum sync: {e}", exc_info=True)
        raise


@shared_task
def sync_spectrum_jobs_manual_task(company_code=None, divisions=None, status_code=None):
    """
    Manual/adhoc Spectrum sync with optional filters.
    """
    try:
        logger.info("Starting manual Spectrum sync...")
        stats = run_spectrum_sync(
            company_code=company_code,
            divisions=divisions,
            status_code=status_code,
            run_type=SpectrumSyncRun.RUN_MANUAL,
        )
        logger.info("Manual Spectrum sync completed successfully")
        return stats
    except Exception as e:
        logger.error(f"Error in manual Spectrum sync: {e}", exc_info=True)
        raise
