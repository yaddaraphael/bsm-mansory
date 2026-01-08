'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authService } from '@/lib/auth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { BuildingOfficeIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    new_password: '',
    confirm_password: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uid, setUid] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    const uidParam = searchParams.get('uid');
    const tokenParam = searchParams.get('token');
    
    if (!uidParam || !tokenParam) {
      setError('Invalid reset link. Please request a new password reset.');
      return;
    }
    
    setUid(uidParam);
    setToken(tokenParam);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.new_password !== formData.confirm_password) {
      setError('Passwords do not match');
      return;
    }

    if (formData.new_password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    try {
      await authService.resetPassword(uid, token, formData.new_password);
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(
        error.response?.data?.detail || 
        error.message || 
        'Failed to reset password. The link may have expired.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!uid || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-xl">
          <div className="text-center">
            <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded">
              <p className="text-sm font-medium">{error || 'Invalid reset link'}</p>
            </div>
            <div className="mt-4">
              <Link href="/forgot-password" className="text-primary hover:underline">
                Request a new password reset
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
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
          <p className="mt-1 text-sm text-gray-500">Set your new password</p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="bg-green-50 border-l-4 border-green-400 text-green-700 px-4 py-3 rounded">
              <p className="text-sm font-medium">
                Password reset successfully! Redirecting to login...
              </p>
            </div>
          </div>
        ) : (
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
                label="New Password"
                type="password"
                value={formData.new_password}
                onChange={(e) => setFormData({ ...formData, new_password: e.target.value })}
                placeholder="Enter your new password"
                required
                showPasswordToggle
                helpText="Must be at least 8 characters"
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={formData.confirm_password}
                onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                placeholder="Confirm your new password"
                required
                showPasswordToggle
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              isLoading={isLoading}
              disabled={!formData.new_password || !formData.confirm_password}
            >
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </Button>

            <div className="text-center">
              <Link 
                href="/login" 
                className="text-sm text-gray-600 hover:text-primary transition-colors"
              >
                ← Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <LoadingSpinner />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
