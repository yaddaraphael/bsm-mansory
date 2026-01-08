# Next Steps - Getting Your BSM System Running

## 🚀 Quick Start (Choose Your Path)

### Option A: Automated Setup (Recommended for Windows)
1. **Backend**: Double-click `backend/setup.bat` (or run in terminal)
2. **Frontend**: Double-click `frontend/setup.bat` (or run in terminal)

### Option B: Manual Setup
Follow the detailed guide in `SETUP_GUIDE.md`

## 📋 Immediate Action Items

### 1. Database Setup (5 minutes)
```bash
# Create PostgreSQL database
psql -U postgres
CREATE DATABASE bsm_db;
\q
```

### 2. Backend Setup (10 minutes)
```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# OR
source venv/bin/activate  # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Create .env file (copy from .env.example and update)
# Update DB_PASSWORD with your PostgreSQL password

# Run migrations
python manage.py makemigrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start server
python manage.py runserver
```

### 3. Frontend Setup (5 minutes)
```bash
cd frontend

# Install dependencies
npm install

# Create .env.local
echo NEXT_PUBLIC_API_URL=http://localhost:8000/api > .env.local

# Start server
npm run dev
```

## ✅ Verification Steps

After setup, verify everything works:

1. **Backend Health Check**
   - Open http://localhost:8000/admin
   - Login with superuser credentials
   - ✅ Should see Django admin dashboard

2. **Frontend Health Check**
   - Open http://localhost:3000
   - Click "Login" or go to http://localhost:3000/login
   - Login with superuser credentials
   - ✅ Should see dashboard

3. **Create Test Data**
   - In Django admin, create a Branch (e.g., "Kansas City", code "KC")
   - Create a Project (job number will auto-generate)
   - ✅ Verify job number format: `KC-24-0001`

## 🎯 What to Do First

### Priority 1: Core Setup
1. ✅ Database created
2. ✅ Backend running
3. ✅ Frontend running
4. ✅ Can login to both

### Priority 2: Initial Data
1. Create your first Branch
2. Create your first Project
3. Verify job number generation works
4. Test user invitation (via admin or API)

### Priority 3: Test Core Features
1. **Time Tracking**
   - Create a Worker user
   - Assign to a project
   - Test clock in/out via API

2. **Equipment**
   - Add equipment record
   - Assign to project
   - Test transfer workflow

3. **Daily Reports**
   - Create Foreman user
   - Submit daily report
   - Test approval workflow

## 📚 Documentation Reference

- **Full Setup Guide**: `SETUP_GUIDE.md`
- **Quick Reference**: `QUICKSTART.md`
- **Main README**: `README.md`
- **Backend README**: `backend/README.md`
- **Frontend README**: `frontend/README.md`

## 🔧 Troubleshooting Quick Fixes

### "Module not found"
```bash
# Backend
pip install -r requirements.txt

# Frontend
npm install
```

### "Database connection error"
- Check PostgreSQL is running
- Verify `.env` file has correct credentials
- Ensure database `bsm_db` exists

### "Port already in use"
```bash
# Backend - use different port
python manage.py runserver 8001

# Frontend - use different port
npm run dev -- -p 3001
```

### "CORS errors"
- Ensure backend is running
- Check `NEXT_PUBLIC_API_URL` in frontend `.env.local`
- Verify CORS settings in `backend/bsm_project/settings.py`

## 🎨 Development Tips

1. **Use Django Admin** for quick data entry and testing
2. **API Testing**: Use Postman or Insomnia to test endpoints
3. **Hot Reload**: Both frontend and backend support hot reload
4. **Database Browser**: Use pgAdmin or DBeaver to view database
5. **Logs**: Check terminal output for errors

## 📞 Need Help?

1. Check error messages in terminal
2. Review browser console (F12)
3. Check Django admin for data issues
4. Verify all environment variables are set
5. Ensure all services are running

## 🚀 Ready to Build Features?

Once setup is complete, you can start building:
- Custom dashboards per role
- Project detail pages
- Time tracking interface
- Equipment management UI
- Reports and exports
- AI integration points
- Public portal views
- GC user views

Good luck! 🎉

