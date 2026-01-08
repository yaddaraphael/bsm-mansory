from django.db import models
from django.utils import timezone
from accounts.models import User
from projects.models import Project


class TimeEntry(models.Model):
    """
    Time entry (clock in/out) record.
    """
    ENTRY_STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('SUBMITTED', 'Submitted'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]
    
    SOURCE_CHOICES = [
        ('MOBILE', 'Mobile'),
        ('WEB', 'Web'),
        ('ADMIN_EDIT', 'Admin Edit'),
    ]
    
    employee = models.ForeignKey(User, on_delete=models.CASCADE, related_name='time_entries')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='time_entries')
    date = models.DateField()
    clock_in = models.DateTimeField()
    clock_out = models.DateTimeField(null=True, blank=True)
    
    # Break tracking
    break_start = models.DateTimeField(null=True, blank=True)
    break_end = models.DateTimeField(null=True, blank=True)
    break_duration_minutes = models.IntegerField(default=0, help_text="Total break time in minutes")
    
    # Role and coding
    role_on_day = models.CharField(
        max_length=20,
        choices=[
            ('LABORER', 'Laborer'),
            ('MASON', 'Mason'),
            ('OPERATOR', 'Operator'),
            ('BRICKLAYER', 'Bricklayer'),
            ('PLASTER', 'Plaster'),
            ('FOREMAN', 'Foreman')
        ],
        default='LABORER'
    )
    cost_code = models.CharField(max_length=50, null=True, blank=True)
    scope = models.CharField(max_length=50, null=True, blank=True)
    
    # Overtime tracking
    regular_hours = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Regular hours worked")
    overtime_hours = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Overtime hours worked")
    
    # Status and approval
    status = models.CharField(
        max_length=20,
        choices=ENTRY_STATUS_CHOICES,
        default='DRAFT'
    )
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='MOBILE')
    
    # Location verification (optional)
    clock_in_location = models.JSONField(null=True, blank=True, help_text="GPS coordinates or geofence data")
    clock_out_location = models.JSONField(null=True, blank=True)
    
    # Approval chain
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_time_entries',
        limit_choices_to={'role__in': ['SUPERINTENDENT', 'HR', 'ADMIN']}
    )
    approved_on = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(null=True, blank=True)
    
    # Correction tracking
    is_correction = models.BooleanField(default=False)
    correction_reason = models.TextField(null=True, blank=True)
    corrected_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='corrected_time_entries'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Time Entry'
        verbose_name_plural = 'Time Entries'
        ordering = ['-date', '-clock_in']
        indexes = [
            models.Index(fields=['employee', 'date']),
            models.Index(fields=['project', 'date']),
        ]
    
    def __str__(self):
        return f"{self.employee} - {self.project.job_number} - {self.date}"
    
    def calculate_hours(self):
        """Calculate total hours worked."""
        if not self.clock_out:
            return 0
        
        total_seconds = (self.clock_out - self.clock_in).total_seconds()
        break_seconds = (self.break_duration_minutes or 0) * 60
        work_seconds = total_seconds - break_seconds
        
        return max(work_seconds / 3600, 0)
    
    def calculate_overtime(self, daily_hours_limit=8, weekly_hours_limit=40):
        """
        Calculate regular and overtime hours.
        For daily: hours over 8 per day are OT
        For weekly: hours over 40 per week are OT
        """
        total_hours = self.calculate_hours()
        
        # Get all entries for this employee in the same week
        from datetime import timedelta
        week_start = self.date - timedelta(days=self.date.weekday())
        week_end = week_start + timedelta(days=6)
        
        week_entries = TimeEntry.objects.filter(
            employee=self.employee,
            date__range=[week_start, week_end],
            status__in=['APPROVED', 'SUBMITTED']
        ).exclude(id=self.id)
        
        week_total = sum(entry.calculate_hours() for entry in week_entries) + total_hours
        
        # Calculate daily OT (hours over 8)
        daily_ot = max(0, total_hours - daily_hours_limit)
        
        # Calculate weekly OT (if week total > 40, distribute OT proportionally)
        if week_total > weekly_hours_limit:
            # Calculate what portion of this entry contributes to weekly OT
            week_regular = min(week_total, weekly_hours_limit)
            week_ot = week_total - weekly_hours_limit
            
            # Proportion of this entry's hours that are OT
            if week_total > 0:
                ot_proportion = week_ot / week_total
                weekly_ot_portion = total_hours * ot_proportion
            else:
                weekly_ot_portion = 0
            
            # Use the maximum of daily OT or weekly OT portion
            overtime_hours = max(daily_ot, weekly_ot_portion)
        else:
            overtime_hours = daily_ot
        
        regular_hours = total_hours - overtime_hours
        
        return {
            'regular_hours': max(0, regular_hours),
            'overtime_hours': max(0, overtime_hours),
            'total_hours': total_hours
        }
    
    @property
    def total_hours(self):
        """Total hours worked (property)."""
        return self.calculate_hours()
    
    @property
    def is_clocked_in(self):
        """Check if currently clocked in."""
        return self.clock_in is not None and self.clock_out is None


class TimeCorrectionRequest(models.Model):
    """
    Request for time correction (by worker).
    """
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]
    
    employee = models.ForeignKey(User, on_delete=models.CASCADE, related_name='correction_requests')
    time_entry = models.ForeignKey(TimeEntry, on_delete=models.CASCADE, related_name='correction_requests', null=True, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='correction_requests')
    date = models.DateField()
    requested_clock_in = models.DateTimeField(null=True, blank=True)
    requested_clock_out = models.DateTimeField(null=True, blank=True)
    reason = models.TextField(help_text="Reason for correction request")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_corrections',
        limit_choices_to={'role__in': ['SUPERINTENDENT', 'HR', 'ADMIN']}
    )
    reviewed_on = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Time Correction Request'
        verbose_name_plural = 'Time Correction Requests'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.employee} - {self.project.job_number} - {self.date} ({self.status})"


class PayPeriod(models.Model):
    """
    Pay period for locking time entries.
    """
    start_date = models.DateField()
    end_date = models.DateField()
    is_locked = models.BooleanField(default=False)
    locked_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='locked_pay_periods',
        limit_choices_to={'role__in': ['HR', 'ADMIN']}
    )
    locked_on = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Pay Period'
        verbose_name_plural = 'Pay Periods'
        ordering = ['-start_date']
        unique_together = [['start_date', 'end_date']]
    
    def __str__(self):
        return f"{self.start_date} to {self.end_date} ({'Locked' if self.is_locked else 'Open'})"

