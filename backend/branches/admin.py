from django.contrib import admin
from .models import Branch, BranchContact


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'status', 'has_portal_password', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['name', 'code', 'address']
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'code', 'spectrum_division_code', 'status')
        }),
        ('Location', {
            'fields': ('address', 'latitude', 'longitude')
        }),
        ('Public Portal', {
            'fields': ('portal_password',),
            'description': 'Set a password for this branch\'s public portal. Leave blank to disable portal access. Only Admin and Root Superadmin can set this.'
        }),
        ('Notes', {
            'fields': ('notes',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    readonly_fields = ['created_at', 'updated_at']
    
    def has_portal_password(self, obj):
        return bool(obj.portal_password)
    has_portal_password.boolean = True
    has_portal_password.short_description = 'Portal Password Set'


@admin.register(BranchContact)
class BranchContactAdmin(admin.ModelAdmin):
    list_display = ['name', 'branch', 'role', 'is_primary', 'email', 'phone']
    list_filter = ['branch', 'role', 'is_primary']
    search_fields = ['name', 'email', 'phone', 'branch__name']
