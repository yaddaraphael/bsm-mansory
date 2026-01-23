from rest_framework import permissions


class CanInviteUsers(permissions.BasePermission):
    """Permission to check if user can invite other users."""
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.can_invite_users()


class IsRootSuperadmin(permissions.BasePermission):
    """Permission to check if user is root superadmin or admin."""
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in ['ROOT_SUPERADMIN', 'ADMIN']

