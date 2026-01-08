'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { BuildingOfficeIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import api from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, authLoading, router]);

  const getRoleBasedRedirect = (userRole: string): string => {
    // Redirect based on user role - all roles go to dashboard now
    const roleRedirects: Record<string, string> = {
      'ROOT_SUPERADMIN': '/dashboard',
      'SUPERADMIN': '/dashboard',
      'ADMIN': '/dashboard',
      'SYSTEM_ADMIN': '/dashboard',
      'PROJECT_MANAGER': '/dashboard',
      'SUPERINTENDENT': '/dashboard',
      'FOREMAN': '/dashboard',
      'LABORER': '/dashboard',
      'MASON': '/dashboard',
      'OPERATOR': '/dashboard',
      'BRICKLAYER': '/dashboard',
      'PLASTER': '/dashboard',
      'WORKER': '/dashboard', // Legacy role
      'HR': '/dashboard',
      'FINANCE': '/dashboard',
      'AUDITOR': '/dashboard',
      'GENERAL_CONTRACTOR': '/dashboard',
    };
    return roleRedirects[userRole] || '/dashboard';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Login first
      await login(credentials);
      
      // Wait a moment for token to be stored, then get profile
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Get user profile to determine role-based redirect
      try {
        const profileResponse = await api.get('/auth/profile/');
        const profile = profileResponse.data;
        const redirectPath = profile?.role 
          ? getRoleBasedRedirect(profile.role) 
          : '/dashboard';
        router.push(redirectPath);
      } catch (profileError) {
        // If profile fetch fails, just go to dashboard
        console.error('Profile fetch error:', profileError);
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(
        error.response?.data?.detail || 
        error.message || 
        'Login failed. Please check your credentials.'
      );
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-xl">
        {/* Logo and Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-primary rounded-full p-3">
              <BuildingOfficeIcon className="h-10 w-10 text-white" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-gray-900">BSM System</h2>
          <p className="mt-2 text-sm text-gray-600">Building Systems Management</p>
          <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
        </div>

        {/* Login Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded">
              <div className="flex">
                <div className="flex-shrink-0">
                  <LockClosedIcon className="h-5 w-5 text-red-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <Input
              label="Username or Email"
              type="text"
              value={credentials.username}
              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
              placeholder="Enter your username or email"
              required
              autoFocus
            />
            <Input
              label="Password"
              type="password"
              value={credentials.password}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
              placeholder="Enter your password"
              required
              showPasswordToggle
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                Remember me
              </label>
            </div>

            <div className="text-sm">
              <Link href="/forgot-password" className="font-medium text-primary hover:text-primary-hover">
                Forgot password?
              </Link>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            isLoading={isLoading}
            disabled={!credentials.username || !credentials.password}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Need help? Contact your system administrator
          </p>
        </div>

        {/* Back to Home */}
        <div className="mt-4 text-center">
          <Link 
            href="/" 
            className="text-sm text-gray-600 hover:text-primary transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

