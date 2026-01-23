"""
Data migration to:
1. Update roles to only ADMIN, BRANCH_MANAGER, PROJECT_MANAGER
2. Create 5 divisions (branches)
3. Clean up users (delete all except admins)
4. Set division codes for Spectrum matching
"""
from django.db import migrations


def create_divisions(apps, schema_editor):
    """Create the 5 divisions as branches."""
    Branch = apps.get_model('branches', 'Branch')
    
    divisions = [
        {'name': 'Kansas City / Nebraska', 'code': 'KC', 'spectrum_division_code': '111'},
        {'name': 'Denver', 'code': 'DEN', 'spectrum_division_code': '121'},
        {'name': 'SLC Commercial', 'code': 'SLC', 'spectrum_division_code': '131'},
        {'name': 'Utah Commercial', 'code': 'UT', 'spectrum_division_code': '135'},
        {'name': 'St George', 'code': 'STG', 'spectrum_division_code': '145'},
    ]
    
    for div in divisions:
        Branch.objects.get_or_create(
            code=div['code'],
            defaults={
                'name': div['name'],
                'spectrum_division_code': div['spectrum_division_code'],
                'status': 'ACTIVE'
            }
        )


def update_user_roles(apps, schema_editor):
    """Update user roles to new system."""
    User = apps.get_model('accounts', 'User')
    
    # Keep ROOT_SUPERADMIN as is, map other admin roles to ADMIN
    role_mapping = {
        'ROOT_SUPERADMIN': 'ROOT_SUPERADMIN',  # Keep as is
        'SUPERADMIN': 'ADMIN',
        'ADMIN': 'ADMIN',
        'SYSTEM_ADMIN': 'ADMIN',
    }
    
    # Update existing admins
    for old_role, new_role in role_mapping.items():
        User.objects.filter(role=old_role).update(role=new_role)
    
    # Delete all users with other roles (except keep one admin if exists)
    admin_count = User.objects.filter(role__in=['ROOT_SUPERADMIN', 'ADMIN']).count()
    if admin_count == 0:
        # Keep the first user and make them ROOT_SUPERADMIN
        first_user = User.objects.first()
        if first_user:
            first_user.role = 'ROOT_SUPERADMIN'
            first_user.save()
    
    # Delete all non-admin users
    User.objects.exclude(role__in=['ROOT_SUPERADMIN', 'ADMIN']).delete()


def reverse_update_user_roles(apps, schema_editor):
    """Reverse migration - cannot fully restore deleted users."""
    pass


def reverse_create_divisions(apps, schema_editor):
    """Reverse - delete created divisions."""
    Branch = apps.get_model('branches', 'Branch')
    Branch.objects.filter(spectrum_division_code__in=['111', '121', '131', '135', '145']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_initial'),
        ('branches', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_divisions, reverse_create_divisions),
        migrations.RunPython(update_user_roles, reverse_update_user_roles),
    ]
