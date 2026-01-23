from django.contrib import admin
from .models import Meeting, MeetingJob, MeetingJobPhase


@admin.register(Meeting)
class MeetingAdmin(admin.ModelAdmin):
    list_display = ['meeting_date', 'created_by', 'branch', 'created_at']
    list_filter = ['meeting_date', 'branch', 'created_at']
    search_fields = ['notes', 'created_by__username', 'created_by__email']
    date_hierarchy = 'meeting_date'
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Meeting Information', {
            'fields': ('meeting_date', 'created_by', 'branch', 'notes')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(MeetingJob)
class MeetingJobAdmin(admin.ModelAdmin):
    list_display = ['meeting', 'project', 'handoff_from_estimator', 'handoff_to_foreman', 'site_specific_safety_plan', 'created_at']
    list_filter = ['meeting__meeting_date', 'meeting__branch', 'handoff_from_estimator', 'handoff_to_foreman', 'site_specific_safety_plan', 'created_at']
    search_fields = ['project__job_number', 'project__name', 'notes']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Meeting & Project', {
            'fields': ('meeting', 'project')
        }),
        ('Job Details', {
            'fields': ('masons', 'labors', 'notes')
        }),
        ('Handoffs & Safety', {
            'fields': ('handoff_from_estimator', 'handoff_to_foreman', 'site_specific_safety_plan')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(MeetingJobPhase)
class MeetingJobPhaseAdmin(admin.ModelAdmin):
    list_display = ['meeting_job', 'phase_code', 'masons', 'operators', 'labors', 'percent_complete', 'created_at']
    list_filter = ['meeting_job__meeting__meeting_date', 'created_at']
    search_fields = ['phase_code', 'phase_description', 'meeting_job__project__job_number']
    readonly_fields = ['created_at', 'updated_at', 'percent_complete']
    
    fieldsets = (
        ('Meeting Job & Phase', {
            'fields': ('meeting_job', 'phase_code', 'phase_description')
        }),
        ('Workforce', {
            'fields': ('masons', 'operators', 'labors')
        }),
        ('Quantity & Progress', {
            'fields': ('quantity', 'installed_quantity', 'percent_complete', 'duration')
        }),
        ('Notes', {
            'fields': ('notes',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
