from django.contrib import admin
from .models import Project, ProjectScope, DailyReport, WeeklyChecklist


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ['job_number', 'name', 'branch', 'status', 'start_date', 'project_manager']
    list_filter = ['status', 'branch', 'is_public', 'start_date']
    search_fields = ['job_number', 'name', 'branch__name']
    readonly_fields = ['created_at', 'updated_at', 'estimated_end_date']
    date_hierarchy = 'start_date'
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'job_number', 'branch', 'status')
        }),
        ('Assignments', {
            'fields': ('general_contractor', 'project_manager', 'superintendent')
        }),
        ('Schedule', {
            'fields': ('start_date', 'duration', 'saturdays', 'full_weekends', 'estimated_end_date')
        }),
        ('Financial', {
            'fields': ('contract_value', 'contract_balance')
        }),
        ('Public Access', {
            'fields': ('is_public', 'public_pin')
        }),
        ('Notes', {
            'fields': ('notes',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at')
        }),
    )


@admin.register(ProjectScope)
class ProjectScopeAdmin(admin.ModelAdmin):
    list_display = ['project', 'scope_type', 'quantity', 'installed', 'remaining', 'percent_complete']
    list_filter = ['scope_type']
    search_fields = ['project__job_number', 'project__name']


@admin.register(DailyReport)
class DailyReportAdmin(admin.ModelAdmin):
    list_display = ['project', 'date', 'foreman', 'status', 'total_workers', 'approved_by']
    list_filter = ['status', 'date']
    search_fields = ['project__job_number', 'foreman__username']
    date_hierarchy = 'date'
    readonly_fields = ['created_at', 'updated_at']


@admin.register(WeeklyChecklist)
class WeeklyChecklistAdmin(admin.ModelAdmin):
    list_display = ['project', 'week_start_date', 'handoff_from_estimator', 'handoff_to_foreman', 'site_specific_safety_plan']
    list_filter = ['week_start_date']
    search_fields = ['project__job_number']
    date_hierarchy = 'week_start_date'

