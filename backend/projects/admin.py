from django.contrib import admin
from .models import Project, ProjectScope, DailyReport, WeeklyChecklist, ScopeType, Foreman


@admin.register(ScopeType)
class ScopeTypeAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['code', 'name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Foreman)
class ForemanAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at']


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
    list_display = ['project', 'scope_type', 'qty_sq_ft', 'installed', 'remaining', 'percent_complete', 'foreman']
    list_filter = ['scope_type', 'foreman']
    search_fields = ['project__job_number', 'project__name', 'scope_type__name']
    readonly_fields = ['created_at', 'updated_at', 'remaining', 'percent_complete']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('project', 'scope_type', 'description')
        }),
        ('Dates', {
            'fields': ('estimation_start_date', 'estimation_end_date', 'duration_days')
        }),
        ('Schedule', {
            'fields': ('saturdays', 'full_weekends')
        }),
        ('Quantities', {
            'fields': ('qty_sq_ft', 'installed', 'remaining', 'percent_complete')
        }),
        ('Resources', {
            'fields': ('foreman', 'masons', 'tenders', 'operators')
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at')
        }),
    )


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

