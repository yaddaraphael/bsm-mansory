from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EquipmentViewSet, EquipmentAssignmentViewSet, EquipmentTransferViewSet

router = DefaultRouter()
router.register(r'equipment', EquipmentViewSet, basename='equipment')
router.register(r'assignments', EquipmentAssignmentViewSet, basename='equipment-assignment')
router.register(r'transfers', EquipmentTransferViewSet, basename='equipment-transfer')

urlpatterns = [
    path('', include(router.urls)),
]

