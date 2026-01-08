'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authService } from '@/lib/auth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { BuildingOfficeIcon, LockClosedIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface PasswordStrength {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

function ActivateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    password: '',
    password_confirm: '',
  });
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uid, setUid] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    const uidParam = searchParams.get('uid');
    const tokenParam = searchParams.get('token');
    
    if (!uidParam || !tokenParam) {
      setError('Invalid activation link. Please contact your administrator.');
      return;
    }
    
    setUid(uidParam);
    setToken(tokenParam);
  }, [searchParams]);

  // Password strength validation
  const getPasswordStrength = (password: string): PasswordStrength => {
    return {
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };
  };

  const passwordStrength = getPasswordStrength(formData.password);
  const isPasswordStrong = Object.values(passwordStrength).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setErrors([]);

    // Client-side validation
    if (formData.password !== formData.password_confirm) {
      setError('Passwords do not match');
      return;
    }

    if (!isPasswordStrong) {
      setError('Password does not meet all requirements');
      return;
    }

    setIsLoading(true);
    try {
      await authService.activateAccount(uid, token, formData.password, formData.password_confirm);
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { errors?: string[]; detail?: string } }; message?: string };
      const errorData = error.response?.data;
      if (errorData?.errors && Array.isArray(errorData.errors)) {
        setErrors(errorData.errors);
        setError('Password does not meet requirements');
      } else {
        setError(
          errorData?.detail || 
          error.message || 
          'Failed to activate account. The link may have expired.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!uid || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
        <div className="max-w-md w-full space-y-8 p-6 sm:p-8 bg-white rounded-lg shadow-xl">
          <div className="text-center">
            <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded">
              <p className="text-sm font-medium">{error || 'Invalid activation link'}</p>
            </div>
            <div className="mt-4">
              <Link href="/login" className="text-primary hover:underline text-sm">
                Go to Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-8">
      <div className="max-w-md w-full space-y-6 sm:space-y-8 p-6 sm:p-8 bg-white rounded-lg shadow-xl">
        {/* Logo and Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-primary rounded-full p-3">
              <BuildingOfficeIcon className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">BSM System</h2>
          <p className="mt-2 text-xs sm:text-sm text-gray-600">Building Systems Management</p>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">Activate your account</p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="bg-green-50 border-l-4 border-green-400 text-green-700 px-4 py-3 rounded">
              <div className="flex items-center">
                <CheckCircleIcon className="h-5 w-5 mr-2" />
                <p className="text-sm font-medium">
                  Account activated successfully! Redirecting to login...
                </p>
              </div>
            </div>
          </div>
        ) : (
          <form className="mt-6 sm:mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <LockClosedIcon className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium">{error}</p>
                    {errors.length > 0 && (
                      <ul className="mt-2 list-disc list-inside text-xs">
                        {errors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Input
                  label="Password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter your password"
                  required
                  showPasswordToggle
                  error={formData.password && !isPasswordStrong ? 'Password does not meet all requirements' : undefined}
                />
                
                {/* Password Strength Indicator */}
                {formData.password && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-md">
                    <p className="text-xs font-medium text-gray-700 mb-2">Password Requirements:</p>
                    <ul className="space-y-1 text-xs">
                      <li className={`flex items-center ${passwordStrength.minLength ? 'text-green-600' : 'text-gray-500'}`}>
                        <span className={`mr-2 ${passwordStrength.minLength ? 'text-green-500' : 'text-gray-400'}`}>
                          {passwordStrength.minLength ? '✓' : '○'}
                        </span>
                        At least 8 characters
                      </li>
                      <li className={`flex items-center ${passwordStrength.hasUppercase ? 'text-green-600' : 'text-gray-500'}`}>
                        <span className={`mr-2 ${passwordStrength.hasUppercase ? 'text-green-500' : 'text-gray-400'}`}>
                          {passwordStrength.hasUppercase ? '✓' : '○'}
                        </span>
                        One uppercase letter
                      </li>
                      <li className={`flex items-center ${passwordStrength.hasLowercase ? 'text-green-600' : 'text-gray-500'}`}>
                        <span className={`mr-2 ${passwordStrength.hasLowercase ? 'text-green-500' : 'text-gray-400'}`}>
                          {passwordStrength.hasLowercase ? '✓' : '○'}
                        </span>
                        One lowercase letter
                      </li>
                      <li className={`flex items-center ${passwordStrength.hasNumber ? 'text-green-600' : 'text-gray-500'}`}>
                        <span className={`mr-2 ${passwordStrength.hasNumber ? 'text-green-500' : 'text-gray-400'}`}>
                          {passwordStrength.hasNumber ? '✓' : '○'}
                        </span>
                        One number
                      </li>
                      <li className={`flex items-center ${passwordStrength.hasSpecialChar ? 'text-green-600' : 'text-gray-500'}`}>
                        <span className={`mr-2 ${passwordStrength.hasSpecialChar ? 'text-green-500' : 'text-gray-400'}`}>
                          {passwordStrength.hasSpecialChar ? '✓' : '○'}
                        </span>
                        One special character (!@#$%^&*...)
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              <Input
                label="Confirm Password"
                type="password"
                value={formData.password_confirm}
                onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })}
                placeholder="Confirm your password"
                required
                showPasswordToggle
                error={formData.password_confirm && formData.password !== formData.password_confirm ? 'Passwords do not match' : undefined}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              isLoading={isLoading}
              disabled={!formData.password || !formData.password_confirm || !isPasswordStrong}
            >
              {isLoading ? 'Activating...' : 'Activate Account'}
            </Button>

            <div className="text-center">
              <Link 
                href="/login" 
                className="text-xs sm:text-sm text-gray-600 hover:text-primary transition-colors"
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

export default function ActivatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <LoadingSpinner />
      </div>
    }>
      <ActivateForm />
    </Suspense>
  );
}
