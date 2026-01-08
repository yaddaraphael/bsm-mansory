'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Input from '@/components/ui/Input';
import { useBranches } from '@/hooks/useBranches';
import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon, MapPinIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';
import api from '@/lib/api';

export default function BranchesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { branches, loading, error, refetch } = useBranches({ 
    search: debouncedSearch, 
    status: statusFilter,
  });

  const handleDeactivate = async (branchId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to deactivate this branch?')) return;
    
    setActionLoading(branchId);
    try {
      await api.post(`/branches/${branchId}/deactivate/`);
      await refetch();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      alert(error.response?.data?.detail || 'Failed to deactivate branch');
    } finally {
      setActionLoading(null);
    }
  };

  const handleActivate = async (branchId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading(branchId);
    try {
      await api.post(`/branches/${branchId}/activate/`);
      await refetch();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      alert(error.response?.data?.detail || 'Failed to activate branch');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (branchId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this branch? This action cannot be undone.')) return;
    
    setActionLoading(branchId);
    try {
      await api.delete(`/branches/${branchId}/`);
      await refetch();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string; requires_transfer?: boolean; project_count?: number; employee_count?: number; equipment_count?: number } } };
      const errorData = error.response?.data;
      if (errorData?.requires_transfer) {
        if (confirm(
          `This branch has ${errorData.project_count} projects, ${errorData.employee_count} employees, and ${errorData.equipment_count} equipment. ` +
          'Would you like to transfer them to another branch before deleting?'
        )) {
          setShowTransferModal(branchId);
        }
      } else {
        alert(errorData?.detail || 'Failed to delete branch');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleTransfer = async (sourceBranchId: number) => {
    if (!transferTarget) {
      alert('Please select a target branch');
      return;
    }
    
    setActionLoading(sourceBranchId);
    try {
      const response = await api.post(`/branches/${sourceBranchId}/transfer/`, {
        target_branch_id: transferTarget,
      });
      alert(`Transfer completed: ${response.data.transferred.projects} projects, ${response.data.transferred.employees} employees, ${response.data.transferred.equipment} equipment transferred.`);
      setShowTransferModal(null);
      setTransferTarget('');
      await refetch();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      alert(error.response?.data?.detail || 'Failed to transfer branch data');
    } finally {
      setActionLoading(null);
    }
  };

  const canCreateBranch = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER'].includes(user?.role || '');
  const canManageBranches = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN'].includes(user?.role || '');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [showTransferModal, setShowTransferModal] = useState<number | null>(null);
  const [transferTarget, setTransferTarget] = useState<string>('');

  if (loading && branches.length === 0) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50">
              <LoadingSpinner />
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">Branches & Locations</h1>
                {canCreateBranch && (
                  <Button
                    onClick={() => router.push('/branches/new')}
                    className="w-full sm:w-auto flex items-center"
                  >
                    <PlusIcon className="h-5 w-5 mr-2" />
                    <span>Add Branch</span>
                  </Button>
                )}
              </div>

            {error && (
              <Card className="mb-6">
                <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded">
                  <p className="text-sm font-medium">{error}</p>
                </div>
              </Card>
            )}

            <Card className="mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search branches..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input-field"
                >
                  <option value="">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
            </Card>

            {loading && branches.length > 0 ? (
              <div className="text-center py-8">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {branches.map((branch) => (
                  <Card
                    key={branch.id}
                    className="cursor-pointer hover:shadow-lg transition-shadow relative"
                    onClick={() => router.push(`/branches/${branch.id}`)}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <MapPinIcon className="h-6 w-6 text-primary flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 truncate">{branch.name}</h3>
                          <p className="text-sm text-gray-500">Code: {branch.code}</p>
                        </div>
                      </div>
                      <StatusBadge status={branch.status} size="sm" />
                    </div>
                    <div className="space-y-2 text-sm">
                      {branch.address && (
                        <div>
                          <span className="text-gray-500">Address:</span>
                          <p className="text-gray-900 mt-1 line-clamp-2">{branch.address}</p>
                        </div>
                      )}
                      {branch.notes && (
                        <div>
                          <span className="text-gray-500">Notes:</span>
                          <p className="text-gray-900 mt-1 line-clamp-2">{branch.notes}</p>
                        </div>
                      )}
                    </div>
                    
                    {canManageBranches && (
                      <div className="mt-4 pt-4 border-t flex items-center justify-end space-x-2" onClick={(e) => e.stopPropagation()}>
                        {branch.status === 'ACTIVE' ? (
                          <button
                            onClick={(e) => handleDeactivate(branch.id, e)}
                            disabled={actionLoading === branch.id}
                            className="text-yellow-600 hover:text-yellow-800 text-sm disabled:opacity-50"
                            title="Deactivate"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={(e) => handleActivate(branch.id, e)}
                            disabled={actionLoading === branch.id}
                            className="text-green-600 hover:text-green-800 text-sm disabled:opacity-50"
                            title="Activate"
                          >
                            Activate
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDelete(branch.id, e)}
                          disabled={actionLoading === branch.id}
                          className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                          title="Delete"
                        >
                          {actionLoading === branch.id ? '...' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}

            {/* Transfer Modal */}
            {showTransferModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                  <h3 className="text-lg font-semibold mb-4">Transfer Branch Data</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Select a target branch to transfer all projects, employees, and equipment from this branch.
                  </p>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Target Branch
                    </label>
                    <select
                      value={transferTarget}
                      onChange={(e) => setTransferTarget(e.target.value)}
                      className="input-field w-full"
                    >
                      <option value="">Select a branch...</option>
                      {branches
                        .filter((b) => b.id !== showTransferModal && b.status === 'ACTIVE')
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.code})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowTransferModal(null);
                        setTransferTarget('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handleTransfer(showTransferModal)}
                      isLoading={actionLoading === showTransferModal}
                      disabled={!transferTarget}
                    >
                      Transfer & Delete
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {!loading && branches.length === 0 && (
              <Card>
                <div className="text-center py-8">
                  <MapPinIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No branches found</p>
                  {canCreateBranch && (
                    <Button
                      onClick={() => router.push('/branches/new')}
                      className="mt-4"
                    >
                      Add First Branch
                    </Button>
                  )}
                </div>
              </Card>
            )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

