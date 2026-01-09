'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import {
  ChartBarIcon,
  FolderIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface DashboardStats {
  total_users: number;
  total_projects: number;
  active_projects: number;
  total_time_entries: number;
  total_equipment: number;
  [key: string]: unknown;
}

interface Project {
  id: number;
  job_number: string;
  name: string;
  status: string;
  production_percent_complete?: number;
  branch_detail?: {
    name: string;
  };
  [key: string]: unknown;
}

interface TimeEntry {
  id: number;
  date: string;
  total_hours?: number;
  status: string;
  employee_detail?: {
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  project_detail?: {
    job_number?: string;
  };
  [key: string]: unknown;
}

interface Equipment {
  id: number;
  asset_number: string;
  type: string;
  status: string;
  current_assignment?: {
    project_name?: string;
    branch_name?: string;
  };
  [key: string]: unknown;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'time' | 'equipment'>('overview');

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch dashboard stats
      const statsResponse = await api.get('/auth/dashboard/stats/');
      setStats(statsResponse.data);

      // Fetch recent projects
      const projectsResponse = await api.get('/projects/projects/?limit=10');
      setProjects(projectsResponse.data.results || projectsResponse.data || []);

      // Fetch recent time entries
      const timeResponse = await api.get('/time/entries/?limit=20');
      setTimeEntries(timeResponse.data.results || timeResponse.data || []);

      // Fetch equipment
      const equipmentResponse = await api.get('/equipment/equipment/?limit=10');
      setEquipment(equipmentResponse.data.results || equipmentResponse.data || []);
    } catch (error) {
      console.error('Failed to fetch reports data:', error);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN'].includes(user?.role || '');

  if (!isAdmin) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 sidebar-content">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <div className="max-w-7xl mx-auto">
                <Card>
                  <div className="text-center py-8">
                    <p className="text-red-600">You don&apos;t have permission to view reports.</p>
                  </div>
                </Card>
              </div>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (loading) {
    return (
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
    );
  }

  const projectColumns = [
    {
      header: 'Job Number',
      accessor: 'job_number',
    },
    {
      header: 'Name',
      accessor: 'name',
    },
    {
      header: 'Status',
      accessor: (row: Project) => <StatusBadge status={row.status} size="sm" />,
    },
    {
      header: 'Progress',
      accessor: (row: Project) => `${(row.production_percent_complete || 0).toFixed(1)}%`,
    },
    {
      header: 'Branch',
      accessor: (row: Project) => row.branch_detail?.name || 'N/A',
    },
  ];

  const timeColumns = [
    {
      header: 'Employee',
      accessor: (row: TimeEntry) => `${row.employee_detail?.first_name || ''} ${row.employee_detail?.last_name || ''}`.trim() || row.employee_detail?.username || '',
    },
    {
      header: 'Project',
      accessor: (row: TimeEntry) => row.project_detail?.job_number || 'N/A',
    },
    {
      header: 'Date',
      accessor: (row: TimeEntry) => new Date(row.date).toLocaleDateString(),
    },
    {
      header: 'Hours',
      accessor: (row: TimeEntry) => row.total_hours?.toFixed(2) || '0.00',
    },
    {
      header: 'Status',
      accessor: (row: TimeEntry) => <StatusBadge status={row.status} size="sm" />,
    },
  ];

  const equipmentColumns = [
    {
      header: 'Asset Number',
      accessor: 'asset_number',
    },
    {
      header: 'Type',
      accessor: 'type',
    },
    {
      header: 'Status',
      accessor: (row: Equipment) => <StatusBadge status={row.status} size="sm" />,
    },
    {
      header: 'Location',
      accessor: (row: Equipment) => row.current_assignment?.project_name || row.current_assignment?.branch_name || 'N/A',
    },
  ];

  return (
    <ProtectedRoute allowedRoles={['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 sidebar-content">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-7xl mx-auto">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 md:mb-6">Reports & Analytics</h1>

              {/* Tabs */}
            <div className="mb-6 border-b border-gray-200">
              <nav className="flex space-x-4 overflow-x-auto">
                {[
                  { id: 'overview', label: 'Overview', icon: ChartBarIcon },
                  { id: 'projects', label: 'Projects', icon: FolderIcon },
                  { id: 'time', label: 'Time Entries', icon: ClockIcon },
                  { id: 'equipment', label: 'Equipment', icon: WrenchScrewdriverIcon },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as 'overview' | 'projects' | 'time' | 'equipment')}
                    className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <tab.icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{tab.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-4 md:space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                  <Card>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Total Projects</p>
                        <p className="text-3xl font-bold text-primary">
                          {stats?.total_projects || 0}
                        </p>
                      </div>
                      <FolderIcon className="h-12 w-12 text-primary opacity-20" />
                    </div>
                  </Card>
                  <Card>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Active Projects</p>
                        <p className="text-3xl font-bold text-primary">
                          {stats?.active_projects || 0}
                        </p>
                      </div>
                      <ChartBarIcon className="h-12 w-12 text-primary opacity-20" />
                    </div>
                  </Card>
                  <Card>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Active Users</p>
                        <p className="text-3xl font-bold text-primary">
                          {stats?.total_users || 0}
                        </p>
                      </div>
                      <UserGroupIcon className="h-12 w-12 text-primary opacity-20" />
                    </div>
                  </Card>
                  <Card>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Equipment</p>
                        <p className="text-3xl font-bold text-primary">
                          {stats?.total_equipment || 0}
                        </p>
                      </div>
                      <WrenchScrewdriverIcon className="h-12 w-12 text-primary opacity-20" />
                    </div>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  <Card title="Recent Projects">
                    <DataTable
                      data={projects.slice(0, 5)}
                      columns={projectColumns}
                      emptyMessage="No projects found"
                    />
                  </Card>
                  <Card title="Recent Time Entries">
                    <DataTable
                      data={timeEntries.slice(0, 5)}
                      columns={timeColumns}
                      emptyMessage="No time entries found"
                    />
                  </Card>
                </div>
              </div>
            )}

            {/* Projects Tab */}
            {activeTab === 'projects' && (
              <Card>
                <DataTable
                  data={projects}
                  columns={projectColumns}
                  emptyMessage="No projects found"
                />
              </Card>
            )}

            {/* Time Entries Tab */}
            {activeTab === 'time' && (
              <Card>
                <DataTable
                  data={timeEntries}
                  columns={timeColumns}
                  emptyMessage="No time entries found"
                />
              </Card>
            )}

            {/* Equipment Tab */}
            {activeTab === 'equipment' && (
              <Card>
                <DataTable
                  data={equipment}
                  columns={equipmentColumns}
                  emptyMessage="No equipment found"
                />
              </Card>
            )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

