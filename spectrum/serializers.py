from rest_framework import serializers
from .models import SpectrumJob


class SpectrumJobSerializer(serializers.ModelSerializer):
    """Serializer for SpectrumJob model."""
    
    class Meta:
        model = SpectrumJob
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'last_synced_at']
