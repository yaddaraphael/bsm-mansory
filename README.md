# BSM - Building Systems Management

A comprehensive project and workforce management system for construction companies.

## Tech Stack

- **Frontend**: Next.js 14 (TypeScript, Tailwind CSS, Hero Icons)
- **Backend**: Django 4.2 (Python, Django REST Framework)
- **Database**: PostgreSQL
- **Authentication**: JWT (JSON Web Tokens)

## Features

### Core System
- ✅ Role-based access control (11 roles + GC + Public)
- ✅ User invitation system with audit trail
- ✅ Project/Job management with auto-generated job numbers
- ✅ Branch/Location management
- ✅ Time tracking (clock in/out)
- ✅ Equipment tracking with transfer workflow
- ✅ Daily reports and weekly checklists
- ✅ Green/Yellow/Red schedule status indicators
- ✅ Comprehensive audit logging

### Roles Supported
1. Public View (No login)
2. Worker
3. Foreman
4. Superintendent / Site Supervisor
5. Project Manager (PM)
6. HR
7. Finance
8. Auditor (Read-only)
9. Admin (Company Admin)
10. System Admin
11. Superadmin
12. Root Superadmin
13. General Contractor (GC)

## Project Structure

```
.
├── backend/          # Django backend
│   ├── accounts/     # User management & authentication
│   ├── branches/     # Branch/Location management
│   ├── projects/     # Project/Job management
│   ├── equipment/    # Equipment tracking
│   ├── time_tracking/# Time entry & payroll
│   └── audit/        # Audit logging
├── frontend/         # Next.js frontend
│   ├── app/          # Next.js app directory
│   ├── components/   # React components
│   └── lib/          # Utilities & API client
└── README.md
```

## Getting Started

### Prerequisites
- Python 3.9+
- Node.js 18+
- PostgreSQL 12+
- npm or yarn

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
Create a `.env` file in the `backend` directory:
```
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
DB_NAME=bsm_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
```

5. Run migrations:
```bash
python manage.py makemigrations
python manage.py migrate
```

6. Create superuser:
```bash
python manage.py createsuperuser
```

7. Run development server:
```bash
python manage.py runserver
```

Backend will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file in the `frontend` directory:
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

4. Run development server:
```bash
npm run dev
```

Frontend will be available at `http://localhost:3000`

## Color Scheme

- **Primary**: #772025 (buttons, hovers, accents)
- **Secondary**: White (#ffffff)
- **Background**: White and shades of gray
- **Text**: Black and gray shades

## API Endpoints

### Authentication
- `POST /api/auth/login/` - Login
- `POST /api/auth/refresh/` - Refresh token
- `GET /api/auth/profile/` - Get user profile
- `POST /api/auth/invite/` - Invite user

### Projects
- `GET /api/projects/projects/` - List projects
- `POST /api/projects/projects/` - Create project
- `GET /api/projects/projects/{id}/` - Get project details
- `GET /api/projects/projects/{id}/schedule_status/` - Get schedule status

### Time Tracking
- `POST /api/time/entries/clock_in/` - Clock in
- `POST /api/time/entries/clock_out/` - Clock out
- `GET /api/time/entries/my_time/` - Get user's time entries
- `GET /api/time/entries/summary/` - Get time summary

### Equipment
- `GET /api/equipment/equipment/` - List equipment
- `POST /api/equipment/transfers/` - Create transfer
- `POST /api/equipment/transfers/{id}/accept/` - Accept transfer

## Key Features Implementation

### Job Numbering
Job numbers are auto-generated in format: `LOCATIONCODE-YY-SEQ`
Example: `KC-26-0142` (Kansas City, year 2026, sequence 0142)

### Schedule Status (Green/Yellow/Red)
- **Green**: Forecast completion on/before baseline
- **Yellow**: Forecast late by 1-7 days
- **Red**: Forecast late by 8+ days or baseline passed

### Invitation System
- Only Superadmin, Admin, System Admin, and HR can invite users
- Every invitation tracks:
  - Who invited
  - When invited
  - Role assigned
  - Scope granted
  - Permission change history

### Equipment Transfers
- Foreman initiates transfer
- Receiving foreman must accept
- Full audit trail maintained
- Equipment status updated automatically

## Development Notes

- Django admin is available at `/admin/` for backend management
- All API endpoints require authentication (except login)
- Frontend uses JWT tokens stored in localStorage
- CORS is configured for local development

## Next Steps

1. Implement AI review features
2. Add public portal views
3. Implement GC user views
4. Add export/PDF generation
5. Set up email notifications
6. Add file upload for photos/documents
7. Implement real-time updates (WebSockets)

## License

Proprietary - All rights reserved

