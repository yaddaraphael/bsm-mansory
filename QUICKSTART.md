# Quick Start Guide

## Initial Setup (First Time)

### 1. Database Setup
```bash
# Create PostgreSQL database
createdb bsm_db
# Or using psql:
psql -U postgres
CREATE DATABASE bsm_db;
```

### 2. Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file (copy from .env.example and update values)
# SECRET_KEY=your-secret-key
# DB_NAME=bsm_db
# DB_USER=postgres
# DB_PASSWORD=your-password

# Run migrations
python manage.py makemigrations
python manage.py migrate

# Create superuser (Root Superadmin)
python manage.py createsuperuser
# Enter username, email, password

# Run server
python manage.py runserver
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Create .env.local file
# NEXT_PUBLIC_API_URL=http://localhost:8000/api

# Run development server
npm run dev
```

## Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000/api
- **Django Admin**: http://localhost:8000/admin

## First Steps After Setup

1. **Login to Django Admin** (http://localhost:8000/admin)
   - Use the superuser credentials you created

2. **Create a Branch**
   - Go to Branches → Add Branch
   - Enter name (e.g., "Kansas City")
   - Enter code (e.g., "KC")
   - Save

3. **Create a Project**
   - Go to Projects → Add Project
   - Fill in required fields
   - Job number will be auto-generated
   - Save

4. **Invite Users**
   - Go to Users → Add User
   - Or use the API endpoint `/api/auth/invite/`
   - Assign appropriate role and scope

5. **Login to Frontend**
   - Go to http://localhost:3000/login
   - Use your superuser credentials

## Common Commands

### Backend
```bash
# Create migrations
python manage.py makemigrations

# Apply migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Run server
python manage.py runserver

# Collect static files (production)
python manage.py collectstatic
```

### Frontend
```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint
npm run lint
```

## Troubleshooting

### Database Connection Error
- Check PostgreSQL is running
- Verify database credentials in `.env`
- Ensure database exists

### Migration Errors
- Delete migration files (except `__init__.py`) in app folders
- Run `python manage.py makemigrations` again
- Run `python manage.py migrate`

### Frontend API Errors
- Check backend is running on port 8000
- Verify `NEXT_PUBLIC_API_URL` in `.env.local`
- Check CORS settings in Django settings

### Port Already in Use
- Change port: `python manage.py runserver 8001`
- Or kill process using the port

## Next Development Steps

1. Set up project assignments for users
2. Create first project with scopes
3. Test clock in/out functionality
4. Set up equipment tracking
5. Configure role-based permissions

