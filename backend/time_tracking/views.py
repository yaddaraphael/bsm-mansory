from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Sum, Count
from .models import TimeEntry, TimeCorrectionRequest, PayPeriod
from .serializers import (
    TimeEntrySerializer, TimeCorrectionRequestSerializer, PayPeriodSerializer
)
from audit.utils import log_action


class TimeEntryViewSet(viewsets.ModelViewSet):
    queryset = TimeEntry.objects.all()
    serializer_class = TimeEntrySerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['employee', 'project', 'date', 'status']
    search_fields = ['employee__username', 'project__job_number']
    
    def get_queryset(self):
        """Filter by user's allowed projects."""
        user = self.request.user
        queryset = super().get_queryset()
        
        # Admin roles (HR, ADMIN, etc.) can see all time entries
        if user.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR', 'FINANCE']:
            # These roles can see all entries - no filtering needed
            pass
        # Laborers and other field workers can only see their own entries
        elif user.role in ['LABORER', 'MASON', 'OPERATOR', 'BRICKLAYER', 'PLASTER']:
            queryset = queryset.filter(employee=user)
        # Project Managers, Superintendents, and Foremen can see entries for their projects
        elif user.role in ['PROJECT_MANAGER', 'SUPERINTENDENT', 'FOREMAN', 'GENERAL_CONTRACTOR']:
            # Get projects they manage
            from projects.models import Project
            if user.role == 'FOREMAN':
                projects = Project.objects.filter(foreman=user)
            elif user.role == 'SUPERINTENDENT':
                projects = Project.objects.filter(superintendent=user)
            elif user.role == 'PROJECT_MANAGER':
                projects = Project.objects.filter(project_manager=user)
            elif user.role == 'GENERAL_CONTRACTOR':
                projects = Project.objects.filter(general_contractor=user)
            else:
                projects = Project.objects.none()
            
            project_ids = projects.values_list('id', flat=True)
            queryset = queryset.filter(project__in=project_ids)
        # Apply project scope filtering for other roles
        elif user.scope == 'PROJECT':
            allowed_projects = user.project_assignments.filter(status='ACTIVE').values_list('project', flat=True)
            queryset = queryset.filter(project__in=allowed_projects)
        
        return queryset.select_related('employee', 'project', 'approved_by')
    
    @action(detail=False, methods=['post'])
    def clock_in(self, request):
        """Clock in to a project."""
        project_id = request.data.get('project')
        cost_code = request.data.get('cost_code')
        scope = request.data.get('scope')
        location = request.data.get('location')
        
        # Verify project access
        user = request.user
        
        # Foremen must provide full project details
        if user.role == 'FOREMAN':
            if not project_id:
                return Response(
                    {'error': 'Foremen must specify a project when clocking in'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if not scope:
                return Response(
                    {'error': 'Foremen must specify scope of work when clocking in'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Laborers and field workers can use assigned scope if not provided
        if user.role in ['LABORER', 'MASON', 'OPERATOR', 'BRICKLAYER', 'PLASTER'] and not scope:
            # Try to get scope from active project assignment
            from accounts.models import ProjectAssignment
            assignment = ProjectAssignment.objects.filter(
                employee=user,
                project_id=project_id,
                status='ACTIVE'
            ).first()
            if assignment and assignment.scope:
                scope = assignment.scope
        
        # Verify project access
        from projects.models import Project
        try:
            project = Project.objects.get(id=project_id)
        except Project.DoesNotExist:
            return Response(
                {'error': 'Project not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check access based on role
        has_access = False
        
        if user.role in ['LABORER', 'MASON', 'OPERATOR', 'BRICKLAYER', 'PLASTER']:
            # Field workers can only clock in to assigned projects
            from accounts.models import ProjectAssignment
            has_access = ProjectAssignment.objects.filter(
                employee=user,
                project=project,
                status='ACTIVE'
            ).exists()
        elif user.role == 'FOREMAN':
            # Foremen can clock in to projects where they're assigned as foreman or through assignments
            from accounts.models import ProjectAssignment
            has_access = (project.foreman == user) or ProjectAssignment.objects.filter(
                employee=user,
                project=project,
                status='ACTIVE'
            ).exists()
        elif user.role == 'PROJECT_MANAGER':
            has_access = project.project_manager == user
        elif user.role == 'SUPERINTENDENT':
            has_access = project.superintendent == user
        elif user.role == 'GENERAL_CONTRACTOR':
            has_access = project.general_contractor == user
        elif user.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR', 'FINANCE']:
            has_access = True
        
        if not has_access:
            return Response(
                {'error': 'You do not have access to this project'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if already clocked in
        active_entry = TimeEntry.objects.filter(
            employee=user,
            clock_out__isnull=True
        ).first()
        
        if active_entry:
            return Response(
                {'error': 'You are already clocked in', 'entry': TimeEntrySerializer(active_entry).data},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Project already retrieved above
        
        entry = TimeEntry.objects.create(
            employee=user,
            project=project,
            date=timezone.now().date(),
            clock_in=timezone.now(),
            role_on_day=user.role if user.role in ['LABORER', 'MASON', 'OPERATOR', 'BRICKLAYER', 'PLASTER', 'FOREMAN'] else 'LABORER',
            cost_code=cost_code,
            scope=scope,
            clock_in_location=location,
            source='MOBILE' if request.data.get('source') == 'mobile' else 'WEB',
            status='DRAFT'
        )
        
        # Log the clock in
        log_action(
            user=user,
            action='CREATE',
            obj=entry,
            reason=f"Clocked in to project {project.job_number}",
            request=request
        )
        
        return Response(TimeEntrySerializer(entry).data, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['post'])
    def clock_out(self, request):
        """Clock out from current project."""
        user = request.user
        active_entry = TimeEntry.objects.filter(
            employee=user,
            clock_out__isnull=True
        ).first()
        
        if not active_entry:
            return Response(
                {'error': 'You are not currently clocked in'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        location = request.data.get('location')
        break_duration = request.data.get('break_duration_minutes', 0)
        
        old_status = active_entry.status
        active_entry.clock_out = timezone.now()
        active_entry.clock_out_location = location
        active_entry.break_duration_minutes = break_duration
        active_entry.status = 'SUBMITTED'
        
        # Calculate overtime
        ot_calc = active_entry.calculate_overtime()
        active_entry.regular_hours = ot_calc['regular_hours']
        active_entry.overtime_hours = ot_calc['overtime_hours']
        
        active_entry.save()
        
        # Log the clock out
        log_action(
            user=user,
            action='UPDATE',
            obj=active_entry,
            field_name='status',
            old_value=old_status,
            new_value='SUBMITTED',
            reason=f"Clocked out from project {active_entry.project.job_number}",
            request=request
        )
        
        return Response(TimeEntrySerializer(active_entry).data)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve time entry. Foremen can approve worker entries."""
        entry = self.get_object()
        user = request.user
        
        # Check permissions
        can_approve = user.role in ['FOREMAN', 'SUPERINTENDENT', 'PROJECT_MANAGER', 'HR', 'ADMIN', 'ROOT_SUPERADMIN', 'SUPERADMIN']
        
        # Foremen can only approve entries for workers on their projects
        if user.role == 'FOREMAN':
            # Check if foreman is assigned to the project
            from projects.models import Project
            project = entry.project
            if project.foreman != user:
                # Check if user is a foreman on this project through assignments
                from accounts.models import ProjectAssignment
                is_assigned = ProjectAssignment.objects.filter(
                    employee=user,
                    project=project,
                    status='ACTIVE'
                ).exists()
                if not is_assigned:
                    return Response(
                        {'error': 'You can only approve entries for workers on your assigned projects'},
                        status=status.HTTP_403_FORBIDDEN
                    )
            # Foremen can only approve worker entries, not other foremen
            if entry.role_on_day == 'FOREMAN':
                return Response(
                    {'error': 'Foremen cannot approve other foremen entries'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        if not can_approve:
            return Response(
                {'error': 'You do not have permission to approve time entries'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if entry.status != 'SUBMITTED':
            return Response(
                {'error': 'Entry must be submitted first'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        old_status = entry.status
        entry.status = 'APPROVED'
        entry.approved_by = request.user
        entry.approved_on = timezone.now()
        entry.save()
        
        # Log the approval
        log_action(
            user=request.user,
            action='APPROVE',
            obj=entry,
            field_name='status',
            old_value=old_status,
            new_value='APPROVED',
            reason=f"Approved time entry for {entry.employee.get_full_name() or entry.employee.username}",
            request=request
        )
        
        return Response(TimeEntrySerializer(entry).data)
    
    @action(detail=False, methods=['get'])
    def my_time(self, request):
        """Get current user's time entries."""
        user = request.user
        entries = TimeEntry.objects.filter(employee=user).order_by('-date', '-clock_in')
        serializer = self.get_serializer(entries, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get time summary (day/week/month/quarter/half_year/year)."""
        user = request.user
        period = request.query_params.get('period', 'week')  # day, week, month, quarter, half_year, year
        employee_id = request.query_params.get('employee_id')  # For admins/foremen to view others
        
        # Check if user can view other employees' time
        target_user = user
        if employee_id and employee_id != str(user.id):
            can_view_others = user.role in [
                'ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR', 'FINANCE',
                'PROJECT_MANAGER', 'SUPERINTENDENT', 'FOREMAN'
            ]
            if not can_view_others:
                return Response(
                    {'error': 'You do not have permission to view other employees\' time'},
                    status=status.HTTP_403_FORBIDDEN
                )
            from accounts.models import User
            try:
                target_user = User.objects.get(id=employee_id)
            except User.DoesNotExist:
                return Response(
                    {'error': 'Employee not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
        
        from datetime import datetime, timedelta
        now = timezone.now()
        
        if period == 'day':
            start = now.date()
            end = now.date()
        elif period == 'week':
            start = (now - timedelta(days=now.weekday())).date()
            end = start + timedelta(days=6)
        elif period == 'month':
            start = now.replace(day=1).date()
            if now.month == 12:
                end = now.replace(year=now.year + 1, month=1, day=1).date() - timedelta(days=1)
            else:
                end = now.replace(month=now.month + 1, day=1).date() - timedelta(days=1)
        elif period == 'quarter':
            quarter = (now.month - 1) // 3
            start = now.replace(month=quarter * 3 + 1, day=1).date()
            if quarter == 3:
                end = now.replace(year=now.year + 1, month=1, day=1).date() - timedelta(days=1)
            else:
                end = now.replace(month=(quarter + 1) * 3 + 1, day=1).date() - timedelta(days=1)
        elif period == 'half_year':
            half = 0 if now.month <= 6 else 1
            start = now.replace(month=half * 6 + 1, day=1).date()
            if half == 1:
                end = now.replace(year=now.year + 1, month=1, day=1).date() - timedelta(days=1)
            else:
                end = now.replace(month=7, day=1).date() - timedelta(days=1)
        elif period == 'year':
            start = now.replace(month=1, day=1).date()
            end = now.replace(year=now.year + 1, month=1, day=1).date() - timedelta(days=1)
        else:  # default to week
            start = (now - timedelta(days=now.weekday())).date()
            end = start + timedelta(days=6)
        
        entries = TimeEntry.objects.filter(
            employee=target_user,
            date__range=[start, end],
            status__in=['APPROVED', 'SUBMITTED']
        )
        
        # Calculate totals using stored overtime values if available
        total_hours = sum(entry.total_hours for entry in entries)
        total_regular = sum(
            float(entry.regular_hours) if entry.regular_hours else entry.total_hours 
            for entry in entries
        )
        total_ot = sum(
            float(entry.overtime_hours) if entry.overtime_hours else 0 
            for entry in entries
        )
        
        # Fallback calculation if overtime not stored
        if total_ot == 0 and period == 'week':
            total_regular = min(total_hours, 40)
            total_ot = max(0, total_hours - 40)
        
        days_worked = entries.values('date').distinct().count()
        
        return Response({
            'period': period,
            'start_date': start,
            'end_date': end,
            'total_hours': round(total_hours, 2),
            'regular_hours': round(total_regular, 2),
            'overtime_hours': round(total_ot, 2),
            'days_worked': days_worked,
            'entries_count': entries.count(),
            'employee_id': target_user.id,
            'employee_name': target_user.get_full_name() or target_user.username
        })
    
    @action(detail=False, methods=['get'])
    def all_clock_ins(self, request):
        """Get all clock-in times (for root admin and authorized roles)."""
        user = request.user
        
        # Only root admin and authorized roles can see all clock-ins
        if user.role not in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR', 'FINANCE']:
            return Response(
                {'error': 'You do not have permission to view all clock-ins'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        from datetime import timedelta
        days = int(request.query_params.get('days', 7))  # Default to last 7 days
        start_date = timezone.now().date() - timedelta(days=days)
        
        entries = TimeEntry.objects.filter(
            date__gte=start_date
        ).order_by('-date', '-clock_in')
        
        serializer = self.get_serializer(entries, many=True)
        return Response({
            'count': entries.count(),
            'results': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def time_stats(self, request):
        """Get time statistics for dashboard cards."""
        user = request.user
        period = request.query_params.get('period', 'week')  # day, week, month
        
        from datetime import timedelta
        now = timezone.now()
        
        if period == 'day':
            start = now.date()
            end = now.date()
        elif period == 'week':
            start = (now - timedelta(days=now.weekday())).date()
            end = start + timedelta(days=6)
        else:  # month
            start = now.replace(day=1).date()
            if now.month == 12:
                end = now.replace(year=now.year + 1, month=1, day=1).date() - timedelta(days=1)
            else:
                end = now.replace(month=now.month + 1, day=1).date() - timedelta(days=1)
        
        # Get entries based on user role
        if user.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR', 'FINANCE']:
            entries = TimeEntry.objects.filter(
                date__range=[start, end],
                status__in=['APPROVED', 'SUBMITTED']
            )
        elif user.role in ['PROJECT_MANAGER', 'SUPERINTENDENT', 'FOREMAN']:
            # Get entries for projects they manage
            from projects.models import Project
            if user.role == 'FOREMAN':
                projects = Project.objects.filter(foreman=user)
            elif user.role == 'SUPERINTENDENT':
                projects = Project.objects.filter(superintendent=user)
            else:  # PROJECT_MANAGER
                projects = Project.objects.filter(project_manager=user)
            
            entries = TimeEntry.objects.filter(
                project__in=projects,
                date__range=[start, end],
                status__in=['APPROVED', 'SUBMITTED']
            )
        else:
            entries = TimeEntry.objects.filter(
                employee=user,
                date__range=[start, end],
                status__in=['APPROVED', 'SUBMITTED']
            )
        
        total_hours = sum(entry.total_hours for entry in entries)
        total_regular = sum(
            float(entry.regular_hours) if entry.regular_hours else entry.total_hours 
            for entry in entries
        )
        total_ot = sum(
            float(entry.overtime_hours) if entry.overtime_hours else 0 
            for entry in entries
        )
        
        unique_employees = entries.values('employee').distinct().count()
        unique_projects = entries.values('project').distinct().count()
        
        return Response({
            'period': period,
            'start_date': start,
            'end_date': end,
            'total_hours': round(total_hours, 2),
            'regular_hours': round(total_regular, 2),
            'overtime_hours': round(total_ot, 2),
            'employees_count': unique_employees,
            'projects_count': unique_projects,
            'entries_count': entries.count()
        })


class TimeCorrectionRequestViewSet(viewsets.ModelViewSet):
    queryset = TimeCorrectionRequest.objects.all()
    serializer_class = TimeCorrectionRequestSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['employee', 'project', 'status']
    
    def get_queryset(self):
        """Filter by user role."""
        user = self.request.user
        queryset = super().get_queryset()
        
        if user.role in ['LABORER', 'MASON', 'OPERATOR', 'BRICKLAYER', 'PLASTER']:
            queryset = queryset.filter(employee=user)
        
        return queryset


class PayPeriodViewSet(viewsets.ModelViewSet):
    queryset = PayPeriod.objects.all()
    serializer_class = PayPeriodSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_locked']
    
    @action(detail=True, methods=['post'])
    def lock(self, request, pk=None):
        """Lock pay period."""
        period = self.get_object()
        if period.is_locked:
            return Response(
                {'error': 'Pay period is already locked'},
                status=status.HTTP_400_BAD_REQUEST
            )
        period.is_locked = True
        period.locked_by = request.user
        period.locked_on = timezone.now()
        period.save()
        return Response(PayPeriodSerializer(period).data)

