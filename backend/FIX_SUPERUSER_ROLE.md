# Fix: Superuser Role Assignment

## Problem
When running `python manage.py createsuperuser`, the created user was getting the default `WORKER` role instead of `ROOT_SUPERADMIN`.

## Solution
Two approaches have been implemented:

### 1. Custom Management Command
Created `backend/accounts/management/commands/createsuperuser.py` that:
- Overrides Django's default `createsuperuser` command
- Automatically sets `role = 'ROOT_SUPERADMIN'` after user creation
- Sets `scope = 'COMPANY_WIDE'` for superusers
- Provides clear success messages

### 2. Signal Handler
Created `backend/accounts/signals.py` that:
- Automatically sets `ROOT_SUPERADMIN` role for any user with `is_superuser=True`
- Works for users created through admin panel or other methods
- Prevents superusers from having incorrect roles

## Usage

### Create Superuser (Interactive)
```bash
python manage.py createsuperuser
```
The command will:
1. Prompt for username, email, and password
2. Create the user
3. Automatically set role to `ROOT_SUPERADMIN`
4. Set scope to `COMPANY_WIDE`

### Create Superuser (Non-Interactive)
```bash
python manage.py createsuperuser --username admin --email admin@example.com --noinput
```
Then set password separately or use environment variables.

## Verification

After creating a superuser, verify the role:
```python
from accounts.models import User
user = User.objects.get(username='your_username')
print(user.role)  # Should be 'ROOT_SUPERADMIN'
print(user.is_superuser)  # Should be True
```

## Files Modified/Created

1. `backend/accounts/management/commands/createsuperuser.py` - Custom command
2. `backend/accounts/signals.py` - Signal handler
3. `backend/accounts/apps.py` - Register signals

## Testing

1. Delete existing superuser (if needed):
   ```python
   python manage.py shell
   >>> from accounts.models import User
   >>> User.objects.filter(is_superuser=True).delete()
   ```

2. Create new superuser:
   ```bash
   python manage.py createsuperuser
   ```

3. Verify role in Django admin or shell:
   ```python
   >>> user = User.objects.get(username='admin')
   >>> user.role
   'ROOT_SUPERADMIN'
   ```

The fix is now complete! All new superusers will automatically get the `ROOT_SUPERADMIN` role.

