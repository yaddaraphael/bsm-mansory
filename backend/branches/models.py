from django.db import models
from django.core.validators import MinLengthValidator
from accounts.models import User


class Branch(models.Model):
    """
    Branch/Division model - represents a division (branches are divisions).
    Each division has a code that matches Spectrum division codes.
    """
    name = models.CharField(max_length=200)
    code = models.CharField(
        max_length=10,
        unique=True,
        validators=[MinLengthValidator(2)],
        help_text="Division code (e.g., 111, 121, 131, 135, 145) - matches Spectrum division codes"
    )
    spectrum_division_code = models.CharField(
        max_length=5,
        unique=True,
        null=True,
        blank=True,
        help_text="Spectrum division code (e.g., '111', '121') - used to match jobs from Spectrum"
    )
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=[('ACTIVE', 'Active'), ('INACTIVE', 'Inactive')],
        default='ACTIVE'
    )
    # Public portal password for branch-specific portal
    portal_password = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Password for accessing this branch's public portal. Leave blank to disable portal access."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Branch'
        verbose_name_plural = 'Branches'
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} ({self.code})"


class BranchContact(models.Model):
    """
    Contact information for a branch/location.
    """
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='contacts')
    name = models.CharField(max_length=200)
    title = models.CharField(max_length=200, null=True, blank=True)
    email = models.EmailField(null=True, blank=True)
    phone = models.CharField(max_length=20, null=True, blank=True)
    role = models.CharField(
        max_length=50,
        choices=[
            ('MANAGER', 'Manager'),
            ('SUPERVISOR', 'Supervisor'),
            ('SAFETY', 'Safety Officer'),
            ('HR', 'HR Contact'),
            ('FINANCE', 'Finance Contact'),
            ('ADMIN', 'Administrative'),
            ('OTHER', 'Other'),
        ],
        default='OTHER'
    )
    is_primary = models.BooleanField(default=False, help_text="Primary contact for this branch")
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Branch Contact'
        verbose_name_plural = 'Branch Contacts'
        ordering = ['-is_primary', 'name']
    
    def __str__(self):
        return f"{self.name} - {self.branch.name}"

