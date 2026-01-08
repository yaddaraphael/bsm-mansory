from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    """
    Custom User model with role-based access control and invitation tracking.
    """
    
    ROLE_CHOICES = [
        ('PUBLIC_VIEW', 'Public View'),
        ('LABORER', 'Laborer'),
        ('MASON', 'Mason'),
        ('OPERATOR', 'Operator'),
        ('BRICKLAYER', 'Bricklayer'),
        ('PLASTER', 'Plaster'),
        ('FOREMAN', 'Foreman'),
        ('SUPERINTENDENT', 'Superintendent / Site Supervisor'),
        ('PROJECT_MANAGER', 'Project Manager'),
        ('HR', 'HR'),
        ('FINANCE', 'Finance'),
        ('AUDITOR', 'Auditor'),
        ('ADMIN', 'Admin'),
        ('SYSTEM_ADMIN', 'System Admin'),
        ('SUPERADMIN', 'Superadmin'),
        ('ROOT_SUPERADMIN', 'Root Superadmin'),
        ('GENERAL_CONTRACTOR', 'General Contractor'),
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
    role = models.CharField(max_length=50, choices=ROLE_CHOICES, default='WORKER')
    scope = models.CharField(max_length=20, choices=SCOPE_CHOICES, default='PROJECT')
    
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
        return self.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR']
    
    def is_root_superadmin(self):
        """Check if user is root superadmin (cannot be removed)."""
        return self.role == 'ROOT_SUPERADMIN'
    
    def get_invitable_roles(self):
        """Get list of roles this user can invite."""
        if self.role == 'ROOT_SUPERADMIN':
            # Root superadmin can invite anyone
            return [choice[0] for choice in self.ROLE_CHOICES]
        elif self.role in ['SUPERADMIN', 'ADMIN', 'HR']:
            # These roles can invite lower roles, but not ROOT_SUPERADMIN, SUPERADMIN, or SYSTEM_ADMIN
            restricted_roles = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'SYSTEM_ADMIN']
            return [choice[0] for choice in self.ROLE_CHOICES if choice[0] not in restricted_roles]
        else:
            return []
    
    def can_invite_role(self, role):
        """Check if user can invite a specific role."""
        return role in self.get_invitable_roles()
    
    # SYSTEM_ADMIN permissions
    def is_system_admin(self):
        """Check if user is system admin."""
        return self.role == 'SYSTEM_ADMIN'
    
    def can_manage_integrations(self):
        """Check if user can manage system integrations."""
        return self.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'SYSTEM_ADMIN']
    
    def can_manage_auth_settings(self):
        """Check if user can manage authentication settings (SSO, MFA)."""
        return self.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'SYSTEM_ADMIN']
    
    def can_view_system_monitoring(self):
        """Check if user can view system monitoring."""
        return self.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'SYSTEM_ADMIN']
    
    # ADMIN permissions
    def is_admin(self):
        """Check if user is admin."""
        return self.role == 'ADMIN'
    
    def can_manage_all_projects(self):
        """Check if user can manage all projects (company-wide visibility)."""
        return self.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']
    
    def can_manage_public_portal(self):
        """Check if user can manage public portal publishing settings."""
        return self.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']
    
    def can_manage_approval_workflows(self):
        """Check if user can manage approval workflows."""
        return self.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']
    
    def can_perform_manual_overrides(self):
        """Check if user can perform manual overrides."""
        return self.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']
    
    # AUDITOR permissions (read-only)
    def is_auditor(self):
        """Check if user is auditor."""
        return self.role == 'AUDITOR'
    
    def can_view_audit_logs(self):
        """Check if user can view audit logs."""
        return self.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'AUDITOR']
    
    def can_view_approval_history(self):
        """Check if user can view approval history."""
        return self.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'AUDITOR']
    
    def can_view_permission_changes(self):
        """Check if user can view permission/role changes history."""
        return self.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'AUDITOR']
    
    def is_read_only(self):
        """Check if user has read-only access (auditor)."""
        return self.role == 'AUDITOR'


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
