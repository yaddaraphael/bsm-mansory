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
  WrenchScrewdriverIcon,
  ChartBarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  BuildingOfficeIcon,
  PlusIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { useActiveClockIn } from '@/hooks/useTimeEntries';
import ClockInWidget from '@/components/dashboard/ClockInWidget';

interface DashboardStats {
  total_projects?: number;
  active_projects?: number;
  total_users?: number;
  employees_by_role_count?: Record<string, number>;
  users_by_role?: Record<string, User[]>;
  total_employees?: number;
  active_employees?: number;
  inactive_employees?: number;
  total_equipment?: number;
  equipment_on_site?: number;
  total_branches?: number;
  total_contract_value?: number;
  total_contract_balance?: number;
  revenue?: number;
  pending_projects?: number;
  completed_projects?: number;
  projects_on_hold?: number;
  equipment_by_status?: Record<string, number>;
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
}

interface TimeStats {
  total_hours?: number;
  regular_hours?: number;
  overtime_hours?: number;
  days_worked?: number;
}

interface DaysWorkedStats {
  days_worked?: number;
  total_entries?: number;
}

export default function DashboardPage() {
  const router = useRouter();

  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { projects, loading: projectsLoading } = useProjects({ status: 'ACTIVE' });

  const [timeStats, setTimeStats] = useState<TimeStats | null>(null);
  const [timeLoading, setTimeLoading] = useState(false);
  const [daysWorkedStats, setDaysWorkedStats] = useState<DaysWorkedStats | null>(null);
  const [daysWorkedLoading, setDaysWorkedLoading] = useState(false);
  const { activeEntry, loading: activeLoading, refetch: refetchActive } = useActiveClockIn();

  useEffect(() => {
    if (user) {
      fetchStats();
      fetchTimeStats();
      fetchDaysWorked();
    }
  }, [user]);

  // Refresh days worked when clock in/out happens
  const handleClockChange = useCallback(() => {
    fetchDaysWorked();
    fetchStats();
    fetchTimeStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await api.get('/auth/dashboard/stats/');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeStats = async () => {
    try {
      setTimeLoading(true);
      const response = await api.get('/time/entries/time_stats/?period=week');
      setTimeStats(response.data);
    } catch (error) {
      console.error('Failed to fetch time stats:', error);
    } finally {
      setTimeLoading(false);
    }
  };

  const fetchDaysWorked = async () => {
    try {
      setDaysWorkedLoading(true);
      const response = await api.get('/time/entries/summary/?period=month');
      setDaysWorkedStats(response.data);
    } catch (error) {
      console.error('Failed to fetch days worked:', error);
    } finally {
      setDaysWorkedLoading(false);
    }
  };

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
                  <button
                    onClick={() => router.push('/projects/new')}
                    className="flex items-center space-x-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm md:text-base"
                  >
                    <PlusIcon className="h-5 w-5" />
                    <span>New Project</span>
                  </button>
                  <button
                    onClick={() => router.push('/equipment/new')}
                    className="flex items-center space-x-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm md:text-base"
                  >
                    <PlusIcon className="h-5 w-5" />
                    <span>Add Equipment</span>
                  </button>
                  {(role === 'ROOT_SUPERADMIN' || role === 'SUPERADMIN' || role === 'ADMIN') && (
                    <button
                      onClick={() => router.push('/branches/new')}
                      className="flex items-center space-x-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm md:text-base"
                    >
                      <PlusIcon className="h-5 w-5" />
                      <span>Add Branch</span>
                    </button>
                  )}
                  {(role === 'ROOT_SUPERADMIN' || role === 'SUPERADMIN' || role === 'ADMIN' || role === 'HR') && (
                    <button
                      onClick={() => router.push('/users/invite')}
                      className="flex items-center space-x-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm md:text-base"
                    >
                      <PlusIcon className="h-5 w-5" />
                      <span>Invite User</span>
                    </button>
                  )}
                  <button
                    onClick={() => router.push('/projects')}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm md:text-base"
                  >
                    <FolderIcon className="h-5 w-5" />
                    <span>View Projects</span>
                    <ArrowRightIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => router.push('/equipment')}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm md:text-base"
                  >
                    <WrenchScrewdriverIcon className="h-5 w-5" />
                    <span>View Equipment</span>
                    <ArrowRightIcon className="h-4 w-4" />
                  </button>
                  {(role === 'ROOT_SUPERADMIN' || role === 'SUPERADMIN' || role === 'ADMIN' || role === 'HR') && (
                    <button
                      onClick={() => router.push('/users')}
                      className="flex items-center space-x-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm md:text-base"
                    >
                      <UserGroupIcon className="h-5 w-5" />
                      <span>View Users</span>
                      <ArrowRightIcon className="h-4 w-4" />
                    </button>
                  )}
                  {(role === 'ROOT_SUPERADMIN' || role === 'SUPERADMIN' || role === 'ADMIN') && (
                    <button
                      onClick={() => router.push('/reports')}
                      className="flex items-center space-x-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm md:text-base"
                    >
                      <ChartBarIcon className="h-5 w-5" />
                      <span>View Reports</span>
                      <ArrowRightIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Role-specific dashboard content */}
            {role === 'PROJECT_MANAGER' && (
              <ProjectManagerDashboard stats={stats} loading={loading} projects={projects} timeStats={timeStats} timeLoading={timeLoading} />
            )}

            {role === 'FOREMAN' && (
              <ForemanDashboard 
                stats={stats} 
                loading={loading} 
                timeStats={timeStats} 
                timeLoading={timeLoading}
                activeEntry={activeEntry}
                activeLoading={activeLoading}
                refetchActive={refetchActive}
                onClockChange={handleClockChange}
                daysWorkedStats={daysWorkedStats}
                daysWorkedLoading={daysWorkedLoading}
              />
            )}

            {(role === 'LABORER' || role === 'MASON' || role === 'OPERATOR' || role === 'BRICKLAYER' || role === 'PLASTER') && (
              <WorkerDashboard 
                stats={stats} 
                loading={loading} 
                timeStats={timeStats} 
                timeLoading={timeLoading}
                activeEntry={activeEntry}
                activeLoading={activeLoading}
                refetchActive={refetchActive}
                onClockChange={handleClockChange}
                daysWorkedStats={daysWorkedStats}
                daysWorkedLoading={daysWorkedLoading}
              />
            )}

            {role === 'HR' && (
              <HRDashboard stats={stats} loading={loading} timeStats={timeStats} timeLoading={timeLoading} />
            )}

            {role === 'FINANCE' && (
              <FinanceDashboard stats={stats} loading={loading} timeStats={timeStats} timeLoading={timeLoading} />
            )}

            {role === 'SUPERINTENDENT' && (
              <SuperintendentDashboard stats={stats} loading={loading} timeStats={timeStats} timeLoading={timeLoading} />
            )}

            {(role === 'ROOT_SUPERADMIN' || role === 'SUPERADMIN' || role === 'ADMIN') && (
              <AdminDashboard stats={stats} loading={loading} projects={projects} timeStats={timeStats} timeLoading={timeLoading} />
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
  timeStats: TimeStats | null;
  timeLoading: boolean;
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
              {stats?.active_projects && stats.active_projects > 0 && (
                <p className="text-xs text-gray-500 mt-1">{stats.active_projects} active</p>
              )}
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
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/equipment')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Equipment</p>
              <p className="text-3xl font-bold text-primary">
                {loading ? '...' : stats?.total_equipment || 0}
              </p>
              {stats?.equipment_on_site && stats.equipment_on_site > 0 && (
                <p className="text-xs text-gray-500 mt-1">{stats.equipment_on_site} on site</p>
              )}
            </div>
            <WrenchScrewdriverIcon className="h-12 w-12 text-primary opacity-20" />
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/projects?status=ACTIVE')}>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Active Projects</p>
              <p className="text-2xl font-bold text-green-600">
                {loading ? '...' : stats?.active_projects || 0}
              </p>
            </div>
          </Card>
          
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/projects?status=PENDING')}>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Pending Projects</p>
              <p className="text-2xl font-bold text-yellow-600">
                {loading ? '...' : stats?.pending_projects || 0}
              </p>
            </div>
          </Card>
          
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/projects?status=COMPLETED')}>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Completed Projects</p>
              <p className="text-2xl font-bold text-blue-600">
                {loading ? '...' : stats?.completed_projects || 0}
              </p>
            </div>
          </Card>
          
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/projects?status=ON_HOLD')}>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">On Hold Projects</p>
              <p className="text-2xl font-bold text-red-600">
                {loading ? '...' : stats?.projects_on_hold || 0}
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Equipment Status Cards */}
      {stats?.equipment_by_status && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Equipment Status</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/equipment?status=IN_YARD')}>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Equipment In Yard</p>
                <p className="text-2xl font-bold text-primary">
                  {loading ? '...' : stats.equipment_by_status.in_yard || 0}
                </p>
              </div>
            </Card>
            
            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/equipment?status=ON_SITE')}>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Equipment On Site</p>
                <p className="text-2xl font-bold text-green-600">
                  {loading ? '...' : stats.equipment_by_status.on_site || 0}
                </p>
              </div>
            </Card>
            
            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/equipment?status=IN_TRANSIT')}>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Equipment In Transit</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {loading ? '...' : stats.equipment_by_status.in_transit || 0}
                </p>
              </div>
            </Card>
            
            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/equipment?status=MAINTENANCE')}>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Equipment In Maintenance</p>
                <p className="text-2xl font-bold text-red-600">
                  {loading ? '...' : stats.equipment_by_status.maintenance || 0}
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}

      <TimeTrackingCards timeStats={timeStats} timeLoading={timeLoading} period="week" />

      {/* Recent Projects and Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card title="Recent Projects">
          <div className="space-y-4">
            {projects.slice(0, 6).map((project: Project) => (
              <div 
                key={project.id} 
                className="flex items-center justify-between p-3 border-b last:border-0 hover:bg-gray-50 rounded cursor-pointer"
                onClick={() => router.push(`/projects/${project.id}`)}
              >
                <div>
                  <p className="font-medium">{project.name}</p>
                  <p className="text-sm text-gray-500">{project.job_number}</p>
                </div>
                <StatusBadge status={project.status} size="sm" />
              </div>
            ))}
            {projects.length === 0 && (
              <p className="text-center text-gray-500 py-4">No projects found</p>
            )}
            {projects.length > 6 && (
              <div className="pt-2 border-t">
                <button
                  onClick={() => router.push('/projects')}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
                >
                  <span>View All Projects</span>
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </Card>

        <LimitedUsersByRoleSection usersByRole={stats?.users_by_role || {}} router={router} />
      </div>
    </div>
  );
}

// Project Manager Dashboard
interface ProjectManagerDashboardProps {
  stats: DashboardStats | null;
  loading: boolean;
  projects?: Project[];
  timeStats?: TimeStats | null;
  timeLoading?: boolean;
}

function ProjectManagerDashboard({ stats, loading }: ProjectManagerDashboardProps) {
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
interface TimeEntry {
  id: number;
  clock_in: string;
  clock_out?: string;
  project?: number;
  [key: string]: unknown;
}

interface ForemanDashboardProps {
  stats: DashboardStats | null;
  loading: boolean;
  timeStats: TimeStats | null;
  timeLoading: boolean;
  activeEntry: TimeEntry | null;
  activeLoading: boolean;
  refetchActive: () => void;
  onClockChange: () => void;
  daysWorkedStats: DaysWorkedStats | null;
  daysWorkedLoading: boolean;
}

function ForemanDashboard({ stats, loading, timeStats, timeLoading, activeEntry, activeLoading, refetchActive, onClockChange, daysWorkedStats, daysWorkedLoading }: ForemanDashboardProps) {
  const [weeklyStats, setWeeklyStats] = useState<TimeStats | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState<TimeStats | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  useEffect(() => {
    const fetchWeekly = async () => {
      try {
        setWeeklyLoading(true);
        const response = await api.get('/time/entries/time_stats/?period=week');
        setWeeklyStats(response.data);
      } catch (error) {
        console.error('Failed to fetch weekly stats:', error);
      } finally {
        setWeeklyLoading(false);
      }
    };

    const fetchMonthly = async () => {
      try {
        setMonthlyLoading(true);
        const response = await api.get('/time/entries/time_stats/?period=month');
        setMonthlyStats(response.data);
      } catch (error) {
        console.error('Failed to fetch monthly stats:', error);
      } finally {
        setMonthlyLoading(false);
      }
    };

    fetchWeekly();
    fetchMonthly();
  }, []);

  // Refresh stats when onClockChange is called (parent will trigger this)
  // We'll refresh weekly/monthly stats periodically or when explicitly needed

  return (
      <div className="space-y-4 md:space-y-6">
      {/* Desktop: Two columns, Mobile: Stack */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <ClockInWidget 
          activeEntry={activeEntry}
          activeLoading={activeLoading}
          refetchActive={refetchActive}
          onClockChange={onClockChange}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Today&apos;s Status</p>
              <p className="text-2xl font-bold text-primary">
                {loading ? '...' : stats?.clocked_in ? (
                  <span className="flex items-center">
                    <CheckCircleIcon className="h-6 w-6 text-green-600 mr-2" />
                    Clocked In
                  </span>
                ) : 'Not Clocked In'}
              </p>
            </div>
            <ClockIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Today&apos;s Hours</p>
          <p className="text-3xl font-bold text-primary">
            {loading ? '...' : stats?.today_hours?.toFixed(2) || '0.00'} hrs
          </p>
        </Card>
        </div>
      </div>

      {/* Weekly and Monthly Cards - Desktop only */}
      <div className="hidden lg:grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">This Week</p>
              <p className="text-2xl font-bold text-primary">
                {weeklyLoading ? '...' : (weeklyStats?.total_hours || 0).toFixed(2)} hrs
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {weeklyStats?.regular_hours?.toFixed(2) || '0.00'} reg / {weeklyStats?.overtime_hours?.toFixed(2) || '0.00'} OT
              </p>
            </div>
            <ChartBarIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">This Month</p>
              <p className="text-2xl font-bold text-primary">
                {monthlyLoading ? '...' : (monthlyStats?.total_hours || 0).toFixed(2)} hrs
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {monthlyStats?.regular_hours?.toFixed(2) || '0.00'} reg / {monthlyStats?.overtime_hours?.toFixed(2) || '0.00'} OT
              </p>
            </div>
            <ChartBarIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
      </div>

      {/* Days Worked Card */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Total Days Worked (This Month)</p>
            <p className="text-3xl font-bold text-primary">
              {daysWorkedLoading ? '...' : daysWorkedStats?.days_worked || 0}
            </p>
          </div>
          <CheckCircleIcon className="h-12 w-12 text-primary opacity-20" />
        </div>
      </Card>

      <TimeTrackingCards timeStats={timeStats} timeLoading={timeLoading} period="week" />

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

// Time Tracking Cards Component
interface TimeTrackingCardsProps {
  timeStats: TimeStats | null;
  timeLoading: boolean;
  period?: string;
}

function TimeTrackingCards({ timeStats, timeLoading, period = 'week' }: TimeTrackingCardsProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Time Tracking ({period === 'day' ? 'Today' : period === 'week' ? 'This Week' : 'This Month'})</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Hours</p>
              <p className="text-3xl font-bold text-primary">
                {timeLoading ? '...' : (timeStats?.total_hours || 0).toFixed(2)}
              </p>
            </div>
            <ClockIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Regular Hours</p>
              <p className="text-3xl font-bold text-green-600">
                {timeLoading ? '...' : (timeStats?.regular_hours || 0).toFixed(2)}
              </p>
            </div>
            <CheckCircleIcon className="h-12 w-12 text-green-600 opacity-20" />
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Overtime Hours</p>
              <p className="text-3xl font-bold text-orange-600">
                {timeLoading ? '...' : (timeStats?.overtime_hours || 0).toFixed(2)}
              </p>
            </div>
            <ExclamationTriangleIcon className="h-12 w-12 text-orange-600 opacity-20" />
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Days Worked</p>
              <p className="text-3xl font-bold text-primary">
                {timeLoading ? '...' : timeStats?.days_worked || 0}
              </p>
            </div>
            <ChartBarIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
      </div>
    </div>
  );
}

// Worker Dashboard
function WorkerDashboard({ stats, loading, timeStats, timeLoading, activeEntry, activeLoading, refetchActive, onClockChange, daysWorkedStats, daysWorkedLoading }: ForemanDashboardProps) {
  const [weeklyStats, setWeeklyStats] = useState<TimeStats | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState<TimeStats | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  useEffect(() => {
    const fetchWeekly = async () => {
      try {
        setWeeklyLoading(true);
        const response = await api.get('/time/entries/time_stats/?period=week');
        setWeeklyStats(response.data);
      } catch (error) {
        console.error('Failed to fetch weekly stats:', error);
      } finally {
        setWeeklyLoading(false);
      }
    };

    const fetchMonthly = async () => {
      try {
        setMonthlyLoading(true);
        const response = await api.get('/time/entries/time_stats/?period=month');
        setMonthlyStats(response.data);
      } catch (error) {
        console.error('Failed to fetch monthly stats:', error);
      } finally {
        setMonthlyLoading(false);
      }
    };

    fetchWeekly();
    fetchMonthly();
  }, []);

  // Refresh stats when onClockChange is called (parent will trigger this)
  // We'll refresh weekly/monthly stats periodically or when explicitly needed

  return (
      <div className="space-y-4 md:space-y-6">
      {/* Desktop: Two columns, Mobile: Stack */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <ClockInWidget 
          activeEntry={activeEntry}
          activeLoading={activeLoading}
          refetchActive={refetchActive}
          onClockChange={onClockChange}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Today&apos;s Status</p>
              <p className="text-2xl font-bold text-primary">
                {loading ? '...' : stats?.clocked_in ? (
                  <span className="flex items-center">
                    <CheckCircleIcon className="h-6 w-6 text-green-600 mr-2" />
                    Clocked In
                  </span>
                ) : 'Not Clocked In'}
              </p>
            </div>
            <ClockIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Today&apos;s Hours</p>
          <p className="text-3xl font-bold text-primary">
            {loading ? '...' : stats?.today_hours?.toFixed(2) || '0.00'} hrs
          </p>
        </Card>
        </div>
      </div>

      {/* Weekly and Monthly Cards - Desktop only */}
      <div className="hidden lg:grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">This Week</p>
              <p className="text-2xl font-bold text-primary">
                {weeklyLoading ? '...' : (weeklyStats?.total_hours || 0).toFixed(2)} hrs
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {weeklyStats?.regular_hours?.toFixed(2) || '0.00'} reg / {weeklyStats?.overtime_hours?.toFixed(2) || '0.00'} OT
              </p>
            </div>
            <ChartBarIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">This Month</p>
              <p className="text-2xl font-bold text-primary">
                {monthlyLoading ? '...' : (monthlyStats?.total_hours || 0).toFixed(2)} hrs
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {monthlyStats?.regular_hours?.toFixed(2) || '0.00'} reg / {monthlyStats?.overtime_hours?.toFixed(2) || '0.00'} OT
              </p>
            </div>
            <ChartBarIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
      </div>

      {/* Days Worked Card */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Total Days Worked (This Month)</p>
            <p className="text-3xl font-bold text-primary">
              {daysWorkedLoading ? '...' : daysWorkedStats?.days_worked || 0}
            </p>
          </div>
          <CheckCircleIcon className="h-12 w-12 text-primary opacity-20" />
        </div>
      </Card>

      <TimeTrackingCards timeStats={timeStats} timeLoading={timeLoading} period="week" />
    </div>
  );
}

// HR Dashboard
interface HRDashboardProps {
  stats: DashboardStats | null;
  loading: boolean;
  timeStats: TimeStats | null;
  timeLoading: boolean;
}

function HRDashboard({ stats, loading, timeStats, timeLoading }: HRDashboardProps) {
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
        
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/time')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Open Pay Periods</p>
              <p className="text-3xl font-bold text-primary">
                {loading ? '...' : stats?.open_pay_periods || 0}
              </p>
            </div>
            <ClockIcon className="h-12 w-12 text-primary opacity-20" />
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

      <TimeTrackingCards timeStats={timeStats} timeLoading={timeLoading} period="week" />

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

      {/* Equipment Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/equipment')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Equipment</p>
              <p className="text-3xl font-bold text-primary">
                {loading ? '...' : stats?.total_equipment || 0}
              </p>
            </div>
            <WrenchScrewdriverIcon className="h-12 w-12 text-primary opacity-20" />
          </div>
        </Card>
        
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
      </div>

    </div>
  );
}

// Finance Dashboard
interface FinanceDashboardProps {
  stats: DashboardStats | null;
  loading: boolean;
  timeStats?: TimeStats | null;
  timeLoading?: boolean;
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
  timeStats?: TimeStats | null;
  timeLoading?: boolean;
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
