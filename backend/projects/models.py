from django.db import models
from django.db.models import Sum, Max
from django.utils import timezone
from datetime import timedelta
from accounts.models import User
from branches.models import Branch


SCOPE_OF_WORK_CHOICES = [
    ('CMU', 'CMU'),
    ('BRICK', 'BRICK'),
    ('CAST_STONE', 'CAST STONE'),
    ('MSV', 'MSV'),
    ('STUCCO', 'STUCCO'),
    ('EIFS', 'EIFS'),
    ('THIN_BRICK', 'THIN BRICK'),
    ('FBD_STONE', 'FBD STONE'),
]


class Project(models.Model):
    """
    Job/Project model - the core entity in the system.
    """
    # Basic Information
    name = models.CharField(max_length=200)
    job_number = models.CharField(max_length=50, unique=True, db_index=True)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name='projects', help_text="Division/Branch (branches are divisions)")
    spectrum_division_code = models.CharField(
        max_length=5,
        null=True,
        blank=True,
        db_index=True,
        help_text="Division code from Spectrum (e.g., '111', '121') - used to match jobs to divisions"
    )
    client_name = models.CharField(max_length=200, null=True, blank=True, help_text="Client name for this project")
    work_location = models.CharField(max_length=500, null=True, blank=True, help_text="Location where work is performed")
    spectrum_project_manager = models.CharField(max_length=100, null=True, blank=True, help_text="Project Manager name from Spectrum (fallback if User not matched)")
    
    # Spectrum Dates (from SpectrumJobDates)
    spectrum_est_start_date = models.DateField(null=True, blank=True, help_text="Estimated Start Date from Spectrum")
    spectrum_est_complete_date = models.DateField(null=True, blank=True, help_text="Estimated Complete Date from Spectrum")
    spectrum_projected_complete_date = models.DateField(null=True, blank=True, help_text="Projected Complete Date from Spectrum")
    spectrum_start_date = models.DateField(null=True, blank=True, help_text="Actual Start Date from Spectrum")
    spectrum_complete_date = models.DateField(null=True, blank=True, help_text="Actual Complete Date from Spectrum")
    spectrum_create_date = models.DateField(null=True, blank=True, help_text="Job Created Date from Spectrum")
    
    # Spectrum Financial (from SpectrumJob)
    spectrum_original_contract = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, help_text="Original Contract Amount from Spectrum")
    
    # Spectrum Phase Aggregates (from SpectrumPhaseEnhanced)
    spectrum_total_projected_dollars = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, help_text="Total Projected Dollars from all phases")
    spectrum_total_estimated_dollars = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, help_text="Total Estimated Dollars from all phases")
    spectrum_total_jtd_dollars = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, help_text="Total Job To Date Dollars from all phases")
    
    # Spectrum Cost Types (comma-separated list of unique cost types from phases)
    spectrum_cost_types = models.TextField(null=True, blank=True, help_text="Comma-separated list of cost types from Spectrum phases")
    
    # Assignments
    general_contractor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gc_projects',
        limit_choices_to={'role': 'GENERAL_CONTRACTOR'}
    )
    project_manager = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pm_projects',
        limit_choices_to={'role': 'PROJECT_MANAGER'}
    )
    superintendent = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='super_projects',
        limit_choices_to={'role': 'SUPERINTENDENT'}
    )
    foreman = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='foreman_projects',
        limit_choices_to={'role': 'FOREMAN'},
        help_text="Optional foreman assignment"
    )
    
    # Quantity per square foot
    qty_sq = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Quantity per square foot"
    )
    
    # Schedule
    start_date = models.DateField()
    duration = models.IntegerField(help_text="Duration in days")
    saturdays = models.BooleanField(default=False, help_text="Include Saturdays as workdays")
    full_weekends = models.BooleanField(default=False, help_text="Include full weekends as workdays")
    
    # Financial
    contract_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    contract_balance = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=[
            ('PENDING', 'Pending'),
            ('ACTIVE', 'Active'),
            ('INACTIVE', 'Inactive'),
            ('COMPLETED', 'Completed'),
            ('ON_HOLD', 'On Hold'),
            ('CLOSED', 'Closed'),
        ],
        default='PENDING'
    )
    
    # Public visibility
    is_public = models.BooleanField(default=False, help_text="Visible on public portal")
    public_pin = models.CharField(max_length=10, null=True, blank=True, help_text="Optional PIN for public access")
    
    # Metadata
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='projects_created')
    
    class Meta:
        verbose_name = 'Project'
        verbose_name_plural = 'Projects'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.job_number} - {self.name}"
    
    def calculate_estimated_end_date(self):
        """Calculate estimated end date based on schedule rules."""
        current_date = self.start_date
        days_added = 0
        workdays = 0
        
        while workdays < self.duration:
            weekday = current_date.weekday()  # 0=Monday, 6=Sunday
            
            # Check if it's a workday
            is_workday = False
            if weekday < 5:  # Monday-Friday
                is_workday = True
            elif weekday == 5 and self.saturdays:  # Saturday
                is_workday = True
            elif weekday == 6 and self.full_weekends:  # Sunday
                is_workday = True
            
            if is_workday:
                workdays += 1
            
            if workdays < self.duration:
                current_date += timedelta(days=1)
                days_added += 1
        
        return current_date
    
    @property
    def estimated_end_date(self):
        """Property to get estimated end date."""
        return self.calculate_estimated_end_date()
    
    @property
    def total_quantity(self):
        """Total quantity across all scopes."""
        return self.scopes.aggregate(total=Sum('quantity'))['total'] or 0
    
    @property
    def total_installed(self):
        """Total installed quantity across all scopes."""
        return self.scopes.aggregate(total=Sum('installed'))['total'] or 0
    
    @property
    def remaining(self):
        """Remaining quantity."""
        return max(self.total_quantity - self.total_installed, 0)
    
    @property
    def production_percent_complete(self):
        """Production percentage complete."""
        if self.total_quantity == 0:
            return 0
        return (self.total_installed / self.total_quantity) * 100
    
    @property
    def financial_percent_complete(self):
        """Financial percentage complete."""
        if not self.contract_value or self.contract_value == 0:
            return 0
        if not self.contract_balance:
            return 100
        return (1 - (self.contract_balance / self.contract_value)) * 100
    
    def get_schedule_status(self):
        """
        Calculate Green/Yellow/Red status based on forecast vs baseline.
        Returns: ('GREEN'|'YELLOW'|'RED', forecast_date, days_late)
        """
        baseline_date = self.estimated_end_date
        forecast_date = self.calculate_forecast_completion_date()
        
        if not forecast_date:
            return ('GREEN', baseline_date, 0)
        
        days_late = (forecast_date - baseline_date).days
        
        if days_late <= 0:
            return ('GREEN', forecast_date, 0)
        elif days_late <= 7:
            return ('YELLOW', forecast_date, days_late)
        else:
            return ('RED', forecast_date, days_late)
    
    def calculate_forecast_completion_date(self):
        """
        Calculate forecast completion date.
        First tries to use projected_complete_date from SpectrumJobDates (GetJobDates API).
        Falls back to calculated forecast based on progress trend if Spectrum data not available.
        """
        # Try to get projected_complete_date from SpectrumJobDates (GetJobDates API)
        try:
            from spectrum.models import SpectrumJobDates
            # Try to find matching SpectrumJobDates by job_number
            # Spectrum job numbers might have different formats, so try multiple approaches
            spectrum_dates = None
            
            # Try exact match first
            try:
                spectrum_dates = SpectrumJobDates.objects.get(job_number=self.job_number)
            except SpectrumJobDates.DoesNotExist:
                # Try case-insensitive match
                try:
                    spectrum_dates = SpectrumJobDates.objects.get(job_number__iexact=self.job_number)
                except (SpectrumJobDates.DoesNotExist, SpectrumJobDates.MultipleObjectsReturned):
                    # Try with trimmed spaces
                    try:
                        trimmed_job_number = self.job_number.strip()
                        if trimmed_job_number != self.job_number:
                            spectrum_dates = SpectrumJobDates.objects.get(job_number=trimmed_job_number)
                    except SpectrumJobDates.DoesNotExist:
                        pass
            
            # If found and has projected_complete_date, use it
            if spectrum_dates and spectrum_dates.projected_complete_date:
                return spectrum_dates.projected_complete_date
        except Exception:
            # If any error occurs, fall back to calculated forecast
            pass
        
        # Fallback: Calculate forecast completion date based on progress trend
        if self.total_quantity == 0 or self.total_installed == 0:
            return self.estimated_end_date
        
        # Get recent daily reports to calculate trend
        recent_reports = self.daily_reports.order_by('-date')[:14]  # Last 2 weeks
        
        if not recent_reports.exists():
            return self.estimated_end_date
        
        # Calculate average daily production
        total_production = sum(report.total_installed for report in recent_reports if hasattr(report, 'total_installed'))
        days_with_production = len([r for r in recent_reports if hasattr(r, 'total_installed') and r.total_installed > 0])
        
        if days_with_production == 0:
            return self.estimated_end_date
        
        avg_daily = total_production / days_with_production
        remaining = self.remaining
        
        if avg_daily == 0:
            return self.estimated_end_date
        
        days_needed = remaining / avg_daily
        forecast_date = timezone.now().date() + timedelta(days=int(days_needed))
        
        return forecast_date


class ProjectScope(models.Model):
    """
    Scope of work for a project.
    """
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='scopes')
    scope_type = models.CharField(max_length=50, choices=SCOPE_OF_WORK_CHOICES)
    description = models.TextField(null=True, blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    installed = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit = models.CharField(max_length=20, default='Sq.Ft', help_text="Unit of measurement")
    start_date = models.DateField(null=True, blank=True, help_text="Start date for this scope")
    end_date = models.DateField(null=True, blank=True, help_text="End date for this scope")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Project Scope'
        verbose_name_plural = 'Project Scopes'
        unique_together = [['project', 'scope_type']]
    
    def __str__(self):
        return f"{self.project.job_number} - {self.get_scope_type_display()}"
    
    @property
    def remaining(self):
        """Remaining quantity for this scope."""
        return max(self.quantity - self.installed, 0)
    
    @property
    def percent_complete(self):
        """Percentage complete for this scope."""
        if self.quantity == 0:
            return 0
        return (self.installed / self.quantity) * 100


class LaborEntry(models.Model):
    """
    Labor entry for daily report - tracks individual employee hours and work.
    """
    daily_report = models.ForeignKey('DailyReport', on_delete=models.CASCADE, related_name='labor_entries')
    employee = models.ForeignKey(User, on_delete=models.CASCADE, related_name='labor_entries')
    phase = models.CharField(max_length=100, help_text="Phase/Scope (e.g., 4210 - CMU- Labor)")
    regular_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    overtime_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Quantity completed")
    comment = models.TextField(null=True, blank=True)
    
    class Meta:
        verbose_name = 'Labor Entry'
        verbose_name_plural = 'Labor Entries'
        ordering = ['employee__employee_number']
    
    def __str__(self):
        return f"{self.employee.employee_number} - {self.employee.get_full_name()} - {self.phase}"


class DailyReport(models.Model):
    """
    Daily report submitted by Foreman.
    """
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='daily_reports')
    foreman = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='daily_reports')
    date = models.DateField()
    report_number = models.CharField(max_length=50, unique=True, db_index=True, null=True, blank=True, help_text="Auto-generated report number")
    phase = models.CharField(max_length=100, null=True, blank=True, help_text="Phase/Scope (e.g., 4210 - CMU- Labor)")
    location = models.CharField(max_length=500, null=True, blank=True, help_text="Work location")
    completed_at = models.DateTimeField(null=True, blank=True, help_text="When report was completed")
    
    # Weather
    weather_sunny = models.BooleanField(default=False)
    weather_cloudy = models.BooleanField(default=False)
    weather_rain = models.BooleanField(default=False)
    weather_wind = models.BooleanField(default=False)
    weather_snow = models.BooleanField(default=False)
    temperature_am = models.IntegerField(null=True, blank=True, help_text="Temperature in AM")
    temperature_pm = models.IntegerField(null=True, blank=True, help_text="Temperature in PM")
    weather_notes = models.TextField(null=True, blank=True, help_text="Additional weather notes")
    
    # Work performed
    work_performed = models.TextField(null=True, blank=True, help_text="Description of work performed")
    
    # Safety
    safety_meeting_held = models.BooleanField(default=False)
    jha_review = models.BooleanField(default=False, help_text="JHA Review For Work Performed")
    scaffolding_inspected = models.BooleanField(default=False)
    
    # Delays
    delays_by_others = models.TextField(null=True, blank=True, help_text="Delays by others description")
    
    # Legacy fields (kept for backward compatibility)
    masons_count = models.IntegerField(default=0)
    tenders_count = models.IntegerField(default=0)
    operators_count = models.IntegerField(default=0)
    
    # Production
    installed_quantities = models.JSONField(
        default=dict,
        help_text="Dict of scope_type: quantity installed"
    )
    
    # Notes and photos
    notes = models.TextField(null=True, blank=True)
    photos = models.JSONField(default=list, help_text="List of photo URLs/paths")
    
    # Blockers/delays
    blockers = models.JSONField(
        default=list,
        help_text="List of structured delay reasons"
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=[
            ('DRAFT', 'Draft'),
            ('SUBMITTED', 'Submitted'),
            ('APPROVED', 'Approved'),
            ('REJECTED', 'Rejected'),
        ],
        default='DRAFT'
    )
    
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_daily_reports',
        limit_choices_to={'role__in': ['SUPERINTENDENT', 'PROJECT_MANAGER', 'ADMIN']}
    )
    approved_on = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Daily Report'
        verbose_name_plural = 'Daily Reports'
        ordering = ['-date', '-created_at']
        # Removed unique_together to allow multiple reports per day per project
        indexes = [
            models.Index(fields=['report_number']),
            models.Index(fields=['project', 'date']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.report_number or 'N/A'} - {self.project.job_number} - {self.date} ({self.status})"
    
    def save(self, *args, **kwargs):
        # Auto-generate report number if not provided
        if not self.report_number:
            from .utils import generate_daily_report_number
            self.report_number = generate_daily_report_number()
        super().save(*args, **kwargs)
    
    @property
    def total_workers(self):
        """Total workers on ground."""
        return self.masons_count + self.tenders_count + self.operators_count
    
    @property
    def total_labor_hours(self):
        """Total labor hours from labor entries."""
        return sum(
            float(entry.regular_hours) + float(entry.overtime_hours) 
            for entry in self.labor_entries.all()
        )
    
    @property
    def total_regular_hours(self):
        """Total regular hours from labor entries."""
        return sum(float(entry.regular_hours) for entry in self.labor_entries.all())
    
    @property
    def total_overtime_hours(self):
        """Total overtime hours from labor entries."""
        return sum(float(entry.overtime_hours) for entry in self.labor_entries.all())
    
    @property
    def attachments_count(self):
        """Number of attachments/photos."""
        return len(self.photos) if self.photos else 0


class WeeklyChecklist(models.Model):
    """
    Tuesday weekly checklist.
    """
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='weekly_checklists')
    week_start_date = models.DateField(help_text="Tuesday of the week")
    
    handoff_from_estimator = models.BooleanField(default=False)
    handoff_to_foreman = models.BooleanField(default=False)
    site_specific_safety_plan = models.BooleanField(default=False)
    weekly_notes = models.TextField(null=True, blank=True)
    
    # Workflow
    drafted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='drafted_checklists',
        limit_choices_to={'role__in': ['FOREMAN', 'SUPERINTENDENT']}
    )
    approved_by_super = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='super_approved_checklists',
        limit_choices_to={'role': 'SUPERINTENDENT'}
    )
    confirmed_by_pm = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pm_confirmed_checklists',
        limit_choices_to={'role': 'PROJECT_MANAGER'}
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Weekly Checklist'
        verbose_name_plural = 'Weekly Checklists'
        ordering = ['-week_start_date']
        unique_together = [['project', 'week_start_date']]
    
    def __str__(self):
        return f"{self.project.job_number} - Week of {self.week_start_date}"

