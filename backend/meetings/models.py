from django.db import models
from django.utils import timezone
from accounts.models import User
from projects.models import Project
from branches.models import Branch


class Meeting(models.Model):
    """
    Meeting model to store meeting information.
    Meetings are created by admins/superadmins to review active jobs.
    """
    meeting_date = models.DateField(help_text="Date of the meeting")
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='created_meetings',
        help_text="User who created the meeting"
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name='meetings',
        null=True,
        blank=True,
        help_text="Branch/Division for this meeting (optional, for branch-specific meetings)"
    )
    notes = models.TextField(
        blank=True,
        null=True,
        help_text="General meeting notes"
    )
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('COMPLETED', 'Completed'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='DRAFT',
        help_text="Meeting status - Draft or Completed"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-meeting_date', '-created_at']
        verbose_name = 'Meeting'
        verbose_name_plural = 'Meetings'
        indexes = [
            models.Index(fields=['meeting_date']),
            models.Index(fields=['branch']),
        ]
    
    def __str__(self):
        branch_name = f" - {self.branch.name}" if self.branch else ""
        return f"Meeting {self.meeting_date}{branch_name}"


class MeetingJob(models.Model):
    """
    MeetingJob model to store job-specific details discussed in a meeting.
    Each job can have multiple meeting entries over time.
    """
    meeting = models.ForeignKey(
        Meeting,
        on_delete=models.CASCADE,
        related_name='meeting_jobs',
        help_text="The meeting this job entry belongs to"
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='meeting_entries',
        help_text="The project/job being discussed"
    )
    # Legacy fields (kept for backward compatibility, but now we use MeetingJobPhase)
    masons = models.IntegerField(
        default=0,
        help_text="Number of masons on this job (deprecated - use MeetingJobPhase)"
    )
    labors = models.IntegerField(
        default=0,
        help_text="Number of labors on this job (deprecated - use MeetingJobPhase)"
    )
    notes = models.TextField(
        blank=True,
        null=True,
        help_text="Job-specific notes for this meeting"
    )
    # New yes/no fields
    handoff_from_estimator = models.BooleanField(
        default=False,
        help_text="Handoff from Estimator"
    )
    handoff_to_foreman = models.BooleanField(
        default=False,
        help_text="Handoff to Foreman"
    )
    site_specific_safety_plan = models.BooleanField(
        default=False,
        help_text="Site Specific Safety Plan"
    )
    saturdays = models.BooleanField(
        null=True,
        blank=True,
        help_text="Saturday work (Yes/No)"
    )
    full_weekends = models.BooleanField(
        null=True,
        blank=True,
        help_text="Full weekends work (Yes/No)"
    )
    selected_scope = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Selected scope type for this meeting"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-meeting__meeting_date', 'project__job_number']
        verbose_name = 'Meeting Job Entry'
        verbose_name_plural = 'Meeting Job Entries'
        unique_together = [['meeting', 'project']]  # One entry per job per meeting
        indexes = [
            models.Index(fields=['meeting', 'project']),
            models.Index(fields=['project']),
        ]
    
    def __str__(self):
        return f"{self.meeting.meeting_date} - {self.project.job_number}"


class MeetingJobPhase(models.Model):
    """
    MeetingJobPhase model to store phase-specific details for a job in a meeting.
    Each phase can have masons, operators, and labors assigned.
    """
    meeting_job = models.ForeignKey(
        MeetingJob,
        on_delete=models.CASCADE,
        related_name='phases',
        help_text="The meeting job entry this phase belongs to"
    )
    phase_code = models.CharField(
        max_length=50,
        help_text="Phase code (e.g., from SpectrumPhaseEnhanced)"
    )
    phase_description = models.TextField(
        blank=True,
        null=True,
        help_text="Description of the phase"
    )
    masons = models.IntegerField(
        default=0,
        help_text="Number of masons for this phase"
    )
    operators = models.IntegerField(
        default=0,
        help_text="Number of operators for this phase"
    )
    labors = models.IntegerField(
        default=0,
        help_text="Number of labors for this phase"
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Total quantity for this phase"
    )
    installed_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Installed quantity for this phase"
    )
    duration = models.IntegerField(
        null=True,
        blank=True,
        help_text="Duration in days for this phase"
    )
    notes = models.TextField(
        blank=True,
        null=True,
        help_text="Phase-specific notes"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['phase_code']
        verbose_name = 'Meeting Job Phase'
        verbose_name_plural = 'Meeting Job Phases'
        unique_together = [['meeting_job', 'phase_code']]  # One entry per phase per meeting job
        indexes = [
            models.Index(fields=['meeting_job', 'phase_code']),
        ]
    
    @property
    def percent_complete(self):
        """Calculate completion percentage for this phase."""
        if self.quantity == 0:
            return 0
        return float((self.installed_quantity / self.quantity) * 100)
    
    def __str__(self):
        return f"{self.meeting_job.project.job_number} - {self.phase_code}"
