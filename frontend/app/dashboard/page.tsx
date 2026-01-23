'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import { useProjects } from '@/hooks/useProjects';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import {
  FolderIcon,
  UserGroupIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  BuildingOfficeIcon,
  PlusIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

interface DashboardStats {
  total_projects?: number;
  active_projects?: number;
  total_users?: number;
  employees_by_role_count?: Record<string, number>;
  users_by_role?: Record<string, User[]>;
  total_employees?: number;
  active_employees?: number;
  inactive_employees?: number;
  total_branches?: number;
  total_contract_value?: number;
  total_contract_balance?: number;
  revenue?: number;
  pending_projects?: number;
  completed_projects?: number;
  projects_on_hold?: number;
  projects_count?: number;
  my_projects?: number;
  projects_at_risk?: number;
  team_members?: User[];
  clocked_in?: number;
  today_hours?: number;
  crew_members?: User[];
  pending_invitations?: number;
  open_pay_periods?: number;
  assigned_projects?: number;
  pending_approvals?: number;
  site_workers?: User[];
  // Spectrum imported jobs counts
  spectrum_jobs_total?: number;
  spectrum_jobs_active?: number;
  spectrum_jobs_inactive?: number;
  spectrum_jobs_complete?: number;
  // Branch Manager specific
  inactive_projects?: number;
  division_name?: string;
}


export default function DashboardPage() {
  const router = useRouter();

  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { projects, loading: projectsLoading } = useProjects({ status: 'ACTIVE' });


  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/auth/dashboard/stats/');
      const dashboardStats = response.data;
      
      // Also fetch project statistics to ensure consistency with projects page
      try {
        const projectStatsResponse = await api.get('/projects/projects/statistics/');
        const projectStats = projectStatsResponse.data;
        
        // Override project counts from projects statistics endpoint for consistency
        dashboardStats.total_projects = projectStats.total;
        dashboardStats.active_projects = projectStats.active;
        dashboardStats.inactive_projects = projectStats.inactive;
        dashboardStats.completed_projects = projectStats.completed; // Only completed, not closed
      } catch (err) {
        console.error('Failed to fetch project statistics:', err);
        // Continue with dashboard stats if project stats fail
      }
      
      setStats(dashboardStats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch stats on mount and set up auto-refresh every minute
  useEffect(() => {
    if (user) {
      // Fetch immediately
      fetchStats();
      
      // Set up interval to fetch every minute (60000ms)
      const intervalId = setInterval(() => {
        fetchStats();
      }, 60000); // 60 seconds = 1 minute
      
      // Cleanup interval on unmount or when user changes
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [user, fetchStats]);

  if (authLoading) {
    return <LoadingSpinner />;
  }

  const role = user?.role;

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 sidebar-content">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-7xl mx-auto">
              <div className="mb-4 md:mb-6">
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-sm md:text-base text-gray-600 mt-1">
                  Welcome back, {user?.first_name || user?.username}!
                </p>
              </div>

            {/* Shortcut Buttons */}
            {(role === 'ROOT_SUPERADMIN' || role === 'SUPERADMIN' || role === 'ADMIN' || role === 'HR') && (
              <div className="mb-6">
                <div className="flex flex-wrap gap-2 md:gap-3">
                  {(role === 'ROOT_SUPERADMIN' || role === 'SUPERADMIN' || role === 'ADMIN' || role === 'HR') && (
                    <button
                      onClick={() => router.push('/users/invite')}
                      className="flex items-center space-x-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm md:text-base"
                    >
                      <PlusIcon className="h-5 w-5" />
                      <span>Invite User</span>
                    </button>
                  )}
                  {(role === 'ROOT_SUPERADMIN' || role === 'SUPERADMIN' || role === 'ADMIN') && (
                    <button
                      onClick={() => router.push('/meetings')}
                      className="flex items-center space-x-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm md:text-base"
                    >
                      <PlusIcon className="h-5 w-5" />
                      <span>New Meeting</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Role-specific dashboard content */}
            {role === 'PROJECT_MANAGER' && (
              <ProjectManagerDashboard stats={stats} loading={loading} projects={projects} />
            )}

            {role === 'FOREMAN' && (
              <ForemanDashboard 
                stats={stats} 
                loading={loading} 
              />
            )}

            {(role === 'LABORER' || role === 'MASON' || role === 'OPERATOR' || role === 'BRICKLAYER' || role === 'PLASTER') && (
              <WorkerDashboard 
                stats={stats} 
                loading={loading} 
              />
            )}

            {role === 'HR' && (
              <HRDashboard stats={stats} loading={loading} />
            )}

            {role === 'FINANCE' && (
              <FinanceDashboard stats={stats} loading={loading} />
            )}

            {role === 'BRANCH_MANAGER' && (
              <BranchManagerDashboard stats={stats} loading={loading} />
            )}

            {role === 'SUPERINTENDENT' && (
              <SuperintendentDashboard stats={stats} loading={loading} />
            )}

            {(role === 'ROOT_SUPERADMIN' || role === 'SUPERADMIN' || role === 'ADMIN') && (
              <AdminDashboard stats={stats} loading={loading} projects={projects} />
            )}

            {role === 'AUDITOR' && (
              <AuditorDashboard />
            )}

            {role === 'GENERAL_CONTRACTOR' && (
              <GCDashboard />
            )}

            {role === 'SYSTEM_ADMIN' && (
              <SystemAdminDashboard stats={stats} />
            )}

            {!role && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card>
                  <h3 className="text-lg font-semibold mb-2">Active Projects</h3>
                  <p className="text-3xl font-bold text-primary">
                    {projectsLoading ? '...' : projects.length}
                  </p>
                </Card>
              </div>
            )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  role_display?: string;
  username?: string;
}

interface LimitedUsersByRoleSectionProps {
  usersByRole: Record<string, User[]>;
  router: ReturnType<typeof useRouter>;
}

// Helper component to display users by role (limited for dashboard)
function LimitedUsersByRoleSection({ usersByRole, router }: LimitedUsersByRoleSectionProps) {
  if (!usersByRole || Object.keys(usersByRole).length === 0) {
    return (
      <Card title="All Users by Role">
        <p className="text-center text-gray-500 py-4">No users found</p>
      </Card>
    );
  }

  const roleOrder = [
    'ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'SYSTEM_ADMIN',
    'PROJECT_MANAGER', 'SUPERINTENDENT', 'GENERAL_CONTRACTOR', 'FOREMAN',
    'LABORER', 'MASON', 'OPERATOR', 'BRICKLAYER', 'PLASTER',
    'HR', 'FINANCE', 'AUDITOR'
  ];

  // Get total users count
  const totalUsers = Object.values(usersByRole).reduce((sum: number, users: User[] | undefined) => sum + (users?.length || 0), 0);
  
  // Limit to first 6 users across all roles
  let displayedCount = 0;
  const maxDisplay = 6;

  return (
    <Card title="All Users by Role">
      <div className="space-y-4">
        {roleOrder.map((roleKey) => {
          const users = usersByRole[roleKey] || [];
          if (users.length === 0 || displayedCount >= maxDisplay) return null;

          const roleDisplay = users[0]?.role_display || roleKey;
          const usersToShow = users.slice(0, maxDisplay - displayedCount);
          displayedCount += usersToShow.length;
          
          return (
            <div key={roleKey} className="border-b last:border-0 pb-3 last:pb-0">
              <h4 className="font-semibold text-gray-900 mb-2 flex items-center text-sm">
                <UserGroupIcon className="h-4 w-4 mr-2 text-primary" />
                {roleDisplay} ({users.length})
              </h4>
              <div className="space-y-1">
                {usersToShow.map((u: User) => (
                  <div
                    key={u.id}
                    className="flex items-center space-x-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/users/${u.id}`)}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {u.first_name || u.username}
                        {u.last_name && ` ${u.last_name}`}
                      </p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {totalUsers > maxDisplay && (
          <div className="pt-2 border-t">
            <button
              onClick={() => router.push('/users')}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
            >
              <span>View All Users ({totalUsers})</span>
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

// Helper component to display users by role (full version for other dashboards)
interface UsersByRoleSectionProps {
  usersByRole: Record<string, User[]>;
  title?: string;
}

function UsersByRoleSection({ usersByRole, title = 'Users by Role' }: UsersByRoleSectionProps) {
  if (!usersByRole || Object.keys(usersByRole).length === 0) {
    return null;
  }

  const roleOrder = [
    'ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'SYSTEM_ADMIN',
    'PROJECT_MANAGER', 'SUPERINTENDENT', 'GENERAL_CONTRACTOR', 'FOREMAN',
    'LABORER', 'MASON', 'OPERATOR', 'BRICKLAYER', 'PLASTER',
    'HR', 'FINANCE', 'AUDITOR'
  ];

  return (
    <Card title={title}>
      <div className="space-y-6">
        {roleOrder.map((roleKey) => {
          const users = usersByRole[roleKey] || [];
          if (users.length === 0) return null;

          const roleDisplay = users[0]?.role_display || roleKey;
          
          return (
            <div key={roleKey} className="border-b last:border-0 pb-4 last:pb-0">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                <UserGroupIcon className="h-5 w-5 mr-2 text-primary" />
                {roleDisplay} ({users.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {users.map((u: User) => (
                  <div
                    key={u.id}
                    className="flex items-center space-x-2 p-2 rounded hover:bg-gray-50"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {u.first_name || u.username}
                        {u.last_name && ` ${u.last_name}`}
                      </p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

interface AdminDashboardProps {
  stats: DashboardStats | null;
  loading: boolean;
  projects: Project[];
}

interface Project {
  id: number;
  name: string;
  job_number: string;
  status: string;
}

// Admin Dashboard Component
function AdminDashboard({ stats, loading, projects, timeStats, timeLoading }: AdminDashboardProps) {
  const router = useRouter();
  
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Main Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/projects')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Projects</p>
              <p className="text-3xl font-bold text-primary">
                {loading ? '...' : stats?.total_projects || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                From imported jobs database
              </p>
            </div>
            <FolderIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/users')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Employees</p>
              <p className="text-3xl font-bold text-primary">
                {loading ? '...' : stats?.total_employees || stats?.total_users || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {stats?.active_employees || 0} active
                {stats?.inactive_employees && stats.inactive_employees > 0 && ` / ${stats.inactive_employees} inactive`}
              </p>
            </div>
            <UserGroupIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/branches')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Branches</p>
              <p className="text-3xl font-bold text-primary">
                {loading ? '...' : stats?.total_branches || 0}
              </p>
            </div>
            <BuildingOfficeIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
      </div>

      {/* Financial Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/reports')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Contract Value</p>
              <p className="text-xl md:text-2xl font-bold text-primary">
                ${loading ? '...' : (stats?.total_contract_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <CurrencyDollarIcon className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/reports')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Contract Balance</p>
              <p className="text-xl md:text-2xl font-bold text-primary">
                ${loading ? '...' : (stats?.total_contract_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <CurrencyDollarIcon className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/reports')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Estimated Revenue</p>
              <p className="text-xl md:text-2xl font-bold text-green-600">
                ${loading ? '...' : (stats?.revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <ChartBarIcon className="h-10 w-10 text-green-600 opacity-20" />
          </div>
        </Card>
      </div>

      {/* Project Status Cards */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Project Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 md:gap-6">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/projects?status=ACTIVE')}>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Active</p>
              <p className="text-2xl font-bold text-green-600">
                {loading ? '...' : stats?.active_projects || 0}
              </p>
            </div>
          </Card>
          
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/projects?status=INACTIVE')}>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Inactive</p>
              <p className="text-2xl font-bold text-yellow-600">
                {loading ? '...' : stats?.inactive_projects || 0}
              </p>
            </div>
          </Card>
          
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/projects?status=COMPLETED')}>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Completed</p>
              <p className="text-2xl font-bold text-blue-600">
                {loading ? '...' : stats?.completed_projects || 0}
              </p>
            </div>
          </Card>
        </div>
      </div>

    </div>
  );
}

// Branch Manager Dashboard
interface BranchManagerDashboardProps {
  stats: DashboardStats | null;
  loading: boolean;
}

function BranchManagerDashboard({ stats, loading }: BranchManagerDashboardProps) {
  const router = useRouter();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);

  const fetchMeetings = useCallback(async () => {
    try {
      setMeetingsLoading(true);
      const response = await api.get('/meetings/meetings/?limit=5');
      setMeetings(response.data.results || response.data || []);
    } catch (err) {
      console.error('Error fetching meetings:', err);
    } finally {
      setMeetingsLoading(false);
    }
  }, []);

  // Fetch meetings on mount and set up auto-refresh every minute
  useEffect(() => {
    // Fetch immediately
    fetchMeetings();
    
    // Set up interval to fetch every minute (60000ms)
    const intervalId = setInterval(() => {
      fetchMeetings();
    }, 60000); // 60 seconds = 1 minute
    
    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [fetchMeetings]);

  const handleExportPDF = async (meetingId: number) => {
    try {
      const response = await api.get(`/meetings/meetings/${meetingId}/export_pdf/`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `meeting_${meetingId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Error exporting PDF:', err);
    }
  };

  const handleExportExcel = async (meetingId: number) => {
    try {
      const response = await api.get(`/meetings/meetings/${meetingId}/export_excel/`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `meeting_${meetingId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Error exporting Excel:', err);
    }
  };
  
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Division Info */}
      {stats?.division_name && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Your Division</p>
              <p className="text-2xl font-bold text-primary">{stats.division_name}</p>
            </div>
            <BuildingOfficeIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
      )}

      {/* Project Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/projects')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Projects</p>
              <p className="text-3xl font-bold text-primary">
                {loading ? '...' : stats?.total_projects || 0}
              </p>
            </div>
            <FolderIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/projects?status=ACTIVE')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Projects</p>
              <p className="text-3xl font-bold text-green-600">
                {loading ? '...' : stats?.active_projects || 0}
              </p>
            </div>
            <CheckCircleIcon className="h-12 w-12 text-green-600 opacity-20" />
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/projects?status=INACTIVE')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Inactive Projects</p>
              <p className="text-3xl font-bold text-yellow-600">
                {loading ? '...' : stats?.inactive_projects || 0}
              </p>
            </div>
            <ExclamationTriangleIcon className="h-12 w-12 text-yellow-600 opacity-20" />
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/projects?status=COMPLETED')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Completed Projects</p>
              <p className="text-3xl font-bold text-blue-600">
                {loading ? '...' : stats?.completed_projects || 0}
              </p>
            </div>
            <CheckCircleIcon className="h-12 w-12 text-blue-600 opacity-20" />
          </div>
        </Card>
      </div>

      {/* Financial Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/reports')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Contract Value</p>
              <p className="text-xl md:text-2xl font-bold text-primary">
                ${loading ? '...' : (stats?.total_contract_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <CurrencyDollarIcon className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/reports')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Contract Balance</p>
              <p className="text-xl md:text-2xl font-bold text-primary">
                ${loading ? '...' : (stats?.total_contract_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <CurrencyDollarIcon className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/reports')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Revenue</p>
              <p className="text-xl md:text-2xl font-bold text-green-600">
                ${loading ? '...' : (stats?.revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <ChartBarIcon className="h-10 w-10 text-green-600 opacity-20" />
          </div>
        </Card>
      </div>

      {/* Meeting Reports Section */}
      <Card title="Recent Meeting Reports">
        {meetingsLoading ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No meetings found</div>
        ) : (
          <div className="space-y-3">
            {meetings.map((meeting) => (
              <div key={meeting.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">
                    {new Date(meeting.meeting_date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                  <p className="text-sm text-gray-500">
                    {meeting.meeting_jobs_count} job{meeting.meeting_jobs_count !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExportPDF(meeting.id)}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    PDF
                  </button>
                  <button
                    onClick={() => handleExportExcel(meeting.id)}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    Excel
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => router.push('/meetings')}
              className="w-full mt-2 px-4 py-2 text-sm text-primary hover:underline"
            >
              View All Meetings →
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

// Project Manager Dashboard
interface ProjectManagerDashboardProps {
  stats: DashboardStats | null;
  loading: boolean;
  projects?: Project[];
}

function ProjectManagerDashboard({ stats, loading }: ProjectManagerDashboardProps) {
  const router = useRouter();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);

  const fetchMeetings = useCallback(async () => {
    try {
      setMeetingsLoading(true);
      const response = await api.get('/meetings/meetings/?limit=5');
      setMeetings(response.data.results || response.data || []);
    } catch (err) {
      console.error('Error fetching meetings:', err);
    } finally {
      setMeetingsLoading(false);
    }
  }, []);

  // Fetch meetings on mount and set up auto-refresh every minute
  useEffect(() => {
    // Fetch immediately
    fetchMeetings();
    
    // Set up interval to fetch every minute (60000ms)
    const intervalId = setInterval(() => {
      fetchMeetings();
    }, 60000); // 60 seconds = 1 minute
    
    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [fetchMeetings]);

  const handleExportPDF = async (meetingId: number) => {
    try {
      const response = await api.get(`/meetings/meetings/${meetingId}/export_pdf/`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `meeting_${meetingId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Error exporting PDF:', err);
    }
  };

  const handleExportExcel = async (meetingId: number) => {
    try {
      const response = await api.get(`/meetings/meetings/${meetingId}/export_excel/`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `meeting_${meetingId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Error exporting Excel:', err);
    }
  };

  return (
      <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <Card>
          <p className="text-sm text-gray-600">My Projects</p>
          <p className="text-3xl font-bold text-primary">
            {loading ? '...' : stats?.my_projects || 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Active Projects</p>
          <p className="text-3xl font-bold text-primary">
            {loading ? '...' : stats?.active_projects || 0}
          </p>
        </Card>
        <Card>
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600 mr-2" />
            <div>
              <p className="text-sm text-gray-600">Projects at Risk</p>
              <p className="text-3xl font-bold text-red-600">
                {loading ? '...' : stats?.projects_at_risk || 0}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Meeting Reports Section */}
      <Card title="Recent Meeting Reports">
        {meetingsLoading ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No meetings found</div>
        ) : (
          <div className="space-y-3">
            {meetings.map((meeting) => (
              <div key={meeting.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">
                    {new Date(meeting.meeting_date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                  <p className="text-sm text-gray-500">
                    {meeting.meeting_jobs_count} job{meeting.meeting_jobs_count !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExportPDF(meeting.id)}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    PDF
                  </button>
                  <button
                    onClick={() => handleExportExcel(meeting.id)}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    Excel
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => router.push('/meetings')}
              className="w-full mt-2 px-4 py-2 text-sm text-primary hover:underline"
            >
              View All Meetings →
            </button>
          </div>
        )}
      </Card>

      {stats?.team_members && stats.team_members.length > 0 && (
        <Card title="My Team Members">
          <div className="space-y-2">
            {stats.team_members?.map((member: User) => (
              <div key={member.id} className="flex items-center justify-between p-2 border-b last:border-0">
                <div>
                  <p className="font-medium">
                    {member.first_name} {member.last_name}
                  </p>
                  <p className="text-sm text-gray-500">{member.role_display}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// Foreman Dashboard
interface ForemanDashboardProps {
  stats: DashboardStats | null;
  loading: boolean;
}

function ForemanDashboard({ stats, loading }: ForemanDashboardProps) {
  return (
    <div className="space-y-4 md:space-y-6">
      {stats?.crew_members && stats.crew_members.length > 0 && (
        <Card title="My Crew Members">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.crew_members?.map((member: User) => (
              <div key={member.id} className="p-3 border rounded-lg">
                <p className="font-medium">
                  {member.first_name} {member.last_name}
                </p>
                <p className="text-sm text-gray-500">{member.role_display}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// Worker Dashboard
interface WorkerDashboardProps {
  stats: DashboardStats | null;
  loading: boolean;
}

function WorkerDashboard({ stats, loading }: WorkerDashboardProps) {
  return (
    <div className="space-y-4 md:space-y-6">
      {stats?.crew_members && stats.crew_members.length > 0 && (
        <Card title="My Crew Members">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.crew_members?.map((member: User) => (
              <div key={member.id} className="p-3 border rounded-lg">
                <p className="font-medium">
                  {member.first_name} {member.last_name}
                </p>
                <p className="text-sm text-gray-500">{member.role_display}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// HR Dashboard
interface HRDashboardProps {
  stats: DashboardStats | null;
  loading: boolean;
}

function HRDashboard({ stats, loading }: HRDashboardProps) {
  const router = useRouter();
  
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Main Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/users')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Employees</p>
              <p className="text-3xl font-bold text-primary">
                {loading ? '...' : stats?.total_employees || stats?.active_employees || 0}
              </p>
              {stats?.inactive_employees && stats.inactive_employees > 0 && (
                <p className="text-xs text-gray-500 mt-1">{stats.inactive_employees} inactive</p>
              )}
            </div>
            <UserGroupIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/users/invite')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Invitations</p>
              <p className="text-3xl font-bold text-primary">
                {loading ? '...' : stats?.pending_invitations || 0}
              </p>
            </div>
            <UserGroupIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Open Pay Periods</p>
              <p className="text-3xl font-bold text-primary">
                {loading ? '...' : stats?.open_pay_periods || 0}
              </p>
            </div>
            <ChartBarIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/projects')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Projects</p>
              <p className="text-3xl font-bold text-primary">
                {loading ? '...' : stats?.active_projects || 0}
              </p>
            </div>
            <FolderIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
      </div>


      {/* Employees by Role Count */}
      <Card title="Employees by Role">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {(() => {
            // Define all roles in the system
            const allRoles = [
              'ROOT_SUPERADMIN',
              'SUPERADMIN',
              'ADMIN',
              'SYSTEM_ADMIN',
              'PROJECT_MANAGER',
              'SUPERINTENDENT',
              'GENERAL_CONTRACTOR',
              'FOREMAN',
              'LABORER',
              'MASON',
              'OPERATOR',
              'BRICKLAYER',
              'PLASTER',
              'HR',
              'FINANCE',
              'AUDITOR',
            ];
            
            // Get counts from stats, defaulting to 0 if not present
            const roleCounts = stats?.employees_by_role_count || {};
            
            // Filter out WORKER if it exists (should be LABORER now)
            const filteredCounts = { ...roleCounts };
            if ('WORKER' in filteredCounts) {
              delete filteredCounts.WORKER;
            }
            
            // Sort roles
            const roleOrder: Record<string, number> = {
              'ROOT_SUPERADMIN': 1,
              'SUPERADMIN': 2,
              'ADMIN': 3,
              'SYSTEM_ADMIN': 4,
              'PROJECT_MANAGER': 5,
              'SUPERINTENDENT': 6,
              'GENERAL_CONTRACTOR': 7,
              'FOREMAN': 8,
              'LABORER': 9,
              'MASON': 10,
              'OPERATOR': 11,
              'BRICKLAYER': 12,
              'PLASTER': 13,
              'HR': 14,
              'FINANCE': 15,
              'AUDITOR': 16,
            };
            
            return allRoles
              .sort((roleA, roleB) => (roleOrder[roleA] || 99) - (roleOrder[roleB] || 99))
              .map((role) => {
                const count = filteredCounts[role] || 0;
                // Format role name for display
                const roleDisplay = role
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (l) => l.toUpperCase());
                
                return (
                  <div
                    key={role}
                    onClick={() => router.push(`/users?role=${role}`)}
                    className="text-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors hover:shadow-md"
                  >
                    <p className="text-2xl font-bold text-primary">{count}</p>
                    <p className="text-xs text-gray-600 mt-1">{roleDisplay}</p>
                  </div>
                );
              });
          })()}
        </div>
      </Card>
    </div>
  );
}

// Finance Dashboard
interface FinanceDashboardProps {
  stats: DashboardStats | null;
  loading: boolean;
}

function FinanceDashboard({ stats, loading }: FinanceDashboardProps) {
  return (
      <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <Card>
          <p className="text-sm text-gray-600">Total Contract Value</p>
          <p className="text-2xl font-bold text-primary">
            ${loading ? '...' : (stats?.total_contract_value || 0).toLocaleString()}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Contract Balance</p>
          <p className="text-2xl font-bold text-primary">
            ${loading ? '...' : (stats?.total_contract_balance || 0).toLocaleString()}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Projects</p>
          <p className="text-3xl font-bold text-primary">
            {loading ? '...' : stats?.projects_count || 0}
          </p>
        </Card>
      </div>

    </div>
  );
}

// Superintendent Dashboard
interface SuperintendentDashboardProps {
  stats: DashboardStats | null;
  loading: boolean;
}

function SuperintendentDashboard({ stats, loading }: SuperintendentDashboardProps) {
  return (
      <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <p className="text-sm text-gray-600">Assigned Projects</p>
          <p className="text-3xl font-bold text-primary">
            {loading ? '...' : stats?.assigned_projects || 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Pending Approvals</p>
          <p className="text-3xl font-bold text-primary">
            {loading ? '...' : stats?.pending_approvals || 0}
          </p>
        </Card>
      </div>

      {stats?.site_workers && stats.site_workers.length > 0 && (
        <Card title="Site Workers">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.site_workers?.map((worker: User) => (
              <div key={worker.id} className="p-3 border rounded-lg">
                <p className="font-medium">
                  {worker.first_name} {worker.last_name}
                </p>
                <p className="text-sm text-gray-500">{worker.role_display}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

    </div>
  );
}

// Auditor Dashboard
function AuditorDashboard() {
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-lg font-semibold mb-4">Read-Only Access</h3>
        <p className="text-gray-600">
          As an Auditor, you have read-only access to view system data and audit logs.
        </p>
      </Card>
    </div>
  );
}

// General Contractor Dashboard
function GCDashboard() {
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-lg font-semibold mb-4">Project Overview</h3>
        <p className="text-gray-600">
          View assigned projects and progress updates.
        </p>
      </Card>

    </div>
  );
}

// System Admin Dashboard
interface SystemAdminDashboardProps {
  stats?: DashboardStats | null;
}

function SystemAdminDashboard({ stats }: SystemAdminDashboardProps = {}) {
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-lg font-semibold mb-4">System Administration</h3>
        <p className="text-gray-600">
          Manage system integrations, configurations, and technical settings.
        </p>
      </Card>

      {stats && <UsersByRoleSection usersByRole={stats.users_by_role || {}} title="All Users by Role" />}
    </div>
  );
}
