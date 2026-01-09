"""
OAuth authentication views for Microsoft Azure AD and Google.
"""
import secrets
import json
import urllib.parse
from django.conf import settings
from django.shortcuts import redirect
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.utils.decorators import method_decorator
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.cache import cache
import requests
from urllib.parse import urlencode, parse_qs, urlparse

User = get_user_model()


class MicrosoftOAuthInitiateView(APIView):
    """Initiate Microsoft OAuth login - returns authorization URL."""
    permission_classes = [AllowAny]
    
    def get(self, request):
        # Generate state for CSRF protection
        state = secrets.token_urlsafe(32)
        cache.set(f'oauth_state_{state}', True, timeout=600)  # 10 minutes
        
        # Get configuration from settings
        client_id = getattr(settings, 'MICROSOFT_CLIENT_ID', None)
        redirect_uri = getattr(settings, 'MICROSOFT_REDIRECT_URI', None)
        tenant_id = getattr(settings, 'MICROSOFT_TENANT_ID', 'common')
        
        if not client_id or not redirect_uri:
            return Response(
                {'error': 'Microsoft OAuth not configured. Please contact administrator.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Microsoft OAuth 2.0 authorization endpoint
        auth_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize"
        
        params = {
            'client_id': client_id,
            'response_type': 'code',
            'redirect_uri': redirect_uri,
            'response_mode': 'query',
            'scope': 'openid email profile User.Read',
            'state': state,
        }
        
        authorization_url = f"{auth_url}?{urlencode(params)}"
        
        return Response({
            'authorization_url': authorization_url,
            'state': state
        })


class MicrosoftOAuthCallbackView(APIView):
    """Handle Microsoft OAuth callback."""
    permission_classes = [AllowAny]
    
    def get(self, request):
        code = request.query_params.get('code')
        state = request.query_params.get('state')
        error = request.query_params.get('error')
        
        if error:
            return Response(
                {'error': f'OAuth error: {error}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not code or not state:
            return Response(
                {'error': 'Missing authorization code or state'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Verify state
        if not cache.get(f'oauth_state_{state}'):
            return Response(
                {'error': 'Invalid or expired state parameter'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Remove state from cache
        cache.delete(f'oauth_state_{state}')
        
        # Exchange code for tokens
        client_id = getattr(settings, 'MICROSOFT_CLIENT_ID', None)
        client_secret = getattr(settings, 'MICROSOFT_CLIENT_SECRET', None)
        redirect_uri = getattr(settings, 'MICROSOFT_REDIRECT_URI', None)
        tenant_id = getattr(settings, 'MICROSOFT_TENANT_ID', 'common')
        
        if not all([client_id, client_secret, redirect_uri]):
            return Response(
                {'error': 'Microsoft OAuth not configured'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        
        token_data = {
            'client_id': client_id,
            'client_secret': client_secret,
            'code': code,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code',
        }
        
        try:
            token_response = requests.post(token_url, data=token_data)
            token_response.raise_for_status()
            tokens = token_response.json()
            
            access_token = tokens.get('access_token')
            if not access_token:
                return Response(
                    {'error': 'Failed to obtain access token'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get user info from Microsoft Graph API
            graph_response = requests.get(
                'https://graph.microsoft.com/v1.0/me',
                headers={'Authorization': f'Bearer {access_token}'}
            )
            graph_response.raise_for_status()
            user_info = graph_response.json()
            
            # Extract user information
            email = user_info.get('mail') or user_info.get('userPrincipalName')
            first_name = user_info.get('givenName', '')
            last_name = user_info.get('surname', '')
            display_name = user_info.get('displayName', '')
            
            if not email:
                return Response(
                    {'error': 'Email not provided by Microsoft'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if user exists by email (for existing accounts)
            try:
                user = User.objects.get(email=email)
                # User exists - update info if needed
                if not user.first_name and first_name:
                    user.first_name = first_name
                if not user.last_name and last_name:
                    user.last_name = last_name
                user.email_verified = True
                user.save()
                created = False
            except User.DoesNotExist:
                # User doesn't exist - create new user
                base_username = email.split('@')[0]
                username = base_username + '_microsoft'
                counter = 1
                
                # Ensure unique username
                while User.objects.filter(username=username).exists():
                    username = f"{base_username}_microsoft_{counter}"
                    counter += 1
                
                user = User.objects.create(
                    email=email,
                    username=username,
                    first_name=first_name,
                    last_name=last_name,
                    email_verified=True,  # Microsoft emails are verified
                    is_active=True,
                )
                created = True
            
            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)
            
            # Return tokens and redirect URL
            # Determine frontend URL from request or settings
            request_host = request.get_host()
            if 'bsm.novacoredeveloper.com' in request_host:
                frontend_url = 'https://bsm.novacoredeveloper.com'
            else:
                frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
            
            # URL encode tokens to handle special characters
            access_token_str = str(refresh.access_token)
            refresh_token_str = str(refresh)
            redirect_url = f"{frontend_url}/login?oauth_success=true&access_token={urllib.parse.quote(access_token_str)}&refresh_token={urllib.parse.quote(refresh_token_str)}"
            
            return redirect(redirect_url)
            
        except requests.exceptions.RequestException as e:
            return Response(
                {'error': f'Failed to authenticate with Microsoft: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )


class GoogleOAuthInitiateView(APIView):
    """Initiate Google OAuth login - returns authorization URL."""
    permission_classes = [AllowAny]
    
    def get(self, request):
        # Generate state for CSRF protection
        state = secrets.token_urlsafe(32)
        cache.set(f'oauth_state_{state}', True, timeout=600)  # 10 minutes
        
        # Get configuration from settings
        client_id = getattr(settings, 'GOOGLE_CLIENT_ID', None)
        redirect_uri = getattr(settings, 'GOOGLE_REDIRECT_URI', None)
        
        if not client_id or not redirect_uri:
            return Response(
                {'error': 'Google OAuth not configured. Please contact administrator.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Google OAuth 2.0 authorization endpoint
        auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
        
        params = {
            'client_id': client_id,
            'response_type': 'code',
            'redirect_uri': redirect_uri,
            'scope': 'openid email profile',
            'state': state,
            'access_type': 'offline',
            'prompt': 'consent',
        }
        
        authorization_url = f"{auth_url}?{urlencode(params)}"
        
        return Response({
            'authorization_url': authorization_url,
            'state': state
        })


class GoogleOAuthCallbackView(APIView):
    """Handle Google OAuth callback."""
    permission_classes = [AllowAny]
    
    def get(self, request):
        code = request.query_params.get('code')
        state = request.query_params.get('state')
        error = request.query_params.get('error')
        
        if error:
            return Response(
                {'error': f'OAuth error: {error}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not code or not state:
            return Response(
                {'error': 'Missing authorization code or state'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Verify state
        if not cache.get(f'oauth_state_{state}'):
            return Response(
                {'error': 'Invalid or expired state parameter'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Remove state from cache
        cache.delete(f'oauth_state_{state}')
        
        # Exchange code for tokens
        client_id = getattr(settings, 'GOOGLE_CLIENT_ID', None)
        client_secret = getattr(settings, 'GOOGLE_CLIENT_SECRET', None)
        redirect_uri = getattr(settings, 'GOOGLE_REDIRECT_URI', None)
        
        if not all([client_id, client_secret, redirect_uri]):
            return Response(
                {'error': 'Google OAuth not configured'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        token_url = "https://oauth2.googleapis.com/token"
        
        token_data = {
            'client_id': client_id,
            'client_secret': client_secret,
            'code': code,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code',
        }
        
        try:
            token_response = requests.post(token_url, data=token_data)
            token_response.raise_for_status()
            tokens = token_response.json()
            
            access_token = tokens.get('access_token')
            id_token = tokens.get('id_token')
            
            if not access_token:
                return Response(
                    {'error': 'Failed to obtain access token'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get user info from Google
            userinfo_response = requests.get(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                headers={'Authorization': f'Bearer {access_token}'}
            )
            userinfo_response.raise_for_status()
            user_info = userinfo_response.json()
            
            # Extract user information
            email = user_info.get('email')
            first_name = user_info.get('given_name', '')
            last_name = user_info.get('family_name', '')
            picture = user_info.get('picture')
            verified_email = user_info.get('verified_email', False)
            
            if not email:
                return Response(
                    {'error': 'Email not provided by Google'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if user exists by email (for existing accounts)
            try:
                user = User.objects.get(email=email)
                # User exists - update info if needed
                if not user.first_name and first_name:
                    user.first_name = first_name
                if not user.last_name and last_name:
                    user.last_name = last_name
                if verified_email:
                    user.email_verified = True
                user.save()
                created = False
            except User.DoesNotExist:
                # User doesn't exist - create new user
                base_username = email.split('@')[0]
                username = base_username + '_google'
                counter = 1
                
                # Ensure unique username
                while User.objects.filter(username=username).exists():
                    username = f"{base_username}_google_{counter}"
                    counter += 1
                
                user = User.objects.create(
                    email=email,
                    username=username,
                    first_name=first_name,
                    last_name=last_name,
                    email_verified=verified_email,
                    is_active=True,
                )
                created = True
            
            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)
            
            # Return tokens and redirect URL
            # Determine frontend URL from request or settings
            request_host = request.get_host()
            if 'bsm.novacoredeveloper.com' in request_host:
                frontend_url = 'https://bsm.novacoredeveloper.com'
            else:
                frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
            
            # URL encode tokens to handle special characters
            access_token_str = str(refresh.access_token)
            refresh_token_str = str(refresh)
            redirect_url = f"{frontend_url}/login?oauth_success=true&access_token={urllib.parse.quote(access_token_str)}&refresh_token={urllib.parse.quote(refresh_token_str)}"
            
            return redirect(redirect_url)
            
        except requests.exceptions.RequestException as e:
            return Response(
                {'error': f'Failed to authenticate with Google: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
