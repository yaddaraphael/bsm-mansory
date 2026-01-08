# BSM Backend (Django)

## Setup Instructions

1. **Create virtual environment:**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. **Install dependencies:**
```bash
pip install -r requirements.txt
```

3. **Set up environment variables:**
Copy `.env.example` to `.env` and configure:
- Database credentials
- Secret key
- Debug mode

4. **Run migrations:**
```bash
python manage.py makemigrations
python manage.py migrate
```

5. **Create superuser:**
```bash
python manage.py createsuperuser
```

6. **Run development server:**
```bash
python manage.py runserver
```

## API Endpoints

- `/api/auth/` - Authentication endpoints
- `/api/branches/` - Branch management
- `/api/projects/` - Project management
- `/api/equipment/` - Equipment tracking
- `/api/time/` - Time tracking
- `/api/audit/` - Audit logs

## Admin Panel

Access Django admin at `/admin/` after creating a superuser.

