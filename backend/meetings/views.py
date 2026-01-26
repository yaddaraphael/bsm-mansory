from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django.utils import timezone
from django.db.models import Q, Count, Prefetch
from django.http import HttpResponse, FileResponse
from django.shortcuts import get_object_or_404
from datetime import datetime, timedelta
import io
import json

from .models import Meeting, MeetingJob, MeetingJobPhase
from .serializers import (
    MeetingSerializer, MeetingJobSerializer, MeetingJobCreateUpdateSerializer,
    MeetingJobPhaseSerializer, MeetingJobPhaseCreateUpdateSerializer
)
from .permissions import MeetingPermission
from projects.models import Project
from branches.models import Branch
from accounts.models import User
import logging

logger = logging.getLogger(__name__)


class MeetingViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing meetings.
    Admins and Superadmins can create, view, update, delete.
    Project Managers and Branch Managers can view meetings related to their projects/branches.
    """
    queryset = Meeting.objects.select_related('created_by', 'branch').prefetch_related(
        'meeting_jobs__project'
    ).all()
    serializer_class = MeetingSerializer
    permission_classes = [IsAuthenticated, MeetingPermission]
    filterset_fields = ['meeting_date', 'branch']
    search_fields = ['notes']
    ordering = ['-meeting_date', '-created_at']
    
    def get_queryset(self):
        """Filter meetings based on user role."""
        queryset = super().get_queryset()
        user = self.request.user
        
        # Add annotation for meeting_jobs_count and prefetch phases
        queryset = queryset.annotate(meeting_jobs_count=Count('meeting_jobs')).prefetch_related(
            'meeting_jobs__project__project_manager',
            'meeting_jobs__project__foreman',
            'meeting_jobs__project__branch',
            'meeting_jobs__phases'
        )
        
        # Admins and superadmins see all meetings
        if user.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']:
            return queryset
        
        # Project Managers see meetings with their projects
        if user.role == 'PROJECT_MANAGER':
            return queryset.filter(
                meeting_jobs__project__project_manager=user
            ).distinct()
        
        # Branch Managers see meetings for their branch
        if user.role == 'BRANCH_MANAGER':
            # Get user's division (branch)
            if user.division:
                return queryset.filter(
                    Q(branch=user.division) |
                    Q(meeting_jobs__project__branch=user.division)
                ).distinct()
            return queryset.none()
        
        return queryset.none()
    
    def perform_create(self, serializer):
        """Set created_by to current user."""
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['get', 'post', 'put', 'patch'])
    def jobs(self, request, pk=None):
        """Get or create/update job entries for a meeting."""
        meeting = self.get_object()
        
        if request.method == 'GET':
            meeting_jobs = meeting.meeting_jobs.select_related('project').all()
            serializer = MeetingJobSerializer(meeting_jobs, many=True)
            return Response(serializer.data)
        
        elif request.method == 'POST':
            # Create new job entry
            data = request.data.copy()
            data['meeting'] = meeting.id
            serializer = MeetingJobCreateUpdateSerializer(
                data=data,
                context={'request': request}
            )
            if serializer.is_valid():
                serializer.save(meeting=meeting)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        elif request.method in ['PUT', 'PATCH']:
            # Update existing job entry
            job_id = request.data.get('id')
            if not job_id:
                return Response(
                    {'detail': 'Job entry ID is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            try:
                meeting_job = MeetingJob.objects.get(id=job_id, meeting=meeting)
            except MeetingJob.DoesNotExist:
                return Response(
                    {'detail': 'Job entry not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            serializer = MeetingJobCreateUpdateSerializer(
                meeting_job,
                data=request.data,
                partial=request.method == 'PATCH',
                context={'request': request}
            )
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get', 'post', 'put', 'patch', 'delete'], url_path='jobs/(?P<job_id>[^/.]+)/phases')
    def job_phases(self, request, pk=None, job_id=None):
        """Get, create, update, or delete phases for a meeting job."""
        meeting = self.get_object()
        
        try:
            meeting_job = MeetingJob.objects.get(id=job_id, meeting=meeting)
        except MeetingJob.DoesNotExist:
            return Response(
                {'detail': 'Job entry not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if request.method == 'GET':
            phases = meeting_job.phases.all()
            serializer = MeetingJobPhaseSerializer(phases, many=True)
            return Response(serializer.data)
        
        elif request.method == 'POST':
            data = request.data.copy()
            data['meeting_job'] = meeting_job.id
            serializer = MeetingJobPhaseCreateUpdateSerializer(data=data)
            if serializer.is_valid():
                serializer.save(meeting_job=meeting_job)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        elif request.method in ['PUT', 'PATCH']:
            phase_id = request.data.get('id')
            if not phase_id:
                return Response(
                    {'detail': 'Phase ID is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            try:
                phase = MeetingJobPhase.objects.get(id=phase_id, meeting_job=meeting_job)
            except MeetingJobPhase.DoesNotExist:
                return Response(
                    {'detail': 'Phase not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            serializer = MeetingJobPhaseCreateUpdateSerializer(
                phase,
                data=request.data,
                partial=request.method == 'PATCH'
            )
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        elif request.method == 'DELETE':
            phase_id = request.query_params.get('id')
            if not phase_id:
                return Response(
                    {'detail': 'Phase ID is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            try:
                phase = MeetingJobPhase.objects.get(id=phase_id, meeting_job=meeting_job)
                phase.delete()
                return Response(status=status.HTTP_204_NO_CONTENT)
            except MeetingJobPhase.DoesNotExist:
                return Response(
                    {'detail': 'Phase not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
    
    @action(detail=True, methods=['get'])
    def export_pdf(self, request, pk=None):
        """Export meeting as PDF."""
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import letter, A4
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
        except ImportError:
            return Response(
                {'detail': 'PDF export requires reportlab library'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        meeting = self.get_object()
        user = request.user
        
        # Base queryset
        meeting_jobs = meeting.meeting_jobs.select_related(
            'project', 'project__project_manager', 'project__foreman', 'project__branch'
        ).prefetch_related('phases', 'project__scopes')
        
        # Filter by user role for exports
        if user.role == 'BRANCH_MANAGER':
            # Branch managers only see projects from their division
            if user.division:
                meeting_jobs = meeting_jobs.filter(project__branch=user.division)
            else:
                meeting_jobs = meeting_jobs.none()
        elif user.role == 'PROJECT_MANAGER':
            # Project managers only see their own projects
            meeting_jobs = meeting_jobs.filter(project__project_manager=user)
        
        meeting_jobs = meeting_jobs.all()
        
        # Create PDF buffer
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        story = []
        styles = getSampleStyleSheet()
        
        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            textColor=colors.HexColor('#1f2937'),
            spaceAfter=30,
        )
        title = Paragraph(f"Meeting Report - {meeting.meeting_date}", title_style)
        story.append(title)
        story.append(Spacer(1, 0.2 * inch))
        
        # Meeting Info
        info_data = [
            ['Meeting Date:', str(meeting.meeting_date)],
            ['Created By:', meeting.created_by.get_full_name() or meeting.created_by.username],
            ['Branch:', meeting.branch.name if meeting.branch else 'All Branches'],
            ['Created At:', meeting.created_at.strftime('%Y-%m-%d %H:%M:%S')],
        ]
        info_table = Table(info_data, colWidths=[2 * inch, 4 * inch])
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 0.3 * inch))
        
        # Notes
        if meeting.notes:
            notes_title = Paragraph("<b>Meeting Notes:</b>", styles['Heading2'])
            story.append(notes_title)
            story.append(Spacer(1, 0.1 * inch))
            notes_para = Paragraph(meeting.notes.replace('\n', '<br/>'), styles['Normal'])
            story.append(notes_para)
            story.append(Spacer(1, 0.3 * inch))
        
        # Jobs Table - Enhanced with all fields
        jobs_title = Paragraph("<b>Job Details:</b>", styles['Heading2'])
        story.append(jobs_title)
        story.append(Spacer(1, 0.1 * inch))
        
        # Get dates from SpectrumJobDates
        from spectrum.models import SpectrumJobDates
        
        # Table headers - expanded
        jobs_data = [['Job Number', 'Project Name', 'Start Date', 'End Date', 'Branch', 'PM', 'Foreman', 
                     'Saturday', 'Weekends', 'Scope', 'Handoff Est', 'Handoff Foreman', 'Safety Plan', 'Masons', 'Labors', 'Notes']]
        
        # Table rows
        for job in meeting_jobs:
            project = job.project
            
            # Get dates from SpectrumJobDates
            start_date = None
            end_date = None
            try:
                spectrum_dates = SpectrumJobDates.objects.filter(job_number=project.job_number).first()
                if spectrum_dates:
                    start_date = spectrum_dates.start_date or spectrum_dates.est_start_date
                    end_date = (spectrum_dates.complete_date or 
                               spectrum_dates.projected_complete_date or 
                               spectrum_dates.est_complete_date)
            except:
                pass
            
            if not start_date:
                start_date = project.start_date
            if not end_date:
                end_date = project.estimated_end_date
            
            # Get scope types
            try:
                scopes = project.scopes.all()
                scope_types = ', '.join([s.get_scope_type_display() for s in scopes]) or 'N/A'
            except:
                scope_types = 'N/A'
            
            notes_text = (job.notes or '')[:30] + ('...' if job.notes and len(job.notes) > 30 else '')
            saturdays_val = 'Yes' if (getattr(job, 'saturdays', None) is True) else ('No' if getattr(job, 'saturdays', None) is False else 'N/A')
            weekends_val = 'Yes' if (getattr(job, 'full_weekends', None) is True) else ('No' if getattr(job, 'full_weekends', None) is False else 'N/A')
            
            # Get PM name - use User if available, otherwise Spectrum PM name
            pm_name = 'N/A'
            if job.project.project_manager:
                try:
                    pm_name = job.project.project_manager.get_full_name()
                except:
                    pass
            elif hasattr(job.project, 'spectrum_project_manager') and job.project.spectrum_project_manager:
                pm_name = job.project.spectrum_project_manager
            
            jobs_data.append([
                job.project.job_number or '',
                job.project.name[:25] + ('...' if len(job.project.name) > 25 else ''),
                str(start_date) if start_date else 'N/A',
                str(end_date) if end_date else 'N/A',
                job.project.branch.name if job.project.branch else 'N/A',
                pm_name,
                job.project.foreman.get_full_name() if job.project.foreman else 'N/A',
                saturdays_val,
                weekends_val,
                scope_types[:20] + ('...' if len(scope_types) > 20 else ''),
                'Yes' if getattr(job, 'handoff_from_estimator', False) else 'No',
                'Yes' if getattr(job, 'handoff_to_foreman', False) else 'No',
                'Yes' if getattr(job, 'site_specific_safety_plan', False) else 'No',
                str(job.masons),
                str(job.labors),
                notes_text,
            ])
            
            # Add phases for this job
            phases = job.phases.all()
            if phases:
                phase_data = [['', 'Phase Code', 'Description', 'Masons', 'Operators', 'Labors', 'Qty', 'Installed', '%', 'Duration', 'Notes']]
                for phase in phases:
                    percent = f"{(float(phase.installed_quantity or 0) / float(phase.quantity or 1) * 100):.1f}%" if phase.quantity and float(phase.quantity) > 0 else "0.0%"
                    phase_data.append([
                        '',  # Empty for job number column
                        phase.phase_code or '',
                        (phase.phase_description or '')[:20] + ('...' if phase.phase_description and len(phase.phase_description) > 20 else ''),
                        str(phase.masons or 0),
                        str(phase.operators or 0),
                        str(phase.labors or 0),
                        str(phase.quantity or 0),
                        str(phase.installed_quantity or 0),
                        percent,
                        str(phase.duration) if phase.duration else 'N/A',
                        (phase.notes or '')[:20] + ('...' if phase.notes and len(phase.notes) > 20 else ''),
                    ])
                phase_table = Table(phase_data, colWidths=[1 * inch, 0.8 * inch, 1.2 * inch, 0.6 * inch, 0.6 * inch, 0.6 * inch, 0.6 * inch, 0.6 * inch, 0.6 * inch, 0.6 * inch, 1 * inch])
                phase_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E5E7EB')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 8),
                    ('FONTSIZE', (0, 1), (-1, -1), 7),
                    ('GRID', (0, 0), (-1, -1), 1, colors.grey),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
                ]))
                story.append(phase_table)
                story.append(Spacer(1, 0.1 * inch))
        
        jobs_table = Table(jobs_data, colWidths=[1 * inch, 1.2 * inch, 0.8 * inch, 0.8 * inch, 0.8 * inch, 1 * inch, 0.8 * inch, 0.5 * inch, 0.5 * inch, 0.8 * inch, 0.6 * inch, 0.6 * inch, 0.6 * inch, 0.5 * inch, 0.5 * inch, 1 * inch])
        jobs_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#374151')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
        ]))
        story.append(jobs_table)
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        
        # Return PDF response
        filename = f"meeting_{meeting.meeting_date}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        response = HttpResponse(buffer.read(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    
    @action(detail=True, methods=['get'])
    def export_excel(self, request, pk=None):
        """Export meeting as Excel with all fields including phases."""
        import io
        from django.http import HttpResponse
        from datetime import datetime
        
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        except ImportError as e:
            import traceback
            logger.error(f"Import error in export_excel: {e}\n{traceback.format_exc()}")
            return Response(
                {'detail': f'Excel export requires openpyxl library. Error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        try:
            meeting = self.get_object()
            user = request.user
            
            # Base queryset
            meeting_jobs = meeting.meeting_jobs.select_related(
                'project', 'project__project_manager', 'project__foreman', 'project__branch'
            ).prefetch_related('phases', 'project__scopes')
            
            # Filter by user role for exports
            if user.role == 'BRANCH_MANAGER':
                # Branch managers only see projects from their division
                if user.division:
                    meeting_jobs = meeting_jobs.filter(project__branch=user.division)
                else:
                    meeting_jobs = meeting_jobs.none()
            elif user.role == 'PROJECT_MANAGER':
                # Project managers only see their own projects
                meeting_jobs = meeting_jobs.filter(project__project_manager=user)
            
            meeting_jobs = meeting_jobs.all()
            
            # Create workbook
            wb = Workbook()
            ws = wb.active
            # Limit worksheet title to 31 characters (Excel limit)
            title = str(meeting.meeting_date)[:31] if meeting.meeting_date else "Meeting"
            ws.title = title
            
            # Styles
            header_fill = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
            header_font = Font(bold=True, color="FFFFFF", size=11)
            title_font = Font(bold=True, size=14)
            border = Border(
                left=Side(style='thin'),
                right=Side(style='thin'),
                top=Side(style='thin'),
                bottom=Side(style='thin')
            )
            center_align = Alignment(horizontal='center', vertical='center')
            
            # Title
            ws.merge_cells('A1:Q1')
            ws['A1'] = f"Meeting Report - {meeting.meeting_date}"
            ws['A1'].font = title_font
            ws['A1'].alignment = center_align
            ws.row_dimensions[1].height = 30
            
            # Meeting Info
            row = 3
            ws[f'A{row}'] = 'Meeting Date:'
            ws[f'B{row}'] = str(meeting.meeting_date)
            row += 1
            ws[f'A{row}'] = 'Created By:'
            ws[f'B{row}'] = meeting.created_by.get_full_name() or meeting.created_by.username
            row += 1
            ws[f'A{row}'] = 'Branch:'
            ws[f'B{row}'] = meeting.branch.name if meeting.branch else 'All Branches'
            row += 1
            ws[f'A{row}'] = 'Created At:'
            ws[f'B{row}'] = meeting.created_at.strftime('%Y-%m-%d %H:%M:%S')
            row += 2
            
            # Notes
            if meeting.notes:
                ws[f'A{row}'] = 'Meeting Notes:'
                ws[f'A{row}'].font = Font(bold=True)
                row += 1
                ws.merge_cells(f'A{row}:Q{row}')
                ws[f'A{row}'] = meeting.notes
                ws[f'A{row}'].alignment = Alignment(wrap_text=True, vertical='top')
                row += 2
            
            # Jobs Table Headers - Expanded with all fields
            headers = [
                'Job Number', 'Project Name', 'Start Date', 'End Date', 'Branch', 'PM', 'Foreman',
                'Saturday', 'Full Weekends', 'Scope', 'Handoff from Estimator', 'Handoff to Foreman',
                'Site Safety Plan', 'Notes'
            ]
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=row, column=col)
                cell.value = header
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = center_align
                cell.border = border
            
            row += 1
            
            # Jobs Table Data
            for job in meeting_jobs:
                project = job.project
                # Get scope types
                try:
                    scopes = project.scopes.all()
                    scope_types = ', '.join([s.get_scope_type_display() for s in scopes]) or 'N/A'
                except:
                    scope_types = 'N/A'
                
                # Get dates from SpectrumJobDates API (GetJobDates), not from sync date
                from spectrum.models import SpectrumJobDates
                start_date = None
                end_date = None
                try:
                    # Query SpectrumJobDates by job_number (exact match first, then try variations)
                    spectrum_dates = None
                    try:
                        spectrum_dates = SpectrumJobDates.objects.filter(job_number=project.job_number).first()
                    except:
                        pass
                    
                    if not spectrum_dates:
                        # Try case-insensitive match
                        try:
                            spectrum_dates = SpectrumJobDates.objects.filter(job_number__iexact=project.job_number).first()
                        except:
                            pass
                    
                    if spectrum_dates:
                        # Use dates from SpectrumJobDates (GetJobDates API)
                        start_date = spectrum_dates.start_date or spectrum_dates.est_start_date
                        end_date = (spectrum_dates.complete_date or 
                                   spectrum_dates.projected_complete_date or 
                                   spectrum_dates.est_complete_date)
                    
                    # Fallback to project dates only if Spectrum dates not available
                    if not start_date:
                        start_date = project.start_date
                    if not end_date:
                        try:
                            end_date = project.estimated_end_date
                        except:
                            end_date = None
                except Exception as date_err:
                    # Fallback to project dates on error
                    start_date = project.start_date
                    try:
                        end_date = project.estimated_end_date
                    except:
                        end_date = None
                
                ws.cell(row=row, column=1, value=project.job_number or '').border = border
                ws.cell(row=row, column=2, value=project.name or '').border = border
                try:
                    ws.cell(row=row, column=3, value=str(start_date) if start_date else 'N/A').border = border
                except:
                    ws.cell(row=row, column=3, value='N/A').border = border
                try:
                    ws.cell(row=row, column=4, value=str(end_date) if end_date else 'N/A').border = border
                except:
                    ws.cell(row=row, column=4, value='N/A').border = border
                ws.cell(row=row, column=5, value=project.branch.name if project.branch and project.branch.name else 'N/A').border = border
                try:
                    pm_name = project.project_manager.get_full_name() if project.project_manager else (project.spectrum_project_manager if hasattr(project, 'spectrum_project_manager') and project.spectrum_project_manager else 'N/A')
                except:
                    pm_name = project.spectrum_project_manager if hasattr(project, 'spectrum_project_manager') and project.spectrum_project_manager else 'N/A'
                ws.cell(row=row, column=6, value=pm_name).border = border
                try:
                    foreman_name = project.foreman.get_full_name() if project.foreman else 'N/A'
                except:
                    foreman_name = 'N/A'
                ws.cell(row=row, column=7, value=foreman_name).border = border
                # Get saturdays and full_weekends from meeting job, not project
                saturdays_val = 'Yes' if (getattr(job, 'saturdays', None) is True) else ('No' if getattr(job, 'saturdays', None) is False else 'N/A')
                full_weekends_val = 'Yes' if (getattr(job, 'full_weekends', None) is True) else ('No' if getattr(job, 'full_weekends', None) is False else 'N/A')
                ws.cell(row=row, column=8, value=saturdays_val).border = border
                ws.cell(row=row, column=9, value=full_weekends_val).border = border
                ws.cell(row=row, column=10, value=scope_types).border = border
                ws.cell(row=row, column=11, value='Yes' if getattr(job, 'handoff_from_estimator', False) else 'No').border = border
                ws.cell(row=row, column=12, value='Yes' if getattr(job, 'handoff_to_foreman', False) else 'No').border = border
                ws.cell(row=row, column=13, value='Yes' if getattr(job, 'site_specific_safety_plan', False) else 'No').border = border
                ws.cell(row=row, column=14, value=job.notes or '').border = border
                row += 1
                
                # Add phases for this job
                phases = job.phases.all()
                if phases:
                    phase_headers = ['Phase Code', 'Phase Description', 'Masons', 'Operators', 'Labors', 
                                    'Quantity', 'Installed', 'Complete %', 'Duration', 'Notes']
                    phase_start_col = 1
                    for col, header in enumerate(phase_headers, phase_start_col):
                        cell = ws.cell(row=row, column=col)
                        cell.value = header
                        cell.font = Font(bold=True, size=10)
                        cell.fill = PatternFill(start_color="E5E7EB", end_color="E5E7EB", fill_type="solid")
                        cell.border = border
                    row += 1
                    
                    for phase in phases:
                        # Calculate percent complete safely
                        try:
                            if phase.quantity and float(phase.quantity) > 0:
                                percent_complete = (float(phase.installed_quantity or 0) / float(phase.quantity)) * 100
                                percent_str = f"{percent_complete:.1f}%"
                            else:
                                percent_str = "0.0%"
                        except:
                            percent_str = "0.0%"
                        
                        ws.cell(row=row, column=1, value=phase.phase_code or '').border = border
                        ws.cell(row=row, column=2, value=phase.phase_description or '').border = border
                        ws.cell(row=row, column=3, value=phase.masons or 0).border = border
                        ws.cell(row=row, column=4, value=phase.operators or 0).border = border
                        ws.cell(row=row, column=5, value=phase.labors or 0).border = border
                        try:
                            ws.cell(row=row, column=6, value=float(phase.quantity or 0)).border = border
                        except:
                            ws.cell(row=row, column=6, value=0).border = border
                        try:
                            ws.cell(row=row, column=7, value=float(phase.installed_quantity or 0)).border = border
                        except:
                            ws.cell(row=row, column=7, value=0).border = border
                        ws.cell(row=row, column=8, value=percent_str).border = border
                        ws.cell(row=row, column=9, value=phase.duration if phase.duration else '').border = border
                        ws.cell(row=row, column=10, value=phase.notes or '').border = border
                        row += 1
                    row += 1  # Add spacing after phases
            
            # Auto-adjust column widths
            column_widths = {
                'A': 15, 'B': 30, 'C': 12, 'D': 12, 'E': 15, 'F': 20, 'G': 20,
                'H': 10, 'I': 12, 'J': 20, 'K': 18, 'L': 18, 'M': 18, 'N': 40
            }
            for col, width in column_widths.items():
                ws.column_dimensions[col].width = width
            
            # Save to buffer
            buffer = io.BytesIO()
            try:
                wb.save(buffer)
                buffer.seek(0)
            except Exception as save_err:
                import traceback
                logger.error(f"Error saving Excel file: {save_err}\n{traceback.format_exc()}")
                return Response(
                    {'detail': f'Error saving Excel file: {str(save_err)}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Return Excel response
            try:
                filename = f"meeting_{meeting.meeting_date}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
                response = HttpResponse(
                    buffer.getvalue(),
                    content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
                return response
            except Exception as response_err:
                import traceback
                logger.error(f"Error creating Excel response: {response_err}\n{traceback.format_exc()}")
                return Response(
                    {'detail': f'Error creating Excel response: {str(response_err)}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
        except Exception as e:
            import traceback
            logger.error(f"Error generating Excel export: {e}\n{traceback.format_exc()}")
            return Response(
                {'detail': f'Error generating Excel export: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def active_jobs(self, request):
        """Get all active jobs for meeting review."""
        user = request.user
        
        # Get active projects based on user role - use same filtering as projects page
        # Only include projects that have been imported from Spectrum (have valid job_number)
        # Filter by job numbers that exist in SpectrumJob
        from spectrum.models import SpectrumJob
        valid_job_numbers = SpectrumJob.objects.values_list('job_number', flat=True).distinct()
        
        projects = Project.objects.filter(
            status='ACTIVE'
        ).exclude(
            job_number__isnull=True
        ).exclude(
            job_number=''
        ).filter(
            job_number__in=valid_job_numbers
        ).select_related(
            'branch', 'project_manager', 'foreman'
        ).prefetch_related('scopes').distinct()
        
        # Filter by user role
        if user.role == 'PROJECT_MANAGER':
            projects = projects.filter(project_manager=user)
        elif user.role == 'BRANCH_MANAGER':
            if user.division:
                projects = projects.filter(branch=user.division)
            else:
                # Fallback to old method if division not set
                user_branch = Branch.objects.filter(manager=user).first()
                if user_branch:
                    projects = projects.filter(branch=user_branch)
                else:
                    projects = projects.none()
        
        # Serialize projects - this will include branch_detail, project_manager_detail, and job_description
        from projects.serializers import ProjectSerializer
        serializer = ProjectSerializer(projects, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def batch_save_jobs(self, request, pk=None):
        """Batch save meeting jobs and phases for faster performance."""
        meeting = self.get_object()
        jobs_data = request.data.get('jobs', [])
        
        if not jobs_data:
            return Response(
                {'detail': 'jobs array is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from django.db import transaction
            
            with transaction.atomic():
                saved_jobs = []
                for job_data in jobs_data:
                    project_id = job_data.get('project_id')
                    if not project_id:
                        continue
                    
                    # Get or create meeting job
                    meeting_job, created = MeetingJob.objects.get_or_create(
                        meeting=meeting,
                        project_id=project_id,
                        defaults={
                            'masons': job_data.get('masons', 0),
                            'labors': job_data.get('labors', 0),
                            'notes': job_data.get('notes', ''),
                            'handoff_from_estimator': job_data.get('handoff_from_estimator', False),
                            'handoff_to_foreman': job_data.get('handoff_to_foreman', False),
                            'site_specific_safety_plan': job_data.get('site_specific_safety_plan', False),
                            'saturdays': job_data.get('saturdays'),
                            'full_weekends': job_data.get('full_weekends'),
                            'selected_scope': job_data.get('selected_scope', ''),
                        }
                    )
                    
                    if not created:
                        # Update existing
                        meeting_job.masons = job_data.get('masons', 0)
                        meeting_job.labors = job_data.get('labors', 0)
                        meeting_job.notes = job_data.get('notes', '')
                        meeting_job.handoff_from_estimator = job_data.get('handoff_from_estimator', False)
                        meeting_job.handoff_to_foreman = job_data.get('handoff_to_foreman', False)
                        meeting_job.site_specific_safety_plan = job_data.get('site_specific_safety_plan', False)
                        meeting_job.saturdays = job_data.get('saturdays')
                        meeting_job.full_weekends = job_data.get('full_weekends')
                        meeting_job.selected_scope = job_data.get('selected_scope', '')
                        meeting_job.save()
                    
                    # Handle phases - use update_or_create to avoid duplicate key errors
                    phases_data = job_data.get('phases', [])
                    if phases_data:
                        # Get existing phase codes for this job
                        existing_phases = {p.phase_code: p for p in meeting_job.phases.all()}
                        
                        # Track which phases we've processed
                        processed_phase_codes = set()
                        
                        for phase_data in phases_data:
                            phase_code = phase_data.get('phase_code', '')
                            if not phase_code or phase_code in processed_phase_codes:
                                continue  # Skip empty or duplicate phase codes
                            
                            processed_phase_codes.add(phase_code)
                            
                            # Update existing or create new
                            phase, created = MeetingJobPhase.objects.update_or_create(
                                meeting_job=meeting_job,
                                phase_code=phase_code,
                                defaults={
                                    'phase_description': phase_data.get('phase_description', ''),
                                    'masons': phase_data.get('masons', 0),
                                    'operators': phase_data.get('operators', 0),
                                    'labors': phase_data.get('labors', 0),
                                    'quantity': phase_data.get('quantity', 0),
                                    'installed_quantity': phase_data.get('installed_quantity', 0),
                                    'duration': phase_data.get('duration'),
                                    'notes': phase_data.get('notes', ''),
                                }
                            )
                        
                        # Delete phases that are no longer in the data
                        phases_to_delete = existing_phases.keys() - processed_phase_codes
                        if phases_to_delete:
                            MeetingJobPhase.objects.filter(
                                meeting_job=meeting_job,
                                phase_code__in=phases_to_delete
                            ).delete()
                    
                    saved_jobs.append(meeting_job.id)
                
                # Return saved jobs with phases
                saved_meeting_jobs = MeetingJob.objects.filter(id__in=saved_jobs).prefetch_related('phases')
                serializer = MeetingJobSerializer(saved_meeting_jobs, many=True)
                
                # Check if this is a draft save or final save
                is_draft = request.data.get('is_draft', False)
                if not is_draft:
                    # Mark meeting as completed and send notifications
                    meeting.status = 'COMPLETED'
                    meeting.save()
                    
                    # Send notifications to project managers and branch managers
                    self._send_meeting_notifications(meeting)
                
                return Response(serializer.data, status=status.HTTP_200_OK)
                
        except Exception as e:
            import traceback
            logger.error(f"Error batch saving jobs: {e}\n{traceback.format_exc()}")
            return Response(
                {'detail': f'Error batch saving jobs: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def _send_meeting_notifications(self, meeting):
        """Send notifications to project managers and branch managers when meeting is completed."""
        try:
            from accounts.models import Notification
            from django.contrib.contenttypes.models import ContentType
            
            meeting_ct = ContentType.objects.get_for_model(Meeting)
            meeting_jobs = meeting.meeting_jobs.select_related('project', 'project__project_manager', 'project__branch').all()
            
            # Track notified users to avoid duplicates
            notified_pms = set()
            notified_branch_managers = set()
            
            for job in meeting_jobs:
                project = job.project
                
                # Notify Project Manager
                if project.project_manager and project.project_manager.id not in notified_pms:
                    Notification.objects.create(
                        user=project.project_manager,
                        type='REPORT_SUBMITTED',
                        title=f'Meeting Report Available - {meeting.meeting_date}',
                        message=f'A meeting report for {project.job_number} - {project.name} is now available. The meeting was held on {meeting.meeting_date}.',
                        link=f'/meetings/{meeting.id}/review',
                        content_type=meeting_ct,
                        object_id=meeting.id
                    )
                    notified_pms.add(project.project_manager.id)
                
                # Notify Branch Manager
                if project.branch and project.branch.manager:
                    branch_manager_id = project.branch.manager.id
                    if branch_manager_id not in notified_branch_managers:
                        # Count jobs for this branch in this meeting
                        branch_jobs_count = meeting_jobs.filter(project__branch=project.branch).count()
                        
                        Notification.objects.create(
                            user=project.branch.manager,
                            type='REPORT_SUBMITTED',
                            title=f'Meeting Report Available - {meeting.meeting_date}',
                            message=f'A meeting report for {project.branch.name} is now available with {branch_jobs_count} project(s). The meeting was held on {meeting.meeting_date}.',
                            link=f'/meetings/{meeting.id}/review',
                            content_type=meeting_ct,
                            object_id=meeting.id
                        )
                        notified_branch_managers.add(branch_manager_id)
            
        except Exception as e:
            import traceback
            logger.error(f"Error sending meeting notifications: {e}\n{traceback.format_exc()}")
            # Don't fail the save if notifications fail
    
    @action(detail=False, methods=['get'])
    def job_details(self, request):
        """Get job details including dates and phases from database (not API calls)."""
        job_number = request.query_params.get('job_number')
        if not job_number:
            return Response(
                {'detail': 'job_number parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from spectrum.models import SpectrumJobDates, SpectrumPhaseEnhanced
            
            # Get dates from database
            job_dates = SpectrumJobDates.objects.filter(job_number=job_number).first()
            dates_data = None
            if job_dates:
                dates_data = {
                    'start_date': job_dates.start_date.isoformat() if job_dates.start_date else None,
                    'est_start_date': job_dates.est_start_date.isoformat() if job_dates.est_start_date else None,
                    'complete_date': job_dates.complete_date.isoformat() if job_dates.complete_date else None,
                    'projected_complete_date': job_dates.projected_complete_date.isoformat() if job_dates.projected_complete_date else None,
                    'est_complete_date': job_dates.est_complete_date.isoformat() if job_dates.est_complete_date else None,
                }
            
            # Get phases from database
            phases = SpectrumPhaseEnhanced.objects.filter(job_number=job_number).order_by('phase_code', 'cost_type')
            phases_data = [{
                'phase_code': p.phase_code,
                'description': p.description,
                'jtd_quantity': float(p.jtd_quantity) if p.jtd_quantity else 0,
                'estimated_quantity': float(p.estimated_quantity) if p.estimated_quantity else 0,
                'start_date': p.start_date.isoformat() if p.start_date else None,
                'end_date': p.end_date.isoformat() if p.end_date else None,
            } for p in phases]
            
            return Response({
                'dates': dates_data,
                'phases': phases_data
            })
        except Exception as e:
            import traceback
            logger.error(f"Error fetching job details: {e}\n{traceback.format_exc()}")
            return Response(
                {'detail': f'Error fetching job details: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def batch_job_details(self, request):
        """Get job details for multiple jobs at once from database (not API calls)."""
        job_numbers = request.data.get('job_numbers', [])
        if not job_numbers or not isinstance(job_numbers, list):
            return Response(
                {'detail': 'job_numbers array is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from spectrum.models import SpectrumJobDates, SpectrumPhaseEnhanced
            from django.db.models import Q
            
            # Build query for multiple job numbers
            job_numbers_filter = Q(job_number__in=job_numbers)
            
            # Get all dates from database in one query
            job_dates_list = SpectrumJobDates.objects.filter(job_numbers_filter)
            dates_dict = {}
            for jd in job_dates_list:
                dates_dict[jd.job_number] = {
                    'start_date': jd.start_date.isoformat() if jd.start_date else None,
                    'est_start_date': jd.est_start_date.isoformat() if jd.est_start_date else None,
                    'complete_date': jd.complete_date.isoformat() if jd.complete_date else None,
                    'projected_complete_date': jd.projected_complete_date.isoformat() if jd.projected_complete_date else None,
                    'est_complete_date': jd.est_complete_date.isoformat() if jd.est_complete_date else None,
                }
            
            # Get all phases from database in one query
            phases_list = SpectrumPhaseEnhanced.objects.filter(job_numbers_filter).order_by('job_number', 'phase_code', 'cost_type')
            phases_dict = {}
            for p in phases_list:
                if p.job_number not in phases_dict:
                    phases_dict[p.job_number] = []
                phases_dict[p.job_number].append({
                    'phase_code': p.phase_code,
                    'description': p.description,
                    'jtd_quantity': float(p.jtd_quantity) if p.jtd_quantity else 0,
                    'estimated_quantity': float(p.estimated_quantity) if p.estimated_quantity else 0,
                    'start_date': p.start_date.isoformat() if p.start_date else None,
                    'end_date': p.end_date.isoformat() if p.end_date else None,
                })
            
            # Build response
            result = {}
            for job_num in job_numbers:
                result[job_num] = {
                    'dates': dates_dict.get(job_num),
                    'phases': phases_dict.get(job_num, [])
                }
            
            return Response(result)
        except Exception as e:
            import traceback
            logger.error(f"Error fetching batch job details: {e}\n{traceback.format_exc()}")
            return Response(
                {'detail': f'Error fetching batch job details: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def project_phases(self, request):
        """Get meeting phases for a specific project by project ID."""
        project_id = request.query_params.get('project_id')
        if not project_id:
            return Response(
                {'detail': 'project_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from projects.models import Project
            project = Project.objects.get(id=project_id)
            
            # Get all meeting phases for this project, ordered by meeting date (most recent first)
            from .models import MeetingJobPhase
            phases = MeetingJobPhase.objects.filter(
                meeting_job__project=project
            ).select_related(
                'meeting_job__meeting'
            ).order_by(
                '-meeting_job__meeting__meeting_date',
                'phase_code'
            )
            
            # Group by phase_code and get the most recent entry for each phase
            phase_data = {}
            for phase in phases:
                phase_code = phase.phase_code
                if phase_code not in phase_data:
                    phase_data[phase_code] = {
                        'phase_code': phase.phase_code,
                        'phase_description': phase.phase_description,
                        'quantity': float(phase.quantity) if phase.quantity else 0,
                        'installed_quantity': float(phase.installed_quantity) if phase.installed_quantity else 0,
                        'percent_complete': float(phase.percent_complete),
                        'meeting_date': phase.meeting_job.meeting.meeting_date.isoformat() if phase.meeting_job.meeting.meeting_date else None,
                        'updated_at': phase.updated_at.isoformat() if phase.updated_at else None,
                    }
            
            return Response({
                'project_id': project.id,
                'project_job_number': project.job_number,
                'phases': list(phase_data.values())
            }, status=status.HTTP_200_OK)
        except Project.DoesNotExist:
            return Response(
                {'detail': 'Project not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error getting project phases: {e}", exc_info=True)
            return Response(
                {'detail': f'Error getting project phases: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def destroy(self, request, *args, **kwargs):
        """Delete meeting - only admins and superadmins can delete."""
        user = request.user
        if user.role not in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']:
            return Response(
                {'detail': 'You do not have permission to delete meetings.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)
