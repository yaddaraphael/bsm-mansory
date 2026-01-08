from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Equipment, EquipmentAssignment, EquipmentTransfer
from .serializers import (
    EquipmentSerializer, EquipmentAssignmentSerializer, EquipmentTransferSerializer
)
from .permissions import EquipmentViewSetPermission


class EquipmentViewSet(viewsets.ModelViewSet):
    queryset = Equipment.objects.all()
    serializer_class = EquipmentSerializer
    permission_classes = [EquipmentViewSetPermission]
    filterset_fields = ['status', 'type']
    search_fields = ['asset_number', 'type']


class EquipmentAssignmentViewSet(viewsets.ModelViewSet):
    queryset = EquipmentAssignment.objects.all()
    serializer_class = EquipmentAssignmentSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['equipment', 'project', 'branch', 'status']


class EquipmentTransferViewSet(viewsets.ModelViewSet):
    queryset = EquipmentTransfer.objects.all()
    serializer_class = EquipmentTransferSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['equipment', 'status', 'sending_foreman', 'receiving_foreman']
    
    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """Accept equipment transfer."""
        transfer = self.get_object()
        notes = request.data.get('notes', '')
        if transfer.accept(request.user, notes):
            return Response(EquipmentTransferSerializer(transfer).data)
        return Response(
            {'error': 'Transfer cannot be accepted'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject equipment transfer."""
        transfer = self.get_object()
        reason = request.data.get('reason', '')
        if transfer.reject(request.user, reason):
            return Response(EquipmentTransferSerializer(transfer).data)
        return Response(
            {'error': 'Transfer cannot be rejected'},
            status=status.HTTP_400_BAD_REQUEST
        )

