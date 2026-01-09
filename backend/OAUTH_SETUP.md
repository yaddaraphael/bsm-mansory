# OAuth Setup Guide

This guide explains how to set up Microsoft Azure AD and Google OAuth authentication for the BSM System.

## Prerequisites

1. Install the required Python packages:
```bash
pip install msal==1.28.0 google-auth==2.29.0 google-auth-oauthlib==1.2.0 google-auth-httplib2==0.2.0
```

## Microsoft Azure AD Setup

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Fill in:
   - **Name**: BSM System
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**: 
     - Type: Web
     - URI: `http://localhost:8000/api/auth/oauth/microsoft/callback/` (for development)
     - For production: `https://yourdomain.com/api/auth/oauth/microsoft/callback/`
5. Click **Register**
6. Note down the **Application (client) ID**
7. Go to **Certificates & secrets** > **New client secret**
8. Create a secret and note it down (you'll only see it once)
9. Go to **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions**
10. Add these permissions:
    - `openid`
    - `email`
    - `profile`
    - `User.Read`
11. Click **Add permissions**
12. Click **Grant admin consent** (if you're an admin)

### Environment Variables for Microsoft

Add these to your `.env` file:

```env
MICROSOFT_CLIENT_ID=your-client-id-here
MICROSOFT_CLIENT_SECRET=your-client-secret-here
MICROSOFT_TENANT_ID=common  # or your specific tenant ID
# For development (localhost)
MICROSOFT_REDIRECT_URI=http://localhost:8000/api/auth/oauth/microsoft/callback/
# For production, use:
# MICROSOFT_REDIRECT_URI=https://bsm.novacoredeveloper.com/api/auth/oauth/microsoft/callback/
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Go to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. If prompted, configure the OAuth consent screen:
   - **User Type**: External (or Internal if using Google Workspace)
   - Fill in required information
   - Add scopes: `openid`, `email`, `profile`
6. Create OAuth client ID:
   - **Application type**: Web application
   - **Name**: BSM System
   - **Authorized JavaScript origins**: 
     - `http://localhost:3000` (for development)
     - `https://bsm.novacoredeveloper.com` (for production)
   - **Authorized redirect URIs**:
     - `http://localhost:8000/api/auth/oauth/google/callback/` (for development)
     - `https://bsm.novacoredeveloper.com/api/auth/oauth/google/callback/` (for production)
7. Click **Create**
8. Note down the **Client ID** and **Client secret**

### Environment Variables for Google

Add these to your `.env` file:

```env
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
# For development (localhost)
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/oauth/google/callback/
# For production, use:
# GOOGLE_REDIRECT_URI=https://bsm.novacoredeveloper.com/api/auth/oauth/google/callback/
```

## How It Works

1. **User clicks "Sign in with Microsoft" or "Sign in with Google"** on the login page
2. **Frontend calls** `/api/auth/oauth/microsoft/initiate/` or `/api/auth/oauth/google/initiate/`
3. **Backend generates** an authorization URL with a state parameter (for CSRF protection)
4. **User is redirected** to Microsoft/Google login page
5. **User authenticates** with their Microsoft/Google account
6. **Microsoft/Google redirects** back to the callback URL with an authorization code
7. **Backend exchanges** the code for access tokens
8. **Backend fetches** user information from Microsoft Graph API or Google UserInfo API
9. **Backend creates or updates** the user in the Django database
10. **Backend generates** JWT tokens and redirects to frontend with tokens in URL
11. **Frontend stores** tokens and redirects to dashboard

## User Creation and Existing Accounts

- **Existing Users**: If a user with the same email already exists in the database, they will be logged in using their existing account. Their email will be marked as verified, and their name will be updated if missing.
- **New Users**: If a user with the email doesn't exist, a new user is created
- Username is generated as `{email_prefix}_{provider}` (e.g., `john_microsoft` or `john_google`)
- If username conflicts occur, a counter is appended (e.g., `john_microsoft_1`)
- Email is automatically verified for OAuth users
- First name and last name are populated from the OAuth provider

**Important**: Users with existing accounts can use OAuth login as long as the email address matches. This allows seamless login regardless of whether they originally registered with email/password or OAuth.

## Security Features

- **State parameter**: Prevents CSRF attacks
- **State stored in cache**: Expires after 10 minutes
- **JWT tokens**: Secure token-based authentication
- **Email verification**: Automatically verified for OAuth users

## Testing

1. Start the Django server: `python manage.py runserver`
2. Start the Next.js frontend: `npm run dev`
3. Go to `http://localhost:3000/login`
4. Click "Sign in with Microsoft" or "Sign in with Google"
5. Complete the OAuth flow
6. You should be redirected to the dashboard

## Troubleshooting

### "OAuth not configured" error
- Check that all environment variables are set correctly
- Verify the client ID and secret are correct
- Ensure redirect URIs match exactly (including trailing slashes)

### "Invalid or expired state parameter"
- The state parameter expires after 10 minutes
- Try the login flow again

### "Email not provided"
- Ensure the OAuth app has the correct permissions
- For Microsoft: Check that `email` and `profile` permissions are granted
- For Google: Check that `openid`, `email`, and `profile` scopes are requested

### Redirect URI mismatch
- Ensure the redirect URI in your OAuth app settings matches exactly
- Check for trailing slashes and HTTP vs HTTPS
