from rest_framework import serializers
from .models import Equipment, EquipmentAssignment, EquipmentTransfer
from projects.serializers import ProjectSerializer
from branches.serializers import BranchSerializer
from accounts.serializers import UserSerializer


class EquipmentSerializer(serializers.ModelSerializer):
    cycle_date = serializers.ReadOnlyField()
    current_site = serializers.ReadOnlyField()
    
    class Meta:
        model = Equipment
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class EquipmentAssignmentSerializer(serializers.ModelSerializer):
    project_detail = ProjectSerializer(source='project', read_only=True)
    branch_detail = BranchSerializer(source='branch', read_only=True)
    foreman_detail = UserSerializer(source='foreman', read_only=True)
    
    class Meta:
        model = EquipmentAssignment
        fields = '__all__'


class EquipmentTransferSerializer(serializers.ModelSerializer):
    equipment_detail = EquipmentSerializer(source='equipment', read_only=True)
    from_project_detail = ProjectSerializer(source='from_project', read_only=True)
    to_project_detail = ProjectSerializer(source='to_project', read_only=True)
    sending_foreman_detail = UserSerializer(source='sending_foreman', read_only=True)
    receiving_foreman_detail = UserSerializer(source='receiving_foreman', read_only=True)
    
    class Meta:
        model = EquipmentTransfer
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'receipt_date']

