"""
Signals to automatically set role for superusers.
"""
from django.db.models.signals import pre_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model

User = get_user_model()


@receiver(pre_save, sender=User)
def set_superuser_role_pre_save(sender, instance, **kwargs):
    """
    Automatically set ROOT_SUPERADMIN role for superusers before saving.
    This ensures that any user with is_superuser=True gets the correct role.
    Using pre_save to avoid recursion issues.
    """
    if instance.is_superuser and instance.role != 'ROOT_SUPERADMIN':
        instance.role = 'ROOT_SUPERADMIN'
        instance.scope = 'COMPANY_WIDE'
