from rest_framework import serializers
from .models import Branch, BranchContact


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class BranchContactSerializer(serializers.ModelSerializer):
    get_role_display = serializers.CharField(source='get_role_display', read_only=True)
    
    class Meta:
        model = BranchContact
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

