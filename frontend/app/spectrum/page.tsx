'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import api from '@/lib/api';
import {
  UserGroupIcon,
  FolderIcon,
  DocumentTextIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface SpectrumEmployee {
  id: string | number;
  employee_id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  status?: string;
  [key: string]: unknown;
}

interface SpectrumProject {
  id: string | number;
  project_id?: string;
  name?: string;
  job_number?: string;
  status?: string;
  client?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  [key: string]: unknown;
}

interface SpectrumReport {
  id: string | number;
  report_id?: string;
  title?: string;
  type?: string;
  project?: string;
  created_date?: string;
  status?: string;
  [key: string]: unknown;
}

type TabType = 'employees' | 'projects' | 'reports';

export default function SpectrumPage() {
  const [activeTab, setActiveTab] = useState<TabType>('employees');
  const [employees, setEmployees] = useState<SpectrumEmployee[]>([]);
  const [projects, setProjects] = useState<SpectrumProject[]>([]);
  const [reports, setReports] = useState<SpectrumReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<{ [key in TabType]?: string }>({});

  const fetchSpectrumData = useCallback(async (type: TabType) => {
    setLoading(true);
    setError(null);
    try {
      let response;
      switch (type) {
        case 'employees':
          response = await api.get('/spectrum/employees/');
          setEmployees(response.data.results || response.data || []);
          break;
        case 'projects':
          response = await api.get('/spectrum/projects/');
          setProjects(response.data.results || response.data || []);
          break;
        case 'reports':
          response = await api.get('/spectrum/reports/');
          setReports(response.data.results || response.data || []);
          break;
      }
      setLastSync(prev => ({
        ...prev,
        [type]: new Date().toLocaleString()
      }));
    } catch (err: unknown) {
      const errorMessage = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || 
        `Failed to fetch ${type} from Spectrum`;
      setError(errorMessage);
      console.error(`Error fetching ${type}:`, err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpectrumData(activeTab);
  }, [activeTab, fetchSpectrumData]);

  const handleRefresh = () => {
    fetchSpectrumData(activeTab);
  };

  const tabs = [
    { id: 'employees' as TabType, name: 'Employees', icon: UserGroupIcon },
    { id: 'projects' as TabType, name: 'Projects', icon: FolderIcon },
    { id: 'reports' as TabType, name: 'Reports', icon: DocumentTextIcon },
  ];

  const renderEmployees = () => {
    if (loading && employees.length === 0) {
      return <LoadingSpinner />;
    }

    if (error && employees.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={handleRefresh}>Try Again</Button>
        </div>
      );
    }

    if (employees.length === 0) {
      return (
        <div className="text-center py-8">
          <UserGroupIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">No employees found in Spectrum</p>
        </div>
      );
    }

    return (
      <DataTable
        data={employees}
        columns={[
          {
            header: 'Employee ID',
            accessor: (row: SpectrumEmployee) => row.employee_id || row.id || 'N/A',
          },
          {
            header: 'Name',
            accessor: (row: SpectrumEmployee) => {
              if (row.name) return row.name;
              if (row.first_name || row.last_name) {
                return `${row.first_name || ''} ${row.last_name || ''}`.trim();
              }
              return 'N/A';
            },
          },
          {
            header: 'Email',
            accessor: (row: SpectrumEmployee) => row.email || 'N/A',
          },
          {
            header: 'Phone',
            accessor: (row: SpectrumEmployee) => row.phone || 'N/A',
          },
          {
            header: 'Role',
            accessor: (row: SpectrumEmployee) => row.role || 'N/A',
          },
          {
            header: 'Status',
            accessor: (row: SpectrumEmployee) => (
              <StatusBadge status={row.status || 'ACTIVE'} size="sm" />
            ),
          },
        ]}
        emptyMessage="No employees found"
      />
    );
  };

  const renderProjects = () => {
    if (loading && projects.length === 0) {
      return <LoadingSpinner />;
    }

    if (error && projects.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={handleRefresh}>Try Again</Button>
        </div>
      );
    }

    if (projects.length === 0) {
      return (
        <div className="text-center py-8">
          <FolderIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">No projects found in Spectrum</p>
        </div>
      );
    }

    return (
      <DataTable
        data={projects}
        columns={[
          {
            header: 'Project ID',
            accessor: (row: SpectrumProject) => row.project_id || row.id || 'N/A',
          },
          {
            header: 'Job Number',
            accessor: (row: SpectrumProject) => row.job_number || 'N/A',
          },
          {
            header: 'Name',
            accessor: (row: SpectrumProject) => row.name || 'N/A',
          },
          {
            header: 'Client',
            accessor: (row: SpectrumProject) => row.client || 'N/A',
          },
          {
            header: 'Location',
            accessor: (row: SpectrumProject) => row.location || 'N/A',
          },
          {
            header: 'Status',
            accessor: (row: SpectrumProject) => (
              <StatusBadge status={row.status || 'ACTIVE'} size="sm" />
            ),
          },
          {
            header: 'Start Date',
            accessor: (row: SpectrumProject) => 
              row.start_date ? new Date(row.start_date).toLocaleDateString() : 'N/A',
          },
          {
            header: 'End Date',
            accessor: (row: SpectrumProject) => 
              row.end_date ? new Date(row.end_date).toLocaleDateString() : 'N/A',
          },
        ]}
        emptyMessage="No projects found"
      />
    );
  };

  const renderReports = () => {
    if (loading && reports.length === 0) {
      return <LoadingSpinner />;
    }

    if (error && reports.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={handleRefresh}>Try Again</Button>
        </div>
      );
    }

    if (reports.length === 0) {
      return (
        <div className="text-center py-8">
          <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">No reports found in Spectrum</p>
        </div>
      );
    }

    return (
      <DataTable
        data={reports}
        columns={[
          {
            header: 'Report ID',
            accessor: (row: SpectrumReport) => row.report_id || row.id || 'N/A',
          },
          {
            header: 'Title',
            accessor: (row: SpectrumReport) => row.title || 'N/A',
          },
          {
            header: 'Type',
            accessor: (row: SpectrumReport) => row.type || 'N/A',
          },
          {
            header: 'Project',
            accessor: (row: SpectrumReport) => row.project || 'N/A',
          },
          {
            header: 'Status',
            accessor: (row: SpectrumReport) => (
              <StatusBadge status={row.status || 'ACTIVE'} size="sm" />
            ),
          },
          {
            header: 'Created Date',
            accessor: (row: SpectrumReport) => 
              row.created_date ? new Date(row.created_date).toLocaleDateString() : 'N/A',
          },
        ]}
        emptyMessage="No reports found"
      />
    );
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 sidebar-content">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-7xl mx-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Spectrum Data</h1>
                  <p className="text-gray-600 mt-1">
                    View employees, projects, and reports synced from Trimble Spectrum
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={handleRefresh}
                  disabled={loading}
                  className="flex items-center"
                >
                  <ArrowPathIcon className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-8">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                          flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors
                          ${
                            activeTab === tab.id
                              ? 'border-primary text-primary'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }
                        `}
                      >
                        <Icon className="h-5 w-5 mr-2" />
                        {tab.name}
                        {lastSync[tab.id] && (
                          <span className="ml-2 text-xs text-gray-400">
                            (Synced: {lastSync[tab.id]})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Content */}
              <Card>
                {activeTab === 'employees' && renderEmployees()}
                {activeTab === 'projects' && renderProjects()}
                {activeTab === 'reports' && renderReports()}
              </Card>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
