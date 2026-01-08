from django.contrib import admin
from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['user', 'action', 'content_type', 'object_id', 'timestamp', 'field_name']
    list_filter = ['action', 'timestamp', 'content_type']
    search_fields = ['user__username', 'field_name', 'reason']
    readonly_fields = ['timestamp']
    date_hierarchy = 'timestamp'

