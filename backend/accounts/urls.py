from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    CustomLoginView, RegisterView, UserProfileView, 
    InviteUserView, UserListView, UserDetailView, DashboardStatsView, 
    ChangePasswordView, ForgotPasswordView, ResetPasswordView, ActivateAccountView,
    NotificationListView, NotificationDetailView,
    NotificationMarkAllReadView, NotificationUnreadCountView,
    UserActivateDeactivateView, InvitedUsersListView,
    ResendInvitationEmailView, CancelInvitationView, AllowedRolesView,
    ProjectAssignmentViewSet
)
from .oauth_views import (
    MicrosoftOAuthInitiateView, MicrosoftOAuthCallbackView,
    GoogleOAuthInitiateView, GoogleOAuthCallbackView
)

router = DefaultRouter()
router.register(r'assignments', ProjectAssignmentViewSet, basename='assignment')

app_name = 'accounts'

urlpatterns = [
    path('login/', CustomLoginView.as_view(), name='token_obtain_pair'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('register/', RegisterView.as_view(), name='register'),
    path('profile/', UserProfileView.as_view(), name='profile'),
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('forgot-password/', ForgotPasswordView.as_view(), name='forgot_password'),
    path('reset-password/', ResetPasswordView.as_view(), name='reset_password'),
    path('activate/', ActivateAccountView.as_view(), name='activate_account'),
    path('invite/', InviteUserView.as_view(), name='invite'),
    path('users/', UserListView.as_view(), name='user_list'),
    path('users/<int:pk>/', UserDetailView.as_view(), name='user_detail'),
    path('users/<int:user_id>/activate-deactivate/', UserActivateDeactivateView.as_view(), name='user_activate_deactivate'),
    path('dashboard/stats/', DashboardStatsView.as_view(), name='dashboard_stats'),
    path('notifications/', NotificationListView.as_view(), name='notification_list'),
    path('notifications/<int:pk>/', NotificationDetailView.as_view(), name='notification_detail'),
    path('notifications/mark-all-read/', NotificationMarkAllReadView.as_view(), name='notification_mark_all_read'),
    path('notifications/unread-count/', NotificationUnreadCountView.as_view(), name='notification_unread_count'),
    path('invited-users/', InvitedUsersListView.as_view(), name='invited_users_list'),
    path('invited-users/<int:user_id>/resend-email/', ResendInvitationEmailView.as_view(), name='resend_invitation_email'),
    path('invited-users/<int:user_id>/cancel/', CancelInvitationView.as_view(), name='cancel_invitation'),
    path('allowed-roles/', AllowedRolesView.as_view(), name='allowed_roles'),
    # OAuth endpoints
    path('oauth/microsoft/initiate/', MicrosoftOAuthInitiateView.as_view(), name='microsoft_oauth_initiate'),
    path('oauth/microsoft/callback/', MicrosoftOAuthCallbackView.as_view(), name='microsoft_oauth_callback'),
    path('oauth/google/initiate/', GoogleOAuthInitiateView.as_view(), name='google_oauth_initiate'),
    path('oauth/google/callback/', GoogleOAuthCallbackView.as_view(), name='google_oauth_callback'),
    path('', include(router.urls)),
]

