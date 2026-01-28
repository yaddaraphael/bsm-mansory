# Project Scopes System Implementation

## Overview

This document describes the complete implementation of the **Project Scopes System**, which replaces the previous phase-based quantity tracking with a comprehensive scope management system. The new system allows for detailed tracking of project scopes with dates, resources, and progress metrics.

## Key Changes

### Conceptual Shift

- **Before**: Phases were pulled from Spectrum and used for tracking quantities
- **After**: 
  - **Phases** (from Spectrum) are now **read-only reference** data
  - **Scopes** are the **editable tracking entities** with comprehensive fields

### Scope Types

The system supports dynamic scope types that can be managed by admins. Default scope types:
- CMU
- BRICK
- CASTSTONE
- MSV
- STUCCO
- EIFS
- THIN BRICK
- FBD STONE

### Foremen

The system supports dynamic foremen management. Default foremen:
- adam, enoch, eric, hugo, jose s, joel, manuel, mike, neftali, sergio, steve, victor c, victor m, vidal, silva, sub-neti, sub-rick, tbd

---

## Backend Implementation

### 1. Database Models

#### ScopeType Model (`projects/models.py`)

```python
class ScopeType(models.Model):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**Purpose**: Manages scope types dynamically. Admins can add new scope types without code changes.

#### Foreman Model (`projects/models.py`)

```python
class Foreman(models.Model):
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**Purpose**: Manages foremen list dynamically. Admins can add new foremen without code changes.

#### ProjectScope Model (Updated) (`projects/models.py`)

**New Fields**:
- `scope_type` - ForeignKey to ScopeType (replaces CharField with choices)
- `description` - TextField for scope description
- `estimation_start_date` - DateField for estimated start
- `estimation_end_date` - DateField for estimated end
- `duration_days` - IntegerField (auto-calculates end date when set)
- `saturdays` - BooleanField (include Saturdays as workdays)
- `full_weekends` - BooleanField (include full weekends as workdays)
- `qty_sq_ft` - DecimalField (quantity per square foot)
- `foreman` - ForeignKey to Foreman (nullable)
- `masons` - IntegerField (number of masons)
- `tenders` - IntegerField (number of tenders)
- `operators` - IntegerField (number of operators)

**Removed Fields**:
- `unit` - No longer needed (always Sq.Ft)
- `start_date` / `end_date` - Replaced with `estimation_start_date` / `estimation_end_date`

**Properties**:
- `quantity` - Alias for `qty_sq_ft` (backward compatibility)
- `remaining` - Calculated as `qty_sq_ft - installed`
- `percent_complete` - Calculated as `(installed / qty_sq_ft) * 100`

**Special Behavior**:
- `save()` method automatically calculates `estimation_end_date` from `duration_days` when both `estimation_start_date` and `duration_days` are set
- Calculation respects `saturdays` and `full_weekends` settings

#### Project Model Updates

- `total_quantity` property now uses `Sum('qty_sq_ft')` instead of `Sum('quantity')`
- All other scope-related properties remain the same

### 2. Serializers (`projects/serializers.py`)

#### ScopeTypeSerializer

```python
class ScopeTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScopeType
        fields = ['id', 'code', 'name', 'is_active', 'created_at', 'updated_at']
```

#### ForemanSerializer

```python
class ForemanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Foreman
        fields = ['id', 'name', 'is_active', 'created_at', 'updated_at']
```

#### ProjectScopeSerializer (Updated)

**New Features**:
- Nested serializers for `scope_type_detail` and `foreman_detail`
- Write-only fields `scope_type_id` and `foreman_id` for easier API usage
- Validation for scope type and foreman existence and active status
- Custom `create()` and `update()` methods to handle ID-based relationships

**Fields**:
- All model fields plus computed fields (`remaining`, `percent_complete`, `quantity`)

### 3. API Views (`projects/views.py`)

#### ScopeTypeViewSet

- **Endpoint**: `/api/projects/scope-types/`
- **Methods**: GET, POST, PUT, PATCH, DELETE
- **Filtering**: `is_active`
- **Access**: All authenticated users can view active scope types; admins can see inactive ones

#### ForemanViewSet

- **Endpoint**: `/api/projects/foremen/`
- **Methods**: GET, POST, PUT, PATCH, DELETE
- **Filtering**: `is_active`
- **Access**: All authenticated users can view active foremen; admins can see inactive ones

#### ProjectScopeViewSet (Updated)

- **Endpoint**: `/api/projects/scopes/`
- **Methods**: GET, POST, PUT, PATCH, DELETE
- **Filtering**: `project`, `scope_type`
- **Optimization**: Uses `select_related('scope_type', 'foreman', 'project')` to reduce queries

### 4. URL Configuration (`projects/urls.py`)

Added routes:
- `/api/projects/scope-types/` - ScopeTypeViewSet
- `/api/projects/foremen/` - ForemanViewSet

### 5. Admin Interface (`projects/admin.py`)

#### ScopeTypeAdmin

- List display: code, name, is_active, created_at
- Filters: is_active
- Search: code, name

#### ForemanAdmin

- List display: name, is_active, created_at
- Filters: is_active
- Search: name

#### ProjectScopeAdmin (Updated)

- List display: project, scope_type, qty_sq_ft, installed, remaining, percent_complete, foreman
- Filters: scope_type, foreman
- Search: project job_number, project name, scope_type name
- Fieldsets organized by: Basic Information, Dates, Schedule, Quantities, Resources, Metadata

---

## Frontend Implementation

### 1. Project Detail Page (`app/projects/[id]/page.tsx`)

#### Changes

**Replaced Section**: "Project Phases & Quantities" → "Project Scopes"

**New Features**:
1. **Scope Display**:
   - Shows all scopes with comprehensive information
   - Displays: scope type, description, foreman, dates, duration, schedule options
   - Shows metrics: Qty/sq.ft, Installed, Remaining, Completion percentage
   - Displays resources: Masons, Tenders, Operators

2. **Scope Management**:
   - "Add Scope" button (if user has edit permissions)
   - Edit/Delete buttons for each scope
   - Inline editing with all fields
   - Real-time validation

3. **Add Scope Modal**:
   - Form with all scope fields
   - Dropdowns for scope type and foreman
   - Date pickers for estimation dates
   - Number inputs for quantities and resources
   - Checkboxes for saturdays and full weekends

4. **Spectrum Phases Section** (New):
   - Read-only table showing Spectrum phases
   - Displays: Code, Type, Description, JTD Cost, Projected Cost, Estimated Cost, Status
   - For reference only - not editable

**State Management**:
- `scopeTypes` - Fetched from `/api/projects/scope-types/`
- `foremen` - Fetched from `/api/projects/foremen/`
- `scopes` - From project data
- `editingScope` - Currently editing scope ID
- `scopeUpdates` - Pending updates
- `showAddScopeModal` - Modal visibility

**API Calls**:
- `GET /api/projects/scope-types/` - Fetch scope types
- `GET /api/projects/foremen/` - Fetch foremen
- `GET /api/projects/scopes/?project={id}` - Fetch project scopes
- `POST /api/projects/scopes/` - Create new scope
- `PATCH /api/projects/scopes/{id}/` - Update scope
- `DELETE /api/projects/scopes/{id}/` - Delete scope

### 2. Project Edit Page (`app/projects/[id]/edit/page.tsx`)

#### Changes

**Replaced Section**: "Phases - Initial Quantities" → "Project Scopes"

**New Features**:
1. **Scope Management Interface**:
   - List of all scopes with expandable details
   - Add/Edit/Delete functionality
   - Inline editing mode
   - Form validation

2. **Scope Form Fields**:
   - Scope Type (required dropdown)
   - Description (textarea)
   - Estimation Start Date (date picker)
   - Estimation End Date (date picker)
   - Duration Days (number input)
   - Saturdays checkbox
   - Full Weekends checkbox
   - Qty/sq.ft (number input)
   - Foreman (dropdown, optional)
   - Masons (number input)
   - Tenders (number input)
   - Operators (number input)

3. **Save Logic**:
   - Scopes are saved separately after project update
   - Creates new scopes or updates existing ones
   - Skips scopes without valid scope_type_id

**State Management**:
- `scopes` - Array of scope objects
- `editingScopeIndex` - Currently editing scope index
- `scopeTypes` - Fetched scope types
- `foremen` - Fetched foremen

---

## Migration Steps

### 1. Create and Run Migrations

```bash
cd backend
python manage.py makemigrations projects
python manage.py migrate projects
```

### 2. Populate Default Data

#### Option A: Using Django Admin

1. Navigate to `/admin/projects/scopetype/`
2. Add each scope type:
   - CMU (code: CMU, name: CMU)
   - BRICK (code: BRICK, name: BRICK)
   - CASTSTONE (code: CASTSTONE, name: CAST STONE)
   - MSV (code: MSV, name: MSV)
   - STUCCO (code: STUCCO, name: STUCCO)
   - EIFS (code: EIFS, name: EIFS)
   - THIN BRICK (code: THIN_BRICK, name: THIN BRICK)
   - FBD STONE (code: FBD_STONE, name: FBD STONE)

3. Navigate to `/admin/projects/foreman/`
4. Add each foreman:
   - adam, enoch, eric, hugo, jose s, joel, manuel, mike, neftali, sergio, steve, victor c, victor m, vidal, silva, sub-neti, sub-rick, tbd

#### Option B: Using Django Management Command

Create a management command or data migration to populate defaults automatically.

### 3. Data Migration for Existing Scopes

If you have existing `ProjectScope` records with the old `scope_type` CharField:

1. Create a data migration to:
   - Create ScopeType records for each unique scope_type value
   - Update ProjectScope records to use ForeignKey relationships
   - Handle any data cleanup needed

### 4. Update Existing Scopes

Existing scopes will need to be updated to use the new scope type system. You may need to:
- Map old scope_type strings to new ScopeType objects
- Set default values for new fields (masons, tenders, operators, etc.)

---

## API Endpoints

### Scope Types

- `GET /api/projects/scope-types/` - List all scope types
- `POST /api/projects/scope-types/` - Create scope type
- `GET /api/projects/scope-types/{id}/` - Get scope type
- `PATCH /api/projects/scope-types/{id}/` - Update scope type
- `DELETE /api/projects/scope-types/{id}/` - Delete scope type

### Foremen

- `GET /api/projects/foremen/` - List all foremen
- `POST /api/projects/foremen/` - Create foreman
- `GET /api/projects/foremen/{id}/` - Get foreman
- `PATCH /api/projects/foremen/{id}/` - Update foreman
- `DELETE /api/projects/foremen/{id}/` - Delete foreman

### Project Scopes

- `GET /api/projects/scopes/` - List all scopes (filterable by project)
- `POST /api/projects/scopes/` - Create scope
- `GET /api/projects/scopes/{id}/` - Get scope
- `PATCH /api/projects/scopes/{id}/` - Update scope
- `DELETE /api/projects/scopes/{id}/` - Delete scope

**Query Parameters**:
- `?project={project_id}` - Filter scopes by project

---

## Usage Guide

### For Project Managers

1. **Viewing Scopes**:
   - Navigate to a project detail page
   - View all scopes in the "Project Scopes" section
   - See progress metrics (installed, remaining, completion %)
   - View Spectrum phases in the reference section below

2. **Adding Scopes**:
   - Click "Add Scope" button
   - Select scope type (required)
   - Fill in description, dates, quantities, and resources
   - Click "Create Scope"

3. **Editing Scopes**:
   - Click "Edit" button on a scope
   - Modify any fields
   - Click "Done" to save

4. **Deleting Scopes**:
   - Click "Delete" button on a scope
   - Confirm deletion

### For Admins

1. **Managing Scope Types**:
   - Navigate to `/settings` and click on the "Scope Types & Foremen" tab
   - Add new scope types by providing a code and name
   - Edit existing scope types (name and active status)
   - Delete scope types (with confirmation)
   - Scope types can be marked as inactive (won't appear in dropdowns)
   - **Note**: Scope types are managed globally, not per project

2. **Managing Foremen**:
   - Navigate to `/settings` and click on the "Scope Types & Foremen" tab
   - Add new foremen by providing a name
   - Edit existing foremen (name and active status)
   - Delete foremen (with confirmation)
   - Foremen can be marked as inactive (won't appear in dropdowns)
   - **Note**: Foremen are managed globally, not per project

3. **Adding Scopes to Projects**:
   - When adding a scope to a project, select from the dropdown of available scope types
   - Select a foreman from the dropdown (optional)
   - Scope types and foremen are managed centrally in Settings, not per project

---

## Key Features

### 1. Dynamic Scope Types and Foremen

- No code changes needed to add new scope types or foremen
- Managed through Django admin
- Can be activated/deactivated

### 2. Comprehensive Scope Tracking

Each scope tracks:
- **Identification**: Type, description
- **Timeline**: Start date, end date, duration (auto-calculated)
- **Schedule**: Saturdays, full weekends options
- **Progress**: Initial quantity, installed quantity, remaining, completion %
- **Resources**: Foreman, masons, tenders, operators

### 3. Automatic Date Calculation

When `duration_days` and `estimation_start_date` are set:
- System automatically calculates `estimation_end_date`
- Respects `saturdays` and `full_weekends` settings
- Only counts workdays

### 4. Meeting Integration

- Installed quantities are updated from meetings
- Meeting phases are matched to scopes
- Progress is tracked automatically

### 5. Read-Only Spectrum Phases

- Spectrum phases are displayed for reference
- Shows cost information and status
- Not editable (pulled from Spectrum system)

---

## Backward Compatibility

### Property Aliases

- `ProjectScope.quantity` → Returns `qty_sq_ft` (for backward compatibility)
- Existing code using `scope.quantity` will continue to work

### API Compatibility

- Old API endpoints still work
- New fields are optional in API requests
- Existing frontend code may need updates to use new field names

---

## Testing Checklist

- [ ] Create scope types via admin
- [ ] Create foremen via admin
- [ ] Add scope to project via detail page
- [ ] Edit scope via detail page
- [ ] Delete scope via detail page
- [ ] Add scope via edit page
- [ ] Edit scope via edit page
- [ ] Delete scope via edit page
- [ ] Verify duration calculation works
- [ ] Verify installed quantities update from meetings
- [ ] Verify progress percentages calculate correctly
- [ ] Verify Spectrum phases display (read-only)
- [ ] Test with completed projects (should be read-only)

---

## Troubleshooting

### Issue: Scope types not appearing in dropdown

**Solution**: 
- Check that scope types are marked as `is_active=True`
- Verify API endpoint `/api/projects/scope-types/` returns data
- Check browser console for API errors

### Issue: Duration not calculating end date

**Solution**:
- Ensure `estimation_start_date` is set
- Ensure `duration_days` is a positive number
- Check that scope save() method is being called

### Issue: Scopes not saving

**Solution**:
- Verify `scope_type_id` is set and valid
- Check API response for validation errors
- Verify user has edit permissions
- Check that project is not completed (completed projects are read-only)

---

## Future Enhancements

Potential improvements:
1. Bulk scope operations (import/export)
2. Scope templates for common scope configurations
3. Scope dependencies and sequencing
4. Advanced reporting on scope progress
5. Integration with Spectrum for automatic scope creation from phases

---

## Files Modified

### Backend
- `backend/projects/models.py` - Added ScopeType, Foreman models; Updated ProjectScope model
- `backend/projects/serializers.py` - Added ScopeTypeSerializer, ForemanSerializer; Updated ProjectScopeSerializer
- `backend/projects/views.py` - Added ScopeTypeViewSet, ForemanViewSet; Updated ProjectScopeViewSet
- `backend/projects/urls.py` - Added scope-types and foremen routes
- `backend/projects/admin.py` - Added ScopeTypeAdmin, ForemanAdmin; Updated ProjectScopeAdmin

### Frontend
- `frontend/app/projects/[id]/page.tsx` - Complete rewrite of scopes section
- `frontend/app/projects/[id]/edit/page.tsx` - Complete rewrite of scopes section

---

## Meeting Integration

### How Meetings Update Scopes

Meetings are the **authoritative source** for the following scope fields:
- **Installed Quantity** - Updated from `MeetingJobPhase.installed_quantity`
- **Masons** - Updated from `MeetingJobPhase.masons`
- **Tenders** - Updated from `MeetingJobPhase.labors` (labors in meetings = tenders in scopes)
- **Operators** - Updated from `MeetingJobPhase.operators`

### Automatic Updates

When a meeting is saved or updated:
1. The `sync_meeting_phase_to_project_scope` signal is triggered
2. It finds the matching ProjectScope by:
   - First checking `MeetingJob.selected_scope` (if set)
   - Then matching `MeetingJobPhase.phase_code` with ScopeType codes/names
3. Updates the scope with the **latest** values from the most recent meeting
4. Completion percentage is automatically recalculated (it's a property)

### Scope Matching Logic

1. **Priority 1**: Uses `selected_scope` from `MeetingJob` if available
2. **Priority 2**: Matches `phase_code` with active ScopeType codes/names
3. If no match found, logs a debug message (scope won't be updated)

### Read-Only Fields

The following fields are **read-only** in the UI (controlled by meetings):
- Installed quantity
- Masons
- Tenders
- Operators

These fields are displayed with a gray background and "Controlled by meetings" helper text.

## Notes

- Phases from Spectrum are now **read-only reference** data (removed duplicate display)
- Scopes are the **editable tracking entities**
- **Scope types and foremen are managed globally** in Settings → "Scope Types & Foremen" tab (admin only)
- When adding scopes to projects, select from dropdowns of available scope types and foremen
- All scope operations respect project completion status (completed projects are read-only)
- Duration calculation automatically updates end date when start date and duration are set
- **Meetings control**: installed quantity, masons, tenders, operators
- **Manual entry**: initial qty/sq.ft, description, dates, duration, schedule options, foreman
- Completion percentage updates automatically when installed quantity changes

## Centralized Management

Scope types and foremen are **not managed per project**. Instead:
- **Global Management**: All scope types and foremen are managed in Settings → "Scope Types & Foremen"
- **Project Usage**: When creating/editing scopes on a project, you select from the available scope types and foremen using dropdowns
- **Benefits**: 
  - Consistent naming across all projects
  - Easy to add new types/foremen without code changes
  - Can deactivate types/foremen without deleting them
  - Changes apply to all projects immediately

---

**Last Updated**: January 27, 2026
**Version**: 1.2.0
