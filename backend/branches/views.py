from rest_framework import viewsets, generics, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password, check_password
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings
from .models import Branch, BranchContact
from .serializers import BranchSerializer, BranchContactSerializer
from .permissions import BranchViewSetPermission
from accounts.permissions import IsRootSuperadmin
from audit.utils import log_action
import logging

logger = logging.getLogger(__name__)

User = get_user_model()


class BranchViewSet(viewsets.ModelViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    permission_classes = [BranchViewSetPermission]
    filterset_fields = ['status']
    search_fields = ['name', 'code']
    
    def destroy(self, request, *args, **kwargs):
        """
        Delete a branch. Can only delete if no projects, employees, or equipment are assigned.
        """
        branch = self.get_object()
        
        # Check for projects
        from projects.models import Project
        project_count = Project.objects.filter(branch=branch).count()
        
        # Check for employees (through projects or current_location)
        employee_count = User.objects.filter(
            Q(current_location__icontains=branch.name) |
            Q(project_assignments__project__branch=branch)
        ).distinct().count()
        
        # Check for equipment
        from equipment.models import EquipmentAssignment
        equipment_count = EquipmentAssignment.objects.filter(branch=branch, status='ACTIVE').count()
        
        if project_count > 0 or employee_count > 0 or equipment_count > 0:
            return Response({
                'detail': 'Cannot delete branch. It has associated projects, employees, or equipment.',
                'project_count': project_count,
                'employee_count': employee_count,
                'equipment_count': equipment_count,
                'requires_transfer': True,
            }, status=400)
        
        return super().destroy(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Deactivate a branch."""
        branch = self.get_object()
        branch.status = 'INACTIVE'
        branch.save()
        return Response(BranchSerializer(branch).data)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate a branch."""
        branch = self.get_object()
        branch.status = 'ACTIVE'
        branch.save()
        return Response(BranchSerializer(branch).data)
    
    @action(detail=True, methods=['post'])
    def transfer(self, request, pk=None):
        """
        Transfer all projects, employees, and equipment from this branch to another branch.
        """
        branch = self.get_object()
        target_branch_id = request.data.get('target_branch_id')
        
        if not target_branch_id:
            return Response(
                {'detail': 'target_branch_id is required.'},
                status=400
            )
        
        try:
            target_branch = Branch.objects.get(id=target_branch_id)
        except Branch.DoesNotExist:
            return Response(
                {'detail': 'Target branch not found.'},
                status=404
            )
        
        if target_branch.id == branch.id:
            return Response(
                {'detail': 'Cannot transfer to the same branch.'},
                status=400
            )
        
        transferred = {
            'projects': 0,
            'employees': 0,
            'equipment': 0,
        }
        
        # Transfer projects
        from projects.models import Project
        projects = Project.objects.filter(branch=branch)
        transferred['projects'] = projects.update(branch=target_branch)
        
        # Transfer employees (update current_location)
        employees = User.objects.filter(current_location__icontains=branch.name)
        for emp in employees:
            if emp.current_location:
                emp.current_location = emp.current_location.replace(branch.name, target_branch.name)
                emp.save()
                transferred['employees'] += 1
        
        # Transfer equipment assignments
        from equipment.models import EquipmentAssignment
        equipment = EquipmentAssignment.objects.filter(branch=branch, status='ACTIVE')
        transferred['equipment'] = equipment.update(branch=target_branch)
        
        return Response({
            'detail': 'Transfer completed successfully.',
            'transferred': transferred,
            'source_branch': BranchSerializer(branch).data,
            'target_branch': BranchSerializer(target_branch).data,
        })
    
    @action(detail=True, methods=['get'], url_path='detail')
    def detail(self, request, pk=None):
        """
        Get detailed information about a branch including employees, revenue, projects, and contacts.
        """
        try:
            # Get branch object
            try:
                branch = self.get_object()
            except Exception as e:
                return Response({'detail': f'Failed to get branch: {str(e)}'}, status=404)
            
            if not branch:
                return Response({'detail': 'Branch not found.'}, status=404)
            
            user = request.user
            if not user or not hasattr(user, 'is_authenticated') or not user.is_authenticated:
                return Response({'detail': 'Authentication required.'}, status=401)
            
            # Check if user has permission to view branch details
            can_view_details = user.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR', 'FINANCE']
            if not can_view_details:
                return Response(
                    {'detail': 'You do not have permission to view branch details.'},
                    status=403
                )
            
            # Get employees/workers at this branch
            # Users are linked to branches through their current_location or through projects
            # Projects have direct ForeignKeys: general_contractor, project_manager, superintendent
            try:
                employees = User.objects.filter(
                    Q(current_location__icontains=branch.name) |
                    Q(gc_projects__branch=branch) |  # General contractors
                    Q(pm_projects__branch=branch) |   # Project managers
                    Q(super_projects__branch=branch)  # Superintendents
                ).distinct().filter(
                    role__in=['WORKER', 'FOREMAN', 'SUPERINTENDENT', 'PROJECT_MANAGER', 'GENERAL_CONTRACTOR']
                )
            except Exception as e:
                # If query fails, try simpler query
                try:
                    employees = User.objects.filter(current_location__icontains=branch.name).filter(
                        role__in=['WORKER', 'FOREMAN', 'SUPERINTENDENT', 'PROJECT_MANAGER', 'GENERAL_CONTRACTOR']
                    )
                except Exception:
                    employees = User.objects.none()
            
            # Get projects for this branch
            try:
                from projects.models import Project
                projects = Project.objects.filter(branch=branch)
            except Exception:
                projects = Project.objects.none()
            
            # Calculate revenue
            try:
                total_contract_value = projects.aggregate(
                    total=Sum('contract_value')
                )['total'] or 0
            except Exception:
                total_contract_value = 0
            
            try:
                total_contract_balance = projects.aggregate(
                    total=Sum('contract_balance')
                )['total'] or 0
            except Exception:
                total_contract_balance = 0
            
            active_projects = projects.filter(status='ACTIVE').count() if projects else 0
            completed_projects = projects.filter(status='COMPLETED').count() if projects else 0
            pending_projects = projects.filter(status='PENDING').count() if projects else 0
            
            # Get contacts
            contacts_data = []
            try:
                contacts = BranchContact.objects.filter(branch=branch)
                if contacts.exists():
                    contacts_data = BranchContactSerializer(contacts, many=True).data
            except Exception as e:
                # If contacts fail to serialize, return empty list
                contacts_data = []
            
            # Get equipment at this branch
            equipment_count = 0
            try:
                from equipment.models import EquipmentAssignment
                equipment = EquipmentAssignment.objects.filter(
                    branch=branch,
                    status='ACTIVE'
                )
                equipment_count = equipment.count()
            except Exception:
                # If EquipmentAssignment doesn't exist or has different structure, set to 0
                equipment_count = 0
            
            # Serialize branch data using the serializer
            branch_data = BranchSerializer(branch).data
            
            # Safely serialize employees
            employees_list = []
            try:
                for emp in employees:
                    try:
                        emp_status = getattr(emp, 'status', 'ACTIVE') or 'ACTIVE'
                        employees_list.append({
                            'id': emp.id,
                            'first_name': getattr(emp, 'first_name', '') or '',
                            'last_name': getattr(emp, 'last_name', '') or '',
                            'email': getattr(emp, 'email', '') or '',
                            'phone_number': getattr(emp, 'phone_number', '') or '',
                            'role': getattr(emp, 'role', '') or '',
                            'role_display': emp.get_role_display() if hasattr(emp, 'get_role_display') else getattr(emp, 'role', ''),
                            'employee_number': getattr(emp, 'employee_number', '') or '',
                            'status': emp_status,
                        })
                    except Exception:
                        continue  # Skip problematic employee records
            except Exception:
                employees_list = []
            
            # Safely serialize projects
            projects_list = []
            try:
                for proj in (projects if hasattr(projects, '__iter__') else []):
                    try:
                        projects_list.append({
                            'id': proj.id,
                            'name': getattr(proj, 'name', '') or '',
                            'job_number': getattr(proj, 'job_number', '') or '',
                            'status': getattr(proj, 'status', '') or '',
                            'contract_value': float(proj.contract_value) if hasattr(proj, 'contract_value') and proj.contract_value is not None else None,
                            'contract_balance': float(proj.contract_balance) if hasattr(proj, 'contract_balance') and proj.contract_balance is not None else None,
                            'start_date': proj.start_date.isoformat() if hasattr(proj, 'start_date') and proj.start_date else None,
                        })
                    except Exception:
                        continue  # Skip problematic project records
            except Exception:
                projects_list = []
            
            return Response({
                'branch': branch_data,
                'employees': employees_list,
                'employee_count': len(employees_list),
                'active_employees': len([e for e in employees_list if e.get('status') == 'ACTIVE']),
                'projects': projects_list,
                'project_count': len(projects_list),
                'active_projects': active_projects,
                'completed_projects': completed_projects,
                'pending_projects': pending_projects,
                'revenue': {
                    'total_contract_value': float(total_contract_value),
                    'total_contract_balance': float(total_contract_balance),
                    'estimated_revenue': float(total_contract_value - total_contract_balance) if total_contract_value else 0,
                },
                'contacts': contacts_data,
                'equipment_count': equipment_count,
            })
        except Exception as e:
            import traceback
            import sys
            error_info = {
                'detail': f'An error occurred while fetching branch details: {str(e)}',
                'error_type': type(e).__name__,
            }
            # Only include traceback in development
            try:
                from django.conf import settings
                if settings.DEBUG:
                    error_info['traceback'] = traceback.format_exc()
            except Exception:
                pass
            return Response(error_info, status=500)
    
    @action(detail=True, methods=['get', 'post'], url_path='contacts')
    def contacts(self, request, pk=None):
        """Get or create contacts for a branch."""
        branch = self.get_object()
        
        if request.method == 'GET':
            contacts = BranchContact.objects.filter(branch=branch)
            serializer = BranchContactSerializer(contacts, many=True)
            return Response(serializer.data)
        
        elif request.method == 'POST':
            # Check permission
            if request.user.role not in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']:
                return Response(
                    {'detail': 'You do not have permission to manage contacts.'},
                    status=403
                )
            
            serializer = BranchContactSerializer(data={**request.data, 'branch': branch.id})
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=201)
            return Response(serializer.errors, status=400)
    
    @action(detail=True, methods=['post'], url_path='set-portal-password')
    def set_portal_password(self, request, pk=None):
        """
        Set or update portal password for a branch/division.
        Accessible by: Root Superadmin, Admin, and Branch Managers (for their own branch)
        """
        branch = self.get_object()
        user = request.user
        new_password = request.data.get('password', '').strip()
        
        # Check permissions
        is_admin = user.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']
        is_branch_manager = user.role == 'BRANCH_MANAGER'
        
        # Branch managers can only change their own branch's password
        if is_branch_manager:
            # Check if user is assigned to this branch
            user_branch = None
            if hasattr(user, 'current_location') and user.current_location:
                # Try to match by location or project assignments
                from projects.models import Project
                user_projects = Project.objects.filter(
                    Q(project_manager=user) | Q(superintendent=user)
                ).first()
                if user_projects and user_projects.branch == branch:
                    user_branch = branch
                elif branch.name.lower() in user.current_location.lower():
                    user_branch = branch
            
            if not user_branch or user_branch.id != branch.id:
                return Response(
                    {'detail': 'You can only change the portal password for your own branch.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        if not is_admin and not is_branch_manager:
            return Response(
                {'detail': 'You do not have permission to set portal passwords.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
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
        
        # Store old password for logging
        old_password_set = bool(branch.portal_password)
        
        # Hash and set new password
        branch.portal_password = make_password(new_password)
        branch.save()
        
        # Log the action
        action = 'UPDATE'  # Using standard audit action
        log_action(
            user=user,
            action=action,
            obj=branch,
            field_name='portal_password',
            old_value='***' if old_password_set else None,
            new_value='***',
            reason=f"Portal password {'set' if not old_password_set else 'changed'} for branch {branch.name} (Division {branch.spectrum_division_code or branch.code})",
            request=request
        )
        
        # Send email notification
        try:
            # Get recipients: admins and branch managers
            recipients = User.objects.filter(
                Q(role__in=['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']) |
                (Q(role='BRANCH_MANAGER') & Q(current_location__icontains=branch.name))
            ).exclude(email='').values_list('email', flat=True).distinct()
            
            if recipients:
                from django.contrib.sites.models import Site
                try:
                    current_site = Site.objects.get_current()
                    site_domain = current_site.domain
                except:
                    site_domain = request.get_host() if hasattr(request, 'get_host') else 'localhost:3000'
                
                context = {
                    'branch': branch,
                    'changed_by': user.get_full_name() or user.username,
                    'changed_by_email': user.email,
                    'action': 'set' if not old_password_set else 'changed',
                    'division_code': branch.spectrum_division_code or branch.code,
                    'request': request,
                }
                
                subject = f'Portal Password {"Set" if not old_password_set else "Changed"} - {branch.name}'
                try:
                    html_message = render_to_string('accounts/emails/portal_password_changed.html', context)
                    plain_message = render_to_string('accounts/emails/portal_password_changed.txt', context)
                except Exception as template_error:
                    # Fallback if template rendering fails
                    logger.error(f"Template rendering error: {template_error}")
                    html_message = None
                    plain_message = f"Portal password for {branch.name} (Division {branch.spectrum_division_code or branch.code}) has been {context['action']} by {context['changed_by']}."
                
                send_mail(
                    subject=subject,
                    message=plain_message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=list(recipients),
                    html_message=html_message,
                    fail_silently=True,
                )
        except Exception as e:
            # Log email error but don't fail the request
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send portal password change email: {e}")
        
        return Response({
            'detail': f'Portal password {"set" if not old_password_set else "changed"} successfully.',
            'branch': BranchSerializer(branch).data
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['get'], url_path='portal-password-status')
    def portal_password_status(self, request, pk=None):
        """
        Get portal password status (whether it's set, without revealing the password).
        """
        branch = self.get_object()
        user = request.user
        
        # Check permissions
        is_admin = user.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']
        is_branch_manager = user.role == 'BRANCH_MANAGER'
        
        if not is_admin and not is_branch_manager:
            return Response(
                {'detail': 'You do not have permission to view portal password status.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        return Response({
            'has_password': bool(branch.portal_password),
            'branch': {
                'id': branch.id,
                'name': branch.name,
                'code': branch.code,
                'spectrum_division_code': branch.spectrum_division_code,
            }
        })


class BranchContactViewSet(viewsets.ModelViewSet):
    """ViewSet for managing branch contacts."""
    queryset = BranchContact.objects.all()
    serializer_class = BranchContactSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = BranchContact.objects.all()
        branch_id = self.request.query_params.get('branch', None)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset
    
    def perform_create(self, serializer):
        # Check permission
        if self.request.user.role not in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You do not have permission to manage contacts.')
        serializer.save()
    
    def perform_update(self, serializer):
        # Check permission
        if self.request.user.role not in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You do not have permission to manage contacts.')
        serializer.save()
    
    def perform_destroy(self, instance):
        # Check permission
        if self.request.user.role not in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You do not have permission to manage contacts.')
        instance.delete()

