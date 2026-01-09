from django.contrib import admin
from .models import SpectrumEmployee, SpectrumProject, SpectrumReport


@admin.register(SpectrumEmployee)
class SpectrumEmployeeAdmin(admin.ModelAdmin):
    list_display = ['spectrum_id', 'employee_id', 'first_name', 'last_name', 'email', 'role', 'status', 'last_synced_at']
    list_filter = ['status', 'role', 'last_synced_at']
    search_fields = ['spectrum_id', 'employee_id', 'first_name', 'last_name', 'email']
    readonly_fields = ['created_at', 'updated_at', 'last_synced_at']


@admin.register(SpectrumProject)
class SpectrumProjectAdmin(admin.ModelAdmin):
    list_display = ['spectrum_id', 'project_id', 'job_number', 'name', 'client', 'status', 'last_synced_at']
    list_filter = ['status', 'last_synced_at']
    search_fields = ['spectrum_id', 'project_id', 'job_number', 'name', 'client']
    readonly_fields = ['created_at', 'updated_at', 'last_synced_at']


@admin.register(SpectrumReport)
class SpectrumReportAdmin(admin.ModelAdmin):
    list_display = ['spectrum_id', 'report_id', 'title', 'report_type', 'project', 'status', 'created_date', 'last_synced_at']
    list_filter = ['report_type', 'status', 'last_synced_at']
    search_fields = ['spectrum_id', 'report_id', 'title', 'project']
    readonly_fields = ['created_at', 'updated_at', 'last_synced_at']
