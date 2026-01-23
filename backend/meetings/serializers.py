from rest_framework import serializers
from .models import Meeting, MeetingJob, MeetingJobPhase
from accounts.serializers import UserSerializer
from projects.serializers import ProjectSerializer
from branches.serializers import BranchSerializer


class MeetingJobPhaseSerializer(serializers.ModelSerializer):
    """Serializer for MeetingJobPhase model."""
    
    class Meta:
        model = MeetingJobPhase
        fields = [
            'id', 'phase_code', 'phase_description',
            'masons', 'operators', 'labors',
            'quantity', 'installed_quantity', 'duration',
            'percent_complete', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'percent_complete', 'created_at', 'updated_at']


class MeetingJobSerializer(serializers.ModelSerializer):
    """Serializer for MeetingJob model."""
    project = ProjectSerializer(read_only=True)
    project_id = serializers.IntegerField(write_only=True, required=True)
    phases = MeetingJobPhaseSerializer(many=True, read_only=True)
    
    class Meta:
        model = MeetingJob
        fields = [
            'id', 'meeting', 'project', 'project_id',
            'masons', 'labors', 'notes',
            'handoff_from_estimator', 'handoff_to_foreman', 'site_specific_safety_plan',
            'saturdays', 'full_weekends', 'selected_scope',
            'phases',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_project_id(self, value):
        """Validate that the project exists and is active."""
        from projects.models import Project
        try:
            project = Project.objects.get(id=value, status='ACTIVE')
            return value
        except Project.DoesNotExist:
            raise serializers.ValidationError("Project not found or not active.")
    
    def create(self, validated_data):
        """Create MeetingJob with project_id."""
        from projects.models import Project
        project_id = validated_data.pop('project_id')
        project = Project.objects.get(id=project_id)
        validated_data['project'] = project
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """Update MeetingJob with project_id."""
        from projects.models import Project
        if 'project_id' in validated_data:
            project_id = validated_data.pop('project_id')
            project = Project.objects.get(id=project_id)
            validated_data['project'] = project
        return super().update(instance, validated_data)


class MeetingSerializer(serializers.ModelSerializer):
    """Serializer for Meeting model."""
    created_by = UserSerializer(read_only=True)
    branch = BranchSerializer(read_only=True)
    branch_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    meeting_jobs = MeetingJobSerializer(many=True, read_only=True)
    meeting_jobs_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = Meeting
        fields = [
            'id', 'meeting_date', 'created_by', 'branch', 'branch_id',
            'notes', 'status', 'meeting_jobs', 'meeting_jobs_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']
    
    def validate_branch_id(self, value):
        """Validate that the branch exists."""
        if value is None:
            return value
        from branches.models import Branch
        try:
            branch = Branch.objects.get(id=value)
            return value
        except Branch.DoesNotExist:
            raise serializers.ValidationError("Branch not found.")
    
    def create(self, validated_data):
        """Create Meeting with branch_id and created_by."""
        from branches.models import Branch
        # Set created_by from request user
        validated_data['created_by'] = self.context['request'].user
        
        # Handle branch_id
        branch_id = validated_data.pop('branch_id', None)
        if branch_id:
            branch = Branch.objects.get(id=branch_id)
            validated_data['branch'] = branch
        else:
            validated_data['branch'] = None
        
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """Update Meeting with branch_id."""
        from branches.models import Branch
        # Handle branch_id
        if 'branch_id' in validated_data:
            branch_id = validated_data.pop('branch_id')
            if branch_id:
                branch = Branch.objects.get(id=branch_id)
                validated_data['branch'] = branch
            else:
                validated_data['branch'] = None
        
        return super().update(instance, validated_data)


class MeetingJobCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating MeetingJob entries."""
    project_id = serializers.IntegerField(write_only=True, required=True)
    
    class Meta:
        model = MeetingJob
        fields = [
            'id', 'meeting', 'project_id', 'masons', 'labors', 'notes',
            'handoff_from_estimator', 'handoff_to_foreman', 'site_specific_safety_plan',
            'saturdays', 'full_weekends', 'selected_scope'
        ]
        read_only_fields = ['id']
    
    def validate_project_id(self, value):
        """Validate that the project exists and is active."""
        from projects.models import Project
        try:
            project = Project.objects.get(id=value, status='ACTIVE')
            return value
        except Project.DoesNotExist:
            raise serializers.ValidationError("Project not found or not active.")
    
    def create(self, validated_data):
        """Create MeetingJob with project_id."""
        from projects.models import Project
        project_id = validated_data.pop('project_id')
        project = Project.objects.get(id=project_id)
        validated_data['project'] = project
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """Update MeetingJob with project_id."""
        from projects.models import Project
        if 'project_id' in validated_data:
            project_id = validated_data.pop('project_id')
            project = Project.objects.get(id=project_id)
            validated_data['project'] = project
        return super().update(instance, validated_data)


class MeetingJobPhaseCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating MeetingJobPhase entries."""
    
    class Meta:
        model = MeetingJobPhase
        fields = [
            'id', 'meeting_job', 'phase_code', 'phase_description',
            'masons', 'operators', 'labors',
            'quantity', 'installed_quantity', 'duration', 'notes'
        ]
        read_only_fields = ['id']
