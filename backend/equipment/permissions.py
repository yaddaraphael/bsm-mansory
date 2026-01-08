from rest_framework import permissions


class CanCreateEquipment(permissions.BasePermission):
    """Permission to check if user can create equipment."""
    
    def has_permission(self, request, view):
        if request.method == 'POST':
            return request.user.role in [
                'ROOT_SUPERADMIN',
                'SUPERADMIN',
                'ADMIN',
                'FOREMAN',
                'PROJECT_MANAGER'
            ]
        return True  # Allow other methods for authenticated users


class EquipmentViewSetPermission(permissions.BasePermission):
    """Combined permission for EquipmentViewSet."""
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        user_role = request.user.role
        
        # AUDITOR: Read-only access
        if user_role == 'AUDITOR':
            return request.method in ['GET', 'HEAD', 'OPTIONS']
        
        # Check create permission
        if request.method == 'POST':
            return user_role in [
                'ROOT_SUPERADMIN',
                'SUPERADMIN',
                'ADMIN',
                'SYSTEM_ADMIN',
                'FOREMAN',
                'PROJECT_MANAGER'
            ]
        
        # Allow other methods for authenticated users
        return True

