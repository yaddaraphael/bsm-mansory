from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserCreationForm, UserChangeForm
from .models import User, PermissionChangeLog, ProjectAssignment, Notification


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'get_full_name', 'role', 'scope', 'status', 'invited_by', 'invited_on']
    list_filter = ['role', 'scope', 'status', 'is_active', 'is_staff']
    search_fields = ['username', 'email', 'first_name', 'last_name', 'employee_number']
    
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Employee Information', {
            'fields': ('employee_number', 'city', 'phone_number', 'profile_picture', 'current_location', 'training', 'status')
        }),
        ('Role & Access', {
            'fields': ('role', 'scope')
        }),
        ('Invitation Tracking', {
            'fields': ('invited_by', 'invited_on', 'role_assigned_by', 'role_assigned_on', 'last_permission_edit_by', 'last_permission_edit_on')
        }),
    )
    
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Employee Information', {
            'fields': ('employee_number', 'city', 'phone_number', 'status')
        }),
        ('Role & Access', {
            'fields': ('role', 'scope')
        }),
    )


@admin.register(PermissionChangeLog)
class PermissionChangeLogAdmin(admin.ModelAdmin):
    list_display = ['user', 'field_changed', 'old_value', 'new_value', 'changed_by', 'changed_on']
    list_filter = ['field_changed', 'changed_on']
    search_fields = ['user__username', 'user__email', 'changed_by__username']
    readonly_fields = ['changed_on']
    date_hierarchy = 'changed_on'


@admin.register(ProjectAssignment)
class ProjectAssignmentAdmin(admin.ModelAdmin):
    list_display = ['employee', 'project', 'start_date', 'end_date', 'status', 'assigned_by']
    list_filter = ['status', 'start_date']
    search_fields = ['employee__username', 'project__name', 'project__job_number']
    date_hierarchy = 'start_date'


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['user', 'type', 'title', 'is_read', 'created_at']
    list_filter = ['type', 'is_read', 'created_at']
    search_fields = ['user__username', 'user__email', 'title', 'message']
    readonly_fields = ['created_at', 'read_at']
    date_hierarchy = 'created_at'

