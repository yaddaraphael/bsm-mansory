from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TimeEntryViewSet, TimeCorrectionRequestViewSet, PayPeriodViewSet

router = DefaultRouter()
router.register(r'entries', TimeEntryViewSet, basename='time-entry')
router.register(r'corrections', TimeCorrectionRequestViewSet, basename='time-correction')
router.register(r'pay-periods', PayPeriodViewSet, basename='pay-period')

urlpatterns = [
    path('', include(router.urls)),
]

