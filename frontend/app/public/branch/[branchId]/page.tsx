'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import StatusBar from '@/components/ui/StatusBar';

interface Project {
  id: number;
  job_number: string;
  name: string;
  job_description?: string;
  status: string;
  spectrum_status_code?: string;
  branch_name?: string;
  branch_code?: string;
  start_date: string;
  estimated_end_date?: string;
  contract_value?: number;
  production_percent_complete?: number;
  financial_percent_complete?: number;
  is_public: boolean;
  public_pin?: string;
  scopes?: ProjectScope[];
  total_quantity?: number;
  total_installed?: number;
  remaining?: number;
  project_manager_detail?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  project_manager_name?: string;
  schedule_status?: {
    status: string;
    days_late?: number;
  };
}

interface ProjectScope {
  id: number;
  scope_type: number | { id: number; code: string; name: string };
  scope_type_detail?: { id: number; code: string; name: string };
  description?: string;
  estimation_start_date?: string;
  estimation_end_date?: string;
  duration_days?: number;
  qty_sq_ft: number;
  installed: number;
  remaining?: number;
  percent_complete?: number;
  masons?: number;
  tenders?: number;
  operators?: number;
  foreman_detail?: { id: number; name: string };
}

function getProductionPercent(p: Project): number | null {
  if (p.production_percent_complete != null && !Number.isNaN(Number(p.production_percent_complete))) {
    return Number(p.production_percent_complete);
  }

  const ti = p.total_installed;
  const tq = p.total_quantity;
  if (ti != null && tq != null && Number(tq) > 0) {
    return (Number(ti) / Number(tq)) * 100;
  }

  if (Array.isArray(p.scopes) && p.scopes.length > 0) {
    const totals = p.scopes.reduce(
      (acc, s) => {
        acc.qty += Number(s.qty_sq_ft || 0);
        acc.inst += Number(s.installed || 0);
        return acc;
      },
      { qty: 0, inst: 0 }
    );
    if (totals.qty > 0) return (totals.inst / totals.qty) * 100;
  }

  return null;
}

function clampPercent(v: number) {
  return Math.min(100, Math.max(0, v));
}

function formatUserName(user?: { first_name?: string; last_name?: string; username?: string }, fallback?: string) {
  if (!user) return fallback || 'N/A';
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return name || user.username || fallback || 'N/A';
}

function formatDate(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString();
}

function isStartedProject(project: Project) {
  if (!project.start_date) return false;
  const start = new Date(project.start_date);
  if (Number.isNaN(start.getTime())) return false;
  return start <= new Date();
}

function scopeHasProgress(scope: ProjectScope) {
  const pct = scope.percent_complete;
  if (pct != null && Number(pct) > 1) return true;
  const qty = Number(scope.qty_sq_ft || 0);
  const installed = Number(scope.installed || 0);
  if (qty <= 0) return false;
  return (installed / qty) * 100 > 1;
}

function projectHasScopeProgress(project: Project) {
  if (!Array.isArray(project.scopes) || project.scopes.length === 0) return false;
  return project.scopes.some((scope) => scopeHasProgress(scope));
}

function getScopeName(scope: ProjectScope) {
  if (typeof scope.scope_type === 'object') return scope.scope_type.name;
  return scope.scope_type_detail?.name || 'Unknown';
}

function PieChart({
  title,
  data,
}: {
  title: string;
  data: Array<{ label: string; value: number; color: string }>;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const segments = total > 0
    ? data
        .map((item) => `${item.color} ${(item.value / total) * 100}%`)
        .join(', ')
    : '#e5e7eb 100%';

  return (
    <div className="border rounded-lg p-4 bg-white">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">{title}</h4>
      <div className="flex items-center gap-4">
        <div
          className="h-28 w-28 rounded-full"
          style={{ background: `conic-gradient(${segments})` }}
          aria-label={title}
        />
        <div className="space-y-2 text-sm">
          {data.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-gray-700">{item.label}</span>
              <span className="text-gray-900 font-semibold ml-auto">
                {item.value}
                {total > 0 && (
                  <span className="text-gray-500 font-normal ml-1">
                    ({((item.value / total) * 100).toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildAiSummary(project: Project) {
  const productionPercent = getProductionPercent(project);
  const totalQty = project.total_quantity ?? 0;
  const totalInstalled = project.total_installed ?? 0;
  const remaining = project.remaining ?? Math.max(0, Number(totalQty) - Number(totalInstalled));
  const scheduleStatus = project.schedule_status?.status || 'GREEN';

  const scopeStats = Array.isArray(project.scopes)
    ? project.scopes.map((scope) => {
        const qty = Number(scope.qty_sq_ft || 0);
        const installed = Number(scope.installed || 0);
        const pct = scope.percent_complete ?? (qty > 0 ? (installed / qty) * 100 : 0);
        return { scope, qty, installed, pct };
      })
    : [];

  const byRemaining = [...scopeStats].sort((a, b) => (b.qty - b.installed) - (a.qty - a.installed));
  const topRemaining = byRemaining.filter((s) => s.qty > s.installed).slice(0, 3);

  const byProgress = [...scopeStats].sort((a, b) => b.pct - a.pct);
  const topComplete = byProgress.slice(0, 3);

  const statusLine =
    scheduleStatus === 'RED'
      ? 'Schedule risk: behind schedule.'
      : scheduleStatus === 'YELLOW'
      ? 'Schedule risk: at risk.'
      : 'Schedule risk: on track.';

  return {
    headline: productionPercent != null
      ? `Overall progress is ${Number(productionPercent).toFixed(1)}%.`
      : 'Overall progress is not yet available.',
    totals: `Installed ${Number(totalInstalled).toLocaleString()} of ${Number(totalQty).toLocaleString()} with ${Number(remaining).toLocaleString()} remaining.`,
    schedule: statusLine,
    topRemaining,
    topComplete,
    projectManager: formatUserName(project.project_manager_detail, project.project_manager_name),
  };
}

interface SpectrumDates {
  est_start_date?: string | Date;
  est_complete_date?: string | Date;
  projected_complete_date?: string | Date;
  start_date?: string | Date;
  complete_date?: string | Date;
  create_date?: string | Date;
}

interface ProjectDetails {
  project: Project;
  spectrum_data?: {
    job?: Record<string, unknown>;
    project?: Record<string, unknown>;
    dates?: SpectrumDates;
    phases?: Array<Record<string, unknown>>;
    udf?: Record<string, unknown>;
    cost_projections?: Array<Record<string, unknown>>;
    contacts?: Array<Record<string, unknown>>;
  };
}

const ITEMS_PER_PAGE = 20;

export default function BranchPortalPage() {
  const params = useParams();
  const divisionCode = params.branchId as string;
  
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [branchName, setBranchName] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'details' | 'charts'>('details');
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'PENDING'>('ALL');

  const fetchProjects = React.useCallback(async (pwd: string) => {
    setLoading(true);
    setError(null);
    setAuthenticated(false);
    
    try {
      const response = await api.get(`/projects/public/branch/${divisionCode}/projects/`, {
        params: { password: pwd }
      });
      
      let projectsData = [];
      if (Array.isArray(response.data)) {
        projectsData = response.data;
      } else if (response.data && Array.isArray(response.data.results)) {
        projectsData = response.data.results;
      } else if (response.data && typeof response.data === 'object') {
        projectsData = (Object.values(response.data).find((val: unknown) => Array.isArray(val)) as Project[]) || [];
      }
      
      setAllProjects(projectsData);
      setAuthenticated(true);
      sessionStorage.setItem(`branch_portal_${divisionCode}_password`, pwd);
      
      // Try to get branch name from first project
      if (projectsData.length > 0) {
        const firstProject = projectsData[0];
        if (firstProject.branch_name) {
          setBranchName(firstProject.branch_name);
        }
      }
      setError(null);
    } catch (err) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      console.error('Branch Portal authentication error:', err);
      const errorMessage = error.response?.data?.detail || error.message || 'Invalid password or unable to load projects.';
      setError(errorMessage);
      setAuthenticated(false);
      sessionStorage.removeItem(`branch_portal_${divisionCode}_password`);
      setAllProjects([]);
    } finally {
      setLoading(false);
    }
  }, [divisionCode]);

  useEffect(() => {
    const savedPassword = sessionStorage.getItem(`branch_portal_${divisionCode}_password`);
    if (savedPassword) {
      setPassword(savedPassword);
      fetchProjects(savedPassword);
    }
  }, [divisionCode, fetchProjects]);

  const fetchProjectDetails = async (project: Project) => {
    setLoadingDetails(true);
    try {
      // Try to fetch comprehensive details from Spectrum
      try {
        const detailsResponse = await api.get(`/spectrum/projects/${encodeURIComponent(project.job_number)}/comprehensive/`);
        setProjectDetails({
          project,
          spectrum_data: detailsResponse.data
        });
      } catch {
        // If Spectrum data not available, just use project data
        setProjectDetails({ project });
      }
    } catch (err) {
      console.error('Error fetching project details:', err);
      setProjectDetails({ project });
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project);
    fetchProjectDetails(project);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      fetchProjects(password);
    }
  };

  // Filter projects
  const filteredProjects = useMemo(() => {
    const filtered = allProjects.filter(project => {
      // Status filter - check both status and spectrum_status_code
      if (statusFilter !== 'ALL') {
        const projectStatus = project.spectrum_status_code === 'A' ? 'ACTIVE' :
                             project.spectrum_status_code === 'C' ? 'COMPLETED' :
                             project.spectrum_status_code === 'I' ? 'PENDING' :
                             project.status;
        if (projectStatus !== statusFilter) {
          return false;
        }
      }
      
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          project.name?.toLowerCase().includes(searchLower) ||
          project.job_number?.toLowerCase().includes(searchLower)
        );
      }
      
      return true;
    });
    
    return filtered;
  }, [allProjects, statusFilter, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredProjects.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProjects = filteredProjects.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Stats
  const stats = useMemo(() => {
    return {
      total: allProjects.length,
      active: allProjects.filter(p => p.spectrum_status_code === 'A' || p.status === 'ACTIVE').length,
      completed: allProjects.filter(p => p.spectrum_status_code === 'C' || p.status === 'COMPLETED').length,
      pending: allProjects.filter(p => p.spectrum_status_code === 'I' || p.status === 'PENDING').length,
    };
  }, [allProjects]);

  const chartStats = useMemo(() => {
    const activeProjects = allProjects.filter((p) => p.spectrum_status_code === 'A' || p.status === 'ACTIVE');
    const qualifiedActive = activeProjects.filter(
      (p) => isStartedProject(p) && projectHasScopeProgress(p)
    );

    const scopeProjectCounts = new Map<string, number>();
    const scopeCompletion: number[] = [];

    allProjects.forEach((project) => {
      if (!Array.isArray(project.scopes)) return;

      const uniqueScopes = new Set<string>();
      project.scopes.forEach((scope) => {
        const scopeName = getScopeName(scope);
        uniqueScopes.add(scopeName);

        const pct =
          scope.percent_complete ??
          (scope.qty_sq_ft > 0 ? (Number(scope.installed || 0) / Number(scope.qty_sq_ft)) * 100 : 0);
        scopeCompletion.push(Number(pct));
      });

      uniqueScopes.forEach((scopeName) => {
        scopeProjectCounts.set(scopeName, (scopeProjectCounts.get(scopeName) || 0) + 1);
      });
    });

    const sortedScopes = [...scopeProjectCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topScopes = sortedScopes.slice(0, 3);
    const otherScopesCount = sortedScopes.slice(3).reduce((sum, [, count]) => sum + count, 0);

    const scopesNearlyDone = scopeCompletion.filter((pct) => pct >= 90).length;
    const scopesInProgress = scopeCompletion.filter((pct) => pct < 90).length;

    return {
      activeTotal: activeProjects.length,
      activeQualified: qualifiedActive.length,
      topScopes,
      otherScopesCount,
      scopesNearlyDone,
      scopesInProgress,
    };
  }, [allProjects]);

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Branch Portal Access</h1>
            <p className="text-gray-600">Enter the portal password to view projects</p>
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Portal Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter password"
                required
                autoFocus
              />
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Verifying...' : 'Access Portal'}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {branchName ? `${branchName} Portal` : `Division ${divisionCode} Portal`}
              </h1>
              <p className="text-sm text-gray-600 mt-1">Public project portal - Division {divisionCode}</p>
            </div>
            <button
              onClick={() => {
                sessionStorage.removeItem(`branch_portal_${divisionCode}_password`);
                setAuthenticated(false);
                setPassword('');
                setAllProjects([]);
                setError(null);
                setSelectedProject(null);
                setProjectDetails(null);
              }}
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Dashboard/Filter Section */}
      <div className="bg-white border-b px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Dashboard:</span>
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 text-sm rounded ${statusFilter === 'ALL' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1 text-sm rounded ${statusFilter === 'ACTIVE' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Active ({stats.active})
            </button>
            <button
              onClick={() => setStatusFilter('COMPLETED')}
              className={`px-3 py-1 text-sm rounded ${statusFilter === 'COMPLETED' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Completed ({stats.completed})
            </button>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`px-3 py-1 text-sm rounded ${statusFilter === 'PENDING' ? 'bg-yellow-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Pending ({stats.pending})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden lg:h-[calc(100vh-200px)]">
        {/* Left Sidebar - Project List - Fixed */}
        <div className="w-full lg:w-80 xl:w-96 border-r bg-white flex flex-col flex-shrink-0 lg:h-[calc(100vh-200px)]">
          <div className="flex-shrink-0">
            {/* Search */}
            <div className="p-4 border-b">
              <input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-2">
                Showing {paginatedProjects.length} of {filteredProjects.length} projects
              </p>
            </div>
          </div>

          {/* Project List - Scrollable */}
          <div className="flex-1 overflow-y-auto" style={{ overflowY: 'auto', height: '0' }}>
            <div className="divide-y">
            {loading ? (
              <div className="p-8">
                <LoadingSpinner />
              </div>
            ) : paginatedProjects.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No projects found
              </div>
            ) : (
              paginatedProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleProjectClick(project)}
                  className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                    selectedProject?.id === project.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {project.job_description || project.name}
                        {project.job_description && <span className="text-gray-500 font-normal"> - Job #{project.job_number}</span>}
                      </h3>
                      {!project.job_description && (
                        <p className="text-sm text-gray-500 mt-1">Job #{project.job_number}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        PM: {formatUserName(project.project_manager_detail, project.project_manager_name)}
                      </p>
                      {project.schedule_status && (
                        <div className="mt-1">
                          <StatusBar status={project.schedule_status.status || 'GREEN'} />
                        </div>
                      )}
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      (project.spectrum_status_code === 'A' || project.status === 'ACTIVE') ? 'bg-green-100 text-green-800' :
                      (project.spectrum_status_code === 'C' || project.status === 'COMPLETED') ? 'bg-blue-100 text-blue-800' :
                      (project.spectrum_status_code === 'I' || project.status === 'PENDING') ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {project.spectrum_status_code === 'C' || project.status === 'COMPLETED' ? 'COMPLETED' : 
                       project.spectrum_status_code === 'A' || project.status === 'ACTIVE' ? 'ACTIVE' :
                       project.spectrum_status_code === 'I' || project.status === 'PENDING' ? 'PENDING' :
                       project.status}
                    </span>
                  </div>
                </button>
              ))
            )}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex-shrink-0 p-4 border-t flex justify-between items-center bg-white">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Middle - Project Details */}
        <div className="w-full lg:flex-[2] overflow-y-auto bg-gray-50 min-w-0 lg:h-[calc(100vh-200px)]">
          <div className="sticky top-0 z-10 bg-gray-50 border-b px-4 sm:px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveTab('details')}
                className={`px-3 py-1 text-sm rounded ${
                  activeTab === 'details'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab('charts')}
                className={`px-3 py-1 text-sm rounded ${
                  activeTab === 'charts'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Charts
              </button>
            </div>
          </div>

          {activeTab === 'charts' ? (
            <div className="p-6 space-y-6">
              <Card>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Branch Charts</h3>
                  <p className="text-sm text-gray-600">
                    Highlights based on public projects in this division.
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <PieChart
                    title="Active Projects Started &amp; Scoped Progress"
                    data={[
                      {
                        label: 'Started + Scope Progress',
                        value: chartStats.activeQualified,
                        color: '#16a34a',
                      },
                      {
                        label: 'Other Active',
                        value: Math.max(0, chartStats.activeTotal - chartStats.activeQualified),
                        color: '#fdba74',
                      },
                    ]}
                  />

                  <PieChart
                    title="Scopes Near Completion"
                    data={[
                      {
                        label: '≥ 90% Complete',
                        value: chartStats.scopesNearlyDone,
                        color: '#22c55e',
                      },
                      {
                        label: '< 90% Complete',
                        value: chartStats.scopesInProgress,
                        color: '#f97316',
                      },
                    ]}
                  />
                </div>

                <div className="mt-6 border-t pt-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Scope Coverage (Projects per Scope)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {chartStats.topScopes.map(([scopeName, count]) => (
                      <div key={scopeName} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{scopeName}</span>
                        <span className="font-semibold text-gray-900">{count} projects</span>
                      </div>
                    ))}
                    {chartStats.otherScopesCount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Other scopes</span>
                        <span className="font-semibold text-gray-900">{chartStats.otherScopesCount} projects</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          ) : selectedProject ? (
            <div className="p-6">
              {loadingDetails ? (
                <LoadingSpinner />
              ) : (
                <Card>
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
                      <div className="space-y-6 lg:col-span-3">
                        {/* Project Header */}
                        <div>
                          <h2 className="text-2xl font-bold text-gray-900">
                            {selectedProject.job_description || selectedProject.name}
                            {selectedProject.job_description && (
                              <span className="text-gray-600 font-normal text-lg"> - Job #{selectedProject.job_number}</span>
                            )}
                          </h2>
                          {!selectedProject.job_description && (
                            <p className="text-gray-600 mt-1">Job #{selectedProject.job_number}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                              selectedProject.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                              selectedProject.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {selectedProject.status}
                            </span>
                            {selectedProject.schedule_status && (
                              <StatusBar status={selectedProject.schedule_status.status || 'GREEN'} />
                            )}
                          </div>
                        </div>

                        {/* Project Information */}
                        <div className="grid grid-cols-2 gap-4">
                          {/* Use dates from GetJobDates API (SpectrumJobDates) if available, otherwise fallback to project dates */}
                          {(projectDetails?.spectrum_data?.dates?.start_date || projectDetails?.spectrum_data?.dates?.est_start_date || selectedProject.start_date) && (
                            <div>
                              <label className="text-sm font-medium text-gray-500">Start Date</label>
                              <p className="text-gray-900">
                                {projectDetails?.spectrum_data?.dates?.start_date 
                                  ? new Date(String(projectDetails.spectrum_data.dates.start_date)).toLocaleDateString()
                                  : projectDetails?.spectrum_data?.dates?.est_start_date
                                  ? new Date(String(projectDetails.spectrum_data.dates.est_start_date)).toLocaleDateString()
                                  : selectedProject.start_date
                                  ? new Date(selectedProject.start_date).toLocaleDateString()
                                  : 'N/A'}
                              </p>
                            </div>
                          )}
                          {(projectDetails?.spectrum_data?.dates?.complete_date || projectDetails?.spectrum_data?.dates?.est_complete_date || projectDetails?.spectrum_data?.dates?.projected_complete_date || selectedProject.estimated_end_date) && (
                            <div>
                              <label className="text-sm font-medium text-gray-500">End Date</label>
                              <p className="text-gray-900">
                                {projectDetails?.spectrum_data?.dates?.complete_date
                                  ? new Date(String(projectDetails.spectrum_data.dates.complete_date)).toLocaleDateString()
                                  : projectDetails?.spectrum_data?.dates?.projected_complete_date
                                  ? new Date(String(projectDetails.spectrum_data.dates.projected_complete_date)).toLocaleDateString()
                                  : projectDetails?.spectrum_data?.dates?.est_complete_date
                                  ? new Date(String(projectDetails.spectrum_data.dates.est_complete_date)).toLocaleDateString()
                                  : selectedProject.estimated_end_date
                                  ? new Date(selectedProject.estimated_end_date).toLocaleDateString()
                                  : 'N/A'}
                              </p>
                            </div>
                          )}
                          <div>
                            <label className="text-sm font-medium text-gray-500">Project Manager</label>
                            <p className="text-gray-900">
                              {formatUserName(
                                (projectDetails?.project || selectedProject).project_manager_detail,
                                (projectDetails?.project || selectedProject).project_manager_name
                              )}
                            </p>
                          </div>
                          {selectedProject.contract_value && (
                            <div>
                              <label className="text-sm font-medium text-gray-500">Contract Value</label>
                              <p className="text-gray-900">${selectedProject.contract_value.toLocaleString()}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Progress */}
                      {(() => {
                        const detailProject = projectDetails?.project || selectedProject;
                        const productionPercent = getProductionPercent(detailProject);

                        return (
                          (productionPercent != null ||
                            detailProject.financial_percent_complete != null ||
                            detailProject.scopes?.length) && (
                            <div className="border-t pt-4 space-y-6 lg:col-span-7 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
                              <h3 className="text-lg font-semibold text-gray-900">Progress Overview</h3>

                              <div className="space-y-4">
                                {productionPercent != null && (
                                  <div>
                                    <div className="flex justify-between text-sm mb-2">
                                      <span className="font-medium text-gray-700">Production Progress</span>
                                      <span className="text-gray-900 font-semibold">
                                        {Number(productionPercent).toFixed(1)}%
                                        {detailProject.total_installed != null && detailProject.total_quantity != null && (
                                          <span className="text-gray-500 font-normal ml-2">
                                            ({Number(detailProject.total_installed).toLocaleString()} /{' '}
                                            {Number(detailProject.total_quantity).toLocaleString()} sq.ft)
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-4 relative overflow-hidden">
                                      <div
                                        className="bg-blue-600 h-4 rounded-full transition-all"
                                        style={{ width: `${clampPercent(Number(productionPercent))}%` }}
                                      />
                                      <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-900">
                                        {Number(productionPercent).toFixed(1)}%
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {detailProject.financial_percent_complete != null && (
                                  <div>
                                    <div className="flex justify-between text-sm mb-2">
                                      <span className="font-medium text-gray-700">Financial Progress</span>
                                      <span className="text-gray-900 font-semibold">
                                        {Number(detailProject.financial_percent_complete).toFixed(1)}%
                                      </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-4 relative overflow-hidden">
                                      <div
                                        className="bg-green-600 h-4 rounded-full transition-all"
                                        style={{ width: `${clampPercent(Number(detailProject.financial_percent_complete))}%` }}
                                      />
                                      <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-900">
                                        {Number(detailProject.financial_percent_complete).toFixed(1)}%
                                      </div>
                                    </div>
                                  </div>
                                )}
                            </div>

                            {detailProject.scopes && detailProject.scopes.length > 0 && (
                              <div className="mt-6">
                                <h4 className="text-md font-semibold text-gray-900 mb-4">Scope Progress</h4>
                                <div className="space-y-4">
                                  {detailProject.scopes.map((scope) => {
                                    const scopeTypeName =
                                      typeof scope.scope_type === 'object'
                                        ? scope.scope_type.name
                                        : scope.scope_type_detail?.name || 'Unknown';
                                    const percentComplete =
                                      scope.percent_complete ??
                                      (scope.qty_sq_ft > 0 ? (scope.installed / scope.qty_sq_ft) * 100 : 0);
                                    const remaining = scope.remaining ?? scope.qty_sq_ft - scope.installed;

                                    return (
                                      <div key={scope.id} className="border rounded-lg p-4 bg-gray-50">
                                        <div className="flex justify-between items-start mb-3">
                                          <div>
                                            <h5 className="font-semibold text-gray-900">{scopeTypeName}</h5>
                                            {scope.description && (
                                              <p className="text-sm text-gray-600 mt-1">{scope.description}</p>
                                            )}
                                          </div>
                                          <span className="text-sm font-semibold text-gray-900">
                                            {Number(percentComplete).toFixed(1)}%
                                          </span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                                          <div
                                            className={`h-3 rounded-full transition-all ${
                                              percentComplete >= 100
                                                ? 'bg-green-600'
                                                : percentComplete >= 75
                                                ? 'bg-blue-600'
                                                : percentComplete >= 50
                                                ? 'bg-yellow-500'
                                                : 'bg-orange-500'
                                            }`}
                                            style={{ width: `${clampPercent(percentComplete)}%` }}
                                          />
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                          <div>
                                            <span className="text-gray-600">Total:</span>
                                            <span className="text-gray-900 font-medium ml-1">
                                              {Number(scope.qty_sq_ft).toLocaleString()} sq.ft
                                            </span>
                                          </div>
                                          <div>
                                            <span className="text-gray-600">Installed:</span>
                                            <span className="text-gray-900 font-medium ml-1">
                                              {Number(scope.installed).toLocaleString()} sq.ft
                                            </span>
                                          </div>
                                          <div>
                                            <span className="text-gray-600">Remaining:</span>
                                            <span className="text-gray-900 font-medium ml-1">
                                              {Number(remaining).toLocaleString()} sq.ft
                                            </span>
                                          </div>
                                          <div>
                                            <span className="text-gray-600">Complete:</span>
                                            <span className="text-gray-900 font-medium ml-1">
                                              {Number(percentComplete).toFixed(1)}%
                                            </span>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3 pt-3 border-t border-gray-200">
                                          <div>
                                            <span className="text-gray-600">Foreman:</span>
                                            <span className="text-gray-900 font-medium ml-1">
                                              {scope.foreman_detail?.name || 'N/A'}
                                            </span>
                                          </div>
                                          <div>
                                            <span className="text-gray-600">Start:</span>
                                            <span className="text-gray-900 font-medium ml-1">
                                              {formatDate(scope.estimation_start_date)}
                                            </span>
                                          </div>
                                          <div>
                                            <span className="text-gray-600">End:</span>
                                            <span className="text-gray-900 font-medium ml-1">
                                              {formatDate(scope.estimation_end_date)}
                                            </span>
                                          </div>
                                          <div>
                                            <span className="text-gray-600">Duration:</span>
                                            <span className="text-gray-900 font-medium ml-1">
                                              {scope.duration_days != null ? `${scope.duration_days} days` : 'N/A'}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                          )
                        );
                      })()}
                    </div>

                    {/* Spectrum Data */}
                    {projectDetails?.spectrum_data && (
                      <div className="border-t pt-6 space-y-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Details</h3>
                        
                        {/* Job Dates */}
                        {projectDetails.spectrum_data.dates && (
                          <div>
                            <h4 className="font-medium text-gray-700 mb-3">Key Dates</h4>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              {projectDetails.spectrum_data.dates.est_start_date && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Est. Start Date:</span>
                                  <span className="text-gray-900">{new Date(String(projectDetails.spectrum_data.dates.est_start_date)).toLocaleDateString()}</span>
                                </div>
                              )}
                              {projectDetails.spectrum_data.dates.est_complete_date && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Est. Complete Date:</span>
                                  <span className="text-gray-900">{new Date(String(projectDetails.spectrum_data.dates.est_complete_date)).toLocaleDateString()}</span>
                                </div>
                              )}
                              {projectDetails.spectrum_data.dates.projected_complete_date && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Projected Complete Date:</span>
                                  <span className="text-gray-900 font-medium">{new Date(String(projectDetails.spectrum_data.dates.projected_complete_date)).toLocaleDateString()}</span>
                                </div>
                              )}
                              {projectDetails.spectrum_data.dates.start_date && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Actual Start Date:</span>
                                  <span className="text-gray-900">{new Date(String(projectDetails.spectrum_data.dates.start_date)).toLocaleDateString()}</span>
                                </div>
                              )}
                              {projectDetails.spectrum_data.dates.complete_date && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Actual Complete Date:</span>
                                  <span className="text-gray-900">{new Date(String(projectDetails.spectrum_data.dates.complete_date)).toLocaleDateString()}</span>
                                </div>
                              )}
                              {projectDetails.spectrum_data.dates.create_date && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Create Date:</span>
                                  <span className="text-gray-900">{new Date(String(projectDetails.spectrum_data.dates.create_date)).toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Phases */}
                        {projectDetails.spectrum_data.phases && Array.isArray(projectDetails.spectrum_data.phases) && projectDetails.spectrum_data.phases.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700 mb-3">Phases ({projectDetails.spectrum_data.phases.length})</h4>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                              {projectDetails.spectrum_data.phases.map((phase: { phase_code?: string; cost_type?: string; description?: string; status_code?: string; [key: string]: unknown }, idx: number) => (
                                <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                                  <div className="flex justify-between items-start mb-2">
                                    <div>
                                      <span className="font-medium text-gray-900">Phase {phase.phase_code}</span>
                                      {phase.cost_type && <span className="text-gray-600 ml-2">({phase.cost_type})</span>}
                                    </div>
                                    {phase.status_code && (
                                      <span className={`px-2 py-1 text-xs rounded ${
                                        phase.status_code === 'A' ? 'bg-green-100 text-green-800' :
                                        phase.status_code === 'C' ? 'bg-blue-100 text-blue-800' :
                                        'bg-gray-100 text-gray-800'
                                      }`}>
                                        {phase.status_code === 'A' ? 'Active' : phase.status_code === 'C' ? 'Complete' : 'Inactive'}
                                      </span>
                                    )}
                                  </div>
                                  {phase.description && (
                                    <p className="text-sm text-gray-700 mb-2">{phase.description}</p>
                                  )}
                                  <div className="grid grid-cols-3 gap-2 text-xs">
                                    {phase.jtd_quantity != null && (
                                      <div>
                                        <span className="text-gray-600">JTD Qty:</span>
                                        <span className="text-gray-900 ml-1">{Number(phase.jtd_quantity).toLocaleString()}</span>
                                      </div>
                                    )}
                                    {phase.jtd_hours != null && (
                                      <div>
                                        <span className="text-gray-600">JTD Hours:</span>
                                        <span className="text-gray-900 ml-1">{Number(phase.jtd_hours).toLocaleString()}</span>
                                      </div>
                                    )}
                                    {phase.jtd_actual_dollars != null && (
                                      <div>
                                        <span className="text-gray-600">JTD Cost:</span>
                                        <span className="text-gray-900 ml-1">${Number(phase.jtd_actual_dollars).toLocaleString()}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* UDFs */}
                        {projectDetails.spectrum_data.udf && Object.values(projectDetails.spectrum_data.udf).some((val: unknown) => val) && (
                          <div>
                            <h4 className="font-medium text-gray-700 mb-3">User Defined Fields</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {Object.entries(projectDetails.spectrum_data.udf).map(([key, value]: [string, unknown]) => 
                                value ? (
                                  <div key={key} className="flex justify-between">
                                    <span className="text-gray-600">{key.toUpperCase()}:</span>
                                    <span className="text-gray-900">{String(value)}</span>
                                  </div>
                                ) : null
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Contacts */}
                        {projectDetails.spectrum_data.contacts && Array.isArray(projectDetails.spectrum_data.contacts) && projectDetails.spectrum_data.contacts.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700 mb-3">Contacts ({projectDetails.spectrum_data.contacts.length})</h4>
                            <div className="space-y-2">
                              {projectDetails.spectrum_data.contacts.map((contact: { contact_type?: string; name?: string; phone?: string; email?: string; [key: string]: unknown }, idx: number) => (
                                <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                                  <div className="font-medium text-gray-900">
                                    {String(contact.first_name || '')} {String(contact.last_name || '')}
                                    {Boolean(contact.title) && <span className="text-gray-600 font-normal ml-2">({String(contact.title)})</span>}
                                  </div>
                                  {Boolean(contact.phone_number) && (
                                    <p className="text-sm text-gray-600">Phone: {String(contact.phone_number)}</p>
                                  )}
                                  {Boolean(contact.email1) && (
                                    <p className="text-sm text-gray-600">Email: {String(contact.email1)}</p>
                                  )}
                                  {Boolean(contact.addr_1) && (
                                    <p className="text-sm text-gray-600">
                                      {String(contact.addr_1)}
                                      {Boolean(contact.addr_city) && `, ${String(contact.addr_city)}`}
                                      {Boolean(contact.addr_state) && ` ${String(contact.addr_state)}`}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-lg">Select a project to view details</p>
              </div>
            </div>
          )}
        </div>

        {/* Right - AI Summary */}
        <div className="w-full lg:w-80 xl:w-96 bg-white border-t lg:border-t-0 lg:border-l border-gray-200 overflow-y-auto lg:h-[calc(100vh-200px)]">
          <div className="p-6">
            <Card>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900">AI Project Summary</h3>
                {selectedProject ? (() => {
                  const detailProject = projectDetails?.project || selectedProject;
                  const summary = buildAiSummary(detailProject);

                  return (
                    <div className="text-sm text-gray-700 space-y-3">
                      <p>{summary.headline}</p>
                      <p>{summary.totals}</p>
                      <p>{summary.schedule}</p>
                      <p>Project Manager: {summary.projectManager}</p>

                      {summary.topRemaining.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-1">Largest Remaining Scopes</p>
                          <div className="space-y-1">
                            {summary.topRemaining.map(({ scope, qty, installed }) => {
                              const name =
                                typeof scope.scope_type === 'object'
                                  ? scope.scope_type.name
                                  : scope.scope_type_detail?.name || 'Unknown';
                              const remaining = Math.max(0, qty - installed);
                              return (
                                <div key={scope.id} className="text-xs text-gray-700">
                                  {name}: {Number(remaining).toLocaleString()} remaining
                                  {scope.foreman_detail?.name ? ` · Foreman: ${scope.foreman_detail.name}` : ''}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {summary.topComplete.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-1">Most Complete Scopes</p>
                          <div className="space-y-1">
                            {summary.topComplete.map(({ scope, pct }) => {
                              const name =
                                typeof scope.scope_type === 'object'
                                  ? scope.scope_type.name
                                  : scope.scope_type_detail?.name || 'Unknown';
                              return (
                                <div key={scope.id} className="text-xs text-gray-700">
                                  {name}: {Number(pct).toFixed(1)}%
                                  {scope.foreman_detail?.name ? ` · Foreman: ${scope.foreman_detail.name}` : ''}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="text-xs text-gray-500">
                        Project: {selectedProject.job_number} · {selectedProject.name || selectedProject.job_description}
                      </div>
                    </div>
                  );
                })() : (
                  <p className="text-sm text-gray-600">Select a project to see its AI summary.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
