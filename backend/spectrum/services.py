"""
Service layer for Trimble AppExchange Spectrum API integration.
This module handles communication with the Trimble Spectrum API.
"""
import requests
import logging
from django.conf import settings
from typing import Dict, List, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class SpectrumAPIClient:
    """Client for interacting with Trimble Spectrum API via AppExchange."""
    
    def __init__(self):
        self.base_url = getattr(settings, 'SPECTRUM_API_BASE_URL', 'https://api.spectrum.trimble.com')
        self.api_key = getattr(settings, 'SPECTRUM_API_KEY', None)
        self.api_secret = getattr(settings, 'SPECTRUM_API_SECRET', None)
        self.timeout = getattr(settings, 'SPECTRUM_API_TIMEOUT', 30)
        
        if not self.api_key or not self.api_secret:
            logger.warning("Spectrum API credentials not configured. Set SPECTRUM_API_KEY and SPECTRUM_API_SECRET in settings.")
    
    def _get_headers(self) -> Dict[str, str]:
        """Get authentication headers for API requests."""
        return {
            'Authorization': f'Bearer {self._get_access_token()}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
    
    def _get_access_token(self) -> str:
        """
        Get OAuth access token from Trimble AppExchange.
        This should implement OAuth 2.0 flow for AppExchange authentication.
        For now, returns API key as token (replace with proper OAuth implementation).
        """
        # TODO: Implement proper OAuth 2.0 flow
        # This is a placeholder - you'll need to implement the actual OAuth flow
        # based on Trimble AppExchange documentation
        if not self.api_key:
            return ''
        
        # In production, this should:
        # 1. Check if we have a valid cached token
        # 2. If expired, request a new token using OAuth 2.0
        # 3. Cache and return the token
        return self.api_key
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict[str, Any]]:
        """Make HTTP request to Spectrum API."""
        if not self.api_key or not self.api_secret:
            logger.error("Spectrum API credentials not configured")
            return None
        
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        headers = self._get_headers()
        
        try:
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                timeout=self.timeout,
                **kwargs
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Spectrum API request failed: {e}")
            return None
    
    def get_employees(self, limit: int = 100, offset: int = 0) -> Optional[Dict[str, Any]]:
        """
        Fetch employees from Spectrum API.
        
        Args:
            limit: Maximum number of records to return
            offset: Number of records to skip
            
        Returns:
            Dictionary with 'results' list and pagination info, or None on error
        """
        endpoint = f"employees?limit={limit}&offset={offset}"
        return self._make_request('GET', endpoint)
    
    def get_projects(self, limit: int = 100, offset: int = 0) -> Optional[Dict[str, Any]]:
        """
        Fetch projects from Spectrum API.
        
        Args:
            limit: Maximum number of records to return
            offset: Number of records to skip
            
        Returns:
            Dictionary with 'results' list and pagination info, or None on error
        """
        endpoint = f"projects?limit={limit}&offset={offset}"
        return self._make_request('GET', endpoint)
    
    def get_reports(self, limit: int = 100, offset: int = 0, report_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Fetch reports from Spectrum API.
        
        Args:
            limit: Maximum number of records to return
            offset: Number of records to skip
            report_type: Optional filter by report type
            
        Returns:
            Dictionary with 'results' list and pagination info, or None on error
        """
        endpoint = f"reports?limit={limit}&offset={offset}"
        if report_type:
            endpoint += f"&type={report_type}"
        return self._make_request('GET', endpoint)


class SpectrumSyncService:
    """Service for syncing data from Spectrum API to local database."""
    
    def __init__(self):
        self.api_client = SpectrumAPIClient()
    
    def sync_employees(self) -> Dict[str, Any]:
        """
        Sync employees from Spectrum API to local database.
        
        Returns:
            Dictionary with sync results (success count, error count, etc.)
        """
        from .models import SpectrumEmployee
        
        results = {
            'success': 0,
            'updated': 0,
            'created': 0,
            'errors': 0,
            'error_messages': []
        }
        
        try:
            # Fetch employees from API
            api_data = self.api_client.get_employees(limit=1000)
            
            if not api_data:
                results['error_messages'].append("Failed to fetch employees from Spectrum API")
                results['errors'] = 1
                return results
            
            employees = api_data.get('results', api_data if isinstance(api_data, list) else [])
            
            for emp_data in employees:
                try:
                    spectrum_id = str(emp_data.get('id', emp_data.get('spectrum_id', '')))
                    if not spectrum_id:
                        continue
                    
                    # Map API data to model fields
                    defaults = {
                        'employee_id': emp_data.get('employee_id', emp_data.get('employee_number', '')),
                        'first_name': emp_data.get('first_name', emp_data.get('firstName', '')),
                        'last_name': emp_data.get('last_name', emp_data.get('lastName', '')),
                        'email': emp_data.get('email', ''),
                        'phone': emp_data.get('phone', emp_data.get('phone_number', '')),
                        'role': emp_data.get('role', emp_data.get('job_title', '')),
                        'status': emp_data.get('status', 'ACTIVE'),
                        'raw_data': emp_data,
                    }
                    
                    employee, created = SpectrumEmployee.objects.update_or_create(
                        spectrum_id=spectrum_id,
                        defaults=defaults
                    )
                    
                    if created:
                        results['created'] += 1
                    else:
                        results['updated'] += 1
                    results['success'] += 1
                    
                except Exception as e:
                    logger.error(f"Error syncing employee: {e}")
                    results['errors'] += 1
                    results['error_messages'].append(f"Employee sync error: {str(e)}")
            
        except Exception as e:
            logger.error(f"Error in sync_employees: {e}")
            results['errors'] += 1
            results['error_messages'].append(f"Sync error: {str(e)}")
        
        return results
    
    def sync_projects(self) -> Dict[str, Any]:
        """
        Sync projects from Spectrum API to local database.
        
        Returns:
            Dictionary with sync results
        """
        from .models import SpectrumProject
        
        results = {
            'success': 0,
            'updated': 0,
            'created': 0,
            'errors': 0,
            'error_messages': []
        }
        
        try:
            api_data = self.api_client.get_projects(limit=1000)
            
            if not api_data:
                results['error_messages'].append("Failed to fetch projects from Spectrum API")
                results['errors'] = 1
                return results
            
            projects = api_data.get('results', api_data if isinstance(api_data, list) else [])
            
            for proj_data in projects:
                try:
                    spectrum_id = str(proj_data.get('id', proj_data.get('spectrum_id', '')))
                    if not spectrum_id:
                        continue
                    
                    # Parse dates if provided
                    start_date = proj_data.get('start_date', proj_data.get('startDate', None))
                    end_date = proj_data.get('end_date', proj_data.get('endDate', None))
                    
                    defaults = {
                        'project_id': proj_data.get('project_id', proj_data.get('projectId', '')),
                        'job_number': proj_data.get('job_number', proj_data.get('jobNumber', '')),
                        'name': proj_data.get('name', proj_data.get('project_name', '')),
                        'client': proj_data.get('client', proj_data.get('client_name', '')),
                        'location': proj_data.get('location', proj_data.get('project_location', '')),
                        'status': proj_data.get('status', 'ACTIVE'),
                        'start_date': self._parse_date(start_date),
                        'end_date': self._parse_date(end_date),
                        'raw_data': proj_data,
                    }
                    
                    project, created = SpectrumProject.objects.update_or_create(
                        spectrum_id=spectrum_id,
                        defaults=defaults
                    )
                    
                    if created:
                        results['created'] += 1
                    else:
                        results['updated'] += 1
                    results['success'] += 1
                    
                except Exception as e:
                    logger.error(f"Error syncing project: {e}")
                    results['errors'] += 1
                    results['error_messages'].append(f"Project sync error: {str(e)}")
            
        except Exception as e:
            logger.error(f"Error in sync_projects: {e}")
            results['errors'] += 1
            results['error_messages'].append(f"Sync error: {str(e)}")
        
        return results
    
    def sync_reports(self) -> Dict[str, Any]:
        """
        Sync reports from Spectrum API to local database.
        
        Returns:
            Dictionary with sync results
        """
        from .models import SpectrumReport
        
        results = {
            'success': 0,
            'updated': 0,
            'created': 0,
            'errors': 0,
            'error_messages': []
        }
        
        try:
            api_data = self.api_client.get_reports(limit=1000)
            
            if not api_data:
                results['error_messages'].append("Failed to fetch reports from Spectrum API")
                results['errors'] = 1
                return results
            
            reports = api_data.get('results', api_data if isinstance(api_data, list) else [])
            
            for rep_data in reports:
                try:
                    spectrum_id = str(rep_data.get('id', rep_data.get('spectrum_id', '')))
                    if not spectrum_id:
                        continue
                    
                    created_date = rep_data.get('created_date', rep_data.get('createdDate', rep_data.get('date', None)))
                    
                    defaults = {
                        'report_id': rep_data.get('report_id', rep_data.get('reportId', '')),
                        'title': rep_data.get('title', rep_data.get('name', '')),
                        'report_type': rep_data.get('report_type', rep_data.get('type', 'OTHER')),
                        'project': rep_data.get('project', rep_data.get('project_name', '')),
                        'project_id': rep_data.get('project_id', rep_data.get('projectId', '')),
                        'status': rep_data.get('status', 'ACTIVE'),
                        'created_date': self._parse_datetime(created_date),
                        'raw_data': rep_data,
                    }
                    
                    report, created = SpectrumReport.objects.update_or_create(
                        spectrum_id=spectrum_id,
                        defaults=defaults
                    )
                    
                    if created:
                        results['created'] += 1
                    else:
                        results['updated'] += 1
                    results['success'] += 1
                    
                except Exception as e:
                    logger.error(f"Error syncing report: {e}")
                    results['errors'] += 1
                    results['error_messages'].append(f"Report sync error: {str(e)}")
            
        except Exception as e:
            logger.error(f"Error in sync_reports: {e}")
            results['errors'] += 1
            results['error_messages'].append(f"Sync error: {str(e)}")
        
        return results
    
    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:
        """Parse date string to date object."""
        if not date_str:
            return None
        try:
            if isinstance(date_str, str):
                # Try common date formats
                for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%m/%d/%Y', '%d/%m/%Y']:
                    try:
                        return datetime.strptime(date_str, fmt).date()
                    except ValueError:
                        continue
            return None
        except Exception:
            return None
    
    def _parse_datetime(self, datetime_str: Optional[str]) -> Optional[datetime]:
        """Parse datetime string to datetime object."""
        if not datetime_str:
            return None
        try:
            if isinstance(datetime_str, str):
                # Try common datetime formats
                for fmt in ['%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%SZ', '%Y-%m-%d %H:%M:%S%z']:
                    try:
                        return datetime.strptime(datetime_str, fmt)
                    except ValueError:
                        continue
            return None
        except Exception:
            return None
