from django.urls import path
from .views import (
    SpectrumEmployeeListView,
    SpectrumProjectListView,
    SpectrumReportListView,
    SpectrumSyncView,
)

app_name = 'spectrum'

urlpatterns = [
    path('employees/', SpectrumEmployeeListView.as_view(), name='employee_list'),
    path('projects/', SpectrumProjectListView.as_view(), name='project_list'),
    path('reports/', SpectrumReportListView.as_view(), name='report_list'),
    path('sync/', SpectrumSyncView.as_view(), name='sync'),
]
