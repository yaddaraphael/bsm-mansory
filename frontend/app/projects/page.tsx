'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Input from '@/components/ui/Input';
import { useProjects } from '@/hooks/useProjects';
import { useRouter, usePathname } from 'next/navigation';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';

export default function ProjectsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [projectManagerFilter, setProjectManagerFilter] = useState<string>('');
  const [contractFilter, setContractFilter] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  // Page size options
  const pageSizeOptions = [50, 100, 250, 500, 1000];
  interface Branch {
    id: number;
    name: string;
  }

  interface ProjectManager {
    id: number;
    first_name: string;
    last_name: string;
  }

  const [branches, setBranches] = useState<Branch[]>([]);
  const [projectManagers, setProjectManagers] = useState<ProjectManager[]>([]);
  
  // Project statistics state
  const [projectStats, setProjectStats] = useState<{
    total: number;
    active: number;
    inactive: number;
    completed: number;
    closed: number;
    branch_name?: string;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Debounce search to prevent flickering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Fetch branches and project managers for filters
  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        // Fetch branches - handle 401 gracefully
        try {
          const branchesRes = await api.get('/branches/?status=ACTIVE');
          setBranches(branchesRes.data.results || branchesRes.data || []);
        } catch (branchError) {
          // If 401, user might not be authenticated yet - will retry when auth is ready
          if ((branchError as { response?: { status?: number } })?.response?.status !== 401) {
            console.error('Failed to fetch branches:', branchError);
          }
        }
        
        // Fetch project managers (users with PROJECT_MANAGER role)
        try {
          const pmRes = await api.get('/auth/users/?role=PROJECT_MANAGER');
          setProjectManagers(pmRes.data.results || pmRes.data || []);
        } catch (pmError) {
          // If 401, user might not be authenticated yet - will retry when auth is ready
          if ((pmError as { response?: { status?: number } })?.response?.status !== 401) {
            console.error('Failed to fetch project managers:', pmError);
          }
        }
      } catch (error) {
        console.error('Failed to fetch filter data:', error);
      }
    };
    // Only fetch if user is authenticated
    if (user) {
      fetchFilterData();
    }
  }, [user]);

  const { projects, loading, error, refetch } = useProjects({ 
    search: debouncedSearch, 
    status: statusFilter,
    branch: branchFilter,
  });

  // Refetch projects when navigating to this page
  useEffect(() => {
    if (pathname === '/projects' && user) {
      // Refetch when route changes to ensure fresh data
      refetch();
    }
  }, [pathname]);

  // Fetch project statistics
  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return;
      
      try {
        setStatsLoading(true);
        const params = new URLSearchParams();
        if (branchFilter) params.append('branch', branchFilter);
        
        const statsRes = await api.get(`/projects/projects/statistics${params.toString() ? '?' + params.toString() : ''}`);
        setProjectStats(statsRes.data);
      } catch (err) {
        console.error('Failed to fetch project statistics:', err);
      } finally {
        setStatsLoading(false);
      }
    };
    
    fetchStats();
  }, [user, branchFilter]);


  interface Project {
    schedule_status?: { status: string };
  }

  const getScheduleStatus = (project: Project) => {
    if (project.schedule_status) {
      return project.schedule_status.status;
    }
    return 'GREEN';
  };

  const canCreateProject = ['ROOT_SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER'].includes(user?.role || '');

  // Filter projects based on all filters
  const filteredProjects = projects.filter((project) => {
    if (projectManagerFilter && project.project_manager !== parseInt(projectManagerFilter)) return false;
    if (contractFilter && !project.general_contractor?.toLowerCase().includes(contractFilter.toLowerCase())) return false;
    return true;
  });

  // Pagination calculations
  const getPaginatedData = <T,>(data: T[], page: number, size: number) => {
    const startIndex = (page - 1) * size;
    const endIndex = startIndex + size;
    return data.slice(startIndex, endIndex);
  };

  const getTotalPages = (dataLength: number, size: number) => {
    return Math.ceil(dataLength / size) || 1;
  };

  // Paginated projects
  const paginatedProjects = getPaginatedData(filteredProjects, currentPage, pageSize);
  const totalPages = getTotalPages(filteredProjects.length, pageSize);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, branchFilter, projectManagerFilter, contractFilter, debouncedSearch]);

  // Pagination component
  const PaginationControls = ({
    currentPage: page,
    totalPages: total,
    pageSize: size,
    onPageChange,
    onPageSizeChange,
    totalItems,
  }: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    totalItems: number;
  }) => {
    const startItem = (page - 1) * size + 1;
    const endItem = Math.min(page * size, totalItems);

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-4 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-700 flex items-center gap-2">
            Show:
            <select
              value={size}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1); // Reset to first page when changing page size
              }}
              className="ml-2 px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <span className="text-sm text-gray-700">
            Showing {startItem} to {endItem} of {totalItems} results
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, total) }, (_, i) => {
              let pageNum: number;
              if (total <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= total - 2) {
                pageNum = total - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`px-3 py-1 text-sm border rounded-md ${
                    page === pageNum
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page === total}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

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
        <div className="flex-1 flex flex-col min-w-0 sidebar-content">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
                  <p className="text-sm text-gray-600 mt-1">
                    Projects are automatically imported from Spectrum. They update every hour or when you manually sync from Spectrum.
                  </p>
                </div>
            </div>

            {error && (
              <Card className="mb-6">
                <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded">
                  <p className="text-sm font-medium">{error}</p>
                </div>
              </Card>
            )}

            {/* Project Statistics Cards - Only show for Admin and Superadmin */}
            {(user?.role === 'ROOT_SUPERADMIN' || user?.role === 'ADMIN') && (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
                <Card>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Total Projects</p>
                    <p className="text-2xl font-bold text-primary">
                      {statsLoading ? '...' : projectStats?.total || 0}
                    </p>
                    {branchFilter && projectStats?.branch_name && (
                      <p className="text-xs text-gray-500 mt-1">{projectStats.branch_name}</p>
                    )}
                  </div>
                </Card>
                <Card>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Active</p>
                    <p className="text-2xl font-bold text-green-600">
                      {statsLoading ? '...' : projectStats?.active || 0}
                    </p>
                  </div>
                </Card>
                <Card>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Inactive</p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {statsLoading ? '...' : projectStats?.inactive || 0}
                    </p>
                  </div>
                </Card>
                <Card>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Completed</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {statsLoading ? '...' : projectStats?.completed || 0}
                    </p>
                  </div>
                </Card>
              </div>
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
                    <option value="INACTIVE">Inactive</option>
                    <option value="COMPLETED">Completed</option>
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
                    value={projectManagerFilter}
                    onChange={(e) => setProjectManagerFilter(e.target.value)}
                    className="input-field"
                  >
                    <option value="">All Project Managers</option>
                    {projectManagers.map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        {pm.first_name} {pm.last_name}
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
                </div>
              </div>
            </Card>

            {loading && projects.length > 0 ? (
              <div className="text-center py-8">
                <LoadingSpinner />
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {paginatedProjects.map((project) => {
                    const projectStatus = project.spectrum_status_code 
                      ? (project.spectrum_status_code === 'A' ? 'ACTIVE' 
                         : project.spectrum_status_code === 'I' ? 'INACTIVE'
                         : project.spectrum_status_code === 'C' ? 'COMPLETED'
                         : project.status)
                      : project.status;
                    
                    const statusColor = projectStatus === 'ACTIVE' ? 'bg-green-100 text-green-800 border-green-300'
                      : projectStatus === 'INACTIVE' ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                      : projectStatus === 'COMPLETED' ? 'bg-blue-100 text-blue-800 border-blue-300'
                      : 'bg-gray-100 text-gray-800 border-gray-300';
                    
                    const indicatorColor = projectStatus === 'ACTIVE' ? 'bg-green-500'
                      : projectStatus === 'INACTIVE' ? 'bg-yellow-500'
                      : projectStatus === 'COMPLETED' ? 'bg-blue-500'
                      : 'bg-gray-500';

                    return (
                      <Card
                        key={project.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow !p-3 md:!p-4"
                        onClick={() => {
                          const jobNumber = project.job_number || project.id;
                          router.push(`/projects/${jobNumber}`);
                        }}
                      >
                        <div className="flex items-start gap-2 md:gap-3">
                          {/* Status Indicator - Always on the side */}
                          <div className="flex-shrink-0 flex items-center justify-center pt-1">
                            <div className={`w-3 h-3 rounded-full ${indicatorColor}`} />
                          </div>
                          
                          {/* Main Content - Takes remaining space */}
                          <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-7 gap-2 md:gap-3">
                            {/* Project Name and Job Number */}
                            <div className="md:col-span-2">
                              <div className="flex items-start justify-between mb-1">
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-base font-semibold text-gray-900 truncate">{project.name}</h3>
                                  <p className="text-xs text-gray-500 truncate mt-0.5">{project.job_number}</p>
                                </div>
                                <span className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded border ${statusColor}`}>
                                  {projectStatus}
                                </span>
                              </div>
                            </div>
                            
                            {/* Branch */}
                            <div className="md:col-span-1">
                              <p className="text-xs text-gray-500 mb-0.5">Branch</p>
                              <p className="text-xs font-medium text-gray-900 truncate">{project.branch_detail?.name || 'N/A'}</p>
                            </div>
                            
                            {/* Project Manager */}
                            <div className="md:col-span-1">
                              <p className="text-xs text-gray-500 mb-0.5">Project Manager</p>
                              <p className="text-xs font-medium text-gray-900 truncate">
                                {project.project_manager_detail 
                                  ? `${project.project_manager_detail.first_name || ''} ${project.project_manager_detail.last_name || ''}`.trim()
                                  : project.spectrum_project_manager_name || 'N/A'}
                              </p>
                            </div>
                            
                            {/* Progress */}
                            <div className="md:col-span-1">
                              <p className="text-xs text-gray-500 mb-0.5">Progress</p>
                              <p className="text-xs font-medium text-gray-900">
                                {project.production_percent_complete?.toFixed(1) || 0}%
                              </p>
                            </div>
                            
                            {/* Projected Complete Date */}
                            <div className="md:col-span-1">
                              <p className="text-xs text-gray-500 mb-0.5">Projected Complete</p>
                              <p className="text-xs font-medium text-gray-900">
                                {(() => {
                                  const dateValue = project.projected_complete_date;
                                  if (!dateValue || dateValue === 'null' || dateValue === '') {
                                    return 'N/A';
                                  }
                                  try {
                                    const date = new Date(dateValue);
                                    if (!isNaN(date.getTime()) && date.getFullYear() > 1900) {
                                      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                    }
                                  } catch (e) {
                                    // Silently handle parsing errors
                                  }
                                  return 'N/A';
                                })()}
                              </p>
                            </div>
                            
                            {/* Actual Complete Date */}
                            <div className="md:col-span-1">
                              <p className="text-xs text-gray-500 mb-0.5">Actual Complete</p>
                              <p className="text-xs font-medium text-gray-900">
                                {(() => {
                                  const dateValue = project.actual_complete_date;
                                  if (!dateValue || dateValue === 'null' || dateValue === '') {
                                    return 'N/A';
                                  }
                                  try {
                                    const date = new Date(dateValue);
                                    if (!isNaN(date.getTime()) && date.getFullYear() > 1900) {
                                      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                    }
                                  } catch (e) {
                                    // Silently handle parsing errors
                                  }
                                  return 'N/A';
                                })()}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
                
                {filteredProjects.length > 0 && (
                  <Card className="mt-6">
                    <PaginationControls
                      currentPage={currentPage}
                      totalPages={totalPages}
                      pageSize={pageSize}
                      onPageChange={setCurrentPage}
                      onPageSizeChange={(size) => {
                        setPageSize(size);
                        setCurrentPage(1);
                      }}
                      totalItems={filteredProjects.length}
                    />
                  </Card>
                )}
              </>
            )}

            {!loading && filteredProjects.length === 0 && (
              <Card>
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">No projects found</p>
                  <p className="text-sm text-gray-500 mt-2">
                    {user?.role === 'BRANCH_MANAGER' 
                      ? 'No projects found in your division. Projects are automatically imported from Spectrum.'
                      : 'Projects are automatically imported from Spectrum. Sync jobs from Spectrum to see projects here.'}
                  </p>
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

