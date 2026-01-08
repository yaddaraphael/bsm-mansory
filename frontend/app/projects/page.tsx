'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Input from '@/components/ui/Input';
import { useProjects } from '@/hooks/useProjects';
import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';

export default function ProjectsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [foremanFilter, setForemanFilter] = useState<string>('');
  const [contractFilter, setContractFilter] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  interface Branch {
    id: number;
    name: string;
  }

  interface Foreman {
    id: number;
    first_name: string;
    last_name: string;
  }

  const [branches, setBranches] = useState<Branch[]>([]);
  const [foremen, setForemen] = useState<Foreman[]>([]);

  // Debounce search to prevent flickering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Fetch branches and foremen for filters
  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        // Fetch branches
        const branchesRes = await api.get('/branches/?status=ACTIVE');
        setBranches(branchesRes.data.results || branchesRes.data || []);
        
        // Fetch foremen (users with FOREMAN role)
        const foremenRes = await api.get('/auth/users/?role=FOREMAN');
        setForemen(foremenRes.data.results || foremenRes.data || []);
      } catch (error) {
        console.error('Failed to fetch filter data:', error);
      }
    };
    fetchFilterData();
  }, []);

  const { projects, loading, error } = useProjects({ 
    search: debouncedSearch, 
    status: statusFilter,
    branch: branchFilter,
  });

  interface Project {
    schedule_status?: { status: string };
  }

  const getScheduleStatus = (project: Project) => {
    if (project.schedule_status) {
      return project.schedule_status.status;
    }
    return 'GREEN';
  };

  const canCreateProject = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER'].includes(user?.role || '');

  if (loading && projects.length === 0) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50">
              <div className="max-w-7xl mx-auto">
                <LoadingSpinner />
              </div>
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
                <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
              {canCreateProject && (
                <button
                  onClick={() => router.push('/projects/new')}
                  className="btn-primary w-full sm:w-auto"
                >
                  + New Project
                </button>
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
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search by job number or name..."
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
                    <option value="PENDING">Pending</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="ON_HOLD">On Hold</option>
                  </select>
                  <select
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    className="input-field"
                  >
                    <option value="">All Branches</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={foremanFilter}
                    onChange={(e) => setForemanFilter(e.target.value)}
                    className="input-field"
                  >
                    <option value="">All Foremen</option>
                    {foremen.map((foreman) => (
                      <option key={foreman.id} value={foreman.id}>
                        {foreman.first_name} {foreman.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    type="text"
                    placeholder="Search by general contractor..."
                    value={contractFilter}
                    onChange={(e) => setContractFilter(e.target.value)}
                  />
                  {canCreateProject && (
                    <button
                      onClick={() => router.push('/projects/new')}
                      className="btn-primary w-full md:w-auto flex items-center justify-center"
                    >
                      + New Project
                    </button>
                  )}
                </div>
              </div>
            </Card>

            {loading && projects.length > 0 ? (
              <div className="text-center py-8">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {projects
                  .filter((project) => {
                    if (foremanFilter && project.foreman !== parseInt(foremanFilter)) return false;
                    if (contractFilter && !project.general_contractor?.toLowerCase().includes(contractFilter.toLowerCase())) return false;
                    return true;
                  })
                  .map((project) => (
                  <Card
                    key={project.id}
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => router.push(`/projects/${project.id}`)}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 truncate">{project.name}</h3>
                        <p className="text-sm text-gray-500 truncate">{project.job_number}</p>
                      </div>
                      <StatusBadge status={getScheduleStatus(project)} size="sm" />
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Branch:</span>
                        <span className="text-gray-900 truncate ml-2">{project.branch_detail?.name || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Status:</span>
                        <span className="text-gray-900">{project.status}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Progress:</span>
                        <span className="text-gray-900">
                          {project.production_percent_complete?.toFixed(1) || 0}%
                        </span>
                      </div>
                      {project.schedule_status && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Forecast:</span>
                          <span className="text-gray-900">
                            {new Date(project.schedule_status.forecast_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {!loading && projects.length === 0 && (
              <Card>
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">No projects found</p>
                  {canCreateProject && (
                    <button
                      onClick={() => router.push('/projects/new')}
                      className="btn-primary"
                    >
                      Create First Project
                    </button>
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

