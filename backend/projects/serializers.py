#backend/projects/serializers.py
from __future__ import annotations

from rest_framework import serializers

from .models import Project, ProjectScope, DailyReport, WeeklyChecklist, LaborEntry, ScopeType, Foreman
from accounts.serializers import UserSerializer
from branches.serializers import BranchSerializer


class ScopeTypeSerializer(serializers.ModelSerializer):
    """Serializer for ScopeType model. Code is auto-generated from name."""
    
    class Meta:
        model = ScopeType
        fields = ['id', 'code', 'name', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['code', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        """Auto-generate code from name if not provided."""
        name = validated_data.get('name', '')
        if name and not validated_data.get('code'):
            # Generate code from name: uppercase, replace spaces with underscores
            validated_data['code'] = name.upper().replace(' ', '_').replace('-', '_')
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """Auto-update code if name changes."""
        if 'name' in validated_data and validated_data['name'] != instance.name:
            # Regenerate code from new name
            validated_data['code'] = validated_data['name'].upper().replace(' ', '_').replace('-', '_')
        return super().update(instance, validated_data)


class ForemanSerializer(serializers.ModelSerializer):
    """Serializer for Foreman model."""
    
    class Meta:
        model = Foreman
        fields = ['id', 'name', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class ProjectScopeSerializer(serializers.ModelSerializer):
    """Serializer for ProjectScope model with all fields."""
    scope_type_detail = ScopeTypeSerializer(source='scope_type', read_only=True)
    scope_type_id = serializers.IntegerField(write_only=True, required=True)
    foreman_detail = ForemanSerializer(source='foreman', read_only=True)
    foreman_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    
    remaining = serializers.ReadOnlyField()
    percent_complete = serializers.ReadOnlyField()
    quantity = serializers.ReadOnlyField()  # Alias for qty_sq_ft for backward compatibility

    class Meta:
        model = ProjectScope
        fields = [
            'id', 'project', 'scope_type', 'scope_type_id', 'scope_type_detail',
            'description', 'estimation_start_date', 'estimation_end_date', 'duration_days',
            'saturdays', 'full_weekends', 'qty_sq_ft', 'quantity', 'installed', 'remaining',
            'percent_complete', 'foreman', 'foreman_id', 'foreman_detail',
            'masons', 'tenders', 'operators', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'remaining', 'percent_complete', 'quantity', 'scope_type', 'foreman', 'installed']
        extra_kwargs = {
            'scope_type': {'required': False},
            'foreman': {'required': False},
        }
    
    def validate_scope_type_id(self, value):
        """Validate that the scope type exists and is active."""
        try:
            scope_type = ScopeType.objects.get(id=value, is_active=True)
            return value
        except ScopeType.DoesNotExist:
            raise serializers.ValidationError("Scope type not found or inactive.")
    
    def validate_foreman_id(self, value):
        """Validate that the foreman exists and is active."""
        if value is None:
            return value
        try:
            foreman = Foreman.objects.get(id=value, is_active=True)
            return value
        except Foreman.DoesNotExist:
            raise serializers.ValidationError("Foreman not found or inactive.")
    
    def validate_qty_sq_ft(self, value):
        """Validate that qty_sq_ft is provided and positive."""
        if value is None:
            raise serializers.ValidationError("Initial quantity (qty_sq_ft) is required.")
        if value < 0:
            raise serializers.ValidationError("Initial quantity must be positive.")
        return value
    
    def create(self, validated_data):
        """Create ProjectScope with scope_type_id and foreman_id."""
        scope_type_id = validated_data.pop('scope_type_id')
        foreman_id = validated_data.pop('foreman_id', None)
        
        scope_type = ScopeType.objects.get(id=scope_type_id)
        validated_data['scope_type'] = scope_type
        
        if foreman_id:
            foreman = Foreman.objects.get(id=foreman_id)
            validated_data['foreman'] = foreman
        else:
            validated_data['foreman'] = None
        
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """Update ProjectScope with scope_type_id and foreman_id."""
        if 'scope_type_id' in validated_data:
            scope_type_id = validated_data.pop('scope_type_id')
            scope_type = ScopeType.objects.get(id=scope_type_id)
            validated_data['scope_type'] = scope_type
        
        if 'foreman_id' in validated_data:
            foreman_id = validated_data.pop('foreman_id')
            if foreman_id:
                foreman = Foreman.objects.get(id=foreman_id)
                validated_data['foreman'] = foreman
            else:
                validated_data['foreman'] = None
        
        return super().update(instance, validated_data)


class ProjectListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the projects list.

    IMPORTANT: This is optimized for performance:
    - No scopes (avoid huge payloads)
    - No properties that trigger per-row aggregates
    - Spectrum-related fields are expected to be annotated in queryset
    """
    branch_detail = BranchSerializer(source='branch', read_only=True)
    project_manager_detail = UserSerializer(source='project_manager', read_only=True)

    # These are expected to be annotated in the queryset; we keep fallback logic for safety.
    spectrum_status_code = serializers.SerializerMethodField()
    projected_complete_date = serializers.SerializerMethodField()
    actual_complete_date = serializers.SerializerMethodField()
    job_description = serializers.SerializerMethodField()
    spectrum_project_manager_name = serializers.SerializerMethodField()

    # Annotated numeric fields (use SerializerMethodField to avoid property conflicts)
    total_quantity = serializers.SerializerMethodField()
    total_installed = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()
    production_percent_complete = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            'id',
            'job_number',
            'name',
            'status',
            'branch',
            'branch_detail',
            'project_manager',
            'project_manager_detail',
            'spectrum_status_code',
            'job_description',
            'spectrum_project_manager_name',
            'projected_complete_date',
            'actual_complete_date',
            'total_quantity',
            'total_installed',
            'remaining',
            'production_percent_complete',
            'updated_at',
        ]
        read_only_fields = ['job_number', 'created_at', 'updated_at']

    def get_spectrum_status_code(self, obj: Project):
        return getattr(obj, 'spectrum_status_code', None) or getattr(obj, 'spectrum_status_code_annot', None)

    def get_job_description(self, obj: Project):
        return getattr(obj, 'job_description', None) or getattr(obj, 'job_description_annot', None)

    def get_spectrum_project_manager_name(self, obj: Project):
        if getattr(obj, 'spectrum_project_manager', None):
            return obj.spectrum_project_manager
        return getattr(obj, 'spectrum_pm_name_annot', None)

    def get_projected_complete_date(self, obj: Project):
        if getattr(obj, 'spectrum_projected_complete_date', None):
            return obj.spectrum_projected_complete_date
        return getattr(obj, 'projected_complete_date_annot', None)

    def get_actual_complete_date(self, obj: Project):
        if getattr(obj, 'spectrum_complete_date', None):
            return obj.spectrum_complete_date
        return getattr(obj, 'actual_complete_date_annot', None)

    def get_total_quantity(self, obj: Project):
        # Use annotated value from queryset (with _annot suffix to avoid property conflict)
        if hasattr(obj, 'total_quantity_annot'):
            val = getattr(obj, 'total_quantity_annot', None)
            return float(val) if val is not None else None
        # Fallback to property if annotation not available
        try:
            return float(obj.total_quantity) if obj.total_quantity is not None else None
        except (AttributeError, TypeError, ValueError):
            return None

    def get_total_installed(self, obj: Project):
        if hasattr(obj, 'total_installed_annot'):
            val = getattr(obj, 'total_installed_annot', None)
            return float(val) if val is not None else None
        try:
            return float(obj.total_installed) if obj.total_installed is not None else None
        except (AttributeError, TypeError, ValueError):
            return None

    def get_remaining(self, obj: Project):
        if hasattr(obj, 'remaining_annot'):
            val = getattr(obj, 'remaining_annot', None)
            return float(val) if val is not None else None
        try:
            return float(obj.remaining) if obj.remaining is not None else None
        except (AttributeError, TypeError, ValueError):
            return None

    def get_production_percent_complete(self, obj: Project):
        if hasattr(obj, 'production_percent_complete_annot'):
            val = getattr(obj, 'production_percent_complete_annot', None)
            return float(val) if val is not None else None
        try:
            return float(obj.production_percent_complete) if obj.production_percent_complete is not None else None
        except (AttributeError, TypeError, ValueError):
            return None


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

    spectrum_status_code = serializers.SerializerMethodField()
    projected_complete_date = serializers.SerializerMethodField()
    actual_complete_date = serializers.SerializerMethodField()
    job_description = serializers.SerializerMethodField()
    spectrum_project_manager_name = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'job_number']

    # ---- Spectrum fields ----
    # We expect these to be annotated in queryset to avoid N+1 queries.
    # For safety on non-annotated objects (e.g. admin usage), we fall back to querying once.

    def get_spectrum_status_code(self, obj: Project):
        value = getattr(obj, 'spectrum_status_code', None) or getattr(obj, 'spectrum_status_code_annot', None)
        if value is not None:
            return value
        try:
            from spectrum.models import SpectrumJob
            row = SpectrumJob.objects.filter(job_number=obj.job_number).values('status_code').first()
            return row['status_code'] if row else None
        except Exception:
            return None

    def get_job_description(self, obj: Project):
        value = getattr(obj, 'job_description', None) or getattr(obj, 'job_description_annot', None)
        if value is not None:
            return value
        try:
            from spectrum.models import SpectrumJob
            row = SpectrumJob.objects.filter(job_number=obj.job_number).values('job_description').first()
            return row['job_description'] if row else None
        except Exception:
            return None

    def get_spectrum_project_manager_name(self, obj: Project):
        if obj.spectrum_project_manager:
            return obj.spectrum_project_manager

        value = getattr(obj, 'spectrum_pm_name_annot', None)
        if value is not None:
            return value

        try:
            from spectrum.models import SpectrumJob
            row = SpectrumJob.objects.filter(job_number=obj.job_number).values('project_manager').first()
            return row['project_manager'] if row else None
        except Exception:
            return None

    def get_projected_complete_date(self, obj: Project):
        if obj.spectrum_projected_complete_date:
            return obj.spectrum_projected_complete_date

        value = getattr(obj, 'projected_complete_date_annot', None)
        if value is not None:
            return value

        try:
            from spectrum.models import SpectrumJobDates
            row = SpectrumJobDates.objects.filter(job_number=obj.job_number).values('projected_complete_date').first()
            return row['projected_complete_date'] if row else None
        except Exception:
            return None

    def get_actual_complete_date(self, obj: Project):
        if obj.spectrum_complete_date:
            return obj.spectrum_complete_date

        value = getattr(obj, 'actual_complete_date_annot', None)
        if value is not None:
            return value

        try:
            from spectrum.models import SpectrumJobDates
            row = SpectrumJobDates.objects.filter(job_number=obj.job_number).values('complete_date').first()
            return row['complete_date'] if row else None
        except Exception:
            return None

    def get_schedule_status(self, obj: Project):
        status, forecast_date, days_late = obj.get_schedule_status()
        return {
            'status': status,
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

    def get_employee_name(self, obj: LaborEntry):
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
        labor_entries_data = validated_data.pop('labor_entries', [])
        report = DailyReport.objects.create(**validated_data)
        for entry_data in labor_entries_data:
            LaborEntry.objects.create(daily_report=report, **entry_data)
        return report

    def update(self, instance, validated_data):
        labor_entries_data = validated_data.pop('labor_entries', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if labor_entries_data is not None:
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
    """Simplified serializer for public project views."""
    branch_name = serializers.SerializerMethodField()
    branch_code = serializers.SerializerMethodField()
    job_description = serializers.SerializerMethodField()
    spectrum_status_code = serializers.SerializerMethodField()

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
            'id', 'name', 'job_number', 'job_description', 'spectrum_status_code', 'branch_name', 'branch_code',
            'start_date', 'estimated_end_date', 'duration',
            'status', 'is_public', 'public_pin',
            'production_percent_complete', 'financial_percent_complete',
            'total_quantity', 'total_installed', 'remaining',
            'schedule_status', 'scopes', 'notes',
            'created_at', 'updated_at', 'client_name', 'work_location'
        ]
        read_only_fields = ['created_at', 'updated_at', 'job_number']

    def get_branch_name(self, obj: Project):
        return obj.branch.name if obj.branch else None

    def get_branch_code(self, obj: Project):
        return obj.branch.code if obj.branch else None

    def get_job_description(self, obj: Project):
        return getattr(obj, 'job_description', None) or getattr(obj, 'job_description_annot', None)

    def get_spectrum_status_code(self, obj: Project):
        return getattr(obj, 'spectrum_status_code', None) or getattr(obj, 'spectrum_status_code_annot', None)

    def get_estimated_end_date(self, obj: Project):
        try:
            date = getattr(obj, 'estimated_end_date', None)
            return date.isoformat() if date else None
        except Exception:
            return None

    # NOTE: If list query annotates total_quantity/total_installed/remaining/production_percent_complete,
    # these methods become O(1) (no per-project aggregate queries).
    def get_total_quantity(self, obj: Project):
        try:
            value = getattr(obj, 'total_quantity', None)
            return float(value) if value else 0.0
        except Exception:
            return 0.0

    def get_total_installed(self, obj: Project):
        try:
            value = getattr(obj, 'total_installed', None)
            return float(value) if value else 0.0
        except Exception:
            return 0.0

    def get_remaining(self, obj: Project):
        try:
            value = getattr(obj, 'remaining', None)
            return float(value) if value else 0.0
        except Exception:
            return 0.0

    def get_production_percent_complete(self, obj: Project):
        try:
            value = getattr(obj, 'production_percent_complete', None)
            return float(value) if value else 0.0
        except Exception:
            return 0.0

    def get_financial_percent_complete(self, obj: Project):
        return None

    def get_schedule_status(self, obj: Project):
        try:
            if hasattr(obj, 'get_schedule_status'):
                status, forecast_date, days_late = obj.get_schedule_status()
                return {
                    'status': status or 'GREEN',
                    'days_late': int(days_late) if days_late else 0
                }
            return {'status': 'GREEN', 'days_late': 0}
        except Exception:
            return {'status': 'GREEN', 'days_late': 0}
