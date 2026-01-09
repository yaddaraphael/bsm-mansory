'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { MagnifyingGlassIcon, UserPlusIcon, UserGroupIcon, CheckCircleIcon, XCircleIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import Modal from '@/components/ui/Modal';

function UsersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: currentUser } = useAuth();
  interface User {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
    status: string;
    employee_id?: string;
    [key: string]: unknown;
  }

  interface UserStats {
    total: number;
    active: number;
    inactive: number;
    byRole?: Record<string, number>;
    by_role?: Record<string, number>;
  }

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [modalMessage, setModalMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search to prevent flickering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Handle role and status filters from URL query params - sync with sidebar
  useEffect(() => {
    const roleParam = searchParams?.get('role') || '';
    const statusParam = searchParams?.get('status') || '';
    setRoleFilter(roleParam);
    setStatusFilter(statusParam);
  }, [searchParams]);

  // Fetch users when filters or search change
  const fetchUsers = useCallback(async (role?: string, status?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      const filterRole = role !== undefined ? role : roleFilter;
      const filterStatus = status !== undefined ? status : statusFilter;
      if (filterRole) params.append('role', filterRole);
      if (filterStatus) params.append('status', filterStatus);

      const response = await api.get(`/auth/users/?${params.toString()}`);
      setUsers(response.data.results || response.data || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, roleFilter, statusFilter]);

  // Fetch users when URL params change (initial load)
  useEffect(() => {
    const roleParam = searchParams?.get('role') || '';
    const statusParam = searchParams?.get('status') || '';
    // Only fetch if we have URL params and filters haven't been set yet
    if ((roleParam || statusParam) && roleFilter === '' && statusFilter === '') {
      setRoleFilter(roleParam);
      setStatusFilter(statusParam);
    }
  }, [searchParams, roleFilter, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get('/auth/users/');
      const allUsers = response.data.results || response.data || [];
      
      // Count only verified users (email_verified=true) and root superadmin
      // Inactive users are those who are deactivated (is_active=false or status='INACTIVE')
      const verifiedUsers = allUsers.filter((u: User) => 
        (u.email_verified as boolean) === true || u.role === 'ROOT_SUPERADMIN'
      );
      const totalUsers = verifiedUsers.length;
      
      // Active users are verified users who are also active
      const activeUsers = verifiedUsers.filter((u: User) => 
        (u.is_active as boolean) === true && u.status === 'ACTIVE'
      ).length;
      
      // Inactive users are those who are deactivated (not active or status inactive)
      const inactiveUsers = allUsers.filter((u: User) => 
        (u.is_active as boolean) === false || u.status === 'INACTIVE'
      ).length;
      
      // Count by role (only verified users)
      const usersByRole: { [key: string]: number } = {};
      verifiedUsers.forEach((u: User) => {
        const role = u.role || 'UNKNOWN';
        usersByRole[role] = (usersByRole[role] || 0) + 1;
      });

      setStats({
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
        byRole: usersByRole,
        by_role: usersByRole,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Fetch users when filters or search change
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const canInvite = currentUser?.can_invite_users || false;
  const canManageUsers = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR'].includes(currentUser?.role || '');

  const handleActivateDeactivate = async (action: 'activate' | 'deactivate') => {
    if (!selectedUser) return;

    setActionLoading(selectedUser.id);
    setModalMessage(null);
    try {
      await api.post(`/auth/users/${selectedUser.id}/activate-deactivate/`, { action });
      await fetchUsers();
      await fetchStats(); // Refresh stats
      setModalMessage({ type: 'success', message: `User ${action}d successfully` });
      setTimeout(() => {
        if (action === 'deactivate') {
          setShowDeactivateModal(false);
        } else {
          setShowActivateModal(false);
        }
        setSelectedUser(null);
        setModalMessage(null);
      }, 2000);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      setModalMessage({ type: 'error', message: err.response?.data?.detail || `Failed to ${action} user` });
    } finally {
      setActionLoading(null);
    }
  };

  const columns = [
    {
      header: 'Name',
      accessor: (row: User) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || (row.username as string | undefined) || '',
    },
    {
      header: 'Email',
      accessor: 'email',
    },
    {
      header: 'Role',
      accessor: (row: User) => <StatusBadge status={(row.role_display as string | undefined) || row.role} size="sm" />,
    },
    {
      header: 'Status',
      accessor: (row: User) => <StatusBadge status={row.status || ((row.is_active as boolean) ? 'ACTIVE' : 'INACTIVE')} size="sm" />,
    },
    {
      header: 'Invited By',
      accessor: (row: User) => (row.invited_by_name as string | undefined) || 'N/A',
    },
    {
      header: 'Actions',
      accessor: (row: User) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={() => router.push(`/users/${row.id}`)}
            className="text-primary hover:underline text-sm"
          >
            View
          </button>
          {canManageUsers && row.id !== currentUser?.id && (
            <>
              {row.is_active ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedUser(row);
                    setShowDeactivateModal(true);
                  }}
                  disabled={actionLoading === row.id}
                  className="text-red-600 hover:underline text-sm disabled:opacity-50"
                >
                  Deactivate
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedUser(row);
                    setShowActivateModal(true);
                  }}
                  disabled={actionLoading === row.id}
                  className="text-green-600 hover:underline text-sm disabled:opacity-50"
                >
                  Activate
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <ProtectedRoute allowedRoles={['ADMIN', 'HR', 'SUPERADMIN', 'ROOT_SUPERADMIN']}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 sidebar-content">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Users</h1>
                <div className="flex flex-wrap gap-2">
                  {canInvite && (
                    <>
                      <Button 
                        onClick={() => router.push('/users/invitations')}
                        variant="secondary"
                        className="w-full sm:w-auto flex items-center"
                      >
                        <EnvelopeIcon className="h-5 w-5 mr-2" />
                        <span>View Invited Users</span>
                      </Button>
                      <Button 
                        onClick={() => router.push('/users/invite')}
                        className="w-full sm:w-auto flex items-center"
                      >
                        <UserPlusIcon className="h-5 w-5 mr-2" />
                        <span>Invite User</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>

            {/* Statistics Cards */}
            {stats && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card 
                  className={clsx(
                    "cursor-pointer hover:shadow-lg transition-shadow",
                    !roleFilter && !statusFilter && "ring-2 ring-primary"
                  )}
                  onClick={() => { 
                    setRoleFilter(''); 
                    setStatusFilter('');
                    router.push('/users');
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Total Users</p>
                      <p className="text-3xl font-bold text-primary">{stats.total}</p>
                    </div>
                    <UserGroupIcon className="h-12 w-12 text-primary opacity-20" />
                  </div>
                </Card>

                <Card 
                  className={clsx(
                    "cursor-pointer hover:shadow-lg transition-shadow",
                    statusFilter === 'ACTIVE' && "ring-2 ring-green-500"
                  )}
                  onClick={() => { 
                    setStatusFilter('ACTIVE');
                    const params = new URLSearchParams();
                    params.set('status', 'ACTIVE');
                    if (roleFilter) params.set('role', roleFilter);
                    router.push(`/users?${params.toString()}`);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Active Users</p>
                      <p className="text-3xl font-bold text-green-600">{stats.active}</p>
                    </div>
                    <CheckCircleIcon className="h-12 w-12 text-green-600 opacity-20" />
                  </div>
                </Card>

                <Card 
                  className={clsx(
                    "cursor-pointer hover:shadow-lg transition-shadow",
                    statusFilter === 'INACTIVE' && "ring-2 ring-red-500"
                  )}
                  onClick={() => { 
                    setStatusFilter('INACTIVE');
                    const params = new URLSearchParams();
                    params.set('status', 'INACTIVE');
                    if (roleFilter) params.set('role', roleFilter);
                    router.push(`/users?${params.toString()}`);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Inactive Users</p>
                      <p className="text-3xl font-bold text-red-600">{stats.inactive}</p>
                    </div>
                    <XCircleIcon className="h-12 w-12 text-red-600 opacity-20" />
                  </div>
                </Card>

                <Card className={clsx(roleFilter && "ring-2 ring-primary")}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Filtered Results</p>
                      <p className="text-3xl font-bold text-primary">{users.length}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {roleFilter ? `Role: ${roleFilter}` : 'All roles'} • {statusFilter || 'All statuses'}
                      </p>
                    </div>
                    <UserGroupIcon className="h-12 w-12 text-primary opacity-20" />
                  </div>
                </Card>
              </div>
            )}

            <Card className="mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search Users</label>
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search users..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Role</label>
                  <select
                    value={roleFilter}
                    onChange={(e) => {
                      const newRole = e.target.value;
                      setRoleFilter(newRole);
                      // Update URL to match sidebar
                      const params = new URLSearchParams(window.location.search);
                      if (newRole) {
                        params.set('role', newRole);
                      } else {
                        params.delete('role');
                      }
                      const newUrl = `/users${params.toString() ? `?${params.toString()}` : ''}`;
                      router.push(newUrl);
                    }}
                    className={clsx(
                      "input-field w-full",
                      roleFilter && "ring-2 ring-primary"
                    )}
                  >
                    <option value="">All Roles</option>
                    <option value="PUBLIC_VIEW">Public View</option>
                    <option value="WORKER">Worker</option>
                    <option value="FOREMAN">Foreman</option>
                    <option value="SUPERINTENDENT">Superintendent / Site Supervisor</option>
                    <option value="PROJECT_MANAGER">Project Manager</option>
                    <option value="HR">HR</option>
                    <option value="FINANCE">Finance</option>
                    <option value="AUDITOR">Auditor</option>
                    <option value="ADMIN">Admin</option>
                    <option value="SYSTEM_ADMIN">System Admin</option>
                    <option value="SUPERADMIN">Superadmin</option>
                    <option value="ROOT_SUPERADMIN">Root Superadmin</option>
                    <option value="GENERAL_CONTRACTOR">General Contractor</option>
                  </select>
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      const newStatus = e.target.value;
                      setStatusFilter(newStatus);
                      // Update URL to match
                      const params = new URLSearchParams(window.location.search);
                      if (newStatus) {
                        params.set('status', newStatus);
                      } else {
                        params.delete('status');
                      }
                      // Preserve role filter if exists
                      if (roleFilter) {
                        params.set('role', roleFilter);
                      }
                      router.push(`/users${params.toString() ? `?${params.toString()}` : ''}`);
                    }}
                    className={clsx(
                      "input-field w-full",
                      statusFilter && "ring-2 ring-primary border-primary"
                    )}
                  >
                    <option value="">All Status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>
            </Card>

            <Card>
              {loading ? (
                <LoadingSpinner />
              ) : (
                <DataTable
                  data={users}
                  columns={columns}
                  emptyMessage="No users found"
                  onRowClick={(row) => router.push(`/users/${row.id}`)}
                />
              )}
            </Card>
            </div>
          </main>
        </div>
      </div>

      {/* Deactivate Modal */}
      <Modal
        isOpen={showDeactivateModal}
        onClose={() => {
          if (!actionLoading) {
            setShowDeactivateModal(false);
            setSelectedUser(null);
            setModalMessage(null);
          }
        }}
        title="Deactivate User"
        size="md"
      >
        {modalMessage ? (
          <div className={`p-4 rounded-lg ${modalMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            <p className="font-medium">{modalMessage.message}</p>
          </div>
        ) : (
          <>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <p className="text-yellow-800 font-medium mb-2">Warning</p>
              <p className="text-yellow-700 text-sm">
                Deactivating this user will prevent them from logging into the system. They will not be able to access their account until it is reactivated.
              </p>
            </div>
            <p className="text-gray-700 mb-4">
              Are you sure you want to deactivate <strong>{selectedUser?.first_name} {selectedUser?.last_name}</strong> ({selectedUser?.email})?
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowDeactivateModal(false);
                  setSelectedUser(null);
                }}
                disabled={actionLoading !== null}
              >
                Cancel
              </Button>
              <Button
                variant="red"
                onClick={() => handleActivateDeactivate('deactivate')}
                isLoading={actionLoading !== null}
                disabled={actionLoading !== null}
              >
                {actionLoading ? 'Deactivating...' : 'Yes, Deactivate User'}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Activate Modal */}
      <Modal
        isOpen={showActivateModal}
        onClose={() => {
          if (!actionLoading) {
            setShowActivateModal(false);
            setSelectedUser(null);
            setModalMessage(null);
          }
        }}
        title="Activate User"
        size="md"
      >
        {modalMessage ? (
          <div className={`p-4 rounded-lg ${modalMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            <p className="font-medium">{modalMessage.message}</p>
          </div>
        ) : (
          <>
            <p className="text-gray-700 mb-4">
              Are you sure you want to activate <strong>{selectedUser?.first_name} {selectedUser?.last_name}</strong> ({selectedUser?.email})?
            </p>
            <p className="text-sm text-gray-500 mb-4">
              This will allow the user to log in and access the system.
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowActivateModal(false);
                  setSelectedUser(null);
                }}
                disabled={actionLoading !== null}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleActivateDeactivate('activate')}
                isLoading={actionLoading !== null}
                disabled={actionLoading !== null}
              >
                {actionLoading ? 'Activating...' : 'Yes, Activate User'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </ProtectedRoute>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 sidebar-content">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <div className="max-w-7xl mx-auto">
                <LoadingSpinner />
              </div>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    }>
      <UsersPageContent />
    </Suspense>
  );
}
