from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Notification

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model."""
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    scope_display = serializers.CharField(source='get_scope_display', read_only=True)
    invited_by_name = serializers.SerializerMethodField()
    role_assigned_by_name = serializers.SerializerMethodField()
    can_invite_users = serializers.SerializerMethodField()
    invitation_email_sent = serializers.BooleanField(read_only=True)
    invitation_email_sent_at = serializers.DateTimeField(read_only=True)
    invitation_email_error = serializers.CharField(read_only=True, allow_null=True)
    is_activated = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'employee_number', 'city', 'phone_number', 'profile_picture',
            'current_location', 'training', 'status', 'role', 'role_display',
            'scope', 'scope_display', 'invited_by', 'invited_by_name',
            'invited_on', 'role_assigned_by', 'role_assigned_by_name',
            'role_assigned_on', 'is_active', 'is_staff', 'is_superuser',
            'date_joined', 'last_login', 'can_invite_users',
            'invitation_email_sent', 'invitation_email_sent_at', 'invitation_email_error',
            'email_verified', 'email_verified_at', 'is_activated', 'division',
        ]
        read_only_fields = ['date_joined', 'last_login', 'is_superuser']
    
    def get_invited_by_name(self, obj):
        if obj.invited_by:
            return obj.invited_by.get_full_name() or obj.invited_by.username
        return None
    
    def get_role_assigned_by_name(self, obj):
        if obj.role_assigned_by:
            return obj.role_assigned_by.get_full_name() or obj.role_assigned_by.username
        return None
    
    def get_can_invite_users(self, obj):
        return obj.can_invite_users()
    
    def get_is_activated(self, obj):
        return obj.last_login is not None
    
    def update(self, instance, validated_data):
        # Handle password separately if provided
        password = validated_data.pop('password', None)
        if password:
            instance.set_password(password)
        
        # Update other fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        instance.save()
        return instance


class InviteUserSerializer(serializers.ModelSerializer):
    """Serializer for inviting new users."""
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    
    class Meta:
        model = User
        fields = [
            'username', 'email', 'first_name', 'last_name',
            'employee_number', 'city', 'phone_number', 'status',
            'role', 'scope', 'division', 'password'
        ]
        extra_kwargs = {'username': {'required': False}}  # Make username optional
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Add division field dynamically with proper queryset
        from branches.models import Branch
        from rest_framework import serializers as drf_serializers
        if 'division' in self.fields:
            self.fields['division'] = drf_serializers.PrimaryKeyRelatedField(
                queryset=Branch.objects.filter(status='ACTIVE'),
                required=False,
                allow_null=True,
                help_text="Division/Branch assignment (required for Branch Managers)"
            )
    
    def generate_employee_number(self):
        """Generate unique employee number from year, month, date."""
        from datetime import datetime
        now = datetime.now()
        date_str = f"{now.year}{now.month:02d}{now.day:02d}"
        
        # Find existing employees with same date prefix
        existing = User.objects.filter(employee_number__startswith=date_str).count()
        sequence = existing + 1
        
        return f"{date_str}{sequence:03d}"
    
    def create(self, validated_data):
        email = validated_data.get('email')
        if not validated_data.get('username') and email:
            # Auto-generate username from email
            base_username = email.split('@')[0]
            username = base_username
            counter = 1
            while User.objects.filter(username=username).exists():
                username = f"{base_username}{counter}"
                counter += 1
            validated_data['username'] = username
        
        # Auto-generate employee number if not provided
        if not validated_data.get('employee_number'):
            validated_data['employee_number'] = self.generate_employee_number()
            # Ensure uniqueness
            while User.objects.filter(employee_number=validated_data['employee_number']).exists():
                # If exists, increment sequence
                existing = User.objects.filter(employee_number__startswith=validated_data['employee_number'][:8]).count()
                from datetime import datetime
                now = datetime.now()
                date_str = f"{now.year}{now.month:02d}{now.day:02d}"
                validated_data['employee_number'] = f"{date_str}{existing + 1:03d}"
        
        # Don't set password - user will set it via activation link
        # Set user as inactive until they activate (except root superadmin)
        # Root superadmin is always active
        if validated_data.get('role') != 'ROOT_SUPERADMIN':
            validated_data['is_active'] = False
        password = validated_data.pop('password', None)
        
        # Create user without password (they'll set it via activation)
        user = User.objects.create_user(**validated_data)
        # Set unusable password so they must use activation
        user.set_unusable_password()
        user.save()
        
        return user


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for notifications."""
    
    class Meta:
        model = Notification
        fields = [
            'id', 'type', 'title', 'message', 'link',
            'is_read', 'created_at', 'read_at'
        ]
        read_only_fields = ['created_at', 'read_at']


class ProjectAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for project assignments."""
    employee_detail = UserSerializer(source='employee', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    project_job_number = serializers.CharField(source='project.job_number', read_only=True)
    assigned_by_name = serializers.SerializerMethodField()
    
    class Meta:
        from .models import ProjectAssignment
        model = ProjectAssignment
        fields = [
            'id', 'employee', 'employee_detail', 'project', 'project_name',
            'project_job_number', 'scope', 'start_date', 'end_date',
            'assigned_by', 'assigned_by_name', 'reason', 'status',
            'created_at'
        ]
        read_only_fields = ['created_at', 'assigned_by']
    
    def get_assigned_by_name(self, obj):
        if obj.assigned_by:
            return obj.assigned_by.get_full_name() or obj.assigned_by.username
        return None
