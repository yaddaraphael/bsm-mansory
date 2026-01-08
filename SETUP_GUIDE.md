# BSM System - Setup Guide

## Prerequisites Checklist

Before starting, ensure you have:
- [ ] Python 3.9+ installed
- [ ] Node.js 18+ installed
- [ ] PostgreSQL 12+ installed and running
- [ ] Git (optional, for version control)

## Step-by-Step Setup

### Step 1: Database Setup

1. **Start PostgreSQL service** (if not running)
   ```bash
   # Windows (as Administrator)
   net start postgresql-x64-XX
   
   # Or use Services app
   ```

2. **Create the database**
   ```bash
   # Using psql command line
   psql -U postgres
   
   # Then in psql:
   CREATE DATABASE bsm_db;
   \q
   ```

   Or using createdb:
   ```bash
   createdb -U postgres bsm_db
   ```

### Step 2: Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Create and activate virtual environment**
   ```bash
   # Windows
   python -m venv venv
   venv\Scripts\activate
   
   # Mac/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Create environment file**
   Create a `.env` file in the `backend` directory with:
   ```env
   SECRET_KEY=django-insecure-change-this-to-a-secure-key-in-production
   DEBUG=True
   ALLOWED_HOSTS=localhost,127.0.0.1
   DB_NAME=bsm_db
   DB_USER=postgres
   DB_PASSWORD=your_postgres_password
   DB_HOST=localhost
   DB_PORT=5432
   ```
   **Important**: Replace `your_postgres_password` with your actual PostgreSQL password.

5. **Run migrations**
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

6. **Create superuser (Root Superadmin)**
   ```bash
   python manage.py createsuperuser
   ```
   Enter:
   - Username: (choose one, e.g., `admin`)
   - Email: (your email)
   - Password: (strong password)

7. **Test backend server**
   ```bash
   python manage.py runserver
   ```
   Open http://localhost:8000/admin and login with your superuser credentials.

### Step 3: Frontend Setup

1. **Open a new terminal** (keep backend running in the first terminal)

2. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

3. **Install Node dependencies**
   ```bash
   npm install
   ```

4. **Create environment file**
   Create a `.env.local` file in the `frontend` directory:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000/api
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Test frontend**
   Open http://localhost:3000 in your browser.

### Step 4: Initial Configuration

1. **Login to Django Admin** (http://localhost:8000/admin)
   - Use your superuser credentials

2. **Create your first Branch**
   - Go to **Branches** → **Add Branch**
   - Name: `Kansas City` (or your location)
   - Code: `KC` (2-10 characters, used for job numbering)
   - Status: `Active`
   - Save

3. **Create your first Project**
   - Go to **Projects** → **Add Project**
   - Fill in:
     - Name: `Test Project`
     - Branch: Select the branch you created
     - Job Number: Leave blank (will auto-generate)
     - Start Date: Today's date
     - Duration: `30` (days)
     - Status: `Active`
   - Save (job number will be auto-generated like `KC-24-0001`)

4. **Test Login on Frontend**
   - Go to http://localhost:3000/login
   - Use your superuser credentials
   - You should be redirected to the dashboard

## Verification Checklist

After setup, verify:

- [ ] Backend server runs without errors
- [ ] Can access Django admin at http://localhost:8000/admin
- [ ] Can login to Django admin
- [ ] Frontend server runs without errors
- [ ] Can access frontend at http://localhost:3000
- [ ] Can login to frontend
- [ ] Created at least one Branch
- [ ] Created at least one Project
- [ ] Job number was auto-generated correctly

## Common Issues & Solutions

### Issue: "Module not found" errors
**Solution**: Make sure virtual environment is activated and dependencies are installed:
```bash
pip install -r requirements.txt
```

### Issue: Database connection error
**Solution**: 
- Check PostgreSQL is running
- Verify database credentials in `.env`
- Ensure database `bsm_db` exists

### Issue: Port 8000 or 3000 already in use
**Solution**: 
- Backend: `python manage.py runserver 8001`
- Frontend: `npm run dev -- -p 3001`
- Update `.env.local` with new port

### Issue: CORS errors in browser console
**Solution**: 
- Ensure backend is running
- Check `CORS_ALLOWED_ORIGINS` in `backend/bsm_project/settings.py`
- Verify `NEXT_PUBLIC_API_URL` in frontend `.env.local`

### Issue: Migration errors
**Solution**:
```bash
# Delete all migration files except __init__.py in each app
# Then:
python manage.py makemigrations
python manage.py migrate
```

## Next Development Steps

Once setup is complete:

1. **Invite Users**
   - Use Django admin or API endpoint `/api/auth/invite/`
   - Assign roles and scopes

2. **Set up Project Assignments**
   - Assign users to projects via Django admin
   - This controls which projects users can access

3. **Test Time Tracking**
   - Create a worker user
   - Assign to a project
   - Test clock in/out functionality

4. **Add Equipment**
   - Create equipment records
   - Test equipment assignment to projects

5. **Create Daily Reports**
   - Test foreman daily report submission
   - Test superintendent approval workflow

## Development Workflow

1. **Backend changes**:
   - Make model changes
   - Create migrations: `python manage.py makemigrations`
   - Apply migrations: `python manage.py migrate`
   - Test in Django admin

2. **Frontend changes**:
   - Make component changes
   - Hot reload should work automatically
   - Check browser console for errors

3. **API testing**:
   - Use Django admin for quick tests
   - Use Postman/Insomnia for API testing
   - Check API docs at http://localhost:8000/api/

## Production Deployment Notes

Before deploying to production:

1. Change `DEBUG=False` in `.env`
2. Set a secure `SECRET_KEY`
3. Update `ALLOWED_HOSTS` with your domain
4. Set up proper database credentials
5. Configure static files serving
6. Set up SSL/HTTPS
7. Configure proper CORS origins
8. Set up email backend for notifications
9. Configure file storage (S3, etc.) for media files

## Getting Help

- Check `README.md` for overview
- Check `QUICKSTART.md` for quick reference
- Review Django and Next.js documentation
- Check API endpoints in Django admin

