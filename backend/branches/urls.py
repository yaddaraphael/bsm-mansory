from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BranchViewSet, BranchContactViewSet

router = DefaultRouter()
router.register(r'', BranchViewSet, basename='branch')
router.register(r'contacts', BranchContactViewSet, basename='branch-contact')

urlpatterns = [
    path('', include(router.urls)),
]

