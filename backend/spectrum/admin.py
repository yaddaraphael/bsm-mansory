from django.contrib import admin
from .models import SpectrumJob


@admin.register(SpectrumJob)
class SpectrumJobAdmin(admin.ModelAdmin):
    list_display = ['job_number', 'job_description', 'company_code', 'status_code', 
                    'project_manager', 'last_synced_at']
    list_filter = ['status_code', 'company_code', 'division', 'project_manager']
    search_fields = ['job_number', 'job_description', 'customer_code', 'contract_number']
    readonly_fields = ['created_at', 'updated_at', 'last_synced_at']
    
    fieldsets = (
        ('Job Information', {
            'fields': ('company_code', 'job_number', 'job_description', 'division', 'status_code')
        }),
        ('Location', {
            'fields': ('address_1', 'address_2', 'city', 'state', 'zip_code')
        }),
        ('Team', {
            'fields': ('project_manager',)
        }),
        ('Customer & Contract', {
            'fields': ('customer_code', 'contract_number', 'cost_center', 'work_state_tax_code', 'certified_flag')
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at', 'last_synced_at')
        }),
    )
