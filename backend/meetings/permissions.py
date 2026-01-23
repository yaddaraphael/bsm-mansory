from rest_framework import permissions


class MeetingPermission(permissions.BasePermission):
    """
    Custom permission for meetings:
    - Admins and Superadmins can create, view, update, delete meetings
    - Project Managers and Branch Managers can view meetings related to their projects/branches
    """
    
    def has_permission(self, request, view):
        # Allow read-only for authenticated users
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated
        
        # Only admins and superadmins can create/update/delete
        if request.user and request.user.is_authenticated:
            return request.user.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']
        
        return False
    
    def has_object_permission(self, request, view, obj):
        # Admins and superadmins have full access
        if request.user.role in ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']:
            return True
        
        # Project Managers can view meetings for their projects (read-only, no delete)
        if request.user.role == 'PROJECT_MANAGER':
            if request.method in permissions.SAFE_METHODS:
                # Check if any job in the meeting belongs to this PM
                return obj.meeting_jobs.filter(project__project_manager=request.user).exists()
            # Allow export (GET with action) but not delete
            if request.method == 'DELETE':
                return False
            # Allow export actions
            if hasattr(view, 'action') and view.action in ['export_pdf', 'export_excel']:
                return obj.meeting_jobs.filter(project__project_manager=request.user).exists()
            return False
        
        # Branch Managers can view meetings for their branch (read-only, no delete)
        if request.user.role == 'BRANCH_MANAGER':
            if request.method in permissions.SAFE_METHODS:
                # Check if meeting is for their branch
                if obj.branch and obj.branch == request.user.division:
                    return True
                # Or if any job belongs to their branch
                return obj.meeting_jobs.filter(project__branch=request.user.division).exists()
            # Allow export (GET with action) but not delete
            if request.method == 'DELETE':
                return False
            # Allow export actions
            if hasattr(view, 'action') and view.action in ['export_pdf', 'export_excel']:
                if obj.branch and obj.branch == request.user.division:
                    return True
                return obj.meeting_jobs.filter(project__branch=request.user.division).exists()
            return False
        
        return False
