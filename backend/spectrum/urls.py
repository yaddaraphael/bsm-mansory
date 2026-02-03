from django.urls import path
from . import views

app_name = 'spectrum'

urlpatterns = [
    path('jobs/fetch/', views.get_jobs_from_spectrum, name='fetch_jobs'),
    path('jobs/import/', views.import_jobs_to_database, name='import_jobs'),
    path('jobs/list/', views.list_imported_jobs, name='list_jobs'),
    path('jobs/sync/', views.manual_sync_jobs, name='manual_sync_jobs'),
    path('jobs/main/fetch/', views.get_job_main_from_spectrum, name='fetch_job_main'),
    path('jobs/contacts/fetch/', views.get_job_contacts_from_spectrum, name='fetch_job_contacts'),
    path('jobs/dates/fetch/', views.get_job_dates_from_spectrum, name='fetch_job_dates'),
    path('jobs/phases/fetch/', views.get_phase_from_spectrum, name='fetch_phases'),
    path('jobs/phases/enhanced/fetch/', views.get_phase_enhanced_from_spectrum, name='fetch_phases_enhanced'),
    path('jobs/dates/import/', views.import_job_dates_to_database, name='import_job_dates'),
    path('jobs/phases/import/', views.import_phases_to_database, name='import_phases'),
    path('projects/<str:job_number>/comprehensive/', views.get_project_comprehensive_details, name='get_project_comprehensive'),
    path('jobs/<str:company_code>/<str:job_number>/details/', views.get_job_details, name='get_job_details'),
]
