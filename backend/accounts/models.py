from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError


class User(AbstractUser):
    """
    Custom User model with role-based access control and invitation tracking.
    """
    
    ROLE_CHOICES = [
        ('ROOT_SUPERADMIN', 'Root Superadmin'),
        ('ADMIN', 'Admin'),
        ('BRANCH_MANAGER', 'Branch Manager'),
        ('PROJECT_MANAGER', 'Project Manager'),
    ]
    
    SCOPE_CHOICES = [
        ('COMPANY_WIDE', 'Company-wide'),
        ('BRANCH', 'Branch'),
        ('PROJECT', 'Project'),
    ]
    
    # Employee fields
    employee_number = models.CharField(max_length=50, unique=True, null=True, blank=True)
    city = models.CharField(max_length=100, null=True, blank=True)
    phone_number = models.CharField(max_length=20, null=True, blank=True)
    profile_picture = models.ImageField(upload_to='profiles/', null=True, blank=True)
    current_location = models.CharField(max_length=200, null=True, blank=True)
    training = models.JSONField(default=list, blank=True)  # List of training/certifications
    status = models.CharField(
        max_length=20,
        choices=[('ACTIVE', 'Active'), ('INACTIVE', 'Inactive')],
        default='ACTIVE'
    )
    
    # Role and scope
    role = models.CharField(max_length=50, choices=ROLE_CHOICES, default='PROJECT_MANAGER')
    scope = models.CharField(max_length=20, choices=SCOPE_CHOICES, default='PROJECT')
    
    # Division assignment (for Branch Managers - they can only see their division's projects)
    division = models.ForeignKey(
        'branches.Branch',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='branch_managers',
        help_text="Division/Branch assignment (required for Branch Managers)"
    )
    
    # Invitation tracking
    invited_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invited_users',
        verbose_name='Invited by'
    )
    invited_on = models.DateTimeField(null=True, blank=True)
    invitation_email_sent = models.BooleanField(default=False, help_text='Whether invitation email was sent successfully')
    invitation_email_sent_at = models.DateTimeField(null=True, blank=True, help_text='When invitation email was last sent')
    invitation_email_error = models.TextField(null=True, blank=True, help_text='Error message if email failed to send')
    email_verified = models.BooleanField(default=False, help_text='Whether the user has verified their email address by activating their account')
    email_verified_at = models.DateTimeField(null=True, blank=True, help_text='When the email was verified')
    role_assigned_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='role_assignments',
        verbose_name='Role assigned by'
    )
    role_assigned_on = models.DateTimeField(null=True, blank=True)
    last_permission_edit_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='permission_edits',
        verbose_name='Last permission edit by'
    )
    last_permission_edit_on = models.DateTimeField(null=True, blank=True)
    
    # Notification preferences
    notification_preferences = models.JSONField(
        default=dict,
        blank=True,
        help_text='User notification preferences (email_notifications, in_app_notifications)'
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"
    
    def can_invite_users(self):
        """Check if user can invite other users."""
        return self.role in ['ROOT_SUPERADMIN', 'ADMIN']
    
    def is_root_superadmin(self):
        """Check if user is root superadmin."""
        return self.role == 'ROOT_SUPERADMIN'
    
    def is_admin(self):
        """Check if user is admin."""
        return self.role == 'ADMIN'
    
    def is_branch_manager(self):
        """Check if user is branch manager."""
        return self.role == 'BRANCH_MANAGER'
    
    def is_project_manager(self):
        """Check if user is project manager."""
        return self.role == 'PROJECT_MANAGER'
    
    def get_invitable_roles(self):
        """Get list of roles this user can invite."""
        if self.role == 'ROOT_SUPERADMIN':
            # Root Superadmin can invite Admin, Branch Managers and Project Managers
            return ['ADMIN', 'BRANCH_MANAGER', 'PROJECT_MANAGER']
        elif self.role == 'ADMIN':
            # Admin can invite Branch Managers and Project Managers
            return ['BRANCH_MANAGER', 'PROJECT_MANAGER']
        else:
            return []
    
    def can_invite_role(self, role):
        """Check if user can invite a specific role."""
        return role in self.get_invitable_roles()
    
    def can_manage_all_projects(self):
        """Check if user can manage all projects (company-wide visibility)."""
        return self.role in ['ROOT_SUPERADMIN', 'ADMIN']
    
    def can_view_all_divisions(self):
        """Check if user can view all divisions."""
        return self.role in ['ROOT_SUPERADMIN', 'ADMIN']
    
    def get_accessible_divisions(self):
        """Get list of divisions this user can access."""
        if self.role in ['ROOT_SUPERADMIN', 'ADMIN']:
            # Root Superadmin and Admin can access all divisions
            from branches.models import Branch
            return Branch.objects.all()
        elif self.role == 'BRANCH_MANAGER' and self.division:
            # Branch Manager can only access their assigned division
            return [self.division]
        else:
            return []


class Notification(models.Model):
    """
    System notifications for users.
    """
    NOTIFICATION_TYPES = [
        ('INVITATION', 'Invitation'),
        ('PROJECT_UPDATE', 'Project Update'),
        ('TIME_APPROVAL', 'Time Approval'),
        ('REPORT_SUBMITTED', 'Report Submitted'),
        ('EQUIPMENT_TRANSFER', 'Equipment Transfer'),
        ('SYSTEM', 'System'),
        ('OTHER', 'Other'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    type = models.CharField(max_length=50, choices=NOTIFICATION_TYPES, default='OTHER')
    title = models.CharField(max_length=200)
    message = models.TextField()
    link = models.CharField(max_length=500, null=True, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    
    # Related object (generic)
    content_type = models.ForeignKey(
        'contenttypes.ContentType',
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    object_id = models.PositiveIntegerField(null=True, blank=True)
    
    class Meta:
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read', '-created_at']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.title}"
    
    def mark_as_read(self):
        """Mark notification as read."""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at'])


class PermissionChangeLog(models.Model):
    """
    Audit log for permission and role changes.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='permission_logs')
    changed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='permission_changes_made')
    changed_on = models.DateTimeField(auto_now_add=True)
    
    # What changed
    field_changed = models.CharField(max_length=50)  # 'role', 'scope', 'status', etc.
    old_value = models.TextField(null=True, blank=True)
    new_value = models.TextField(null=True, blank=True)
    reason = models.TextField(null=True, blank=True)
    
    class Meta:
        verbose_name = 'Permission Change Log'
        verbose_name_plural = 'Permission Change Logs'
        ordering = ['-changed_on']
    
    def __str__(self):
        return f"{self.user} - {self.field_changed} changed by {self.changed_by} on {self.changed_on}"


class ProjectAssignment(models.Model):
    """
    Tracks which projects a user is assigned to (for access control).
    Includes scope assignment for workers.
    """
    employee = models.ForeignKey(User, on_delete=models.CASCADE, related_name='project_assignments')
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='assignments')
    scope = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text="Scope of work assigned (e.g., CMU, BRICK, etc.)"
    )
    start_date = models.DateTimeField()
    end_date = models.DateTimeField(null=True, blank=True)
    assigned_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='assignments_made')
    reason = models.TextField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=[('ACTIVE', 'Active'), ('ENDED', 'Ended')],
        default='ACTIVE'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Project Assignment'
        verbose_name_plural = 'Project Assignments'
        ordering = ['-start_date']
        unique_together = [['employee', 'project', 'start_date']]
    
    def __str__(self):
        return f"{self.employee} -> {self.project} ({self.status})"
