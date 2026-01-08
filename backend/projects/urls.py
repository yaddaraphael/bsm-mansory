from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProjectViewSet, ProjectScopeViewSet,
    DailyReportViewSet, WeeklyChecklistViewSet,
    LaborEntryViewSet,
    PublicProjectListView, PublicProjectDetailView
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
]

