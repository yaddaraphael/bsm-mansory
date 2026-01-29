// frontend/app/projects/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Input from '@/components/ui/Input';

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProjects';

interface Branch {
 id: number;
 name: string;
}

interface ProjectManager {
 id: number;
 first_name: string;
 last_name: string;
}

interface Project {
 id: number;
 job_number: string;
 name: string;
 project_manager?: number;
 spectrum_status_code?: string;
 status?: string;

 branch_detail?: {
  id: number;
  name: string;
 };

 project_manager_detail?: {
  id: number;
  first_name: string;
  last_name: string;
 };

 spectrum_project_manager_name?: string;
 production_percent_complete?: number;
 projected_complete_date?: string;
 actual_complete_date?: string;
}

/** Fast + safe date formatting */
const formatDate = (dateValue?: string | null | unknown) => {
 if (!dateValue || dateValue === 'null' || dateValue === '') return 'N/A';
 if (typeof dateValue !== 'string') return 'N/A';
 const trimmed = dateValue.trim();
 if (trimmed === '') return 'N/A';
 const d = new Date(trimmed);
 if (Number.isNaN(d.getTime()) || d.getFullYear() <= 1900) return 'N/A';
 return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getProjectStatus = (project: Project) => {
 if (project.spectrum_status_code) {
  if (project.spectrum_status_code === 'A') return 'ACTIVE';
  if (project.spectrum_status_code === 'I') return 'INACTIVE';
  if (project.spectrum_status_code === 'C') return 'COMPLETED';
 }
 return project.status || 'UNKNOWN';
};

const getStatusClasses = (status: string) => {
 const statusColor =
  status === 'ACTIVE'
   ? 'bg-green-100 text-green-800 border-green-300'
   : status === 'INACTIVE'
   ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
   : status === 'COMPLETED'
   ? 'bg-blue-100 text-blue-800 border-blue-300'
   : 'bg-gray-100 text-gray-800 border-gray-300';

 const indicatorColor =
  status === 'ACTIVE'
   ? 'bg-green-500'
   : status === 'INACTIVE'
   ? 'bg-yellow-500'
   : status === 'COMPLETED'
   ? 'bg-blue-500'
   : 'bg-gray-500';

 return { statusColor, indicatorColor };
};

export default function ProjectsPage() {
 const router = useRouter();
 const { user } = useAuth();

 // Filters
 const [search, setSearch] = useState('');
 const [debouncedSearch, setDebouncedSearch] = useState('');
 const [statusFilter, setStatusFilter] = useState('');
 const [branchFilter, setBranchFilter] = useState('');
 const [projectManagerFilter, setProjectManagerFilter] = useState('');

 // Pagination (server-driven)
 const [currentPage, setCurrentPage] = useState(1);
 const [pageSize, setPageSize] = useState(50);
 const pageSizeOptions = [50, 100, 250, 500, 1000];

 // Dropdown data
 const [branches, setBranches] = useState<Branch[]>([]);
 const [projectManagers, setProjectManagers] = useState<ProjectManager[]>([]);

 // Stats
 const [projectStats, setProjectStats] = useState<{
  total: number;
  active: number;
  inactive: number;
  completed: number;
  branch_name?: string;
 } | null>(null);
 const [statsLoading, setStatsLoading] = useState(false);

 // Debounce search
 useEffect(() => {
  const timer = setTimeout(() => setDebouncedSearch(search), 300);
  return () => clearTimeout(timer);
 }, [search]);

 // Reset pagination when filters change
 useEffect(() => {
  setCurrentPage(1);
 }, [statusFilter, branchFilter, projectManagerFilter, debouncedSearch]);

 // ✅ Server-side pagination + filtering
 const { projects, count, loading, error } = useProjects({
  search: debouncedSearch,
  status: statusFilter,
  branch: branchFilter,
  project_manager: projectManagerFilter,
  page: currentPage,
  page_size: pageSize,
  enabled: !!user,
 });

 const totalPages = useMemo(() => Math.max(1, Math.ceil((count || 0) / pageSize)), [count, pageSize]);

 // Fetch branches & project managers for filters (only after auth)
 const userId = user?.id;
 useEffect(() => {
  if (!userId) return;

  let mounted = true;

  const fetchFilterData = async () => {
   try {
    const [branchesRes, pmRes] = await Promise.allSettled([
     api.get('/branches/?status=ACTIVE'),
     api.get('/auth/users/?role=PROJECT_MANAGER'),
    ]);

    if (!mounted) return;

    if (branchesRes.status === 'fulfilled') {
     const data = branchesRes.value.data?.results || branchesRes.value.data || [];
     setBranches(Array.isArray(data) ? data : []);
    }

    if (pmRes.status === 'fulfilled') {
     const data = pmRes.value.data?.results || pmRes.value.data || [];
     setProjectManagers(Array.isArray(data) ? data : []);
    }
   } catch (e) {
    // silent; we log only non-401 below if needed
    console.error('Failed to fetch filter data:', e);
   }
  };

  fetchFilterData();

  return () => {
   mounted = false;
  };
 }, [userId]);

 // Fetch project statistics (only if user exists)
 useEffect(() => {
  if (!user) return;

  let mounted = true;

  const fetchStats = async () => {
   try {
    setStatsLoading(true);

    const params = new URLSearchParams();
    if (branchFilter) params.append('branch', branchFilter);

    const url = `/projects/projects/statistics${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await api.get(url);

    if (!mounted) return;
    setProjectStats(res.data);
   } catch (e) {
    console.error('Failed to fetch project statistics:', e);
   } finally {
    if (mounted) setStatsLoading(false);
   }
  };

  fetchStats();

  return () => {
   mounted = false;
  };
 }, [user, branchFilter]);

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
  const startItem = totalItems === 0 ? 0 : (page - 1) * size + 1;
  const endItem = Math.min(page * size, totalItems);

  return (
   <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-4 py-3 bg-gray-50 border-t border-gray-200">
    <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 w-full sm:w-auto">
     <label className="text-sm text-gray-700 flex items-center gap-2">
      Show:
      <select
       value={size}
       onChange={(e) => {
        onPageSizeChange(Number(e.target.value));
        onPageChange(1);
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

     <span className="text-sm text-gray-700 text-center sm:text-left">
      Showing {startItem} to {endItem} of {totalItems} results
     </span>
    </div>

    <div className="flex items-center gap-2 flex-wrap justify-center">
     <button
      onClick={() => onPageChange(page - 1)}
      disabled={page <= 1}
      className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
     >
      Previous
     </button>

     <div className="flex items-center gap-1">
      {Array.from({ length: Math.min(5, total) }, (_, i) => {
       let pageNum: number;
       if (total <= 5) pageNum = i + 1;
       else if (page <= 3) pageNum = i + 1;
       else if (page >= total - 2) pageNum = total - 4 + i;
       else pageNum = page - 2 + i;

       return (
        <button
         key={pageNum}
         onClick={() => onPageChange(pageNum)}
         className={`px-3 py-1 text-sm border rounded-md ${
          page === pageNum ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-100'
         }`}
        >
         {pageNum}
        </button>
       );
      })}
     </div>

     <button
      onClick={() => onPageChange(page + 1)}
      disabled={page >= total}
      className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
     >
      Next
     </button>
    </div>
   </div>
  );
 };

 // Auth still loading -> show loader (prevents 401 fetch loops)
 if (!user) {
  return (
   <ProtectedRoute>
    <main className="flex-1 p-4 md:p-6 bg-gray-50">
     <div className="max-w-7xl mx-auto">
      <LoadingSpinner />
     </div>
    </main>
   </ProtectedRoute>
  );
 }

 // Initial load
 if (loading && projects.length === 0) {
  return (
   <ProtectedRoute>
    <main className="flex-1 p-4 md:p-6 bg-gray-50">
     <div className="max-w-7xl mx-auto">
      <LoadingSpinner />
     </div>
    </main>
   </ProtectedRoute>
  );
 }

 return (
  <ProtectedRoute>
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

       {(user?.role === 'ROOT_SUPERADMIN' || user?.role === 'ADMIN') && (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
         <Card>
          <div className="text-center">
           <p className="text-sm text-gray-600 mb-1">Total Projects</p>
           <p className="text-2xl font-bold text-primary">{statsLoading ? '...' : projectStats?.total || 0}</p>
           {branchFilter && projectStats?.branch_name && (
            <p className="text-xs text-gray-500 mt-1">{projectStats.branch_name}</p>
           )}
          </div>
         </Card>
         <Card>
          <div className="text-center">
           <p className="text-sm text-gray-600 mb-1">Active</p>
           <p className="text-2xl font-bold text-green-600">{statsLoading ? '...' : projectStats?.active || 0}</p>
          </div>
         </Card>
         <Card>
          <div className="text-center">
           <p className="text-sm text-gray-600 mb-1">Inactive</p>
           <p className="text-2xl font-bold text-yellow-600">{statsLoading ? '...' : projectStats?.inactive || 0}</p>
          </div>
         </Card>
         <Card>
          <div className="text-center">
           <p className="text-sm text-gray-600 mb-1">Completed</p>
           <p className="text-2xl font-bold text-blue-600">{statsLoading ? '...' : projectStats?.completed || 0}</p>
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

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field">
           <option value="">All Statuses</option>
           <option value="ACTIVE">Active</option>
           <option value="INACTIVE">Inactive</option>
           <option value="COMPLETED">Completed</option>
          </select>

          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="input-field">
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
        </div>
       </Card>

       {loading && projects.length > 0 ? (
        <div className="text-center py-8">
         <LoadingSpinner />
        </div>
       ) : (
        <>
         <div className="space-y-4">
          {projects.map((project: Project) => {
           const projectStatus = getProjectStatus(project);
           const { statusColor, indicatorColor } = getStatusClasses(projectStatus);

           return (
            <Card
             key={project.id}
             className="cursor-pointer hover:shadow-lg transition-shadow !p-3 md:!p-4"
             onClick={() => router.push(`/projects/${encodeURIComponent(String(project.id))}`)}
            >
             <div className="flex items-start gap-2 md:gap-3">
              <div className="flex-shrink-0 flex items-center justify-center pt-1">
               <div className={`w-3 h-3 rounded-full ${indicatorColor}`} />
              </div>

              <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-7 gap-2 md:gap-3">
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

               <div className="md:col-span-1">
                <p className="text-xs text-gray-500 mb-0.5">Branch</p>
                <p className="text-xs font-medium text-gray-900 truncate">{project.branch_detail?.name || 'N/A'}</p>
               </div>

               <div className="md:col-span-1">
                <p className="text-xs text-gray-500 mb-0.5">Project Manager</p>
                <p className="text-xs font-medium text-gray-900 truncate">
                 {project.project_manager_detail
                  ? `${project.project_manager_detail.first_name || ''} ${project.project_manager_detail.last_name || ''}`.trim()
                  : project.spectrum_project_manager_name || 'N/A'}
                </p>
               </div>

               <div className="md:col-span-1">
                <p className="text-xs text-gray-500 mb-0.5">Progress</p>
                <p className="text-xs font-medium text-gray-900">
                 {typeof project.production_percent_complete === 'number'
                  ? `${project.production_percent_complete.toFixed(1)}%`
                  : '0%'}
                </p>
               </div>

               <div className="md:col-span-1">
                <p className="text-xs text-gray-500 mb-0.5">Projected Complete</p>
                <p className="text-xs font-medium text-gray-900">{formatDate(project.projected_complete_date)}</p>
               </div>

               <div className="md:col-span-1">
                <p className="text-xs text-gray-500 mb-0.5">Actual Complete</p>
                <p className="text-xs font-medium text-gray-900">{formatDate(project.actual_complete_date)}</p>
               </div>
              </div>
             </div>
            </Card>
           );
          })}
         </div>

         {count > 0 && (
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
            totalItems={count}
           />
          </Card>
         )}
        </>
       )}

       {!loading && projects.length === 0 && (
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
  </ProtectedRoute>
 );
}
