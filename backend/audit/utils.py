"""
Utility functions for audit logging.
"""
from django.contrib.contenttypes.models import ContentType
from .models import AuditLog


def log_action(user, action, obj, field_name=None, old_value=None, new_value=None, reason=None, request=None):
    """
    Create an audit log entry.
    
    Args:
        user: User performing the action
        action: Action type (CREATE, UPDATE, DELETE, APPROVE, REJECT, etc.)
        obj: The object being acted upon
        field_name: Name of the field being changed (optional)
        old_value: Old value (optional)
        new_value: New value (optional)
        reason: Reason for the action (optional)
        request: Django request object for IP and user agent (optional)
    """
    try:
        content_type = ContentType.objects.get_for_model(obj)
        
        ip_address = None
        user_agent = None
        if request:
            ip_address = get_client_ip(request)
            user_agent = request.META.get('HTTP_USER_AGENT', '')[:500]  # Limit length
        
        AuditLog.objects.create(
            user=user,
            action=action,
            content_type=content_type,
            object_id=obj.pk,
            field_name=field_name,
            old_value=str(old_value) if old_value is not None else None,
            new_value=str(new_value) if new_value is not None else None,
            reason=reason,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    except Exception as e:
        # Don't fail the main operation if logging fails
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to create audit log: {e}", exc_info=True)


def get_client_ip(request):
    """Get client IP address from request."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip

