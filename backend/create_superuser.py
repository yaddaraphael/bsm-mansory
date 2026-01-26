"""
Script to create a superuser programmatically.
Run this with: python manage.py shell < create_superuser.py
Or copy-paste these commands into Django shell.
"""
from accounts.models import User

# Check if user already exists
username = 'yadda'
email = 'yadda@example.com'  # Change this to your email
password = 'Nova@Jonathan#2025'

try:
    user = User.objects.get(username=username)
    print(f"User '{username}' already exists!")
    print(f"Updating to superuser...")
    user.is_superuser = True
    user.is_staff = True
    user.role = 'ROOT_SUPERADMIN'
    user.scope = 'COMPANY_WIDE'
    user.set_password(password)
    user.save()
    print(f"✓ User '{username}' updated to superuser successfully!")
except User.DoesNotExist:
    # Create new superuser
    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
        is_superuser=True,
        is_staff=True,
        role='ROOT_SUPERADMIN',
        scope='COMPANY_WIDE',
        is_active=True
    )
    print(f"✓ Superuser '{username}' created successfully!")
    print(f"  Email: {user.email}")
    print(f"  Role: {user.role}")
    print(f"  Scope: {user.scope}")
