# Logo Storage and Usage Guide

## Logo Storage Location

The BSM logo should be stored in the following locations:

### Backend (Django)
- **Static Files**: `backend/static/images/logo.png` (or `logo.jpg`)
- **Media Files**: `backend/media/logos/logo.png` (for uploaded logos)
- **Email Templates**: Reference via `{{ STATIC_URL }}images/logo.png` or absolute URL

### Frontend (Next.js)
- **Public Folder**: `frontend/public/images/logo.png`
- **Usage**: Reference as `/images/logo.png` in components

## Recommended Logo Specifications

- **Format**: PNG (with transparency) or SVG
- **Size**: 
  - Full logo: 200x60px (for headers)
  - Icon: 64x64px (for sidebar)
  - Email: 150x45px (for email templates)
- **Background**: Transparent or white

## Implementation Steps

1. **Place logo files**:
   ```bash
   # Backend static
   mkdir -p backend/static/images
   cp logo.png backend/static/images/
   
   # Frontend public
   mkdir -p frontend/public/images
   cp logo.png frontend/public/images/
   ```

2. **Update Django Settings** (already configured):
   - `STATIC_URL = 'static/'`
   - `STATIC_ROOT = BASE_DIR / 'staticfiles'`
   - `MEDIA_URL = 'media/'`
   - `MEDIA_ROOT = BASE_DIR / 'media'`

3. **Update Email Templates**:
   - Templates are in: `backend/accounts/templates/accounts/emails/`
   - Add logo reference: `<img src="{{ logo_url }}" alt="BSM Logo" style="max-width: 150px;">`
   - Logo URL should be absolute (e.g., `https://yourdomain.com/static/images/logo.png`)

4. **Update Sidebar**:
   - Current: Uses BuildingOfficeIcon
   - Replace with: `<img src="/images/logo.png" alt="BSM" className="h-8 w-auto" />`

5. **Update Login Page**:
   - Current: Uses BuildingOfficeIcon
   - Replace with: `<img src="/images/logo.png" alt="BSM System" className="h-16 w-auto" />`

## Email Template Logo Usage

In email templates, use absolute URLs for logos:

```html
<div class="header">
    <img src="https://yourdomain.com/static/images/logo.png" alt="BSM Logo" style="max-width: 150px; margin-bottom: 10px;">
    <h1>Welcome to BSM System</h1>
</div>
```

Or use a context variable passed from views:

```python
# In views.py
context = {
    'logo_url': f"{settings.STATIC_URL}images/logo.png",
    # or absolute URL
    'logo_url': f"{settings.BASE_URL}/static/images/logo.png",
}
```

## Current Status

- ✅ Static files configuration is set up
- ✅ Media files configuration is set up
- ⚠️ Logo files need to be added to the directories
- ⚠️ Email templates need logo image references
- ⚠️ Sidebar and login page need logo image references

## Next Steps

1. Obtain the BSM logo file(s)
2. Place logo in both backend/static/images/ and frontend/public/images/
3. Update email templates to include logo
4. Update Sidebar component to use logo image
5. Update Login page to use logo image
6. Test logo display in emails and UI

