"""
URL configuration for bsm_project project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/branches/', include('branches.urls')),
    path('api/projects/', include('projects.urls')),
    path('api/equipment/', include('equipment.urls')),
    path('api/time/', include('time_tracking.urls')),
    path('api/audit/', include('audit.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    # Also add direct media serving for /api/media/ path
    urlpatterns += static('/api/media/', document_root=settings.MEDIA_ROOT)

