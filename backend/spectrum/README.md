# Spectrum Integration

This app provides integration with Trimble Spectrum via the AppExchange platform, allowing you to sync employees, projects, and reports from Spectrum into the BSM system.

## Setup

### 1. Environment Variables

Add the following to your `.env` file:

```env
# Trimble Spectrum API Configuration
SPECTRUM_API_BASE_URL=https://api.spectrum.trimble.com
SPECTRUM_API_KEY=your_api_key_here
SPECTRUM_API_SECRET=your_api_secret_here
SPECTRUM_API_TIMEOUT=30
```

### 2. Database Migrations

Run migrations to create the Spectrum tables:

```bash
python manage.py makemigrations spectrum
python manage.py migrate
```

### 3. Trimble AppExchange OAuth Setup

The current implementation uses a placeholder for OAuth authentication. To complete the integration:

1. Register your application with Trimble AppExchange
2. Obtain OAuth 2.0 credentials (Client ID and Client Secret)
3. Implement the OAuth 2.0 flow in `services.py`:
   - Update `_get_access_token()` method to handle OAuth token requests
   - Implement token refresh logic
   - Add token caching to avoid unnecessary API calls

## API Endpoints

### List Employees
```
GET /api/spectrum/employees/
Query Parameters:
  - search: Search by name, email, or employee ID
  - status: Filter by status (ACTIVE, INACTIVE, etc.)
  - role: Filter by role
```

### List Projects
```
GET /api/spectrum/projects/
Query Parameters:
  - search: Search by name, job number, client, or location
  - status: Filter by status
```

### List Reports
```
GET /api/spectrum/reports/
Query Parameters:
  - search: Search by title, report ID, or project
  - type: Filter by report type (DAILY, WEEKLY, MONTHLY, PAYROLL, OTHER)
  - status: Filter by status
```

### Sync Data
```
POST /api/spectrum/sync/
Body:
  {
    "type": "all" | "employees" | "projects" | "reports"
  }
```

**Note:** Only ROOT_SUPERADMIN, SUPERADMIN, and ADMIN users can trigger syncs.

## Data Models

### SpectrumEmployee
- Stores employee data from Spectrum
- Fields: spectrum_id, employee_id, first_name, last_name, email, phone, role, status
- Raw API data stored in `raw_data` JSON field

### SpectrumProject
- Stores project data from Spectrum
- Fields: spectrum_id, project_id, job_number, name, client, location, status, dates
- Raw API data stored in `raw_data` JSON field

### SpectrumReport
- Stores report data from Spectrum
- Fields: spectrum_id, report_id, title, report_type, project, status, created_date
- Raw API data stored in `raw_data` JSON field

## Sync Service

The `SpectrumSyncService` class handles syncing data from the Spectrum API:

- `sync_employees()`: Syncs all employees
- `sync_projects()`: Syncs all projects
- `sync_reports()`: Syncs all reports

Each sync method:
- Fetches data from Spectrum API
- Maps API fields to model fields
- Creates or updates records using `update_or_create()`
- Returns sync results with success/error counts

## Customization

### API Field Mapping

If the Spectrum API uses different field names, update the mapping in the sync methods in `services.py`. The current implementation handles common variations:

- `firstName` / `first_name`
- `lastName` / `last_name`
- `employee_number` / `employee_id`
- etc.

### Date Parsing

The service includes date parsing for various formats. If your API uses different date formats, update the `_parse_date()` and `_parse_datetime()` methods.

## Admin Interface

All Spectrum models are registered in Django admin for easy management:
- View and search synced data
- See last sync timestamps
- Access raw API data stored in JSON fields

## Next Steps

1. **Complete OAuth Implementation**: Replace placeholder authentication with actual OAuth 2.0 flow
2. **Add Scheduled Syncs**: Set up Celery tasks to automatically sync data on a schedule
3. **Error Handling**: Enhance error handling and retry logic
4. **Webhooks**: Implement webhook support if Spectrum provides it for real-time updates
5. **Data Validation**: Add validation rules for synced data
6. **Mapping Configuration**: Make field mappings configurable via admin or settings
