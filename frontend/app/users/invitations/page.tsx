'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import {
  EnvelopeIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import Modal from '@/components/ui/Modal';

interface InvitedUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  username: string;
  employee_number: string;
  role: string;
  role_display: string;
  invited_by_name: string;
  invited_on: string;
  invitation_email_sent: boolean;
  invitation_email_sent_at: string | null;
  invitation_email_error: string | null;
  is_activated: boolean;
  email_verified: boolean;
}

export default function InvitedUsersPage() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<InvitedUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<InvitedUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [error, setError] = useState<string>('');
  const [resendingEmail, setResendingEmail] = useState<number | null>(null);
  const [cancellingInvitation, setCancellingInvitation] = useState<number | null>(null);
  const [showResendModal, setShowResendModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<InvitedUser | null>(null);
  const [modalMessage, setModalMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const canManageInvitations = currentUser?.role === 'ROOT_SUPERADMIN' || 
                                currentUser?.role === 'SUPERADMIN' || 
                                currentUser?.role === 'ADMIN' ||
                                currentUser?.role === 'HR';

  const fetchInvitedUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (selectedRole !== 'all') {
        params.append('role', selectedRole);
      }
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      
      const response = await api.get(`/auth/invited-users/?${params.toString()}`);
      setUsers(response.data.results || response.data || []);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      console.error('Error fetching invited users:', error);
      setError(error.response?.data?.detail || 'Failed to fetch invited users');
    } finally {
      setLoading(false);
    }
  }, [selectedRole, searchTerm]);

  const filterUsers = useCallback(() => {
    let filtered = [...users];

    // Filter by role
    if (selectedRole !== 'all') {
      filtered = filtered.filter(user => user.role === selectedRole);
    }

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(user =>
        user.email.toLowerCase().includes(search) ||
        user.first_name?.toLowerCase().includes(search) ||
        user.last_name?.toLowerCase().includes(search) ||
        user.username.toLowerCase().includes(search) ||
        user.employee_number?.toLowerCase().includes(search)
      );
    }

    setFilteredUsers(filtered);
  }, [users, selectedRole, searchTerm]);

  useEffect(() => {
    filterUsers();
  }, [filterUsers]);

  const handleResendEmail = async () => {
    if (!selectedUser) return;

    try {
      setResendingEmail(selectedUser.id);
      const response = await api.post(`/auth/invited-users/${selectedUser.id}/resend-email/`);
      
      if (response.data.email_sent) {
        setModalMessage({ type: 'success', message: 'Invitation email resent successfully!' });
        fetchInvitedUsers(); // Refresh the list
        setTimeout(() => {
          setShowResendModal(false);
          setModalMessage(null);
          setSelectedUser(null);
        }, 2000);
      } else {
        setModalMessage({ type: 'error', message: `Failed to resend email: ${response.data.error || 'Unknown error'}` });
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      console.error('Error resending email:', error);
      setModalMessage({ type: 'error', message: error.response?.data?.detail || 'Failed to resend invitation email' });
    } finally {
      setResendingEmail(null);
    }
  };

  const openResendModal = (user: InvitedUser) => {
    setSelectedUser(user);
    setShowResendModal(true);
    setModalMessage(null);
  };

  const handleCancelInvitation = async () => {
    if (!selectedUser) return;

    try {
      setCancellingInvitation(selectedUser.id);
      const response = await api.delete(`/auth/invited-users/${selectedUser.id}/cancel/`);
      setModalMessage({ type: 'success', message: response.data.detail || 'Invitation cancelled successfully and user account deleted.' });
      fetchInvitedUsers(); // Refresh the list
      setTimeout(() => {
        setShowCancelModal(false);
        setModalMessage(null);
        setSelectedUser(null);
      }, 2000);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      console.error('Error cancelling invitation:', error);
      setModalMessage({ type: 'error', message: error.response?.data?.detail || 'Failed to cancel invitation' });
    } finally {
      setCancellingInvitation(null);
    }
  };

  const openCancelModal = (user: InvitedUser) => {
    setSelectedUser(user);
    setShowCancelModal(true);
    setModalMessage(null);
  };

  // Get unique roles from users
  const roles = Array.from(new Set(users.map(u => u.role))).sort();

  if (!canManageInvitations) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 sidebar-content">
            <Header />
            <main className="flex-1 p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <Card>
                <p className="text-center text-red-600 py-8">
                  You don&apos;t have permission to view invited users
                </p>
              </Card>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR']}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 sidebar-content">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-7xl mx-auto">
              <div className="mb-6 flex justify-between items-center">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Invited Users</h1>
                  <p className="text-gray-600">Manage user invitations and track email delivery status</p>
                </div>
                {canManageInvitations && (
                  <Button
                    onClick={() => router.push('/users/invite')}
                    className="flex items-center"
                  >
                    <UserPlusIcon className="h-5 w-5 mr-2" />
                    Invite User
                  </Button>
                )}
              </div>

              {/* Filters and Search */}
              <Card className="mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by name, email, username, or employee number..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="input-field pl-10 w-full"
                    />
                  </div>
                  <div className="relative">
                    <FunnelIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="input-field pl-10 w-full"
                    >
                      <option value="all">All Roles</option>
                      {roles.map(role => {
                        const user = users.find(u => u.role === role);
                        return (
                          <option key={role} value={role}>
                            {user?.role_display || role}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              </Card>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
                  {error}
                </div>
              )}

              {loading ? (
                <Card>
                  <LoadingSpinner />
                </Card>
              ) : (
                <Card>
                  {filteredUsers.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500">No invited users found</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invited By</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invited On</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredUsers.map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50">
                              <td className="px-4 py-4 whitespace-nowrap">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {user.first_name} {user.last_name}
                                  </div>
                                  <div className="text-sm text-gray-500">{user.email}</div>
                                  {user.employee_number && (
                                    <div className="text-xs text-gray-400">#{user.employee_number}</div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap">
                                <StatusBadge status={user.role_display} size="sm" />
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                {user.invited_by_name || 'N/A'}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                {user.invited_on ? new Date(user.invited_on).toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap">
                                {user.invitation_email_sent ? (
                                  <div className="flex items-center text-green-600">
                                    <EnvelopeIcon className="h-4 w-4 mr-1" />
                                    <span className="text-sm">Sent</span>
                                    {user.invitation_email_sent_at && (
                                      <span className="text-xs text-gray-400 ml-2">
                                        {new Date(user.invitation_email_sent_at).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center text-red-600">
                                    <XMarkIcon className="h-4 w-4 mr-1" />
                                    <span className="text-sm">Failed</span>
                                    {user.invitation_email_error && (
                                      <span className="text-xs text-gray-400 ml-2" title={user.invitation_email_error}>
                                        (Error)
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap">
                                {user.email_verified ? (
                                  <StatusBadge status="Activated" size="sm" />
                                ) : (
                                  <StatusBadge status="Pending" size="sm" />
                                )}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex space-x-2">
                                  {(!user.invitation_email_sent || user.invitation_email_error) && !user.email_verified && (
                                    <button
                                      className="px-3 py-1 text-sm bg-gray-200 text-gray-800 hover:bg-gray-300 rounded disabled:opacity-50 flex items-center"
                                      onClick={() => openResendModal(user)}
                                      disabled={resendingEmail === user.id || cancellingInvitation === user.id}
                                    >
                                      <EnvelopeIcon className="h-4 w-4 mr-1" />
                                      Resend
                                    </button>
                                  )}
                                  {!user.email_verified && (
                                    <button
                                      className="px-3 py-1 text-sm bg-red-600 text-white hover:bg-red-700 rounded disabled:opacity-50 flex items-center"
                                      onClick={() => openCancelModal(user)}
                                      disabled={resendingEmail === user.id || cancellingInvitation === user.id}
                                    >
                                      <XMarkIcon className="h-4 w-4 mr-1" />
                                      Cancel
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Resend Email Modal */}
      <Modal
        isOpen={showResendModal}
        onClose={() => {
          if (!resendingEmail) {
            setShowResendModal(false);
            setSelectedUser(null);
            setModalMessage(null);
          }
        }}
        title="Resend Invitation Email"
        size="md"
      >
        {modalMessage ? (
          <div className={`p-4 rounded-lg ${modalMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            <p className="font-medium">{modalMessage.message}</p>
          </div>
        ) : (
          <>
            <p className="text-gray-700 mb-4">
              Are you sure you want to resend the invitation email to <strong>{selectedUser?.email}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowResendModal(false);
                  setSelectedUser(null);
                }}
                disabled={resendingEmail !== null}
              >
                Cancel
              </Button>
              <Button
                onClick={handleResendEmail}
                isLoading={resendingEmail !== null}
                disabled={resendingEmail !== null}
              >
                {resendingEmail ? 'Sending...' : 'Resend Email'}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Cancel Invitation Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => {
          if (!cancellingInvitation) {
            setShowCancelModal(false);
            setSelectedUser(null);
            setModalMessage(null);
          }
        }}
        title="Cancel Invitation"
        size="md"
      >
        {modalMessage ? (
          <div className={`p-4 rounded-lg ${modalMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            <p className="font-medium">{modalMessage.message}</p>
          </div>
        ) : (
          <>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 font-medium mb-2">Warning: This action cannot be undone!</p>
              <p className="text-red-700 text-sm">
                This will permanently delete the user account for <strong>{selectedUser?.email}</strong> if they haven&apos;t activated it yet.
              </p>
            </div>
            <p className="text-gray-700 mb-4">
              Are you sure you want to cancel this invitation?
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCancelModal(false);
                  setSelectedUser(null);
                }}
                disabled={cancellingInvitation !== null}
              >
                No, Keep It
              </Button>
              <Button
                variant="red"
                onClick={handleCancelInvitation}
                isLoading={cancellingInvitation !== null}
                disabled={cancellingInvitation !== null}
              >
                {cancellingInvitation ? 'Cancelling...' : 'Yes, Cancel Invitation'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </ProtectedRoute>
  );
}

