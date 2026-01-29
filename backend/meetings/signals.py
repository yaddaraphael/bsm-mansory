"""
Signals to sync meeting phase updates to project scopes.
Meetings are the authoritative source for installed quantities, masons, tenders, and operators.
"""
from django.db import models
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import MeetingJobPhase, MeetingJob
from projects.models import ProjectScope, ScopeType
from decimal import Decimal


def sync_meeting_phase_to_project_scope(meeting_job_phase):
    """
    Sync MeetingJobPhase data to ProjectScope.
    Updates: installed_quantity, masons, tenders (labors), operators.
    Maps phase_code to scope_type by trying to match scope types.
    Meetings are the authoritative source for these values.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    meeting = meeting_job_phase.meeting_job.meeting
    if meeting.status != "COMPLETED":
        return

    project = meeting_job_phase.meeting_job.project
    
    # Try to find matching ProjectScope
    matching_scope = None
    scope_type_obj = None
    
    # Priority 1: Use selected_scope from meeting_job if available
    # selected_scope is a CharField storing the scope type code
    if meeting_job_phase.meeting_job.selected_scope:
        try:
            # Find ScopeType by code
            scope_type_obj = ScopeType.objects.get(
                code=meeting_job_phase.meeting_job.selected_scope, 
                is_active=True
            )
            matching_scope = ProjectScope.objects.get(project=project, scope_type=scope_type_obj)
        except (ScopeType.DoesNotExist, ProjectScope.DoesNotExist):
            pass
    
    # Priority 2: Try to match phase_code with scope types
    if not matching_scope:
        phase_code_upper = meeting_job_phase.phase_code.upper()
        # Get all active scope types
        active_scope_types = ScopeType.objects.filter(is_active=True)
        
        for scope_type in active_scope_types:
            # Check if phase_code contains the scope code or name
            if (scope_type.code.upper() in phase_code_upper or 
                scope_type.name.upper() in phase_code_upper):
                try:
                    matching_scope = ProjectScope.objects.get(project=project, scope_type=scope_type)
                    scope_type_obj = scope_type
                    break
                except ProjectScope.DoesNotExist:
                    continue
    
    # Update the matching scope with cumulative installed + latest resources
    if matching_scope:
        completed_phases = MeetingJobPhase.objects.filter(
            meeting_job__project=project,
            phase_code=meeting_job_phase.phase_code,
            meeting_job__meeting__status="COMPLETED",
        )

        latest_phase = completed_phases.order_by("-meeting_job__meeting__meeting_date", "-updated_at").first()

        if latest_phase:
            # Meetings are authoritative for: installed (cumulative), masons, tenders, operators
            old_installed = matching_scope.installed
            old_masons = matching_scope.masons
            old_tenders = matching_scope.tenders
            old_operators = matching_scope.operators

            matching_scope.installed = Decimal(str(latest_phase.installed_quantity))
            matching_scope.masons = latest_phase.masons or 0
            matching_scope.tenders = latest_phase.labors or 0  # labors in MeetingJobPhase = tenders in ProjectScope
            matching_scope.operators = latest_phase.operators or 0

            matching_scope.save(update_fields=["installed", "masons", "tenders", "operators", "updated_at"])

            logger.info(
                f"Synced meeting phase {latest_phase.phase_code} to project scope {scope_type_obj.name if scope_type_obj else 'N/A'}: "
                f"installed: {old_installed} -> {matching_scope.installed}, "
                f"masons: {old_masons} -> {matching_scope.masons}, "
                f"tenders: {old_tenders} -> {matching_scope.tenders}, "
                f"operators: {old_operators} -> {matching_scope.operators} "
                f"(latest meeting {latest_phase.meeting_job.meeting.meeting_date})"
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
    meeting = instance.meeting_job.meeting
    if meeting.status != "COMPLETED":
        return
    # Re-sync all phases for this project to ensure consistency
    project = instance.meeting_job.project
    for phase in MeetingJobPhase.objects.filter(meeting_job__project=project):
        sync_meeting_phase_to_project_scope(phase)
