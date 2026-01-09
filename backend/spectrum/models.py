from django.db import models
from django.utils import timezone
import json


class SpectrumEmployee(models.Model):
    """Employee data synced from Trimble Spectrum."""
    spectrum_id = models.CharField(max_length=255, unique=True, db_index=True)
    employee_id = models.CharField(max_length=100, blank=True, null=True)
    first_name = models.CharField(max_length=100, blank=True, null=True)
    last_name = models.CharField(max_length=100, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=50, blank=True, null=True)
    role = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(max_length=50, default='ACTIVE')
    
    # Store raw JSON data from Spectrum API
    raw_data = models.JSONField(default=dict, blank=True)
    
    # Sync tracking
    last_synced_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Spectrum Employee'
        verbose_name_plural = 'Spectrum Employees'
        ordering = ['last_name', 'first_name']
    
    def __str__(self):
        name = f"{self.first_name or ''} {self.last_name or ''}".strip()
        return name or self.spectrum_id or f"Employee {self.id}"
    
    @property
    def full_name(self):
        return f"{self.first_name or ''} {self.last_name or ''}".strip() or self.spectrum_id


class SpectrumProject(models.Model):
    """Project data synced from Trimble Spectrum."""
    spectrum_id = models.CharField(max_length=255, unique=True, db_index=True)
    project_id = models.CharField(max_length=100, blank=True, null=True)
    job_number = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    name = models.CharField(max_length=255, blank=True, null=True)
    client = models.CharField(max_length=255, blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=50, default='ACTIVE')
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    
    # Store raw JSON data from Spectrum API
    raw_data = models.JSONField(default=dict, blank=True)
    
    # Sync tracking
    last_synced_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Spectrum Project'
        verbose_name_plural = 'Spectrum Projects'
        ordering = ['-created_at']
    
    def __str__(self):
        return self.name or self.job_number or f"Project {self.spectrum_id}"


class SpectrumReport(models.Model):
    """Report data synced from Trimble Spectrum."""
    REPORT_TYPES = [
        ('DAILY', 'Daily Report'),
        ('WEEKLY', 'Weekly Report'),
        ('MONTHLY', 'Monthly Report'),
        ('PAYROLL', 'Payroll Report'),
        ('OTHER', 'Other'),
    ]
    
    spectrum_id = models.CharField(max_length=255, unique=True, db_index=True)
    report_id = models.CharField(max_length=100, blank=True, null=True)
    title = models.CharField(max_length=255, blank=True, null=True)
    report_type = models.CharField(max_length=50, choices=REPORT_TYPES, default='OTHER')
    project = models.CharField(max_length=255, blank=True, null=True)
    project_id = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(max_length=50, default='ACTIVE')
    created_date = models.DateTimeField(blank=True, null=True)
    
    # Store raw JSON data from Spectrum API
    raw_data = models.JSONField(default=dict, blank=True)
    
    # Sync tracking
    last_synced_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Spectrum Report'
        verbose_name_plural = 'Spectrum Reports'
        ordering = ['-created_date', '-created_at']
    
    def __str__(self):
        return self.title or self.report_id or f"Report {self.spectrum_id}"
