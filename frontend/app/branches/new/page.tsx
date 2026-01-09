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

export default function NewBranchPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    notes: '',
    status: 'ACTIVE',
  });

  const canCreateBranch = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER'].includes(user?.role || '');

  if (!canCreateBranch) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50">
              <Card>
                <div className="text-center py-8">
                  <p className="text-red-600">You don&apos;t have permission to create branches.</p>
                </div>
              </Card>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const payload = {
        ...formData,
      };
      
      await api.post('/branches/', payload);
      setSuccess(true);
      setTimeout(() => {
        router.push('/branches');
      }, 1500);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string; code?: string[]; name?: string[] } } };
      setError(
        error.response?.data?.detail || 
        error.response?.data?.code?.[0] || 
        error.response?.data?.name?.[0] ||
        'Failed to create branch'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 sidebar-content">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="mb-4 md:mb-6">
              <button
                onClick={() => router.back()}
                className="text-sm md:text-base text-gray-600 hover:text-primary mb-2"
              >
                ← Back to Branches
              </button>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Add New Branch</h1>
            </div>

            <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
              <Card>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Branch Name *"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Kansas City"
                      required
                    />
                    <Input
                      label="Branch Code *"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      placeholder="e.g., KC"
                      required
                      helpText="Short code for job numbering (min 2 characters)"
                      maxLength={10}
                    />
                  </div>

                  <Input
                    label="Address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Full address"
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status *</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="input-field"
                      required
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="input-field"
                      rows={4}
                      placeholder="Additional notes about this branch..."
                    />
                  </div>

                  {success && (
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                      <p className="font-medium">Branch created successfully!</p>
                      <p className="text-sm mt-1">Redirecting to branches list...</p>
                    </div>
                  )}

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                      {error}
                    </div>
                  )}

                  <div className="flex space-x-4">
                    <Button type="submit" isLoading={loading} className="flex-1">
                      Create Branch
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

