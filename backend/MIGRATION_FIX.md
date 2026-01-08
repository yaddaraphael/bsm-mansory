# Fix Migration Error

## Problem
The error occurs because:
1. Custom app migrations haven't been created yet
2. Django tries to apply admin migrations which depend on the User model
3. The `accounts_user` table doesn't exist yet

## Solution

### Step 1: Create Migrations for All Apps

Run these commands in order (make sure your virtual environment is activated):

```bash
# Activate virtual environment first
venv\Scripts\activate

# Create migrations for each app (in order of dependencies)
python manage.py makemigrations accounts
python manage.py makemigrations branches
python manage.py makemigrations projects
python manage.py makemigrations equipment
python manage.py makemigrations time_tracking
python manage.py makemigrations audit
```

### Step 2: Apply All Migrations

```bash
python manage.py migrate
```

### Alternative: Use the Fix Script

I've created a batch script that does this automatically:

```bash
fix_migrations.bat
```

## Why This Happens

1. **Dependency Order**: The `accounts` app must be migrated first because:
   - It contains the custom User model
   - Other apps (projects, time_tracking, etc.) have foreign keys to User
   - Django admin needs the User model to exist

2. **Migration Creation**: `makemigrations` needs to be run for each app individually the first time, or you can run:
   ```bash
   python manage.py makemigrations
   ```
   This should detect all apps, but sometimes it's safer to do them one by one.

## Expected Output

After running the commands, you should see:

```
Migrations for 'accounts':
  accounts\migrations\0001_initial.py
    - Create model User
    - Create model PermissionChangeLog
    - Create model ProjectAssignment
    ...

Migrations for 'branches':
  branches\migrations\0001_initial.py
    - Create model Branch
    ...

Migrations for 'projects':
  projects\migrations\0001_initial.py
    - Create model Project
    - Create model ProjectScope
    ...
```

Then when you run `migrate`, all tables will be created in the correct order.

## If You Still Get Errors

1. **Check Database Connection**: Make sure PostgreSQL is running and credentials in `.env` are correct

2. **Drop and Recreate Database** (if needed):
   ```sql
   DROP DATABASE bsm_db;
   CREATE DATABASE bsm_db;
   ```

3. **Check for Circular Dependencies**: Make sure models don't have circular foreign key references

4. **Verify INSTALLED_APPS**: Check that all apps are listed in `settings.py`

## Quick Fix Command

If you want to do it all at once:

```bash
venv\Scripts\activate
python manage.py makemigrations
python manage.py migrate
```

This should work, but if it doesn't, use the step-by-step approach above.

