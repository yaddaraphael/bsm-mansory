from django.contrib import admin
from .models import TimeEntry, TimeCorrectionRequest, PayPeriod


@admin.register(TimeEntry)
class TimeEntryAdmin(admin.ModelAdmin):
    list_display = ['employee', 'project', 'date', 'clock_in', 'clock_out', 'total_hours', 'status']
    list_filter = ['status', 'date', 'role_on_day', 'source']
    search_fields = ['employee__username', 'project__job_number']
    date_hierarchy = 'date'
    readonly_fields = ['created_at', 'updated_at', 'total_hours']


@admin.register(TimeCorrectionRequest)
class TimeCorrectionRequestAdmin(admin.ModelAdmin):
    list_display = ['employee', 'project', 'date', 'status', 'reviewed_by', 'created_at']
    list_filter = ['status', 'date']
    search_fields = ['employee__username', 'project__job_number']
    date_hierarchy = 'created_at'
    readonly_fields = ['created_at', 'updated_at']


@admin.register(PayPeriod)
class PayPeriodAdmin(admin.ModelAdmin):
    list_display = ['start_date', 'end_date', 'is_locked', 'locked_by', 'locked_on']
    list_filter = ['is_locked', 'start_date']
    date_hierarchy = 'start_date'
    readonly_fields = ['created_at', 'updated_at']

