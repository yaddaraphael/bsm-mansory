from rest_framework import serializers
from .models import Project, ProjectScope, DailyReport, WeeklyChecklist, LaborEntry
from accounts.serializers import UserSerializer
from branches.serializers import BranchSerializer


class ProjectScopeSerializer(serializers.ModelSerializer):
    remaining = serializers.ReadOnlyField()
    percent_complete = serializers.ReadOnlyField()
    
    class Meta:
        model = ProjectScope
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class ProjectSerializer(serializers.ModelSerializer):
    branch_detail = BranchSerializer(source='branch', read_only=True)
    scopes = ProjectScopeSerializer(many=True, read_only=True)
    estimated_end_date = serializers.ReadOnlyField()
    total_quantity = serializers.ReadOnlyField()
    total_installed = serializers.ReadOnlyField()
    remaining = serializers.ReadOnlyField()
    production_percent_complete = serializers.ReadOnlyField()
    financial_percent_complete = serializers.ReadOnlyField()
    schedule_status = serializers.SerializerMethodField()
    project_manager_detail = UserSerializer(source='project_manager', read_only=True)
    superintendent_detail = UserSerializer(source='superintendent', read_only=True)
    foreman_detail = UserSerializer(source='foreman', read_only=True)
    general_contractor_detail = UserSerializer(source='general_contractor', read_only=True)
    
    class Meta:
        model = Project
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'job_number']
    
    
    def get_schedule_status(self, obj):
        status, forecast_date, days_late = obj.get_schedule_status()
        return {
            'status': status,
            'forecast_date': forecast_date,
            'days_late': days_late
        }


class LaborEntrySerializer(serializers.ModelSerializer):
    employee_detail = UserSerializer(source='employee', read_only=True)
    employee_number = serializers.CharField(source='employee.employee_number', read_only=True)
    employee_name = serializers.SerializerMethodField()
    
    class Meta:
        model = LaborEntry
        fields = '__all__'
        read_only_fields = []
    
    def get_employee_name(self, obj):
        return f"{obj.employee.employee_number} - {obj.employee.get_full_name() or obj.employee.username}"


class DailyReportSerializer(serializers.ModelSerializer):
    foreman_detail = UserSerializer(source='foreman', read_only=True)
    approved_by_detail = UserSerializer(source='approved_by', read_only=True)
    project_detail = ProjectSerializer(source='project', read_only=True)
    total_workers = serializers.ReadOnlyField()
    total_labor_hours = serializers.ReadOnlyField()
    total_regular_hours = serializers.ReadOnlyField()
    total_overtime_hours = serializers.ReadOnlyField()
    attachments_count = serializers.ReadOnlyField()
    labor_entries = LaborEntrySerializer(many=True, required=False)
    
    class Meta:
        model = DailyReport
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'approved_on', 'report_number', 'completed_at']
    
    def create(self, validated_data):
        # Extract labor_entries if present
        labor_entries_data = validated_data.pop('labor_entries', [])
        # Create the report
        report = DailyReport.objects.create(**validated_data)
        # Create labor entries
        for entry_data in labor_entries_data:
            LaborEntry.objects.create(daily_report=report, **entry_data)
        return report
    
    def update(self, instance, validated_data):
        # Extract labor_entries if present
        labor_entries_data = validated_data.pop('labor_entries', None)
        # Update the report
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        # Update labor entries if provided
        if labor_entries_data is not None:
            # Delete existing entries and create new ones
            instance.labor_entries.all().delete()
            for entry_data in labor_entries_data:
                LaborEntry.objects.create(daily_report=instance, **entry_data)
        return instance


class WeeklyChecklistSerializer(serializers.ModelSerializer):
    drafted_by_detail = UserSerializer(source='drafted_by', read_only=True)
    approved_by_super_detail = UserSerializer(source='approved_by_super', read_only=True)
    confirmed_by_pm_detail = UserSerializer(source='confirmed_by_pm', read_only=True)
    
    class Meta:
        model = WeeklyChecklist
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class PublicProjectSerializer(serializers.ModelSerializer):
    """
    Simplified serializer for public project views.
    Excludes sensitive information and uses safe field access.
    """
    branch_name = serializers.SerializerMethodField()
    branch_code = serializers.SerializerMethodField()
    scopes = ProjectScopeSerializer(many=True, read_only=True)
    estimated_end_date = serializers.SerializerMethodField()
    total_quantity = serializers.SerializerMethodField()
    total_installed = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()
    production_percent_complete = serializers.SerializerMethodField()
    financial_percent_complete = serializers.SerializerMethodField()
    schedule_status = serializers.SerializerMethodField()
    
    class Meta:
        model = Project
        fields = [
            'id', 'name', 'job_number', 'branch_name', 'branch_code',
            'start_date', 'estimated_end_date', 'duration',
            'status', 'is_public', 'public_pin',
            # Financial fields removed for public view
            'production_percent_complete', 'financial_percent_complete',
            'total_quantity', 'total_installed', 'remaining',
            'schedule_status', 'scopes', 'notes',
            'created_at', 'updated_at', 'client_name', 'work_location'
        ]
        read_only_fields = ['created_at', 'updated_at', 'job_number']
    
    def get_branch_name(self, obj):
        try:
            return obj.branch.name if obj.branch else None
        except Exception:
            return None
    
    def get_branch_code(self, obj):
        try:
            return obj.branch.code if obj.branch else None
        except Exception:
            return None
    
    def get_estimated_end_date(self, obj):
        try:
            if hasattr(obj, 'estimated_end_date'):
                date = obj.estimated_end_date
                return date.isoformat() if date else None
            return None
        except Exception:
            return None
    
    def get_total_quantity(self, obj):
        try:
            if hasattr(obj, 'total_quantity'):
                return float(obj.total_quantity) if obj.total_quantity else 0
            return 0
        except Exception:
            return 0
    
    def get_total_installed(self, obj):
        try:
            if hasattr(obj, 'total_installed'):
                return float(obj.total_installed) if obj.total_installed else 0
            return 0
        except Exception:
            return 0
    
    def get_remaining(self, obj):
        try:
            if hasattr(obj, 'remaining'):
                return float(obj.remaining) if obj.remaining else 0
            return 0
        except Exception:
            return 0
    
    def get_production_percent_complete(self, obj):
        try:
            if hasattr(obj, 'production_percent_complete'):
                return float(obj.production_percent_complete) if obj.production_percent_complete else 0
            return 0
        except Exception:
            return 0
    
    def get_financial_percent_complete(self, obj):
        # Hide financial info for public projects
        return None
    
    def get_schedule_status(self, obj):
        try:
            # Safely get schedule status
            if hasattr(obj, 'get_schedule_status'):
                status, forecast_date, days_late = obj.get_schedule_status()
                return {
                    'status': status or 'GREEN',
                    'forecast_date': forecast_date.isoformat() if forecast_date and hasattr(forecast_date, 'isoformat') else None,
                    'days_late': int(days_late) if days_late else 0
                }
            else:
                # Fallback if method doesn't exist
                return {
                    'status': 'GREEN',
                    'forecast_date': None,
                    'days_late': 0
                }
        except Exception as e:
            # Return safe default on any error
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f'Error getting schedule status for project {obj.id}: {str(e)}', exc_info=True)
            return {
                'status': 'GREEN',
                'forecast_date': None,
                'days_late': 0
            }

