from rest_framework import serializers
from .models import TimeEntry, TimeCorrectionRequest, PayPeriod
from accounts.serializers import UserSerializer
from projects.serializers import ProjectSerializer


class TimeEntrySerializer(serializers.ModelSerializer):
    employee_detail = UserSerializer(source='employee', read_only=True)
    project_detail = ProjectSerializer(source='project', read_only=True)
    approved_by_detail = UserSerializer(source='approved_by', read_only=True)
    total_hours = serializers.ReadOnlyField()
    is_clocked_in = serializers.ReadOnlyField()
    regular_hours = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True, allow_null=True)
    overtime_hours = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True, allow_null=True)
    
    class Meta:
        model = TimeEntry
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'approved_on']


class TimeCorrectionRequestSerializer(serializers.ModelSerializer):
    employee_detail = UserSerializer(source='employee', read_only=True)
    project_detail = ProjectSerializer(source='project', read_only=True)
    reviewed_by_detail = UserSerializer(source='reviewed_by', read_only=True)
    
    class Meta:
        model = TimeCorrectionRequest
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'reviewed_on']


class PayPeriodSerializer(serializers.ModelSerializer):
    locked_by_detail = UserSerializer(source='locked_by', read_only=True)
    
    class Meta:
        model = PayPeriod
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'locked_on']

