"""
Celery tasks for Spectrum integration.
"""
from celery import shared_task
from django.core.management import call_command
import logging

logger = logging.getLogger(__name__)


@shared_task
def sync_spectrum_jobs_task():
    """
    Periodic task to sync jobs from Spectrum API.
    Runs every hour.
    """
    try:
        logger.info("Starting automatic Spectrum job sync...")
        call_command('sync_spectrum_jobs')
        logger.info("Automatic Spectrum job sync completed successfully")
    except Exception as e:
        logger.error(f"Error in automatic Spectrum job sync: {e}", exc_info=True)
        raise
