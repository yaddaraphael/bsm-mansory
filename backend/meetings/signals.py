"""
Signals to sync meeting phase updates to project scopes.
"""
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import MeetingJobPhase, MeetingJob
from projects.models import ProjectScope
from decimal import Decimal


def sync_meeting_phase_to_project_scope(meeting_job_phase):
    """
    Sync MeetingJobPhase installed_quantity to ProjectScope.installed.
    Maps phase_code to scope_type by trying to match scope types in the phase_code.
    Meetings are the authoritative source for installed quantities.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    project = meeting_job_phase.meeting_job.project
    
    # Try to find matching ProjectScope by scope_type
    # Phase codes might contain scope type information (e.g., "CMU", "BRICK", etc.)
    scope_type = None
    matching_scope = None
    
    # Get all scope type choices
    from projects.models import SCOPE_OF_WORK_CHOICES
    
    # Priority 1: Use selected_scope from meeting_job if available
    if meeting_job_phase.meeting_job.selected_scope:
        try:
            matching_scope = ProjectScope.objects.get(
                project=project, 
                scope_type=meeting_job_phase.meeting_job.selected_scope
            )
            scope_type = meeting_job_phase.meeting_job.selected_scope
        except ProjectScope.DoesNotExist:
            pass
    
    # Priority 2: Try to match phase_code with scope types
    if not matching_scope:
        phase_code_upper = meeting_job_phase.phase_code.upper()
        for scope_choice in SCOPE_OF_WORK_CHOICES:
            scope_code = scope_choice[0]
            scope_name = scope_choice[1]
            
            # Check if phase_code contains the scope code or name
            if scope_code in phase_code_upper or scope_name.upper() in phase_code_upper:
                try:
                    matching_scope = ProjectScope.objects.get(project=project, scope_type=scope_code)
                    scope_type = scope_code
                    break
                except ProjectScope.DoesNotExist:
                    continue
    
    # Update the matching scope with the latest installed_quantity from the most recent meeting
    if matching_scope:
        # Get the most recent installed_quantity for this scope from all meetings
        latest_phase = MeetingJobPhase.objects.filter(
            meeting_job__project=project,
            phase_code=meeting_job_phase.phase_code
        ).order_by('-meeting_job__meeting__meeting_date', '-updated_at').first()
        
        if latest_phase:
            # Update the project scope with the latest installed quantity from meetings
            # This overwrites any values from daily reports - meetings are authoritative
            old_installed = matching_scope.installed
            matching_scope.installed = Decimal(str(latest_phase.installed_quantity))
            matching_scope.save(update_fields=['installed', 'updated_at'])
            logger.info(
                f"Synced meeting phase {latest_phase.phase_code} to project scope {scope_type}: "
                f"{old_installed} → {matching_scope.installed} (from meeting {latest_phase.meeting_job.meeting.meeting_date})"
            )
    else:
        # Log when we can't find a matching scope (for debugging)
        logger.debug(
            f"Could not find matching ProjectScope for phase_code '{meeting_job_phase.phase_code}' "
            f"in project {project.job_number}. Selected scope: {meeting_job_phase.meeting_job.selected_scope}"
        )


@receiver(post_save, sender=MeetingJobPhase)
def sync_phase_on_save(sender, instance, **kwargs):
    """Sync meeting phase to project scope when saved."""
    sync_meeting_phase_to_project_scope(instance)


@receiver(post_delete, sender=MeetingJobPhase)
def sync_phase_on_delete(sender, instance, **kwargs):
    """Re-sync remaining phases when one is deleted."""
    # Re-sync all phases for this project to ensure consistency
    project = instance.meeting_job.project
    for phase in MeetingJobPhase.objects.filter(meeting_job__project=project):
        sync_meeting_phase_to_project_scope(phase)
