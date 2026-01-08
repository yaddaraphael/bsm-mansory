# Email Templates Update Script

All email templates need to have the BSM logo added. The logo should be added in the header section like this:

```html
<div class="header">
    <div class="logo" style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">BSM</div>
    <p style="margin: 0; font-size: 14px; opacity: 0.9;">Building Systems Management</p>
    <h1 style="margin-top: 10px;">Welcome to BSM System</h1>
</div>
```

Templates to update:
- invite_worker.html ✅
- invite_foreman.html ✅
- invite_superintendent.html ✅
- invite_pm.html ✅
- invite_hr.html ✅
- invite_finance.html ✅
- invite_auditor.html ✅
- invite_admin.html ✅
- invite_system_admin.html ✅
- invite_superadmin.html ✅
- invite_gc.html ✅
- invite_default.html ✅
- reset_password.html ✅

All templates have been updated with the BSM logo in the header.

## Email Configuration (.env Setup)

To enable email sending in the BSM system, you need to configure email settings in your `.env` file. Add the following variables to your `.env` file:

### For Production (SMTP Email Backend)

```env
# Email Backend - Use SMTP for sending real emails
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend

# Email Server Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True

# Email Credentials
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password-or-regular-password

# Default From Email Address
DEFAULT_FROM_EMAIL=noreply@bsm.com

# Frontend URL (used in email links)
FRONTEND_URL=http://localhost:3000
```

### For Development (Console Output - No Real Emails)

```env
# Email Backend - Console output for development
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend

# Frontend URL (still needed for email links)
FRONTEND_URL=http://localhost:3000
```

### Email Provider Examples

#### Gmail Configuration (Port 587 - TLS)

```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-specific-password
DEFAULT_FROM_EMAIL=your-email@gmail.com
FRONTEND_URL=http://localhost:3000
```

#### Gmail Configuration (Port 465 - SSL)

```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_USE_SSL=True
EMAIL_USE_TLS=False
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-specific-password
DEFAULT_FROM_EMAIL=your-email@gmail.com
FRONTEND_URL=http://localhost:3000
```

**Note for Gmail**: 
- You'll need to use an [App Password](https://support.google.com/accounts/answer/185833) instead of your regular Gmail password if you have 2-Step Verification enabled.
- Port 465 uses SSL encryption from the start, while port 587 uses STARTTLS.

#### Outlook/Office 365 Configuration

```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.office365.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
EMAIL_HOST_USER=your-email@outlook.com
EMAIL_HOST_PASSWORD=your-password
DEFAULT_FROM_EMAIL=your-email@outlook.com
FRONTEND_URL=http://localhost:3000
```

#### Custom SMTP Server Configuration (Port 587)

```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.yourdomain.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
EMAIL_HOST_USER=noreply@yourdomain.com
EMAIL_HOST_PASSWORD=your-smtp-password
DEFAULT_FROM_EMAIL=noreply@yourdomain.com
FRONTEND_URL=http://localhost:3000
```

#### Custom SMTP Server Configuration (Port 465)

```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.yourdomain.com
EMAIL_PORT=465
EMAIL_USE_SSL=True
EMAIL_USE_TLS=False
EMAIL_HOST_USER=noreply@yourdomain.com
EMAIL_HOST_PASSWORD=your-smtp-password
DEFAULT_FROM_EMAIL=noreply@yourdomain.com
FRONTEND_URL=http://localhost:3000
```

### Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `EMAIL_BACKEND` | Django email backend to use | `django.core.mail.backends.console.EmailBackend` | No |
| `EMAIL_HOST` | SMTP server hostname | `smtp.gmail.com` | Yes (for SMTP) |
| `EMAIL_PORT` | SMTP server port | `587` (TLS) or `465` (SSL) | Yes (for SMTP) |
| `EMAIL_USE_TLS` | Use TLS encryption | `True` for port 587 | Yes (for SMTP port 587) |
| `EMAIL_USE_SSL` | Use SSL encryption | `False` | Yes (for SMTP port 465) |
| `EMAIL_HOST_USER` | SMTP username/email | `` | Yes (for SMTP) |
| `EMAIL_HOST_PASSWORD` | SMTP password | `` | Yes (for SMTP) |
| `DEFAULT_FROM_EMAIL` | Default sender email address | `noreply@bsm.com` | No |
| `FRONTEND_URL` | Frontend URL for email links | `http://localhost:3000` | Yes |

**Important Notes:**
- **Port 465 (SSL)**: Set `EMAIL_PORT=465`, `EMAIL_USE_SSL=True`, and `EMAIL_USE_TLS=False`
- **Port 587 (TLS)**: Set `EMAIL_PORT=587`, `EMAIL_USE_TLS=True`, and `EMAIL_USE_SSL=False`
- **Never set both SSL and TLS to `True` at the same time**

### Troubleshooting

1. **Email not sending**: Check that `EMAIL_BACKEND` is set to `django.core.mail.backends.smtp.EmailBackend` (not console backend)
2. **Authentication errors**: Verify `EMAIL_HOST_USER` and `EMAIL_HOST_PASSWORD` are correct
3. **Connection errors**: 
   - Check firewall settings and ensure the SMTP port is open
   - For port 465: Ensure `EMAIL_USE_SSL=True` and `EMAIL_USE_TLS=False`
   - For port 587: Ensure `EMAIL_USE_TLS=True` and `EMAIL_USE_SSL=False`
   - **Never set both SSL and TLS to `True` simultaneously**
4. **"Connection unexpectedly closed" error**: Usually means SSL/TLS configuration mismatch with the port
   - Port 465 requires SSL (`EMAIL_USE_SSL=True`)
   - Port 587 requires TLS (`EMAIL_USE_TLS=True`)
5. **Gmail errors**: Make sure you're using an App Password, not your regular password
6. **Test email configuration**: Use Django shell to test:
   ```python
   from django.core.mail import send_mail
   send_mail('Test', 'Test message', 'from@example.com', ['to@example.com'])
   ```

