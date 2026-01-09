from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q
from .models import SpectrumEmployee, SpectrumProject, SpectrumReport
from .serializers import (
    SpectrumEmployeeSerializer,
    SpectrumProjectSerializer,
    SpectrumReportSerializer
)
from .services import SpectrumSyncService


class SpectrumEmployeeListView(generics.ListAPIView):
    """List all Spectrum employees."""
    serializer_class = SpectrumEmployeeSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = SpectrumEmployee.objects.all()
        
        # Search filter
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(email__icontains=search) |
                Q(employee_id__icontains=search)
            )
        
        # Status filter
        status_filter = self.request.query_params.get('status', None)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Role filter
        role_filter = self.request.query_params.get('role', None)
        if role_filter:
            queryset = queryset.filter(role__icontains=role_filter)
        
        return queryset.order_by('last_name', 'first_name')


class SpectrumProjectListView(generics.ListAPIView):
    """List all Spectrum projects."""
    serializer_class = SpectrumProjectSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = SpectrumProject.objects.all()
        
        # Search filter
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(job_number__icontains=search) |
                Q(client__icontains=search) |
                Q(location__icontains=search)
            )
        
        # Status filter
        status_filter = self.request.query_params.get('status', None)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        return queryset.order_by('-created_at')


class SpectrumReportListView(generics.ListAPIView):
    """List all Spectrum reports."""
    serializer_class = SpectrumReportSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = SpectrumReport.objects.all()
        
        # Search filter
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) |
                Q(report_id__icontains=search) |
                Q(project__icontains=search)
            )
        
        # Type filter
        type_filter = self.request.query_params.get('type', None)
        if type_filter:
            queryset = queryset.filter(report_type=type_filter)
        
        # Status filter
        status_filter = self.request.query_params.get('status', None)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        return queryset.order_by('-created_date', '-created_at')


class SpectrumSyncView(APIView):
    """Sync data from Spectrum API."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        """Trigger sync for employees, projects, or reports."""
        # Only admins can trigger sync
        if request.user.role not in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']:
            return Response(
                {'detail': 'You do not have permission to sync Spectrum data.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        sync_type = request.data.get('type', 'all')  # 'employees', 'projects', 'reports', or 'all'
        sync_service = SpectrumSyncService()
        
        results = {}
        
        if sync_type in ['employees', 'all']:
            results['employees'] = sync_service.sync_employees()
        
        if sync_type in ['projects', 'all']:
            results['projects'] = sync_service.sync_projects()
        
        if sync_type in ['reports', 'all']:
            results['reports'] = sync_service.sync_reports()
        
        return Response({
            'detail': 'Sync completed.',
            'results': results
        }, status=status.HTTP_200_OK)
