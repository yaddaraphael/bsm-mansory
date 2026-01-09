'use client';

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Helper function to get allowed roles for invitation based on user's role
const getAllowedRoles = (userRole: string | undefined): string[] => {
  if (!userRole) return [];
  
  // Root superadmin can invite anyone
  if (userRole === 'ROOT_SUPERADMIN') {
    return [
      'LABORER',
      'MASON',
      'OPERATOR',
      'BRICKLAYER',
      'PLASTER',
      'FOREMAN',
      'SUPERINTENDENT',
      'PROJECT_MANAGER',
      'GENERAL_CONTRACTOR',
      'HR',
      'FINANCE',
      'AUDITOR',
      'ADMIN',
      'SYSTEM_ADMIN',
      'SUPERADMIN',
      'ROOT_SUPERADMIN',
    ];
  }
  
  // Other roles (SUPERADMIN, ADMIN, HR) can invite lower roles
  // They cannot invite ROOT_SUPERADMIN, SUPERADMIN, or SYSTEM_ADMIN
  if (['SUPERADMIN', 'ADMIN', 'HR'].includes(userRole)) {
    return [
      'LABORER',
      'MASON',
      'OPERATOR',
      'BRICKLAYER',
      'PLASTER',
      'FOREMAN',
      'SUPERINTENDENT',
      'PROJECT_MANAGER',
      'GENERAL_CONTRACTOR',
      'HR',
      'FINANCE',
      'AUDITOR',
      'ADMIN',
    ];
  }
  
  return [];
};

const roleLabels: Record<string, string> = {
  'LABORER': 'Laborer',
  'MASON': 'Mason',
  'OPERATOR': 'Operator',
  'BRICKLAYER': 'Bricklayer',
  'PLASTER': 'Plaster',
  'FOREMAN': 'Foreman',
  'SUPERINTENDENT': 'Superintendent',
  'PROJECT_MANAGER': 'Project Manager',
  'GENERAL_CONTRACTOR': 'General Contractor',
  'HR': 'HR',
  'FINANCE': 'Finance',
  'AUDITOR': 'Auditor',
  'ADMIN': 'Admin',
  'SYSTEM_ADMIN': 'System Admin',
  'SUPERADMIN': 'Superadmin',
  'ROOT_SUPERADMIN': 'Root Superadmin',
};

export default function InviteUserPage() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const allowedRoles = getAllowedRoles(currentUser?.role);
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    city: '',
    role: allowedRoles[0] || 'LABORER',
  });
  
  const [generatedEmployeeNumber, setGeneratedEmployeeNumber] = useState<string>('');
  const [invitedEmail, setInvitedEmail] = useState<string>('');

  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const response = await api.post('/auth/invite/', formData);
      setGeneratedEmployeeNumber(response.data?.employee_number || '');
      setInvitedEmail(formData.email);
      
      // Check if email was sent successfully
      if (response.data?.email_error || response.data?.email_sent === false) {
        // Account was created but email failed - show warning but allow user to continue
        const errorMsg = response.data?.email_error || response.data?.message || 'Invitation email could not be sent.';
        setError(`⚠️ User account created successfully, but email failed: ${errorMsg}. You can resend the email from the Invited Users page.`);
        setSuccess(true); // Still show success since account was created
        setGeneratedEmployeeNumber(response.data?.employee_number || '');
        setInvitedEmail(formData.email);
        // Reset form
        setFormData({
          email: '',
          first_name: '',
          last_name: '',
          phone_number: '',
          city: '',
          role: 'LABORER',
        });
        // Don't auto-redirect, let user see the message
      } else {
        setSuccess(true);
        setError(''); // Clear any previous errors
        // Reset form
        setFormData({
          email: '',
          first_name: '',
          last_name: '',
          phone_number: '',
          city: '',
          role: 'LABORER',
        });
        // Redirect after 3 seconds if email was sent successfully
        setTimeout(() => {
          router.push('/users');
        }, 3000);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string; message?: string } } };
      setError(error.response?.data?.detail || error.response?.data?.message || 'Failed to invite user');
    } finally {
      setLoading(false);
    }
  };

  const canInvite = currentUser?.role === 'ADMIN' || 
                    currentUser?.role === 'HR' || 
                    currentUser?.role === 'SUPERADMIN' || 
                    currentUser?.role === 'ROOT_SUPERADMIN';

  if (!canInvite) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 sidebar-content">
          <Header />
          <main className="flex-1 p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <Card>
                <p className="text-center text-red-600 py-8">
                  You don&apos;t have permission to invite users
                </p>
              </Card>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['ADMIN', 'HR', 'SUPERADMIN', 'ROOT_SUPERADMIN']}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 sidebar-content">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 md:mb-6">Invite User</h1>

            <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
              <Card>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="First Name"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      required
                    />
                    <Input
                      label="Last Name"
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      required
                    />
                  </div>

                  <Input
                    label="Email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="user@example.com"
                    required
                    helpText="Username will be auto-generated from email"
                  />

                  {generatedEmployeeNumber && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm font-medium text-blue-900">Employee Number (Auto-generated)</p>
                      <p className="text-lg font-bold text-blue-700 mt-1">{generatedEmployeeNumber}</p>
                    </div>
                  )}
                  
                  {!generatedEmployeeNumber && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <p className="text-sm text-gray-600">
                        Employee number will be auto-generated from the current date (YYYYMMDD + sequence)
                      </p>
                    </div>
                  )}

                  <Input
                    label="Phone Number"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  />

                  <Input
                    label="City"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="input-field"
                      required
                    >
                      {allowedRoles.length === 0 ? (
                        <option value="">No roles available</option>
                      ) : (
                        allowedRoles.map((role) => (
                          <option key={role} value={role}>
                            {roleLabels[role] || role}
                          </option>
                        ))
                      )}
                    </select>
                    {allowedRoles.length === 0 && (
                      <p className="text-sm text-red-600 mt-1">
                        You do not have permission to invite users.
                      </p>
                    )}
                  </div>



                  {success && !error && (
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                      <p className="font-medium">User invited successfully!</p>
                      <p className="text-sm mt-1">
                        An activation email has been sent to {invitedEmail}. The user will need to set their password when they activate their account.
                      </p>
                      {generatedEmployeeNumber && (
                        <p className="text-sm mt-1 font-semibold">
                          Employee Number: {generatedEmployeeNumber}
                        </p>
                      )}
                    </div>
                  )}

                  {success && error && (
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
                      <p className="font-medium">⚠️ User account created successfully!</p>
                      <p className="text-sm mt-1">{error}</p>
                      {generatedEmployeeNumber && (
                        <p className="text-sm mt-2 font-semibold">
                          Employee Number: {generatedEmployeeNumber}
                        </p>
                      )}
                      <p className="text-sm mt-2">
                        You can resend the invitation email from the <Link href="/users/invitations" className="underline font-medium">Invited Users</Link> page.
                      </p>
                    </div>
                  )}

                  {!success && error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                      {error}
                    </div>
                  )}

                  <div className="flex space-x-4">
                    <Button type="submit" isLoading={loading} className="flex-1">
                      Invite User
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => router.back()}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            </form>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

