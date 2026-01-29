'use client';

import { use, useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import DataTable from '@/components/ui/DataTable';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ClockIcon, TrashIcon } from '@heroicons/react/24/outline';
import Modal from '@/components/ui/Modal';

interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  role_display?: string;
  status: string;
  email_verified?: boolean;
  email_verified_at?: string;
  invited_by?: number;
  invited_by_name?: string;
  invited_on?: string;
  is_active?: boolean;
  employee_number?: string;
  phone_number?: string;
  city?: string;
  current_location?: string;
  role_assigned_by_name?: string;
  role_assigned_on?: string;
}

interface TimeEntry {
  id: number;
  date: string;
  clock_in: string;
  clock_out?: string;
  total_hours?: number;
  regular_hours?: number;
  overtime_hours?: number;
  break_duration_minutes?: number;
  status: string;
  project?: {
    id: number;
    name: string;
    job_number: string;
  };
}

interface TimeSummary {
  total_hours: string;
  regular_hours: string;
  overtime_hours: string;
  days_worked: number;
  total_entries: number;
  approved_entries: number;
}

interface Project {
  id: number;
  name: string;
  job_number: string;
  status: string;
  client_name?: string;
  work_location?: string;
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [timeLoading, setTimeLoading] = useState(true);
  const [timeSummary, setTimeSummary] = useState<TimeSummary | null>(null);
  const [dateFilter, setDateFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [modalMessage, setModalMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const canManageUsers = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR'].includes(currentUser?.role || '');
  const canViewTimeEntries = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR', 'FINANCE', 'PROJECT_MANAGER', 'SUPERINTENDENT', 'FOREMAN'].includes(currentUser?.role || '') || currentUser?.id === parseInt(id);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/auth/users/${id}/`);
      setUser(response.data);
    } catch (error: unknown) {
      console.error('Failed to fetch user:', error);
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        setUser(null); // Explicitly set to null so the "not found" message shows
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchProjects = useCallback(async () => {
    try {
      setProjectsLoading(true);
      // Fetch projects where user is assigned
      const [pmRes, superRes, foremanRes, gcRes, assignmentsRes] = await Promise.all([
        api.get(`/projects/projects/?project_manager=${id}`).catch(() => ({ data: { results: [] } })),
        api.get(`/projects/projects/?superintendent=${id}`).catch(() => ({ data: { results: [] } })),
        api.get(`/projects/projects/?foreman=${id}`).catch(() => ({ data: { results: [] } })),
        api.get(`/projects/projects/?general_contractor=${id}`).catch(() => ({ data: { results: [] } })),
        api.get(`/auth/assignments/?employee=${id}&status=ACTIVE`).catch(() => ({ data: { results: [] } })),
      ]);
      
      const allProjects = new Map<number, Project>();
      
      // Add projects from direct assignments
      [...(pmRes.data.results || []), ...(superRes.data.results || []), 
       ...(foremanRes.data.results || []), ...(gcRes.data.results || [])].forEach((p: Project) => {
        allProjects.set(p.id, p);
      });
      
      // Add projects from ProjectAssignment
      const assignments = assignmentsRes.data.results || assignmentsRes.data || [];
      const assignmentProjectIds = assignments.map((a: { project: number }) => a.project).filter(Boolean);
      if (assignmentProjectIds.length > 0) {
        const assignmentProjectsRes = await api.get(`/projects/projects/?id__in=${assignmentProjectIds.join(',')}`).catch(() => ({ data: { results: [] } }));
        (assignmentProjectsRes.data.results || []).forEach((p: Project) => {
          allProjects.set(p.id, p);
        });
      }
      
      setProjects(Array.from(allProjects.values()));
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setProjectsLoading(false);
    }
  }, [id]);

  const fetchTimeEntries = useCallback(async () => {
    if (!canViewTimeEntries) {
      setTimeLoading(false);
      return;
    }
    
    try {
      setTimeLoading(true);
      const params = new URLSearchParams();
      params.append('employee', id);
      if (dateFilter) {
        params.append('date', dateFilter);
      }
      if (statusFilter) {
        params.append('status', statusFilter);
      }
      
      const response = await api.get(`/time/entries/?${params.toString()}`);
      const entries = response.data.results || response.data || [];
      setTimeEntries(entries);
      
      // Calculate summary with regular and overtime hours
      // Handle both entries with clock_out and those still in progress
      const totalHours = entries.reduce((sum: number, entry: TimeEntry) => {
        if (entry.total_hours) {
          return sum + parseFloat(String(entry.total_hours));
        } else if (entry.clock_in && entry.clock_out) {
          // Calculate hours if not provided
          const clockIn = new Date(entry.clock_in);
          const clockOut = new Date(entry.clock_out);
          const diffMs = clockOut.getTime() - clockIn.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          const breakHours = (entry.break_duration_minutes || 0) / 60;
          return sum + Math.max(0, diffHours - breakHours);
        }
        return sum;
      }, 0);
      
      const totalRegularHours = entries.reduce((sum: number, entry: TimeEntry) => {
        if (entry.regular_hours) {
          return sum + parseFloat(String(entry.regular_hours));
        } else if (entry.total_hours && !entry.overtime_hours) {
          // If we have total hours but no overtime specified, assume all regular
          return sum + parseFloat(String(entry.total_hours));
        } else if (entry.total_hours && entry.overtime_hours) {
          // Calculate regular as total - overtime
          return sum + (parseFloat(String(entry.total_hours)) - parseFloat(String(entry.overtime_hours)));
        }
        return sum;
      }, 0);
      
      const totalOvertimeHours = entries.reduce((sum: number, entry: TimeEntry) => {
        if (entry.overtime_hours) {
          return sum + parseFloat(String(entry.overtime_hours));
        }
        return sum;
      }, 0);
      
      const daysWorked = new Set(entries.map((e: TimeEntry) => e.date)).size;
      const approvedEntries = entries.filter((e: TimeEntry) => e.status === 'APPROVED').length;
      
      setTimeSummary({
        total_hours: totalHours.toFixed(2),
        regular_hours: totalRegularHours.toFixed(2),
        overtime_hours: totalOvertimeHours.toFixed(2),
        days_worked: daysWorked,
        total_entries: entries.length,
        approved_entries: approvedEntries,
      });
    } catch (error) {
      console.error('Failed to fetch time entries:', error);
      setTimeEntries([]);
    } finally {
      setTimeLoading(false);
    }
  }, [id, canViewTimeEntries, dateFilter, statusFilter]);

  useEffect(() => {
    fetchUser();
    fetchProjects();
  }, [fetchUser, fetchProjects]);

  useEffect(() => {
    if (canViewTimeEntries) {
      fetchTimeEntries();
    }
  }, [canViewTimeEntries, fetchTimeEntries]);

  // Poll for user status updates (in case email is verified)
  useEffect(() => {
    if (!user || !user.invited_by || user.email_verified) {
      return;
    }
    
    const interval = setInterval(() => {
      fetchUser();
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, [user, fetchUser]);

  const handleActivateDeactivate = async (action: 'activate' | 'deactivate') => {
    setActionLoading(true);
    setModalMessage(null);
    try {
      await api.post(`/auth/users/${id}/activate-deactivate/`, { action });
      await fetchUser();
      setModalMessage({ type: 'success', message: `User ${action}d successfully` });
      setTimeout(() => {
        if (action === 'deactivate') {
          setShowDeactivateModal(false);
        } else {
          setShowActivateModal(false);
        }
        setModalMessage(null);
      }, 2000);
    } catch (error: unknown) {
      const errorMessage = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail || `Failed to ${action} user`;
      setModalMessage({ type: 'error', message: errorMessage });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    setModalMessage(null);
    try {
      await api.delete(`/auth/users/${id}/`);
      setModalMessage({ type: 'success', message: 'User deleted successfully' });
      setTimeout(() => {
        router.push('/users');
      }, 1500);
    } catch (error: unknown) {
      const errorMessage = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail || 'Failed to delete user';
      setModalMessage({ type: 'error', message: errorMessage });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <main className="flex-1 p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <LoadingSpinner />
            </main>
      </ProtectedRoute>
    );
  }

  if (!user) {
    return (
      <ProtectedRoute>
        <main className="flex-1 p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <div className="max-w-4xl mx-auto">
                <Card>
                  <p className="text-center text-gray-500 py-8">User not found</p>
                </Card>
              </div>
            </main>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <main className="flex-1 p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <button
                  onClick={() => router.back()}
                  className="text-gray-600 hover:text-primary mb-2"
                >
                  ← Back to Users
                </button>
                <h1 className="text-2xl font-bold text-gray-900">
                  {user.first_name} {user.last_name}
                </h1>
                <p className="text-gray-500">{user.email}</p>
              </div>
              <div className="flex space-x-2 flex-wrap gap-2">
                <StatusBadge status={user.role_display || user.role} />
                <StatusBadge status={user.status || (user.is_active ? 'ACTIVE' : 'INACTIVE')} />
                {user.invited_by && (
                  user.email_verified ? (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200">
                      ✓ Email Verified
                    </span>
                  ) : (
                    <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded border border-yellow-200">
                      ⚠ Email Pending
                    </span>
                  )
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card title="Personal Information">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Username</label>
                    <p className="text-gray-900">{user.username}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Employee Number</label>
                    <p className="text-gray-900">{user.employee_number || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Phone Number</label>
                    <p className="text-gray-900">{user.phone_number || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">City</label>
                    <p className="text-gray-900">{user.city || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Current Location</label>
                    <p className="text-gray-900">{user.current_location || 'N/A'}</p>
                  </div>
                </div>
              </Card>

              <Card title="Role & Access">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Role</label>
                    <p className="text-gray-900">{user.role_display || user.role}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Status</label>
                    <div className="flex items-center space-x-2">
                      <StatusBadge status={user.status || (user.is_active ? 'ACTIVE' : 'INACTIVE')} />
                      {user.invited_by && !user.email_verified && (
                        <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                          Email Not Verified
                        </span>
                      )}
                      {user.email_verified && (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                          Email Verified
                        </span>
                      )}
                    </div>
                  </div>
                  {user.invited_by && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Email Verification</label>
                      <p className="text-gray-900">
                        {user.email_verified ? (
                          <span className="text-green-600">✓ Verified</span>
                        ) : (
                          <span className="text-yellow-600">⚠ Pending Verification</span>
                        )}
                      </p>
                      {user.email_verified_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Verified on: {new Date(user.email_verified_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              <Card title="Invitation Information">
                <div className="space-y-4">
                  {user.invited_by_name && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Invited By</label>
                      <p className="text-gray-900">{user.invited_by_name}</p>
                    </div>
                  )}
                  {user.invited_on && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Invited On</label>
                      <p className="text-gray-900">
                        {new Date(user.invited_on).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {user.role_assigned_by_name && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Role Assigned By</label>
                      <p className="text-gray-900">{user.role_assigned_by_name}</p>
                    </div>
                  )}
                  {user.role_assigned_on && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Role Assigned On</label>
                      <p className="text-gray-900">
                        {new Date(user.role_assigned_on).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </Card>

              <Card title="Actions">
                <div className="space-y-2">
                  {canManageUsers && user.id !== currentUser?.id && (
                    <>
                      {user.is_active ? (
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => setShowDeactivateModal(true)}
                          disabled={actionLoading}
                        >
                          Deactivate User
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => setShowActivateModal(true)}
                          disabled={actionLoading}
                        >
                          Activate User
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        className="w-full text-red-600 hover:text-red-700"
                        onClick={() => setShowDeleteModal(true)}
                        disabled={actionLoading}
                      >
                        <TrashIcon className="h-5 w-5 mr-2 inline" />
                        Delete User
                      </Button>
                    </>
                  )}
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => router.push(`/users/${id}/edit`)}
                  >
                    Edit User
                  </Button>
                </div>
              </Card>
            </div>

            {/* Projects Section */}
            <Card title="Assigned Projects" className="mt-6">
              {projectsLoading ? (
                <LoadingSpinner />
              ) : (
                <>
                  {projects.length > 0 ? (
                    <div className="space-y-3">
                      {projects.map((project: Project) => (
                        <div
                          key={project.id}
                          className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => router.push(`/projects/${project.id}`)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-900">{project.name}</h3>
                              <p className="text-sm text-gray-500 mt-1">{project.job_number}</p>
                              {project.client_name && (
                                <p className="text-sm text-gray-600 mt-1">Client: {project.client_name}</p>
                              )}
                            </div>
                            <StatusBadge status={project.status} size="sm" />
                          </div>
                          {project.work_location && (
                            <p className="text-sm text-gray-500 mt-2">📍 {project.work_location}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No projects assigned</p>
                  )}
                </>
              )}
            </Card>

            {/* Time Entries Section */}
            {canViewTimeEntries && (
              <Card title="Time Entries & Hours Worked" className="mt-6">
                {/* Filters */}
                <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Date</label>
                    <input
                      type="date"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className="input-field w-full"
                      max={new Date().toISOString().split('T')[0]}
                    />
                    {dateFilter && (
                      <button
                        onClick={() => setDateFilter('')}
                        className="mt-2 text-sm text-primary hover:underline"
                      >
                        Clear date filter
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="input-field w-full"
                    >
                      <option value="">All Statuses</option>
                      <option value="DRAFT">Draft</option>
                      <option value="SUBMITTED">Submitted</option>
                      <option value="APPROVED">Approved</option>
                      <option value="REJECTED">Rejected</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    {(dateFilter || statusFilter) && (
                      <button
                        onClick={() => {
                          setDateFilter('');
                          setStatusFilter('');
                        }}
                        className="btn-secondary w-full"
                      >
                        Clear All Filters
                      </button>
                    )}
                  </div>
                </div>
                
                {timeLoading ? (
                  <LoadingSpinner />
                ) : (
                  <>
                    {timeSummary && (
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                          <p className="text-xs text-gray-600 mb-1">Total Hours</p>
                          <p className="text-2xl font-bold text-blue-700">{timeSummary.total_hours || '0.00'}</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                          <p className="text-xs text-gray-600 mb-1">Regular Hours</p>
                          <p className="text-2xl font-bold text-green-700">{timeSummary.regular_hours || '0.00'}</p>
                        </div>
                        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                          <p className="text-xs text-gray-600 mb-1">Overtime Hours</p>
                          <p className="text-2xl font-bold text-orange-700">{timeSummary.overtime_hours || '0.00'}</p>
                        </div>
                        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                          <p className="text-xs text-gray-600 mb-1">Days Worked</p>
                          <p className="text-2xl font-bold text-purple-700">{timeSummary.days_worked || 0}</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <p className="text-xs text-gray-600 mb-1">Total Entries</p>
                          <p className="text-2xl font-bold text-gray-700">{timeSummary.total_entries || 0}</p>
                        </div>
                        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                          <p className="text-xs text-gray-600 mb-1">Approved</p>
                          <p className="text-2xl font-bold text-indigo-700">{timeSummary.approved_entries || 0}</p>
                        </div>
                      </div>
                    )}
                    {timeEntries.length > 0 ? (
                      <DataTable
                        data={timeEntries}
                        columns={[
                          {
                            header: 'Date',
                            accessor: (row: TimeEntry) => (
                              <div>
                                <p className="font-medium">{new Date(row.date || row.clock_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                              </div>
                            ),
                          },
                          {
                            header: 'Project',
                            accessor: (row: TimeEntry) => {
                              const project = row.project as { job_number?: string; name?: string } | undefined;
                              return (
                                <div>
                                  <p className="font-medium">{project?.job_number || 'N/A'}</p>
                                  <p className="text-xs text-gray-500">{project?.name || ''}</p>
                                </div>
                              );
                            },
                          },
                          {
                            header: 'Clock In',
                            accessor: (row: TimeEntry) => row.clock_in ? (
                              <div>
                                <p className="font-medium">{new Date(row.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                                <p className="text-xs text-gray-500">{new Date(row.clock_in).toLocaleDateString()}</p>
                              </div>
                            ) : 'N/A',
                          },
                          {
                            header: 'Clock Out',
                            accessor: (row: TimeEntry) => row.clock_out ? (
                              <div>
                                <p className="font-medium">{new Date(row.clock_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                                <p className="text-xs text-gray-500">{new Date(row.clock_out).toLocaleDateString()}</p>
                              </div>
                            ) : (
                              <span className="text-yellow-600 font-medium">In Progress</span>
                            ),
                          },
                          {
                            header: 'Regular',
                            accessor: (row: TimeEntry) => (
                              <span className="font-medium text-green-600">
                                {row.regular_hours ? parseFloat(String(row.regular_hours)).toFixed(2) : '0.00'}h
                              </span>
                            ),
                          },
                          {
                            header: 'Overtime',
                            accessor: (row: TimeEntry) => (
                              <span className="font-medium text-orange-600">
                                {row.overtime_hours ? parseFloat(String(row.overtime_hours)).toFixed(2) : '0.00'}h
                              </span>
                            ),
                          },
                          {
                            header: 'Total Hours',
                            accessor: (row: TimeEntry) => (
                              <span className="font-bold text-primary">
                                {row.total_hours ? parseFloat(String(row.total_hours)).toFixed(2) : '0.00'}h
                              </span>
                            ),
                          },
                          {
                            header: 'Status',
                            accessor: (row: TimeEntry) => <StatusBadge status={row.status || (row.clock_out ? 'APPROVED' : 'DRAFT')} size="sm" />,
                          },
                        ]}
                        emptyMessage="No time entries found"
                      />
                    ) : (
                      <div className="text-center py-8">
                        <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No time entries found for this employee</p>
                      </div>
                    )}
                  </>
                )}
              </Card>
            )}
            </div>

            {/* Deactivate Modal */}
            <Modal
              isOpen={showDeactivateModal}
              onClose={() => {
                if (!actionLoading) {
                  setShowDeactivateModal(false);
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
                    Are you sure you want to deactivate <strong>{user?.first_name} {user?.last_name}</strong> ({user?.email})?
                  </p>
                  <div className="flex justify-end space-x-3">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowDeactivateModal(false);
                        setModalMessage(null);
                      }}
                      disabled={actionLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="red"
                      onClick={() => handleActivateDeactivate('deactivate')}
                      isLoading={actionLoading}
                      disabled={actionLoading}
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
                    Are you sure you want to activate <strong>{user?.first_name} {user?.last_name}</strong> ({user?.email})?
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    This will allow the user to log in and access the system.
                  </p>
                  <div className="flex justify-end space-x-3">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowActivateModal(false);
                        setModalMessage(null);
                      }}
                      disabled={actionLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handleActivateDeactivate('activate')}
                      isLoading={actionLoading}
                      disabled={actionLoading}
                    >
                      {actionLoading ? 'Activating...' : 'Yes, Activate User'}
                    </Button>
                  </div>
                </>
              )}
            </Modal>

            {/* Delete User Modal */}
            <Modal
              isOpen={showDeleteModal}
              onClose={() => {
                if (!actionLoading) {
                  setShowDeleteModal(false);
                  setModalMessage(null);
                }
              }}
              title="Delete User"
              size="md"
            >
              {modalMessage ? (
                <div className={`p-4 rounded-lg ${modalMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  <p className="font-medium">{modalMessage.message}</p>
                </div>
              ) : (
                <>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <p className="text-red-800 font-medium mb-2">⚠️ Warning: This action cannot be undone</p>
                    <p className="text-red-700 text-sm">
                      Deleting this user will permanently remove their account and all associated data from the system. This includes:
                    </p>
                    <ul className="text-red-700 text-sm mt-2 list-disc list-inside space-y-1">
                      <li>User account and login credentials</li>
                      <li>Time entries and work history</li>
                      <li>Project assignments</li>
                      <li>All associated records</li>
                    </ul>
                  </div>
                  <p className="text-gray-700 mb-4">
                    Are you absolutely sure you want to delete <strong>{user?.first_name} {user?.last_name}</strong> ({user?.email})?
                  </p>
                  <div className="flex justify-end space-x-3">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowDeleteModal(false);
                        setModalMessage(null);
                      }}
                      disabled={actionLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="red"
                      onClick={handleDelete}
                      isLoading={actionLoading}
                      disabled={actionLoading}
                    >
                      {actionLoading ? 'Deleting...' : 'Yes, Delete User'}
                    </Button>
                  </div>
                </>
              )}
            </Modal>
          </main>
    </ProtectedRoute>
  );
}

