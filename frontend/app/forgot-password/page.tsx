'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { BuildingOfficeIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await authService.forgotPassword(email);
      setSuccess(true);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(
        error.response?.data?.detail || 
        error.message || 
        'Failed to send reset email. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

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
          <p className="mt-1 text-sm text-gray-500">Reset your password</p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="bg-green-50 border-l-4 border-green-400 text-green-700 px-4 py-3 rounded">
              <p className="text-sm font-medium">
                If an account exists with this email, a password reset link has been sent.
              </p>
            </div>
            <div className="flex space-x-4">
              <Button
                onClick={() => router.push('/login')}
                className="flex-1"
              >
                Back to Login
              </Button>
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

            <div>
              <Input
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                autoFocus
              />
              <p className="mt-2 text-sm text-gray-500">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              isLoading={isLoading}
              disabled={!email}
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
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

