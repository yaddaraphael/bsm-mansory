from django.contrib import admin
from .models import Equipment, EquipmentAssignment, EquipmentTransfer


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    list_display = ['asset_number', 'type', 'status', 'billing_date', 'cycle_date']
    list_filter = ['status', 'type']
    search_fields = ['asset_number', 'type']
    readonly_fields = ['created_at', 'updated_at', 'cycle_date']


@admin.register(EquipmentAssignment)
class EquipmentAssignmentAdmin(admin.ModelAdmin):
    list_display = ['equipment', 'project', 'branch', 'foreman', 'status', 'assigned_on']
    list_filter = ['status', 'assigned_on']
    search_fields = ['equipment__asset_number', 'project__job_number']


@admin.register(EquipmentTransfer)
class EquipmentTransferAdmin(admin.ModelAdmin):
    list_display = ['equipment', 'from_project', 'to_project', 'status', 'transfer_out_date', 'receipt_date']
    list_filter = ['status', 'transfer_out_date']
    search_fields = ['equipment__asset_number']
    readonly_fields = ['created_at', 'updated_at']

