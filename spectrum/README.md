# Spectrum Integration

This app provides integration with Spectrum Data Exchange SOAP/WSDL services.

## Setup

1. **Install Dependencies**
   ```bash
   pip install zeep==4.2.1
   ```

2. **Configure Environment Variables**
   Add to your `.env` file:
   ```
   SPECTRUM_ENDPOINT=https://buildersstonekc.dexterchaney.com:8482/ws
   SPECTRUM_AUTHORIZATION_ID=your_authorization_id_here
   SPECTRUM_COMPANY_CODE=BSM
   SPECTRUM_TIMEOUT=30
   ```

3. **Run Migrations**
   ```bash
   python manage.py migrate spectrum
   ```

## Available Services

### GetJob
- **WSDL**: `GetJob.jws`
- **Method**: `GetJob`
- **Purpose**: Import Job information from Spectrum

## API Endpoints

All endpoints require authentication and `ROOT_SUPERADMIN` role.

- `GET /api/spectrum/jobs/fetch/` - Fetch jobs from Spectrum (with optional filters)
- `POST /api/spectrum/jobs/import/` - Import fetched jobs into the database
- `GET /api/spectrum/jobs/list/` - List all imported jobs from the database

## Usage

1. Navigate to `/spectrum` page (Root Admin only)
2. Use filters to specify which jobs to fetch
3. Click "Fetch Jobs from Spectrum" to retrieve data
4. Review the fetched jobs
5. Click "Import Jobs to Database" to save them locally
6. View imported jobs in the "Imported Jobs" tab

## Models

### SpectrumJob
Stores job information imported from Spectrum. Fields match the GetJob return fields.

## Permissions

All Spectrum endpoints are restricted to `ROOT_SUPERADMIN` role only.
