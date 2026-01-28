from rest_framework import viewsets, status, generics
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from django.utils import timezone
from django.db.models import Q

from django.db.models import OuterRef, Subquery, Sum, Value, FloatField, DecimalField, F, Case, When, ExpressionWrapper
from django.db.models.functions import Coalesce
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.conf import settings
from datetime import datetime
import os
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.contrib.auth import get_user_model
from .models import Project, ProjectScope, DailyReport, WeeklyChecklist, LaborEntry, SCOPE_OF_WORK_CHOICES, ScopeType, Foreman
from .serializers import (
    ProjectSerializer, ProjectListSerializer, ProjectScopeSerializer,
    DailyReportSerializer, WeeklyChecklistSerializer,
    PublicProjectSerializer, LaborEntrySerializer,
    ScopeTypeSerializer, ForemanSerializer
)
from .utils import generate_job_number
from .permissions import ProjectViewSetPermission
from .pagination import StandardResultsSetPagination
from audit.utils import log_action
from branches.models import Branch
from django.contrib.auth.hashers import check_password

User = get_user_model()



def _annotated_projects_queryset(*, include_scopes: bool):
    """Base queryset for projects endpoints.

    Fixes major performance problems:
    - Removes N+1 queries caused by serializer method fields that hit Spectrum tables
    - Removes N+1 queries caused by Project.total_quantity/total_installed/... properties (aggregates per row)
    - Adds select_related/prefetch_related for nested serializers
    """
    # Spectrum subqueries (1 query total)
    from spectrum.models import SpectrumJob, SpectrumJobDates

    spectrum_job_qs = SpectrumJob.objects.filter(job_number=OuterRef('job_number'))
    spectrum_dates_qs = SpectrumJobDates.objects.filter(job_number=OuterRef('job_number'))

    # Decimal output fields for aggregates
    dec_field = DecimalField(max_digits=12, decimal_places=2)
    zero_dec = Value(0, output_field=dec_field)

    qs = (
        Project.objects.exclude(job_number__isnull=True)
        .exclude(job_number='')
        .select_related(
            'branch',
            'project_manager',
            'superintendent',
            'foreman',
            'general_contractor',
        )
    )

    if include_scopes:
        qs = qs.prefetch_related('scopes')

    # Aggregate scope totals ONCE (instead of per project property call)
    # Use _annot suffix to avoid conflicts with @property methods
    qs = qs.annotate(
        total_quantity_annot=Coalesce(Sum('scopes__qty_sq_ft'), zero_dec),
        total_installed_annot=Coalesce(Sum('scopes__installed'), zero_dec),
    ).annotate(
        remaining_annot=Case(
            When(total_quantity_annot__gt=F('total_installed_annot'), then=F('total_quantity_annot') - F('total_installed_annot')),
            default=zero_dec,
            output_field=dec_field,
        ),
        production_percent_complete_annot=Case(
            When(total_quantity_annot=0, then=Value(0.0)),
            default=ExpressionWrapper(
                (F('total_installed_annot') * Value(100.0)) / F('total_quantity_annot'),
                output_field=FloatField(),
            ),
            output_field=FloatField(),
        ),
    )

    # Spectrum fields via subquery annotations (avoid per-object DB hits)
    qs = qs.annotate(
        spectrum_status_code_annot=Subquery(spectrum_job_qs.values('status_code')[:1]),
        job_description_annot=Subquery(spectrum_job_qs.values('job_description')[:1]),
        spectrum_pm_name_annot=Subquery(spectrum_job_qs.values('project_manager')[:1]),
        projected_complete_date_annot=Subquery(spectrum_dates_qs.values('projected_complete_date')[:1]),
        actual_complete_date_annot=Subquery(spectrum_dates_qs.values('complete_date')[:1]),
    )

    return qs


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [ProjectViewSetPermission]

    # ✅ backend filtering + search + ordering
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'branch', 'is_public', 'project_manager']
    search_fields = ['job_number', 'name', 'branch__name']
    ordering_fields = ['updated_at', 'created_at', 'name', 'job_number', 'id']
    ordering = ['-updated_at']

    # ✅ enable pagination (frontend now requests page/page_size)
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        include_scopes = self.action in {'retrieve', 'create', 'update', 'partial_update'}
        return _annotated_projects_queryset(include_scopes=include_scopes)

    def get_serializer_class(self):
        if self.action == 'list':
            return ProjectListSerializer
        return ProjectSerializer

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def statistics(self, request):
        """
        Get project statistics.
        For branch managers: stats for their division only
        For admins/superadmins: stats for all projects or filtered by branch
        """
        from django.db.models import Count, Q
        from spectrum.models import SpectrumJob

        user = request.user
        branch_id = request.query_params.get('branch', None)

        # Use a subquery (does not materialize in Python)
        valid_job_numbers = SpectrumJob.objects.values_list('job_number', flat=True).distinct()
        base_queryset = Project.objects.exclude(job_number__isnull=True).exclude(job_number='').filter(
            job_number__in=valid_job_numbers
        )

        if user.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']:
            queryset = base_queryset
        elif user.role == 'BRANCH_MANAGER':
            queryset = base_queryset.filter(branch=user.division) if user.division else Project.objects.none()
        elif user.role == 'PROJECT_MANAGER':
            queryset = base_queryset.filter(project_manager=user)
        else:
            queryset = Project.objects.none()

        if branch_id:
            try:
                queryset = queryset.filter(branch_id=branch_id)
            except ValueError:
                pass

        stats = queryset.aggregate(
            total=Count('id', distinct=True),
            active=Count('id', filter=Q(status='ACTIVE'), distinct=True),
            inactive=Count('id', filter=Q(status='INACTIVE'), distinct=True),
            completed=Count('id', filter=Q(status='COMPLETED'), distinct=True),
        )

        if branch_id:
            try:
                branch = Branch.objects.filter(id=branch_id).first()
                if branch:
                    stats['branch_name'] = branch.name
            except Exception:
                pass

        return Response(stats)
class ProjectScopeViewSet(viewsets.ModelViewSet):
    queryset = ProjectScope.objects.all().select_related('scope_type', 'foreman', 'project')
    serializer_class = ProjectScopeSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['project', 'scope_type']
    
    def get_queryset(self):
        """Filter scopes based on project access."""
        queryset = super().get_queryset()
        project_id = self.request.query_params.get('project', None)
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset


class ScopeTypeViewSet(viewsets.ModelViewSet):
    """ViewSet for managing scope types."""
    queryset = ScopeType.objects.filter(is_active=True).order_by('name')
    serializer_class = ScopeTypeSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_active']
    
    def get_queryset(self):
        """Allow admins to see inactive scope types."""
        user = self.request.user
        if user.role in ['ROOT_SUPERADMIN', 'ADMIN']:
            return ScopeType.objects.all().order_by('name')
        return ScopeType.objects.filter(is_active=True).order_by('name')


class ForemanViewSet(viewsets.ModelViewSet):
    """ViewSet for managing foremen."""
    queryset = Foreman.objects.filter(is_active=True).order_by('name')
    serializer_class = ForemanSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_active']
    
    def get_queryset(self):
        """Allow admins to see inactive foremen."""
        user = self.request.user
        if user.role in ['ROOT_SUPERADMIN', 'ADMIN']:
            return Foreman.objects.all().order_by('name')
        return Foreman.objects.filter(is_active=True).order_by('name')


class DailyReportViewSet(viewsets.ModelViewSet):
    queryset = DailyReport.objects.all()
    serializer_class = DailyReportSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['project', 'status', 'date', 'foreman', 'phase']
    search_fields = ['project__job_number', 'project__name', 'foreman__username', 'foreman__first_name', 'foreman__last_name', 'report_number', 'phase']
    
    def get_queryset(self):
        """Filter reports based on user role."""
        user = self.request.user
        queryset = super().get_queryset()
        
        # Foremen can only see their own reports
        if user.role == 'FOREMAN':
            queryset = queryset.filter(foreman=user)
        
        # Project Managers can see reports for their projects
        elif user.role == 'PROJECT_MANAGER':
            queryset = queryset.filter(project__project_manager=user)
        
        # Superintendents can see reports for their projects
        elif user.role == 'SUPERINTENDENT':
            queryset = queryset.filter(project__superintendent=user)
        
        # General Contractors can see reports for their projects
        elif user.role == 'GENERAL_CONTRACTOR':
            queryset = queryset.filter(project__general_contractor=user)
        
        # Root Superadmin, Superadmin, Admin, HR, Finance can see all
        # (no filtering needed)
        
        return queryset
    
    def perform_create(self, serializer):
        # Get status from request data, default to DRAFT if not provided
        status = self.request.data.get('status', 'DRAFT')
        # Set status in validated_data
        serializer.validated_data['status'] = status
        # Set foreman and completed_at
        serializer.validated_data['foreman'] = self.request.user
        serializer.validated_data['completed_at'] = timezone.now()
        
        # Save the report (serializer.create will handle labor_entries)
        report = serializer.save()
        
        # Log the creation
        log_action(
            user=self.request.user,
            action='CREATE',
            obj=report,
            reason=f"Created daily report for project {report.project.job_number}",
            request=self.request
        )
    
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit daily report for approval."""
        report = self.get_object()
        if report.status != 'DRAFT':
            return Response(
                {'error': 'Report already submitted'},
                status=status.HTTP_400_BAD_REQUEST
            )
        old_status = report.status
        report.status = 'SUBMITTED'
        report.save()
        
        # Log the submission
        log_action(
            user=request.user,
            action='SUBMIT',
            obj=report,
            field_name='status',
            old_value=old_status,
            new_value='SUBMITTED',
            reason="Submitted daily report for approval",
            request=request
        )
        
        # Create notifications for relevant project personnel
        from accounts.models import Notification
        from django.contrib.contenttypes.models import ContentType
        project = report.project
        
        # Get users who should be notified
        notified_users = []
        
        # Project Manager
        if project.project_manager:
            notified_users.append(project.project_manager)
        
        # General Contractor
        if project.general_contractor:
            notified_users.append(project.general_contractor)
        
        # Superintendent
        if project.superintendent:
            notified_users.append(project.superintendent)
        
        # Remove duplicates and the foreman who submitted
        notified_users = list(set(notified_users))
        if request.user in notified_users:
            notified_users.remove(request.user)
        
        # Get content type for DailyReport
        content_type = ContentType.objects.get_for_model(DailyReport)
        foreman_name = report.foreman.get_full_name() if report.foreman else "A foreman"
        
        # Create notifications
        for user in notified_users:
            Notification.objects.create(
                user=user,
                title='Daily Report Submitted',
                message=f'{foreman_name} submitted a daily report for {project.job_number} - {project.name}',
                type='REPORT_SUBMITTED',
                content_type=content_type,
                object_id=report.id,
                link=f'/reports/daily/{report.id}'
            )
        
        return Response(DailyReportSerializer(report).data)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve daily report."""
        report = self.get_object()
        
        # Check if user has permission to approve
        user_role = request.user.role
        can_approve = user_role in [
            'ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 
            'PROJECT_MANAGER', 'SUPERINTENDENT', 'GENERAL_CONTRACTOR'
        ]
        
        if not can_approve:
            return Response(
                {'error': 'You do not have permission to approve reports'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if report.status != 'SUBMITTED':
            return Response(
                {'error': 'Report must be submitted first'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        old_status = report.status
        approval_description = request.data.get('description', '').strip()
        report.status = 'APPROVED'
        report.approved_by = request.user
        report.approved_on = timezone.now()
        # Store approval description in rejection_reason field if not already used, or use notes
        if approval_description:
            # We'll store it in a JSON field or use notes field
            # For now, append to notes if exists, otherwise store in notes
            if report.notes:
                report.notes = f"{report.notes}\n\n[Approval Note]: {approval_description}"
            else:
                report.notes = f"[Approval Note]: {approval_description}"
        report.save()
        
        # Update project quantities and progress when report is approved
        self._update_project_from_report(report)
        
        # Log the approval
        log_action(
            user=request.user,
            action='APPROVE',
            obj=report,
            field_name='status',
            old_value=old_status,
            new_value='APPROVED',
            reason=approval_description or 'Daily report approved',
            request=request
        )
        
        return Response(DailyReportSerializer(report).data)
    
    def _update_project_from_report(self, report):
        """Update project installed quantities and progress from approved daily report."""
        from .models import ProjectScope
        from decimal import Decimal
        
        project = report.project
        
        # Track which scopes we've updated to avoid double counting
        updated_scopes = set()
        
        # Update installed quantities from labor entries
        for labor_entry in report.labor_entries.all():
            if labor_entry.quantity and labor_entry.phase:
                # Try to match phase to a project scope
                # Phase format might be like "4210 - CMU- Labor" or just scope type
                scope_type = None
                matching_scope = None
                
                # First, try to find scope by matching the phase string directly
                # The phase might contain the scope type or scope description
                for scope_choice in SCOPE_OF_WORK_CHOICES:
                    scope_code = scope_choice[0]
                    scope_name = scope_choice[1]
                    # Check if phase contains the scope code or name
                    if scope_code in labor_entry.phase.upper() or scope_name.upper() in labor_entry.phase.upper():
                        # Try to get the scope
                        try:
                            matching_scope = ProjectScope.objects.get(project=project, scope_type=scope_code)
                            scope_type = scope_code
                            break
                        except ProjectScope.DoesNotExist:
                            continue
                
                # If no match found, try to find by partial match in existing scopes
                if not matching_scope:
                    # Get all scopes for this project
                    project_scopes = ProjectScope.objects.filter(project=project)
                    for scope in project_scopes:
                        # Check if phase contains scope type or description
                        if scope.scope_type in labor_entry.phase.upper() or scope.get_scope_type_display().upper() in labor_entry.phase.upper():
                            matching_scope = scope
                            scope_type = scope.scope_type
                            break
                
                # Update the scope if found
                if matching_scope and scope_type:
                    if scope_type not in updated_scopes:
                        matching_scope.installed = (matching_scope.installed or Decimal('0')) + Decimal(str(labor_entry.quantity))
                        matching_scope.save()
                        updated_scopes.add(scope_type)
        
        # Also update from installed_quantities field if present
        if report.installed_quantities:
            for scope_type, quantity in report.installed_quantities.items():
                if quantity and quantity > 0:
                    try:
                        scope = ProjectScope.objects.get(project=project, scope_type=scope_type)
                        # Only update if not already updated from labor entries
                        if scope_type not in updated_scopes:
                            scope.installed = (scope.installed or Decimal('0')) + Decimal(str(quantity))
                            scope.save()
                            updated_scopes.add(scope_type)
                    except ProjectScope.DoesNotExist:
                        # Scope doesn't exist, skip
                        pass
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject daily report."""
        report = self.get_object()
        
        # Check if user has permission to reject
        user_role = request.user.role
        can_reject = user_role in [
            'ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 
            'PROJECT_MANAGER', 'SUPERINTENDENT', 'GENERAL_CONTRACTOR'
        ]
        
        if not can_reject:
            return Response(
                {'error': 'You do not have permission to reject reports'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        rejection_reason = request.data.get('reason', '')
        old_status = report.status
        report.status = 'REJECTED'
        report.rejection_reason = rejection_reason
        report.save()
        
        # Log the rejection
        log_action(
            user=request.user,
            action='REJECT',
            obj=report,
            field_name='status',
            old_value=old_status,
            new_value='REJECTED',
            reason=rejection_reason or 'Daily report rejected',
            request=request
        )
        
        return Response(DailyReportSerializer(report).data)
    
    def perform_destroy(self, instance):
        """Log project deletion before destroying."""
        log_action(
            user=self.request.user,
            action='DELETE',
            obj=instance,
            reason=f"Deleted project {instance.job_number}",
            request=self.request
        )
        super().perform_destroy(instance)
    
    def destroy(self, request, *args, **kwargs):
        """Delete daily report. Only root superadmin/superadmin can delete approved reports."""
        report = self.get_object()
        user = request.user
        
        # Check if report is approved
        if report.status == 'APPROVED':
            # Only root superadmin and superadmin can delete approved reports
            if user.role not in ['ROOT_SUPERADMIN', 'SUPERADMIN']:
                return Response(
                    {'error': 'Only superadmins can delete approved reports'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        # Foremen can delete their own draft/submitted reports
        elif user.role == 'FOREMAN' and report.foreman != user:
            return Response(
                {'error': 'You can only delete your own reports'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Log the deletion before destroying
        log_action(
            user=user,
            action='DELETE',
            obj=report,
            reason=f"Deleted daily report {report.report_number or report.id}",
            request=request
        )
        
        return super().destroy(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'])
    def upload_photo(self, request, pk=None):
        """Upload a photo for daily report."""
        report = self.get_object()
        
        if 'photo' not in request.FILES:
            return Response(
                {'error': 'No photo file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        photo_file = request.FILES['photo']
        
        # Validate file type
        allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
        if photo_file.content_type not in allowed_types:
            return Response(
                {'error': 'Invalid file type. Only images are allowed.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create daily_reports directory if it doesn't exist
        daily_reports_dir = os.path.join(settings.MEDIA_ROOT, 'daily_reports')
        os.makedirs(daily_reports_dir, exist_ok=True)
        
        # Generate unique filename
        file_extension = os.path.splitext(photo_file.name)[1]
        filename = f'daily_report_{report.id}_{timezone.now().strftime("%Y%m%d_%H%M%S")}_{photo_file.name}'
        file_path = os.path.join('daily_reports', filename)
        
        # Save file
        saved_path = default_storage.save(file_path, ContentFile(photo_file.read()))
        
        # Get URL path (relative to MEDIA_ROOT)
        photo_url = f'/media/{saved_path}'
        
        # Add to report photos
        current_photos = report.photos or []
        current_photos.append(photo_url)
        report.photos = current_photos
        report.save()
        
        return Response({
            'url': photo_url,
            'message': 'Photo uploaded successfully'
        })
    
    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate PDF of daily report."""
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.pdfgen import canvas
            from reportlab.lib.utils import ImageReader, simpleSplit
            from io import BytesIO
            from django.http import HttpResponse
            import os
        except ImportError:
            return Response(
                {'error': 'PDF generation requires reportlab library. Please install it: pip install reportlab'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        
        report = self.get_object()
        
        # Create PDF
        buffer = BytesIO()
        pdf_title = f"Foreman's Daily Report - {report.report_number or report.id}"
        p = canvas.Canvas(buffer, pagesize=letter)
        p.setTitle(pdf_title)
        p.setSubject(f"Daily Report for {report.project.job_number}")
        p.setAuthor(report.foreman.get_full_name() if report.foreman else "Foreman")
        width, height = letter
        
        # Add company logo if available
        logo_path = os.path.join(settings.MEDIA_ROOT, 'logo.png')
        if os.path.exists(logo_path):
            try:
                logo = ImageReader(logo_path)
                p.drawImage(logo, 50, height - 100, width=100, height=50, preserveAspectRatio=True)
            except:
                pass
        
        # Report header
        p.setFont("Helvetica-Bold", 16)
        p.drawString(50, height - 120, f"Foreman's Daily Report - {report.report_number or 'N/A'}")
        
        p.setFont("Helvetica", 12)
        y = height - 150
        p.drawString(50, y, f"Job: {report.project.job_number} - {report.project.name}")
        y -= 20
        p.drawString(50, y, f"Date: {report.date.strftime('%b %d, %Y')}")
        if report.phase:
            y -= 20
            p.drawString(50, y, f"Phase: {report.phase}")
        if report.location:
            y -= 20
            p.drawString(50, y, f"Location: {report.location}")
        if report.foreman:
            y -= 20
            p.drawString(50, y, f"Created By: {report.foreman.get_full_name() or report.foreman.username}")
        if report.completed_at:
            y -= 20
            p.drawString(50, y, f"Completed: {report.completed_at.strftime('%b %d, %Y %I:%M %p')}")
        if report.approved_by:
            y -= 20
            p.drawString(50, y, f"Approved: {report.approved_on.strftime('%b %d, %Y %I:%M %p') if report.approved_on else 'N/A'} by {report.approved_by.get_full_name() or report.approved_by.username}")
        
        # Weather section
        y -= 40
        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, y, "Weather")
        p.setFont("Helvetica", 10)
        y -= 20
        weather_conditions = []
        if report.weather_sunny: weather_conditions.append("Sunny")
        if report.weather_cloudy: weather_conditions.append("Cloudy")
        if report.weather_rain: weather_conditions.append("Rain")
        if report.weather_wind: weather_conditions.append("Wind")
        if report.weather_snow: weather_conditions.append("Snow")
        p.drawString(50, y, f"Conditions: {', '.join(weather_conditions) if weather_conditions else 'N/A'}")
        if report.temperature_am or report.temperature_pm:
            y -= 20
            p.drawString(50, y, f"Temperature: AM {report.temperature_am or 'N/A'}°F / PM {report.temperature_pm or 'N/A'}°F")
        if report.weather_notes:
            y -= 20
            p.drawString(50, y, f"Notes: {report.weather_notes[:100]}")
        
        # Labor section
        y -= 40
        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, y, "Labor")
        p.setFont("Helvetica", 9)
        y -= 20
        
        # Table header
        p.drawString(50, y, "Employee")
        p.drawString(200, y, "Phase")
        p.drawString(300, y, "Reg")
        p.drawString(330, y, "OT")
        p.drawString(360, y, "Quantity")
        y -= 15
        p.line(50, y, 550, y)
        y -= 10
        
        # Labor entries
        for entry in report.labor_entries.all():
            if y < 100:  # New page if needed
                p.showPage()
                y = height - 50
            
            employee_name = f"{entry.employee.employee_number} - {entry.employee.get_full_name() or entry.employee.username}"
            p.drawString(50, y, employee_name[:30])
            p.drawString(200, y, entry.phase[:20] if entry.phase else '-')
            p.drawString(300, y, str(entry.regular_hours))
            p.drawString(330, y, str(entry.overtime_hours))
            p.drawString(360, y, str(entry.quantity) if entry.quantity else '-')
            y -= 15
        
        # Totals
        y -= 10
        p.line(50, y, 550, y)
        y -= 15
        p.setFont("Helvetica-Bold", 10)
        p.drawString(50, y, "Total")
        p.drawString(300, y, str(report.total_regular_hours))
        p.drawString(330, y, str(report.total_overtime_hours))
        
        # Work Performed
        if report.work_performed:
            y -= 40
            p.setFont("Helvetica-Bold", 12)
            p.drawString(50, y, "Work Performed")
            p.setFont("Helvetica", 10)
            y -= 20
            lines = simpleSplit(report.work_performed, "Helvetica", 10, 500)
            for line in lines:
                if y < 100:
                    p.showPage()
                    y = height - 50
                p.drawString(50, y, line)
                y -= 15
        
        # Safety
        y -= 40
        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, y, "Safety")
        p.setFont("Helvetica", 10)
        y -= 20
        p.drawString(50, y, f"Safety Meeting Held: {'Yes' if report.safety_meeting_held else 'No'}")
        y -= 15
        p.drawString(50, y, f"JHA Review: {'Yes' if report.jha_review else 'No'}")
        y -= 15
        p.drawString(50, y, f"Scaffolding Inspected: {'Yes' if report.scaffolding_inspected else 'No'}")
        
        # Delays
        if report.delays_by_others:
            y -= 40
            p.setFont("Helvetica-Bold", 12)
            p.drawString(50, y, "Delays By Others")
            p.setFont("Helvetica", 10)
            y -= 20
            lines = simpleSplit(report.delays_by_others, "Helvetica", 10, 500)
            for line in lines:
                if y < 100:
                    p.showPage()
                    y = height - 50
                p.drawString(50, y, line)
                y -= 15
        
        # Attachments/Photos
        if report.photos and len(report.photos) > 0:
            y -= 40
            p.setFont("Helvetica-Bold", 12)
            p.drawString(50, y, f"Attachments ({len(report.photos)})")
            p.setFont("Helvetica", 10)
            y -= 20
            
            for idx, photo_url in enumerate(report.photos):
                if y < 200:  # Need space for image
                    p.showPage()
                    y = height - 50
                
                try:
                    # Handle both absolute URLs and relative paths
                    if photo_url.startswith('http'):
                        # External URL - would need to download first
                        # For now, just show the URL
                        p.drawString(50, y, f"Photo {idx + 1}: {photo_url[:80]}")
                        y -= 15
                    else:
                        # Local file path - handle various path formats
                        photo_path = photo_url
                        
                        # Remove leading /media/ or / if present
                        if photo_path.startswith('/media/'):
                            photo_path = photo_path[7:]  # Remove '/media/'
                        elif photo_path.startswith('media/'):
                            photo_path = photo_path[6:]  # Remove 'media/'
                        elif photo_path.startswith('/'):
                            photo_path = photo_path[1:]  # Remove leading /
                        
                        # Construct full path
                        if not os.path.isabs(photo_path):
                            photo_path = os.path.join(settings.MEDIA_ROOT, photo_path)
                        
                        # Try alternative paths if first doesn't work
                        if not os.path.exists(photo_path):
                            # Try with daily_reports prefix
                            alt_path = os.path.join(settings.MEDIA_ROOT, 'daily_reports', os.path.basename(photo_path))
                            if os.path.exists(alt_path):
                                photo_path = alt_path
                            else:
                                # Try just the filename in media root
                                alt_path = os.path.join(settings.MEDIA_ROOT, os.path.basename(photo_path))
                                if os.path.exists(alt_path):
                                    photo_path = alt_path
                        
                        if os.path.exists(photo_path):
                            try:
                                img = ImageReader(photo_path)
                                # Get image dimensions
                                img_width, img_height = img.getSize()
                                # Scale to fit (max width 500, maintain aspect ratio)
                                max_width = 500
                                scale = min(max_width / img_width, 1.0)
                                display_width = img_width * scale
                                display_height = img_height * scale
                                
                                if y - display_height < 50:  # Not enough space
                                    p.showPage()
                                    y = height - 50
                                
                                p.drawString(50, y, f"Photo {idx + 1}:")
                                y -= 10
                                p.drawImage(img, 50, y - display_height, width=display_width, height=display_height, preserveAspectRatio=True)
                                y -= display_height + 20
                            except Exception as e:
                                import logging
                                logger = logging.getLogger(__name__)
                                logger.error(f"Error loading image {photo_path}: {e}")
                                p.drawString(50, y, f"Photo {idx + 1}: [Image could not be loaded: {str(e)[:50]}]")
                                y -= 15
                        else:
                            p.drawString(50, y, f"Photo {idx + 1}: [File not found: {photo_url}]")
                            y -= 15
                except Exception as e:
                    p.drawString(50, y, f"Photo {idx + 1}: [Error loading image]")
                    y -= 15
        
        p.save()
        buffer.seek(0)
        
        # Set PDF title
        pdf_title = f"Foreman's Daily Report - {report.report_number or report.id}"
        filename = f"Foreman_Daily_Report_{report.report_number or report.id}.pdf"
        
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    
    @action(detail=True, methods=['post'])
    def email(self, request, pk=None):
        """Email daily report as PDF."""
        from django.core.mail import EmailMessage
        from django.template.loader import render_to_string
        from django.conf import settings
        import tempfile
        import os
        
        report = self.get_object()
        recipient_email = request.data.get('email', report.foreman.email if report.foreman else None)
        
        if not recipient_email:
            return Response(
                {'error': 'Email address is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Generate PDF
        pdf_response = self.pdf(request, pk)
        
        # Create email
        subject = f'Daily Report {report.report_number or report.id} - {report.project.job_number}'
        message = f"""
        Please find attached the daily report for {report.project.name} ({report.project.job_number}).
        
        Report Number: {report.report_number or 'N/A'}
        Date: {report.date.strftime('%b %d, %Y')}
        Status: {report.get_status_display()}
        """
        
        email = EmailMessage(
            subject=subject,
            body=message,
            from_email=settings.DEFAULT_FROM_EMAIL or 'noreply@bsm.com',
            to=[recipient_email],
        )
        
        # Attach PDF
        email.attach(
            f'daily_report_{report.report_number or report.id}.pdf',
            pdf_response.content,
            'application/pdf'
        )
        
        try:
            email.send()
            return Response({'message': f'Report sent successfully to {recipient_email}'})
        except Exception as e:
            return Response(
                {'error': f'Failed to send email: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class LaborEntryViewSet(viewsets.ModelViewSet):
    """ViewSet for managing labor entries in daily reports."""
    queryset = LaborEntry.objects.all()
    serializer_class = LaborEntrySerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['daily_report', 'employee', 'phase']


class WeeklyChecklistViewSet(viewsets.ModelViewSet):
    queryset = WeeklyChecklist.objects.all()
    serializer_class = WeeklyChecklistSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['project', 'week_start_date']


class PublicProjectListView(generics.ListAPIView):
    """
    Public endpoint to list public projects.
    No authentication required.
    """
    serializer_class = PublicProjectSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        # Return ALL public projects (with or without PIN)
        # The frontend will handle PIN entry when user clicks on PIN-protected projects
        queryset = _annotated_projects_queryset(include_scopes=False).filter(is_public=True)
        
        # Filter by PIN if provided (for filtering the list by a specific PIN)
        pin = self.request.query_params.get('pin', None)
        if pin:
            # Return projects that match the PIN or don't have a PIN
            queryset = queryset.filter(
                Q(public_pin=pin) | Q(public_pin__isnull=True) | Q(public_pin='')
            )
        # If no PIN provided, return ALL public projects (including PIN-protected ones)
        # The frontend will show them but require PIN to view details
        
        return queryset.order_by('-updated_at')


class PublicProjectDetailView(generics.RetrieveAPIView):
    """
    Public endpoint to view a single public project.
    No authentication required, but PIN may be required.
    """
    serializer_class = PublicProjectSerializer
    permission_classes = [AllowAny]
    
    def get_object(self):
        try:
            project = Project.objects.get(pk=self.kwargs['pk'])
        except Project.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound('Project not found.')
        
        # Check if project is public
        if not project.is_public:
            from rest_framework.exceptions import NotFound
            raise NotFound('Project not found.')
        
        # Check PIN if project has one
        pin = self.request.query_params.get('pin', None)
        if project.public_pin:
            if not pin or pin != project.public_pin:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('PIN required to access this project.')
        
        return project


class BranchPortalProjectListView(generics.ListAPIView):
    """
    Public endpoint to view projects for a specific branch/division portal.
    Requires branch portal password.
    """
    serializer_class = PublicProjectSerializer
    permission_classes = [AllowAny]
    pagination_class = None
    
    def get_queryset(self):
        division_code = self.kwargs.get('division_code')
        password = self.request.query_params.get('password', '')
        
        try:
            # Look up branch by spectrum_division_code (e.g., '111', '121', '115')
            branch = Branch.objects.get(spectrum_division_code=division_code, status='ACTIVE')
        except Branch.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound(f'Division {division_code} not found or inactive.')
        
        # Check portal password
        if not branch.portal_password:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Portal access is not enabled for this division.')
        
        if not password:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Password is required.')
        
        # Verify password (support both plain text and hashed)
        # Branch passwords are stored hashed, so use check_password
        password_valid = False
        stored_password = branch.portal_password
        
        # Check if stored password is hashed (starts with hash identifier)
        if stored_password.startswith('pbkdf2_') or stored_password.startswith('bcrypt') or stored_password.startswith('argon2'):
            # Password is hashed, use check_password
            try:
                password_valid = check_password(password, stored_password)
            except Exception:
                password_valid = False
        else:
            # Fallback: might be plain text (for backward compatibility)
            password_valid = (password == stored_password)
        
        if not password_valid:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Invalid portal password.')
        
        # Return public projects for this branch/division
        # Filter by both branch and spectrum_division_code to ensure each division only sees their own projects
        qs = _annotated_projects_queryset(include_scopes=True)
        return qs.filter(
            status="ACTIVE",
        ).filter(
            Q(branch=branch) | Q(spectrum_division_code=division_code)
        ).order_by('-updated_at')


# public hq start code

# projects/views.py
from django.db.models import Sum, Value, FloatField, DecimalField, F, Case, When, ExpressionWrapper
from django.db.models.functions import Coalesce

class HQPortalProjectListView(generics.ListAPIView):
    serializer_class = PublicProjectSerializer
    permission_classes = [AllowAny]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        password = self.request.query_params.get('password', '').strip()
        hq_password = getattr(settings, 'HQ_PORTAL_PASSWORD', '').strip()

        if not hq_password:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('HQ portal access is not enabled.')

        if not password:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Password is required.')

        # Verify password (plain or hashed)
        password_valid = False
        if password == hq_password:
            password_valid = True
        elif hq_password.startswith(('pbkdf2_', 'bcrypt', 'argon2')):
            try:
                password_valid = check_password(password, hq_password)
            except Exception:
                password_valid = False
        else:
            try:
                password_valid = check_password(password, hq_password)
            except Exception:
                password_valid = False

        if not password_valid:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Invalid HQ portal password.')

        # Optional: allow public-only mode via param (default OFF for HQ)
        public_only = str(self.request.query_params.get('public_only', '0')).lower() in ('1', 'true', 'yes')

        dec_field = DecimalField(max_digits=12, decimal_places=2)
        zero_dec = Value(0, output_field=dec_field)

        qs = (
            Project.objects
            .select_related('branch', 'project_manager', 'superintendent', 'foreman', 'general_contractor')
            .prefetch_related('scopes')
            .annotate(
                total_quantity_annot=Coalesce(Sum('scopes__qty_sq_ft'), zero_dec),
                total_installed_annot=Coalesce(Sum('scopes__installed'), zero_dec),
            )
            .annotate(
                remaining_annot=Case(
                    When(total_quantity_annot__gt=F('total_installed_annot'),
                         then=F('total_quantity_annot') - F('total_installed_annot')),
                    default=zero_dec,
                    output_field=dec_field,
                ),
                production_percent_complete_annot=Case(
                    When(total_quantity_annot=0, then=Value(0.0)),
                    default=ExpressionWrapper(
                        (F('total_installed_annot') * Value(100.0)) / F('total_quantity_annot'),
                        output_field=FloatField(),
                    ),
                    output_field=FloatField(),
                ),
            )
        )

        qs = qs.filter(status="ACTIVE")

        if public_only:
            qs = qs.filter(is_public=True)

        return qs.order_by('-updated_at')



@api_view(['POST'])
@permission_classes([IsAuthenticated])
def set_hq_portal_password(request):
    """
    Set or update HQ portal password.
    Only accessible to Root Superadmin and Admin.
    Note: This logs the change. The actual password must be updated in .env file or settings.
    """
    user = request.user
    if user.role not in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']:
        return Response(
            {'detail': 'You do not have permission to set HQ portal password.'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    new_password = request.data.get('password', '').strip()
    if not new_password:
        return Response(
            {'detail': 'Password is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if len(new_password) < 4:
        return Response(
            {'detail': 'Password must be at least 4 characters long.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Get old password status
    old_password_set = bool(getattr(settings, 'HQ_PORTAL_PASSWORD', ''))
    
    # Note: HQ portal password is a setting, not a model object, so we can't use log_action
    # Instead, we'll log it manually or skip audit logging for settings
    # For now, we'll create a simple log entry
    import logging
    logger = logging.getLogger(__name__)
    logger.info(
        f"HQ Portal Password {'changed' if old_password_set else 'set'} by {user.get_full_name() or user.username} ({user.email})"
    )
    
    # Send email notification
    try:
        recipients = User.objects.filter(
            role__in=['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']
        ).exclude(email='').values_list('email', flat=True).distinct()
        
        if recipients:
            from django.contrib.sites.models import Site
            try:
                current_site = Site.objects.get_current()
                site_domain = current_site.domain
            except:
                site_domain = request.get_host() if hasattr(request, 'get_host') else 'localhost:3000'
            
            context = {
                'changed_by': user.get_full_name() or user.username,
                'changed_by_email': user.email,
                'action': 'set' if not old_password_set else 'changed',
                'request': request,
            }
            
            subject = f'HQ Portal Password {"Set" if not old_password_set else "Changed"}'
            try:
                html_message = render_to_string('accounts/emails/hq_portal_password_changed.html', context)
                plain_message = render_to_string('accounts/emails/hq_portal_password_changed.txt', context)
            except Exception as template_error:
                # Fallback if template rendering fails
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Template rendering error: {template_error}")
                html_message = None
                plain_message = f"HQ portal password has been {context['action']} by {context['changed_by']}."
            
            send_mail(
                subject=subject,
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=list(recipients),
                html_message=html_message,
                fail_silently=True,
            )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send HQ portal password change email: {e}")
    
    return Response({
        'detail': f'HQ portal password {"set" if not old_password_set else "changed"} successfully. Note: You must update HQ_PORTAL_PASSWORD in your .env file or settings for the change to take effect.',
        'note': 'This endpoint logs the change. Please update HQ_PORTAL_PASSWORD in your environment configuration.',
        'password': new_password  # Return password so admin can copy it to .env
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_hq_portal_password_status(request):
    """
    Get HQ portal password status.
    Only accessible to Root Superadmin and Admin.
    """
    user = request.user
    if user.role not in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']:
        return Response(
            {'detail': 'You do not have permission to view HQ portal password status.'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    hq_password = getattr(settings, 'HQ_PORTAL_PASSWORD', '')
    return Response({
        'has_password': bool(hq_password),
    })
