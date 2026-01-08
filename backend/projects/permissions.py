from rest_framework import permissions


class CanCreateProject(permissions.BasePermission):
    """Permission to check if user can create projects."""
    
    def has_permission(self, request, view):
        if request.method == 'POST':
            return request.user.role in [
                'ROOT_SUPERADMIN',
                'SUPERADMIN',
                'ADMIN',
                'PROJECT_MANAGER'
            ]
        return True  # Allow other methods for authenticated users


class ProjectViewSetPermission(permissions.BasePermission):
    """Combined permission for ProjectViewSet."""
    
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
                'PROJECT_MANAGER'
            ]
        
        # Only ROOT_SUPERADMIN can update (PUT/PATCH) or delete projects
        if request.method in ['PUT', 'PATCH', 'DELETE']:
            return user_role == 'ROOT_SUPERADMIN'
        
        # Allow other methods (GET, etc.) for authenticated users
        return True

