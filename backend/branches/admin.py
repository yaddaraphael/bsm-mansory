from django.contrib import admin
from .models import Branch, BranchContact


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'status', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['name', 'code', 'address']


@admin.register(BranchContact)
class BranchContactAdmin(admin.ModelAdmin):
    list_display = ['name', 'branch', 'role', 'is_primary', 'email', 'phone']
    list_filter = ['branch', 'role', 'is_primary']
    search_fields = ['name', 'email', 'phone', 'branch__name']
