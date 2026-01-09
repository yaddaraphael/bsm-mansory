from rest_framework import serializers
from .models import SpectrumEmployee, SpectrumProject, SpectrumReport


class SpectrumEmployeeSerializer(serializers.ModelSerializer):
    """Serializer for Spectrum Employee."""
    full_name = serializers.ReadOnlyField()
    
    class Meta:
        model = SpectrumEmployee
        fields = [
            'id', 'spectrum_id', 'employee_id', 'first_name', 'last_name',
            'full_name', 'email', 'phone', 'role', 'status',
            'last_synced_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'last_synced_at', 'created_at', 'updated_at']


class SpectrumProjectSerializer(serializers.ModelSerializer):
    """Serializer for Spectrum Project."""
    
    class Meta:
        model = SpectrumProject
        fields = [
            'id', 'spectrum_id', 'project_id', 'job_number', 'name',
            'client', 'location', 'status', 'start_date', 'end_date',
            'last_synced_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'last_synced_at', 'created_at', 'updated_at']


class SpectrumReportSerializer(serializers.ModelSerializer):
    """Serializer for Spectrum Report."""
    
    class Meta:
        model = SpectrumReport
        fields = [
            'id', 'spectrum_id', 'report_id', 'title', 'report_type',
            'project', 'project_id', 'status', 'created_date',
            'last_synced_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'last_synced_at', 'created_at', 'updated_at']
