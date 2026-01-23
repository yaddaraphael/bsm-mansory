from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProjectViewSet, ProjectScopeViewSet,
    DailyReportViewSet, WeeklyChecklistViewSet,
    LaborEntryViewSet,
    PublicProjectListView, PublicProjectDetailView,
    BranchPortalProjectListView, HQPortalProjectListView,
    set_hq_portal_password, get_hq_portal_password_status
)

router = DefaultRouter()
router.register(r'projects', ProjectViewSet, basename='project')
router.register(r'scopes', ProjectScopeViewSet, basename='scope')
router.register(r'daily-reports', DailyReportViewSet, basename='daily-report')
router.register(r'labor-entries', LaborEntryViewSet, basename='labor-entry')
router.register(r'weekly-checklists', WeeklyChecklistViewSet, basename='weekly-checklist')

urlpatterns = [
    path('', include(router.urls)),
    # Public endpoints (no authentication required)
    path('public/projects/', PublicProjectListView.as_view(), name='public-projects-list'),
    path('public/projects/<int:pk>/', PublicProjectDetailView.as_view(), name='public-project-detail'),
    # Branch portal endpoints (password protected) - uses division code
    path('public/branch/<str:division_code>/projects/', BranchPortalProjectListView.as_view(), name='branch-portal-projects'),
    # HQ portal endpoint (password protected)
    path('public/hq/projects/', HQPortalProjectListView.as_view(), name='hq-portal-projects'),
    # Portal password management
    path('portal/hq/password/', set_hq_portal_password, name='set-hq-portal-password'),
    path('portal/hq/password/status/', get_hq_portal_password_status, name='get-hq-portal-password-status'),
]

