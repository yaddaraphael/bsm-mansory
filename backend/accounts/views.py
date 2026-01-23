from rest_framework import generics, status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from django.contrib.auth import authenticate
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework_simplejwt.tokens import RefreshToken
from .models import PermissionChangeLog, Notification, ProjectAssignment
from .serializers import UserSerializer, InviteUserSerializer, NotificationSerializer, ProjectAssignmentSerializer
from .permissions import CanInviteUsers
from audit.utils import log_action

User = get_user_model()


class CustomLoginView(APIView):
    """Custom login that accepts email or username."""
    permission_classes = []
    
    def post(self, request):
        identifier = request.data.get('username') or request.data.get('email')
        password = request.data.get('password')
        
        if not identifier or not password:
            return Response(
                {'detail': 'Username/email and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Try to find user by email or username
        try:
            if '@' in identifier:
                user = User.objects.get(email=identifier)
            else:
                user = User.objects.get(username=identifier)
        except User.DoesNotExist:
            return Response(
                {'detail': 'Invalid credentials.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Authenticate user
        user = authenticate(username=user.username, password=password)
        if user is None:
            return Response(
                {'detail': 'Invalid credentials.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        if not user.is_active:
            return Response(
                {'detail': 'User account is disabled.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Check if invited user has verified their email
        if user.invited_by and not user.email_verified:
            return Response(
                {'detail': 'Please verify your email address by clicking the activation link sent to your email before logging in.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Generate tokens
        refresh = RefreshToken.for_user(user)
        
        # Include user info in response
        user_serializer = UserSerializer(user)
        
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': user_serializer.data,  # Include user data with role
        })


class ForgotPasswordView(APIView):
    """Request password reset."""
    permission_classes = []
    
    def post(self, request):
        email = request.data.get('email')
        
        if not email:
            return Response(
                {'detail': 'Email is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Don't reveal if email exists for security
            return Response(
                {'detail': 'If an account exists with this email, a password reset link has been sent.'},
                status=status.HTTP_200_OK
            )
        
        # Generate reset token
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        
        # Send email
        reset_url = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
        
        context = {
            'user': user,
            'reset_url': reset_url,
        }
        
        try:
            html_message = render_to_string('accounts/emails/reset_password.html', context)
            plain_message = render_to_string('accounts/emails/reset_password.txt', context)
            
            send_mail(
                subject='BSM System - Password Reset Request',
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL or 'noreply@bsm.com',
                recipient_list=[user.email],
                html_message=html_message,
                fail_silently=False,
            )
        except Exception as e:
            print(f"Failed to send password reset email: {e}")
        
        return Response(
            {'detail': 'If an account exists with this email, a password reset link has been sent.'},
            status=status.HTTP_200_OK
        )


class ResetPasswordView(APIView):
    """Reset password with token."""
    permission_classes = []
    
    def post(self, request):
        uid = request.data.get('uid')
        token = request.data.get('token')
        new_password = request.data.get('new_password')
        
        if not uid or not token or not new_password:
            return Response(
                {'detail': 'UID, token, and new password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response(
                {'detail': 'Invalid reset link.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Verify token
        if not default_token_generator.check_token(user, token):
            return Response(
                {'detail': 'Invalid or expired reset token.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Set new password
        user.set_password(new_password)
        user.save()
        
        return Response({'detail': 'Password has been reset successfully.'})


class ActivateAccountView(APIView):
    """Activate account by setting password (for invited users)."""
    permission_classes = []
    
    def post(self, request):
        uid = request.data.get('uid')
        token = request.data.get('token')
        password = request.data.get('password')
        password_confirm = request.data.get('password_confirm')
        
        if not uid or not token or not password:
            return Response(
                {'detail': 'UID, token, and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if password != password_confirm:
            return Response(
                {'detail': 'Passwords do not match.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response(
                {'detail': 'Invalid activation link.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Verify token
        if not default_token_generator.check_token(user, token):
            return Response(
                {'detail': 'Invalid or expired activation token.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if user has already activated (has a usable password set)
        # Allow reactivation if user hasn't logged in yet (password might have been set but not used)
        if user.has_usable_password() and user.last_login:
            return Response(
                {'detail': 'Account has already been activated and you have logged in. Please use the login page.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate password strength
        try:
            validate_password(password, user)
        except ValidationError as e:
            return Response(
                {
                    'detail': 'Password does not meet requirements.',
                    'errors': e.messages
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Set password, verify email, and activate account
        user.set_password(password)
        user.email_verified = True
        user.email_verified_at = timezone.now()
        user.is_active = True
        user.status = 'ACTIVE'
        user.save()
        
        # Refresh user from database to ensure all changes are persisted
        user.refresh_from_db()
        
        return Response({
            'detail': 'Account activated and email verified successfully. You can now log in.',
            'email': user.email
        })


class ChangePasswordView(APIView):
    """Change user password."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        current_password = request.data.get('current_password')
        new_password = request.data.get('new_password')
        
        if not current_password or not new_password:
            return Response(
                {'detail': 'Current password and new password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user = request.user
        
        # Verify current password
        if not user.check_password(current_password):
            return Response(
                {'detail': 'Current password is incorrect.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Set new password
        user.set_password(new_password)
        user.save()
        
        return Response({'detail': 'Password changed successfully.'})


class RegisterView(generics.CreateAPIView):
    """User registration (typically for initial setup or public registration if enabled)."""
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = []  # Public registration if needed, or restrict as needed


class UserProfileView(generics.RetrieveUpdateAPIView):
    """Get and update current user profile."""
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    
    def get_object(self):
        return self.request.user


class InviteUserView(generics.CreateAPIView):
    """Invite a new user (only for users with invite permission)."""
    serializer_class = InviteUserSerializer
    permission_classes = [IsAuthenticated, CanInviteUsers]
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Check if user is trying to invite a role they don't have permission for
        requested_role = serializer.validated_data.get('role')
        
        # Use the helper method to check permissions
        if not request.user.can_invite_role(requested_role):
            return Response(
                {'detail': f'You do not have permission to invite users with role: {requested_role}'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = serializer.save()
        user.invited_by = self.request.user
        user.invited_on = timezone.now()
        user.role_assigned_by = self.request.user
        user.role_assigned_on = timezone.now()
        
        # Set division if provided (required for Branch Managers)
        division = serializer.validated_data.get('division')
        if user.role == 'BRANCH_MANAGER':
            if not division:
                return Response(
                    {'detail': 'Division is required for Branch Managers.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            user.division = division
        else:
            user.division = division  # Allow setting for other roles too (can be None)
        
        # Save user first to ensure all fields are persisted
        user.save()
        
        # Refresh user from database to ensure we have the latest state
        # This is important for token generation which uses password hash and last_login
        user.refresh_from_db()
        
        # Log permission change
        PermissionChangeLog.objects.create(
            user=user,
            changed_by=self.request.user,
            field_changed='role',
            old_value=None,
            new_value=user.role,
            reason=f'Initial role assignment during invitation'
        )
        
        # Log audit action
        log_action(
            user=self.request.user,
            action='INVITE',
            obj=user,
            field_name='role',
            old_value=None,
            new_value=user.role,
            reason=f"Invited user {user.email} with role {user.role}",
            request=request
        )
        
        # Create notification for the invited user
        Notification.objects.create(
            user=user,
            type='INVITATION',
            title='Welcome to BSM System',
            message=f'You have been invited to join BSM System by {self.request.user.get_full_name() or self.request.user.username}. Check your email for login credentials.',
            link='/login'
        )
        
        # Send activation email (no password - user sets it themselves)
        # Generate token after user is fully saved and refreshed
        email_error = self.send_activation_email(user)
        
        # Update email status in database
        if email_error:
            user.invitation_email_sent = False
            user.invitation_email_error = str(email_error)
        else:
            user.invitation_email_sent = True
            user.invitation_email_sent_at = timezone.now()
            user.invitation_email_error = None
        user.save()
        
        # Prepare response
        response_data = serializer.data
        if email_error:
            response_data['email_error'] = email_error
            response_data['email_sent'] = False
            response_data['message'] = 'User account created successfully, but the invitation email could not be sent. You can resend the email from the Invited Users page.'
        else:
            response_data['email_sent'] = True
            response_data['message'] = 'User invited successfully and activation email sent.'
        
        headers = self.get_success_headers(serializer.data)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)
    
    def send_activation_email(self, user):
        """Send invitation email with role-specific template."""
        # Ensure user is refreshed from database before generating token
        # Token generation uses password hash and last_login, so we need fresh data
        user.refresh_from_db()
        
        role_templates = {
            'WORKER': 'accounts/emails/invite_worker.html',
            'FOREMAN': 'accounts/emails/invite_foreman.html',
            'SUPERINTENDENT': 'accounts/emails/invite_superintendent.html',
            'PROJECT_MANAGER': 'accounts/emails/invite_pm.html',
            'HR': 'accounts/emails/invite_hr.html',
            'FINANCE': 'accounts/emails/invite_finance.html',
            'AUDITOR': 'accounts/emails/invite_auditor.html',
            'ADMIN': 'accounts/emails/invite_admin.html',
            'SYSTEM_ADMIN': 'accounts/emails/invite_system_admin.html',
            'SUPERADMIN': 'accounts/emails/invite_superadmin.html',
            'ROOT_SUPERADMIN': 'accounts/emails/invite_superadmin.html',  # Use superadmin template
            'GENERAL_CONTRACTOR': 'accounts/emails/invite_gc.html',
            'BRANCH_MANAGER': 'accounts/emails/invite_admin.html',  # Use admin template for branch managers
        }
        
        template = role_templates.get(user.role, 'accounts/emails/invite_default.html')
        
        # Generate activation token - ensure user is fully saved before this
        from django.contrib.auth.tokens import default_token_generator
        # Generate token after ensuring user is fresh from database
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        activation_url = f"{settings.FRONTEND_URL or 'http://localhost:3000'}/activate?uid={uid}&token={token}"
        
        # Logo URL for emails (use absolute URL)
        logo_url = f"{settings.FRONTEND_URL or 'http://localhost:3000'}/images/logo.png"
        
        context = {
            'user': user,
            'invited_by': self.request.user,
            'activation_url': activation_url,
            'login_url': f"{settings.FRONTEND_URL or 'http://localhost:3000'}/login",
            'logo_url': logo_url,
        }
        
        email_error = None
        try:
            html_message = render_to_string(template, context)
            plain_template = template.replace('.html', '.txt')
            try:
                plain_message = render_to_string(plain_template, context)
            except:
                plain_message = f"Welcome to BSM System. Please activate your account by visiting: {activation_url}"
            
            send_mail(
                subject=f'Activate Your BSM System Account - {user.get_role_display()}',
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL or 'noreply@bsm.com',
                recipient_list=[user.email],
                html_message=html_message,
                fail_silently=False,
            )
        except Exception as e:
            # Log error and store it to return to frontend
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send invitation email: {e}", exc_info=True)
            
            # Provide user-friendly error messages
            error_str = str(e)
            if '535' in error_str or 'Incorrect authentication data' in error_str or 'SMTPAuthenticationError' in error_str:
                email_error = 'Email authentication failed. Please check your EMAIL_HOST_USER and EMAIL_HOST_PASSWORD in .env file.'
            elif 'Connection unexpectedly closed' in error_str or 'SMTPServerDisconnected' in error_str:
                email_error = 'Email server connection failed. Please check your EMAIL_HOST and EMAIL_PORT settings.'
            elif 'getaddrinfo failed' in error_str or 'Name or service not known' in error_str:
                email_error = 'Email server hostname could not be resolved. Please check your EMAIL_HOST setting.'
            else:
                email_error = f'Email sending failed: {error_str}'
            
            print(f"Failed to send invitation email: {e}")
        
        # Store email error in user instance or return it
        # We'll return it in the response
        return email_error


class UserListView(generics.ListAPIView):
    """List users (with appropriate filtering based on role)."""
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        queryset = User.objects.all().select_related('invited_by', 'role_assigned_by')
        
        # Only admins and HR can see all users
        # Other roles see filtered users based on scope
        if user.role not in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR']:
            # Apply scope filtering based on user's role and scope
            if user.scope == 'BRANCH':
                # Filter by branch if user has branch scope
                pass  # Will implement when branch model is ready
            elif user.scope == 'PROJECT':
                # Filter by assigned projects
                project_ids = user.project_assignments.values_list('project', flat=True)
                if project_ids:
                    queryset = queryset.filter(project_assignments__project__in=project_ids).distinct()
                else:
                    # If no projects assigned, return empty queryset
                    queryset = User.objects.none()
        
        # Apply search filter
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(email__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(username__icontains=search) |
                Q(employee_number__icontains=search)
            )
        
        # Apply role filter
        role = self.request.query_params.get('role', None)
        if role:
            queryset = queryset.filter(role=role)
        
        # Apply status filter
        status = self.request.query_params.get('status', None)
        if status:
            if status == 'ACTIVE':
                queryset = queryset.filter(is_active=True, status='ACTIVE')
            elif status == 'INACTIVE':
                queryset = queryset.filter(Q(is_active=False) | Q(status='INACTIVE'))
        
        return queryset.order_by('-created_at')


class UserDetailView(generics.RetrieveAPIView, generics.DestroyAPIView):
    """Get user details by ID or delete user."""
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        
        # Only admins and HR can see all users
        if user.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR']:
            return User.objects.all().select_related('invited_by', 'role_assigned_by')
        
        # Other users can only see themselves
        return User.objects.filter(id=user.id)
    
    def get_object(self):
        queryset = self.get_queryset()
        obj = get_object_or_404(queryset, pk=self.kwargs['pk'])
        return obj
    
    def destroy(self, request, *args, **kwargs):
        """Delete a user."""
        # Check permissions - only admins and HR can delete users
        if request.user.role not in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR']:
            return Response(
                {'detail': 'You do not have permission to delete users.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user_to_delete = self.get_object()
        
        # Prevent users from deleting themselves
        if request.user.id == user_to_delete.id:
            return Response(
                {'detail': 'You cannot delete your own account.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Prevent deleting root superadmin
        if user_to_delete.role == 'ROOT_SUPERADMIN' and request.user.role != 'ROOT_SUPERADMIN':
            return Response(
                {'detail': 'You do not have permission to delete a root superadmin.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Log the deletion action
        user_name = user_to_delete.get_full_name() or user_to_delete.username
        log_action(
            user=request.user,
            action='DELETE',
            content_type='user',
            object_id=user_to_delete.id,
            object_repr=f'{user_name} ({user_to_delete.email})',
            old_value='ACTIVE',
            new_value='DELETED',
        )
        
        # Store user info before deletion for audit log
        user_id_for_log = user_to_delete.id
        user_email_for_log = user_to_delete.email
        user_name_for_log = user_name
        user_role_for_log = user_to_delete.role
        
        # Delete the user
        user_to_delete.delete()
        
        return Response(
            {
                'detail': 'User deleted successfully.',
                'deleted_user': {
                    'id': user_id_for_log,
                    'name': user_name_for_log,
                    'email': user_email_for_log,
                    'role': user_role_for_log,
                }
            },
            status=status.HTTP_200_OK
        )


class UserActivateDeactivateView(APIView):
    """Activate or deactivate a user."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request, user_id):
        if not request.user.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR']:
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Prevent deactivating root superadmin
        if target_user.role == 'ROOT_SUPERADMIN' and request.user.id != target_user.id:
            return Response(
                {'detail': 'Cannot deactivate root superadmin.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        action = request.data.get('action')  # 'activate' or 'deactivate'
        
        if action == 'deactivate':
            target_user.is_active = False
            target_user.status = 'INACTIVE'
            message = f'User {target_user.get_full_name() or target_user.username} has been deactivated.'
        elif action == 'activate':
            target_user.is_active = True
            target_user.status = 'ACTIVE'
            message = f'User {target_user.get_full_name() or target_user.username} has been activated.'
        else:
            return Response(
                {'detail': 'Invalid action. Use "activate" or "deactivate".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        target_user.save()
        
        # Log the change
        PermissionChangeLog.objects.create(
            user=target_user,
            changed_by=request.user,
            field_changed='status',
            old_value='ACTIVE' if action == 'deactivate' else 'INACTIVE',
            new_value=target_user.status,
            reason=f'User {action}d by {request.user.get_full_name() or request.user.username}'
        )
        
        return Response({
            'detail': message,
            'user': UserSerializer(target_user).data
        })


class NotificationListView(generics.ListAPIView):
    """List notifications for current user."""
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)


class NotificationDetailView(generics.RetrieveUpdateAPIView):
    """Get and mark notification as read."""
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)
    
    def update(self, request, *args, **kwargs):
        notification = self.get_object()
        if request.data.get('is_read'):
            notification.mark_as_read()
        return Response(NotificationSerializer(notification).data)


class NotificationMarkAllReadView(APIView):
    """Mark all notifications as read."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        count = Notification.objects.filter(
            user=request.user,
            is_read=False
        ).update(
            is_read=True,
            read_at=timezone.now()
        )
        return Response({'marked_read': count})


class NotificationUnreadCountView(APIView):
    """Get unread notification count."""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        count = Notification.objects.filter(
            user=request.user,
            is_read=False
        ).count()
        return Response({'unread_count': count})


class DashboardStatsView(APIView):
    """Get dashboard statistics based on user role."""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        user = request.user
        role = user.role
        
        stats = {}
        users_by_role = {}
        
        # Get all users grouped by role (for all dashboards)
        from accounts.models import User as UserModel
        all_users = UserModel.objects.filter(status='ACTIVE').select_related('invited_by', 'role_assigned_by')
        
        # Group users by role
        for user_obj in all_users:
            role_key = user_obj.role
            if role_key not in users_by_role:
                users_by_role[role_key] = []
            users_by_role[role_key].append({
                'id': user_obj.id,
                'first_name': user_obj.first_name,
                'last_name': user_obj.last_name,
                'username': user_obj.username,
                'email': user_obj.email,
                'role': user_obj.role,
                'role_display': user_obj.get_role_display(),
                'status': user_obj.status,
            })
        
        if role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']:
            from projects.models import Project
            from django.db.models import Sum, Count, Q
            from branches.models import Branch
            from spectrum.models import SpectrumJob
            
            # Use distinct() to ensure no duplicates and filter out any invalid projects
            # Exclude projects with null or empty job_numbers
            # Only count Projects that have a corresponding SpectrumJob (imported from Spectrum)
            # This ensures the count matches the dashboard's "Imported Jobs (Spectrum)" count
            from django.db.models import Count
            
            # Get valid job numbers from SpectrumJob (imported jobs)
            valid_job_numbers = SpectrumJob.objects.values_list('job_number', flat=True).distinct()
            base_projects = Project.objects.exclude(job_number__isnull=True).exclude(job_number='').filter(job_number__in=valid_job_numbers)
            projects = base_projects.distinct()
            active_projects = base_projects.filter(status='ACTIVE')
            pending_projects = base_projects.filter(status='PENDING')
            completed_projects = base_projects.filter(status='COMPLETED')
            inactive_projects = base_projects.filter(status='INACTIVE')
            
            # Calculate revenue statistics
            total_contract_value = projects.aggregate(
                total=Sum('contract_value')
            )['total'] or 0
            
            total_contract_balance = projects.aggregate(
                total=Sum('contract_balance')
            )['total'] or 0
            
            # Count projects by status using Count with distinct=True on job_number
            projects_by_status = {
                'active': active_projects.aggregate(count=Count('job_number', distinct=True))['count'] or 0,
                'pending': pending_projects.aggregate(count=Count('job_number', distinct=True))['count'] or 0,
                'completed': completed_projects.aggregate(count=Count('job_number', distinct=True))['count'] or 0,
                'on_hold': base_projects.filter(status='ON_HOLD').aggregate(count=Count('job_number', distinct=True))['count'] or 0,
            }
            
            # Count users by status
            total_employees = UserModel.objects.filter(status='ACTIVE').count()
            inactive_employees = UserModel.objects.filter(status='INACTIVE').count()
            
            # Count branches
            total_branches = Branch.objects.filter(status='ACTIVE').count()
            
            # Count Spectrum imported jobs (from imported jobs database)
            spectrum_jobs = SpectrumJob.objects.all()
            spectrum_jobs_total = spectrum_jobs.count()
            spectrum_jobs_active = spectrum_jobs.filter(status_code='A').count()  # Active (A)
            spectrum_jobs_inactive = spectrum_jobs.filter(status_code='I').count()  # Inactive (I)
            spectrum_jobs_complete = spectrum_jobs.filter(status_code='C').count()  # Complete (C)
            
            # Count distinct job_numbers to ensure accurate counts matching Spectrum imported jobs
            # Use Count with distinct=True to ensure accurate counting
            stats = {
                'total_projects': base_projects.aggregate(count=Count('job_number', distinct=True))['count'] or 0,
                'active_projects': active_projects.aggregate(count=Count('job_number', distinct=True))['count'] or 0,
                'inactive_projects': inactive_projects.aggregate(count=Count('job_number', distinct=True))['count'] or 0,
                'pending_projects': pending_projects.aggregate(count=Count('job_number', distinct=True))['count'] or 0,
                'completed_projects': completed_projects.aggregate(count=Count('job_number', distinct=True))['count'] or 0,
                'projects_on_hold': base_projects.filter(status='ON_HOLD').aggregate(count=Count('job_number', distinct=True))['count'] or 0,
                'projects_by_status': projects_by_status,
                'total_users': total_employees,
                'total_employees': total_employees,
                'inactive_employees': inactive_employees,
                'total_branches': total_branches,
                'total_contract_value': float(total_contract_value),
                'total_contract_balance': float(total_contract_balance),
                'revenue': float(total_contract_value - total_contract_balance),  # Estimated revenue
                'users_by_role': users_by_role,
                # Spectrum imported jobs counts
                'spectrum_jobs_total': spectrum_jobs_total,
                'spectrum_jobs_active': spectrum_jobs_active,
                'spectrum_jobs_inactive': spectrum_jobs_inactive,
                'spectrum_jobs_complete': spectrum_jobs_complete,
            }
        elif role == 'BRANCH_MANAGER':
            from projects.models import Project
            from django.db.models import Sum, Count, Q
            
            # Branch Managers can only see projects in their assigned division
            if user.division:
                projects = Project.objects.filter(branch=user.division)
            else:
                # No division assigned - return empty stats
                projects = Project.objects.none()
            
            # Calculate project statistics
            total_projects = projects.count()
            active_projects = projects.filter(status='ACTIVE').count()
            inactive_projects = projects.filter(status='PENDING').count()
            completed_projects = projects.filter(status='COMPLETED').count()
            
            # Calculate financial statistics
            total_contract_value = projects.aggregate(
                total=Sum('contract_value')
            )['total'] or 0
            
            total_contract_balance = projects.aggregate(
                total=Sum('contract_balance')
            )['total'] or 0
            
            revenue = float(total_contract_value - total_contract_balance)
            
            stats = {
                'total_projects': total_projects,
                'active_projects': active_projects,
                'inactive_projects': inactive_projects,
                'completed_projects': completed_projects,
                'total_contract_value': float(total_contract_value),
                'total_contract_balance': float(total_contract_balance),
                'revenue': revenue,
                'division_name': user.division.name if user.division else None,
                'users_by_role': users_by_role,
            }
        elif role == 'PROJECT_MANAGER':
            from projects.models import Project
            from datetime import date
            projects = Project.objects.filter(project_manager=user)
            active_projects = projects.filter(status='ACTIVE')
            
            # Count projects at risk (Yellow or Red)
            at_risk = 0
            for p in active_projects:
                try:
                    status, _, days_late = p.get_schedule_status()
                    if status in ['YELLOW', 'RED']:
                        at_risk += 1
                except:
                    pass
            
            # Get team members for PM's projects
            team_members = UserModel.objects.filter(
                project_assignments__project__in=projects,
                status='ACTIVE'
            ).distinct()
            
            stats = {
                'my_projects': projects.count(),
                'active_projects': active_projects.count(),
                'projects_at_risk': at_risk,
                'team_members': [{
                    'id': u.id,
                    'first_name': u.first_name,
                    'last_name': u.last_name,
                    'role': u.role,
                    'role_display': u.get_role_display(),
                } for u in team_members],
                'users_by_role': users_by_role,
            }
        elif role in ['FOREMAN', 'WORKER']:
            from time_tracking.models import TimeEntry
            from datetime import date
            today_entries = TimeEntry.objects.filter(employee=user, date=date.today())
            clocked_in = today_entries.filter(clock_out__isnull=True).exists()
            today_hours = sum(e.total_hours for e in today_entries)
            
            # For foreman, get crew members
            crew_members = []
            if role == 'FOREMAN':
                from projects.models import Project
                foreman_projects = Project.objects.filter(foreman=user)
                crew_members = UserModel.objects.filter(
                    project_assignments__project__in=foreman_projects,
                    role__in=['WORKER', 'FOREMAN'],
                    status='ACTIVE'
                ).distinct()
            
            stats = {
                'clocked_in': clocked_in,
                'today_hours': today_hours,
                'crew_members': [{
                    'id': u.id,
                    'first_name': u.first_name,
                    'last_name': u.last_name,
                    'role': u.role,
                    'role_display': u.get_role_display(),
                } for u in crew_members] if role == 'FOREMAN' else [],
                'users_by_role': users_by_role,
            }
        elif role == 'HR':
            from time_tracking.models import PayPeriod
            from projects.models import Project
            total_employees = UserModel.objects.filter(status='ACTIVE').count()
            inactive_employees = UserModel.objects.filter(status='INACTIVE').count()
            
            # Count employees by role
            employees_by_role_count = {}
            for role_key, role_users in users_by_role.items():
                employees_by_role_count[role_key] = len(role_users)
            
            stats = {
                'active_employees': total_employees,
                'total_employees': total_employees,
                'inactive_employees': inactive_employees,
                'pending_invitations': 0,  # TODO: Track pending invitations
                'open_pay_periods': PayPeriod.objects.filter(is_locked=False).count() if PayPeriod.objects.exists() else 0,
                'total_projects': Project.objects.count(),
                'active_projects': Project.objects.filter(status='ACTIVE').count(),
                'employees_by_role_count': employees_by_role_count,
                'users_by_role': users_by_role,
            }
        elif role == 'FINANCE':
            from projects.models import Project
            projects = Project.objects.all()
            total_value = sum(p.contract_value or 0 for p in projects)
            total_balance = sum(p.contract_balance or 0 for p in projects)
            stats = {
                'total_contract_value': float(total_value),
                'total_contract_balance': float(total_balance),
                'projects_count': projects.count(),
                'users_by_role': users_by_role,
            }
        elif role == 'SUPERINTENDENT':
            from projects.models import Project
            from time_tracking.models import TimeEntry, DailyReport
            from datetime import date
            projects = Project.objects.filter(superintendent=user)
            pending_reports = DailyReport.objects.filter(
                project__in=projects,
                status='SUBMITTED'
            ).count()
            pending_time = TimeEntry.objects.filter(
                project__in=projects,
                status='SUBMITTED'
            ).count()
            
            # Get site workers
            site_workers = UserModel.objects.filter(
                project_assignments__project__in=projects,
                status='ACTIVE'
            ).distinct()
            
            stats = {
                'assigned_projects': projects.count(),
                'pending_approvals': pending_reports + pending_time,
                'site_workers': [{
                    'id': u.id,
                    'first_name': u.first_name,
                    'last_name': u.last_name,
                    'role': u.role,
                    'role_display': u.get_role_display(),
                } for u in site_workers],
                'users_by_role': users_by_role,
            }
        
        # Add users_by_role to all stats if not already present
        if 'users_by_role' not in stats:
            stats['users_by_role'] = users_by_role
        
        return Response(stats)


class InvitedUsersListView(generics.ListAPIView):
    """List all invited users with email status."""
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        
        # Only users who can invite can see invited users
        if not user.can_invite_users():
            return User.objects.none()
        
        # Get all users who were invited (have invited_by set)
        queryset = User.objects.filter(invited_by__isnull=False).select_related('invited_by', 'role_assigned_by')
        
        # Filter by role if provided
        role = self.request.query_params.get('role', None)
        if role:
            queryset = queryset.filter(role=role)
        
        # Search functionality
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(email__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(username__icontains=search) |
                Q(employee_number__icontains=search)
            )
        
        return queryset.order_by('-invited_on')


class ResendInvitationEmailView(APIView):
    """Resend invitation email to a user."""
    permission_classes = [IsAuthenticated, CanInviteUsers]
    
    def _send_activation_email(self, user, invited_by):
        """Send activation email with role-specific template."""
        role_templates = {
            'WORKER': 'accounts/emails/invite_worker.html',
            'FOREMAN': 'accounts/emails/invite_foreman.html',
            'SUPERINTENDENT': 'accounts/emails/invite_superintendent.html',
            'PROJECT_MANAGER': 'accounts/emails/invite_pm.html',
            'HR': 'accounts/emails/invite_hr.html',
            'FINANCE': 'accounts/emails/invite_finance.html',
            'AUDITOR': 'accounts/emails/invite_auditor.html',
            'ADMIN': 'accounts/emails/invite_admin.html',
            'SYSTEM_ADMIN': 'accounts/emails/invite_system_admin.html',
            'SUPERADMIN': 'accounts/emails/invite_superadmin.html',
            'ROOT_SUPERADMIN': 'accounts/emails/invite_superadmin.html',
            'GENERAL_CONTRACTOR': 'accounts/emails/invite_gc.html',
        }
        
        template = role_templates.get(user.role, 'accounts/emails/invite_default.html')
        
        # Generate activation token
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        activation_url = f"{settings.FRONTEND_URL or 'http://localhost:3000'}/activate?uid={uid}&token={token}"
        
        # Logo URL for emails
        logo_url = f"{settings.FRONTEND_URL or 'http://localhost:3000'}/images/logo.png"
        
        context = {
            'user': user,
            'invited_by': invited_by,
            'activation_url': activation_url,
            'login_url': f"{settings.FRONTEND_URL or 'http://localhost:3000'}/login",
            'logo_url': logo_url,
        }
        
        email_error = None
        try:
            html_message = render_to_string(template, context)
            plain_template = template.replace('.html', '.txt')
            try:
                plain_message = render_to_string(plain_template, context)
            except:
                plain_message = f"Welcome to BSM System. Please activate your account by visiting: {activation_url}"
            
            send_mail(
                subject=f'Activate Your BSM System Account - {user.get_role_display()}',
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL or 'noreply@bsm.com',
                recipient_list=[user.email],
                html_message=html_message,
                fail_silently=False,
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send invitation email: {e}", exc_info=True)
            email_error = str(e)
        
        return email_error
    
    def post(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if user was invited
        if not user.invited_by:
            return Response(
                {'detail': 'This user was not invited through the system.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if user has already activated (has logged in)
        if user.last_login:
            return Response(
                {'detail': 'User has already activated their account. Cannot resend invitation.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Resend email - reuse the send_activation_email logic
        email_error = self._send_activation_email(user, request.user)
        
        # Update email status
        if email_error:
            user.invitation_email_sent = False
            user.invitation_email_error = str(email_error)
            user.save()
            return Response(
                {
                    'detail': 'Failed to resend invitation email.',
                    'error': str(email_error),
                    'email_sent': False
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        else:
            user.invitation_email_sent = True
            user.invitation_email_sent_at = timezone.now()
            user.invitation_email_error = None
            user.save()
            return Response({
                'detail': 'Invitation email resent successfully.',
                'email_sent': True
            })


class CancelInvitationView(APIView):
    """Cancel/delete an invitation (delete the user account if not activated)."""
    permission_classes = [IsAuthenticated, CanInviteUsers]
    
    def delete(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if user was invited
        if not user.invited_by:
            return Response(
                {'detail': 'This user was not invited through the system.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if user has already activated (has logged in)
        if user.last_login:
            return Response(
                {'detail': 'Cannot cancel invitation for a user who has already activated their account. Deactivate the user instead.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Only allow root superadmin or the person who invited to cancel
        if request.user.role != 'ROOT_SUPERADMIN' and user.invited_by != request.user:
            return Response(
                {'detail': 'You can only cancel invitations you sent.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Store user info for audit log
        user_email = user.email
        user_name = user.get_full_name() or user.username
        user_role = user.role
        user_employee_number = user.employee_number
        
        # Create audit log before deletion
        PermissionChangeLog.objects.create(
            user=user,
            changed_by=request.user,
            field_changed='account_deleted',
            old_value=f'User: {user_name} ({user_email}), Role: {user_role}, Employee #: {user_employee_number}',
            new_value='DELETED',
            reason=f'Invitation cancelled by {request.user.get_full_name() or request.user.username}. User account deleted before activation.'
        )
        
        # Delete the user (this will cascade delete related PermissionChangeLog entries, but we already created one)
        # Actually, we need to keep the log, so let's update the user reference to be nullable
        # But since we're deleting, we'll create the log with user info stored
        user_id_for_log = user.id
        user_email_for_log = user.email
        user_name_for_log = user_name
        user_role_for_log = user.role
        
        # Delete the user
        user.delete()
        
        return Response({
            'detail': f'Invitation for {user_name_for_log} ({user_email_for_log}) has been cancelled and the user account has been deleted.',
            'deleted_user': {
                'name': user_name_for_log,
                'email': user_email_for_log,
                'role': user_role_for_log,
            }
        })


class AllowedRolesView(APIView):
    """Get list of roles the current user can invite."""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Return list of roles the current user can invite."""
        user = request.user
        allowed_roles = user.get_invitable_roles()
        
        # Return with labels
        role_choices = dict(User.ROLE_CHOICES)
        roles_with_labels = [
            {'value': role, 'label': role_choices.get(role, role)}
            for role in allowed_roles
        ]
        
        return Response({
            'allowed_roles': allowed_roles,
            'roles_with_labels': roles_with_labels
        })


class ProjectAssignmentViewSet(viewsets.ModelViewSet):
    """ViewSet for managing project assignments (assigning workers to projects with scope)."""
    queryset = ProjectAssignment.objects.all()
    serializer_class = ProjectAssignmentSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['employee', 'project', 'status', 'scope']
    search_fields = ['employee__username', 'employee__email', 'project__name', 'project__job_number']
    
    def get_queryset(self):
        """Filter assignments based on user role."""
        user = self.request.user
        queryset = super().get_queryset()
        
        # Workers can only see their own assignments
        if user.role == 'WORKER':
            queryset = queryset.filter(employee=user)
        
        # Foremen can see assignments for their projects
        elif user.role == 'FOREMAN':
            from projects.models import Project
            foreman_projects = Project.objects.filter(foreman=user)
            queryset = queryset.filter(project__in=foreman_projects)
        
        # Project Managers can see assignments for their projects
        elif user.role == 'PROJECT_MANAGER':
            from projects.models import Project
            pm_projects = Project.objects.filter(project_manager=user)
            queryset = queryset.filter(project__in=pm_projects)
        
        # Superintendents can see assignments for their projects
        elif user.role == 'SUPERINTENDENT':
            from projects.models import Project
            super_projects = Project.objects.filter(superintendent=user)
            queryset = queryset.filter(project__in=super_projects)
        
        # General Contractors can see assignments for their projects
        elif user.role == 'GENERAL_CONTRACTOR':
            from projects.models import Project
            gc_projects = Project.objects.filter(general_contractor=user)
            queryset = queryset.filter(project__in=gc_projects)
        
        # Root admin, superadmin, admin, HR can see all
        # (no filtering needed)
        
        return queryset
    
    def perform_create(self, serializer):
        """Set assigned_by to current user."""
        assignment = serializer.save(assigned_by=self.request.user, start_date=timezone.now())
        
        # Log the assignment
        log_action(
            user=self.request.user,
            action='CREATE',
            obj=assignment,
            reason=f"Assigned {assignment.employee.get_full_name() or assignment.employee.username} to project {assignment.project.job_number}",
            request=self.request
        )
