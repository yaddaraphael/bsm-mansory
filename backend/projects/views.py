from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from django.utils import timezone
from django.db.models import Q
from django.conf import settings
from datetime import datetime
import os
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from .models import Project, ProjectScope, DailyReport, WeeklyChecklist, LaborEntry, SCOPE_OF_WORK_CHOICES
from .serializers import (
    ProjectSerializer, ProjectScopeSerializer,
    DailyReportSerializer, WeeklyChecklistSerializer,
    PublicProjectSerializer, LaborEntrySerializer
)
from .utils import generate_job_number
from .permissions import ProjectViewSetPermission
from audit.utils import log_action


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    permission_classes = [ProjectViewSetPermission]
    filterset_fields = ['status', 'branch', 'is_public']
    search_fields = ['job_number', 'name', 'branch__name']
    
    def get_queryset(self):
        """Filter projects based on user role and assignments."""
        user = self.request.user
        queryset = super().get_queryset()
        
        # Field workers can only see projects they're assigned to
        if user.role in ['LABORER', 'MASON', 'OPERATOR', 'BRICKLAYER', 'PLASTER']:
            from accounts.models import ProjectAssignment
            assigned_projects = ProjectAssignment.objects.filter(
                employee=user,
                status='ACTIVE'
            ).values_list('project', flat=True)
            queryset = queryset.filter(id__in=assigned_projects)
        
        # Foremen can see projects they're assigned to as foreman or through assignments
        elif user.role == 'FOREMAN':
            from accounts.models import ProjectAssignment
            # Projects where they're the foreman
            foreman_projects = queryset.filter(foreman=user).values_list('id', flat=True)
            # Projects they're assigned to
            assigned_projects = ProjectAssignment.objects.filter(
                employee=user,
                status='ACTIVE'
            ).values_list('project', flat=True)
            # Combine both
            all_projects = list(foreman_projects) + list(assigned_projects)
            queryset = queryset.filter(id__in=all_projects)
        
        # Project Managers can see their assigned projects
        elif user.role == 'PROJECT_MANAGER':
            queryset = queryset.filter(project_manager=user)
        
        # Superintendents can see their assigned projects
        elif user.role == 'SUPERINTENDENT':
            queryset = queryset.filter(superintendent=user)
        
        # General Contractors can see their assigned projects
        elif user.role == 'GENERAL_CONTRACTOR':
            queryset = queryset.filter(general_contractor=user)
        
        # Admin, Root Superadmin, Superadmin, HR, Finance can see all
        # (no filtering needed)
        
        return queryset
    
    def perform_create(self, serializer):
        # Get scopes data from request
        scopes_data = self.request.data.get('scopes', [])
        
        # Create project
        project = serializer.save(created_by=self.request.user)
        if not project.job_number:
            project.job_number = generate_job_number(project.branch)
            project.save()
        
        # Create scopes if provided
        if scopes_data:
            for scope_data in scopes_data:
                # Only create scope if scope_type is provided
                if scope_data.get('scope_type'):
                    ProjectScope.objects.create(
                        project=project,
                        scope_type=scope_data.get('scope_type'),
                        quantity=scope_data.get('quantity', 0) or 0,
                        unit=scope_data.get('unit', 'Sq.Ft'),
                        start_date=scope_data.get('start_date') or None,
                        end_date=scope_data.get('end_date') or None,
                        description=scope_data.get('description', '') or ''
                    )
        
        # Log the creation
        log_action(
            user=self.request.user,
            action='CREATE',
            obj=project,
            reason=f"Created project {project.job_number}",
            request=self.request
        )
        
        # Send notifications to assigned team members
        self._notify_project_assignments(project, is_new=True)
    
    def perform_update(self, serializer):
        # Get scopes data from request
        scopes_data = self.request.data.get('scopes', None)
        
        # Store old assignments to detect changes
        project = serializer.instance
        old_pm = project.project_manager_id if project else None
        old_super = project.superintendent_id if project else None
        old_foreman = project.foreman_id if project else None
        old_gc = project.general_contractor_id if project else None
        
        # Update project
        project = serializer.save()
        
        # Update scopes if provided
        if scopes_data is not None:
            # Delete existing scopes and create new ones
            project.scopes.all().delete()
            for scope_data in scopes_data:
                # Only create scope if scope_type is provided
                if scope_data.get('scope_type'):
                    ProjectScope.objects.create(
                        project=project,
                        scope_type=scope_data.get('scope_type'),
                        quantity=scope_data.get('quantity', 0) or 0,
                        unit=scope_data.get('unit', 'Sq.Ft'),
                        start_date=scope_data.get('start_date') or None,
                        end_date=scope_data.get('end_date') or None,
                        description=scope_data.get('description', '') or ''
                    )
        
        # Check if assignments changed and notify only newly assigned users
        if (old_pm != project.project_manager_id or 
            old_super != project.superintendent_id or 
            old_foreman != project.foreman_id or
            old_gc != project.general_contractor_id):
            self._notify_project_assignments(project, is_new=False, 
                                            old_pm=old_pm, old_super=old_super, 
                                            old_foreman=old_foreman, old_gc=old_gc)
    
    def _notify_project_assignments(self, project, is_new=True, old_pm=None, old_super=None, old_foreman=None, old_gc=None):
        """Send notifications to assigned team members."""
        from accounts.models import Notification, User
        from django.core.mail import send_mail
        from django.template.loader import render_to_string
        from django.conf import settings
        
        assigned_users = []
        
        # If it's an update, only notify newly assigned users
        if not is_new:
            if project.project_manager_id and project.project_manager_id != old_pm:
                assigned_users.append(project.project_manager)
            if project.superintendent_id and project.superintendent_id != old_super:
                assigned_users.append(project.superintendent)
            if project.foreman_id and project.foreman_id != old_foreman:
                assigned_users.append(project.foreman)
            if project.general_contractor_id and project.general_contractor_id != old_gc:
                assigned_users.append(project.general_contractor)
        else:
            # For new projects, notify all assigned users
            if project.project_manager:
                assigned_users.append(project.project_manager)
            if project.superintendent:
                assigned_users.append(project.superintendent)
            if project.foreman:
                assigned_users.append(project.foreman)
            if project.general_contractor:
                assigned_users.append(project.general_contractor)
        
        # Remove duplicates
        assigned_users = list(set(assigned_users))
        
        # Send notifications
        for user in assigned_users:
            # Create in-app notification
            Notification.objects.create(
                user=user,
                type='PROJECT_UPDATE',
                title=f'Project Assignment: {project.name}',
                message=f'You have been {"assigned to" if is_new else "updated on"} project {project.job_number} - {project.name}',
                link=f'/projects/{project.id}'
            )
            
            # Send email notification
            try:
                subject = f'Project Assignment: {project.name}'
                context = {
                    'user': user,
                    'project': project,
                    'is_new': is_new,
                    'project_url': f"{settings.FRONTEND_URL or 'http://localhost:3000'}/projects/{project.id}",
                    'login_url': f"{settings.FRONTEND_URL or 'http://localhost:3000'}/login",
                }
                
                html_message = render_to_string('accounts/emails/project_assignment.html', context)
                plain_message = render_to_string('accounts/emails/project_assignment.txt', context)
                
                send_mail(
                    subject=subject,
                    message=plain_message,
                    from_email=settings.DEFAULT_FROM_EMAIL or 'noreply@bsm.com',
                    recipient_list=[user.email],
                    html_message=html_message,
                    fail_silently=False,
                )
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send project assignment email to {user.email}: {e}", exc_info=True)
    
    @action(detail=True, methods=['get'])
    def schedule_status(self, request, pk=None):
        """Get detailed schedule status (Green/Yellow/Red)."""
        project = self.get_object()
        status, forecast_date, days_late = project.get_schedule_status()
        return Response({
            'status': status,
            'forecast_date': forecast_date,
            'days_late': days_late,
            'baseline_date': project.estimated_end_date,
        })


class ProjectScopeViewSet(viewsets.ModelViewSet):
    queryset = ProjectScope.objects.all()
    serializer_class = ProjectScopeSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['project', 'scope_type']


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
        queryset = Project.objects.filter(is_public=True)
        
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

