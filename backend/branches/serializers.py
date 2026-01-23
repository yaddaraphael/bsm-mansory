from rest_framework import serializers
from .models import Branch, BranchContact


class BranchSerializer(serializers.ModelSerializer):
    # Project counts from Spectrum jobs
    total_projects = serializers.SerializerMethodField()
    active_projects = serializers.SerializerMethodField()
    inactive_projects = serializers.SerializerMethodField()
    
    class Meta:
        model = Branch
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
    
    def get_total_projects(self, obj):
        """Get total project count from Project model for this branch."""
        try:
            from projects.models import Project
            from spectrum.models import SpectrumJob
            from django.db.models import Count
            # Only count Projects that have a corresponding SpectrumJob (imported from Spectrum)
            # This ensures the count matches the dashboard's "Imported Jobs (Spectrum)" count
            valid_job_numbers = SpectrumJob.objects.values_list('job_number', flat=True).distinct()
            return Project.objects.filter(branch=obj).exclude(job_number__isnull=True).exclude(job_number='').filter(job_number__in=valid_job_numbers).aggregate(count=Count('job_number', distinct=True))['count'] or 0
        except Exception:
            return 0
    
    def get_active_projects(self, obj):
        """Get active project count from Project model for this branch."""
        try:
            from projects.models import Project
            from spectrum.models import SpectrumJob
            from django.db.models import Count
            # Only count Projects that have a corresponding SpectrumJob (imported from Spectrum)
            # This ensures the count matches the dashboard's "Imported Jobs (Spectrum)" count
            valid_job_numbers = SpectrumJob.objects.values_list('job_number', flat=True).distinct()
            return Project.objects.filter(branch=obj, status='ACTIVE').exclude(job_number__isnull=True).exclude(job_number='').filter(job_number__in=valid_job_numbers).aggregate(count=Count('job_number', distinct=True))['count'] or 0
        except Exception:
            return 0
    
    def get_inactive_projects(self, obj):
        """Get inactive project count from Project model for this branch."""
        try:
            from projects.models import Project
            from spectrum.models import SpectrumJob
            from django.db.models import Count
            # Only count Projects that have a corresponding SpectrumJob (imported from Spectrum)
            # This ensures the count matches the dashboard's "Imported Jobs (Spectrum)" count
            valid_job_numbers = SpectrumJob.objects.values_list('job_number', flat=True).distinct()
            return Project.objects.filter(branch=obj, status='INACTIVE').exclude(job_number__isnull=True).exclude(job_number='').filter(job_number__in=valid_job_numbers).aggregate(count=Count('job_number', distinct=True))['count'] or 0
        except Exception:
            return 0


class BranchContactSerializer(serializers.ModelSerializer):
    get_role_display = serializers.CharField(source='get_role_display', read_only=True)
    
    class Meta:
        model = BranchContact
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

