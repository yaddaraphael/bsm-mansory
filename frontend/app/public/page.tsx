'use client';

import { useState, useEffect, useMemo } from 'react';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import {
  BuildingOfficeIcon,
  LockClosedIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';

interface PublicProject {
  id: number;
  job_number: string;
  name: string;
  status: string;
  public_pin?: string;
  schedule_status?: {
    status: string;
    days_late?: number;
    forecast_date?: string;
  };
  branch_name?: string;
  branch_code?: string;
  production_percent_complete?: number;
  total_installed?: number;
  total_quantity?: number;
  financial_percent_complete?: number;
  [key: string]: unknown;
}

interface ProjectScope {
  scope_type: string;
  description?: string;
  percent_complete?: number;
  quantity?: number;
  unit?: string;
  installed?: number;
  remaining?: number;
  start_date?: string;
  end_date?: string;
  [key: string]: unknown;
}

interface ProjectDetails {
  id: number;
  job_number: string;
  name: string;
  status: string;
  contract_value?: string | number;
  contract_balance?: string | number;
  scopes?: ProjectScope[];
  notes?: string;
  updated_at?: string;
  estimated_end_date?: string;
  start_date?: string;
  branch_name?: string;
  production_percent_complete?: number;
  financial_percent_complete?: number;
  total_installed?: number;
  total_quantity?: number;
  schedule_status?: {
    status: string;
    days_late?: number;
    forecast_date?: string;
  };
  [key: string]: unknown;
}

export default function PublicProjectsPage() {
  const router = useRouter();
  const [allProjects, setAllProjects] = useState<PublicProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<PublicProject | null>(null);
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [authenticatedPins, setAuthenticatedPins] = useState<Set<number>>(new Set());
  
  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchPublicProjects();
  }, []);

  const fetchPublicProjects = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/projects/public/projects/');
      setAllProjects(response.data.results || response.data || []);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to load public projects');
      setAllProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectDetails = async (projectId: number, projectPin?: string) => {
    try {
      setLoadingDetails(true);
      setError('');
      setPinError('');
      const params = new URLSearchParams();
      if (projectPin) {
        params.append('pin', projectPin);
      }
      const response = await api.get(`/projects/public/projects/${projectId}/?${params.toString()}`);
      // Ensure we have the data before setting it
      if (response.data) {
        setProjectDetails(response.data);
        if (projectPin) {
          // Store authenticated PIN for this project
          setAuthenticatedPins(prev => {
            const newSet = new Set(prev);
            newSet.add(projectId);
            return newSet;
          });
        }
      } else {
        setProjectDetails(null);
        setError('No data received from server');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string }; status?: number } };
      if (error.response?.status === 403 || error.response?.status === 404) {
        setProjectDetails(null);
        setPinError('Invalid PIN or project not accessible');
      } else {
        setProjectDetails(null);
        setError(error.response?.data?.detail || 'Failed to load project details');
      }
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleProjectClick = (project: PublicProject) => {
    setSelectedProject(project);
    setProjectDetails(null);
    setPin('');
    setPinError('');
    
    // If project has PIN and we haven't authenticated it yet
    if (project.public_pin && !authenticatedPins.has(project.id)) {
      // Don't fetch yet, wait for PIN entry
      return;
    }
    
    // Fetch project details
    const projectPin = project.public_pin && authenticatedPins.has(project.id) ? project.public_pin : undefined;
    fetchProjectDetails(project.id, projectPin);
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) {
      setPinError('Please enter a PIN');
      return;
    }

    if (!selectedProject) return;

    // Verify PIN matches
    if (pin === selectedProject.public_pin) {
      // Store authenticated PIN
      setAuthenticatedPins(prev => {
        const newSet = new Set(prev);
        newSet.add(selectedProject.id);
        return newSet;
      });
      // Fetch project details with PIN
      await fetchProjectDetails(selectedProject.id, pin);
      setPinError('');
    } else {
      setPinError('Invalid PIN');
    }
  };

  const getScheduleStatus = (project: PublicProject | ProjectDetails) => {
    if (project?.schedule_status && typeof project.schedule_status === 'object' && 'status' in project.schedule_status) {
      return (project.schedule_status as { status: string }).status;
    }
    return 'GREEN';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'GREEN':
        return 'bg-green-500';
      case 'YELLOW':
        return 'bg-yellow-500';
      case 'RED':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Filter and search projects
  const projects = useMemo(() => {
    let filtered = [...allProjects];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (project) =>
          project.name?.toLowerCase().includes(query) ||
          project.job_number?.toLowerCase().includes(query) ||
          project.branch_name?.toLowerCase().includes(query) ||
          project.branch_code?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter((project) => project.status === statusFilter);
    }

    // Schedule status filter
    if (scheduleStatusFilter) {
      filtered = filtered.filter(
        (project) => getScheduleStatus(project) === scheduleStatusFilter
      );
    }

    // Branch filter
    if (branchFilter) {
      filtered = filtered.filter(
        (project) => project.branch_code === branchFilter || project.branch_name === branchFilter
      );
    }

    return filtered;
  }, [allProjects, searchQuery, statusFilter, scheduleStatusFilter, branchFilter]);

  // Get unique branches for filter
  const branches = useMemo(() => {
    const branchSet = new Set<string>();
    allProjects.forEach((project) => {
      if (project.branch_code) branchSet.add(project.branch_code);
      if (project.branch_name) branchSet.add(project.branch_name);
    });
    return Array.from(branchSet).sort();
  }, [allProjects]);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setScheduleStatusFilter('');
    setBranchFilter('');
  };

  const hasActiveFilters = searchQuery || statusFilter || scheduleStatusFilter || branchFilter;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex flex-col">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 bg-white shadow-sm border-b z-30">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <BuildingOfficeIcon className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">BSM Public Portal</h1>
                <p className="text-xs md:text-sm text-gray-600">View public project information</p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => router.push('/login')}
              className="text-sm"
            >
              Login
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content - Sidebar Layout */}
      <div className="flex-1 flex overflow-hidden pt-20">
        {/* Fixed Left Sidebar - Project Cards */}
        <div className={`fixed left-0 top-20 bottom-0 w-full md:w-80 lg:w-96 bg-white border-r border-gray-200 flex flex-col z-20 transition-transform duration-300 ${
          selectedProject ? '-translate-x-full md:translate-x-0' : 'translate-x-0'
        }`}>
          {/* Search and Filter Header */}
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="p-1.5 rounded-md hover:bg-gray-200 transition-colors"
                title="Toggle Filters"
              >
                <FunnelIcon className={`h-5 w-5 ${hasActiveFilters ? 'text-primary' : 'text-gray-500'}`} />
              </button>
            </div>
            
            {/* Search Bar */}
            <div className="relative mb-3">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filters Panel */}
            {showFilters && (
              <div className="space-y-3 pt-3 border-t border-gray-200">
                {/* Status Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="ACTIVE">Active</option>
                    <option value="ON_HOLD">On Hold</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>

                {/* Schedule Status Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Schedule Status</label>
                  <select
                    value={scheduleStatusFilter}
                    onChange={(e) => setScheduleStatusFilter(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="">All Schedule Statuses</option>
                    <option value="GREEN">Green</option>
                    <option value="YELLOW">Yellow</option>
                    <option value="RED">Red</option>
                  </select>
                </div>

                {/* Branch Filter */}
                {branches.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Branch</label>
                    <select
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value="">All Branches</option>
                      {branches.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Clear Filters Button */}
                {hasActiveFilters && (
                  <Button
                    variant="secondary"
                    onClick={clearFilters}
                    className="w-full text-xs py-1.5"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            )}

            {/* Results Count */}
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-600">
                Showing <span className="font-semibold text-gray-900">{projects.length}</span> of{' '}
                <span className="font-semibold text-gray-900">{allProjects.length}</span> projects
                {hasActiveFilters && ' (filtered)'}
              </p>
            </div>
          </div>

          {/* Scrollable Project Cards */}
          <div className="flex-1 overflow-y-auto">

          {loading ? (
            <div className="flex justify-center items-center min-h-[400px] p-4">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <div className="p-4">
              <Card>
                <div className="text-center py-4">
                  <p className="text-red-600 text-sm mb-2">{error}</p>
                  <Button onClick={() => fetchPublicProjects()}>
                    Try Again
                  </Button>
                </div>
              </Card>
            </div>
          ) : projects.length === 0 ? (
            <div className="p-4">
              <Card>
                <div className="text-center py-8">
                  <BuildingOfficeIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">No Public Projects</h3>
                  <p className="text-xs text-gray-600">There are currently no public projects available.</p>
                </div>
              </Card>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {projects.map((project) => {
                const isSelected = selectedProject?.id === project.id;
                const isAuthenticated = !project.public_pin || authenticatedPins.has(project.id);
                
                return (
                  <Card
                    key={project.id}
                    className={`cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? 'ring-2 ring-primary shadow-lg'
                        : 'hover:shadow-md hover:border-primary/50'
                    }`}
                    onClick={() => handleProjectClick(project)}
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">
                            {project.name}
                          </h3>
                          <p className="text-xs text-gray-500 truncate mt-0.5">
                            {project.job_number}
                          </p>
                        </div>
                        <div className="flex items-center space-x-1 ml-2">
                          <StatusBadge status={getScheduleStatus(project)} size="sm" />
                          {project.public_pin && (
                            <LockClosedIcon
                              className={`h-4 w-4 ${
                                isAuthenticated ? 'text-green-500' : 'text-gray-400'
                              }`}
                              title={isAuthenticated ? 'PIN Authenticated' : 'PIN Protected'}
                            />
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600">Progress</span>
                          <span className="font-medium text-gray-900">
                            {typeof project.production_percent_complete === 'number' ? project.production_percent_complete.toFixed(0) : 0}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${getStatusColor(getScheduleStatus(project))}`}
                            style={{ width: `${Math.min(typeof project.production_percent_complete === 'number' ? project.production_percent_complete : 0, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Quick Info */}
                      <div className="flex items-center justify-between text-xs text-gray-600 pt-1 border-t border-gray-100">
                        <div className="flex items-center">
                          <BuildingOfficeIcon className="h-3 w-3 mr-1" />
                          <span className="truncate">{String(project.branch_code || 'N/A')}</span>
                        </div>
                        <StatusBadge status={project.status} size="sm" />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          </div>
        </div>

        {/* Right Side - Project Details (with left margin for sidebar) */}
        <div className={`flex-1 overflow-y-auto bg-gray-50 transition-all duration-300 ${
          selectedProject ? 'ml-0' : 'ml-0 md:ml-80 lg:ml-96'
        }`}>
          {!selectedProject ? (
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center max-w-md">
                <BuildingOfficeIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Select a Project</h2>
                <p className="text-gray-600">
                  Click on a project from the sidebar to view its details
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 md:p-6 lg:p-8">
              {/* Back Button - Mobile Only */}
              <div className="md:hidden mb-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelectedProject(null);
                    setProjectDetails(null);
                    setPin('');
                    setPinError('');
                  }}
                  className="flex items-center"
                >
                  <ArrowLeftIcon className="h-5 w-5 mr-2" />
                  Back to Projects
                </Button>
              </div>
              {selectedProject.public_pin && !authenticatedPins.has(selectedProject.id) ? (
                // PIN Entry Form
                <Card className="max-w-md mx-auto">
                  <div className="text-center mb-6">
                    <LockClosedIcon className="h-12 w-12 text-primary mx-auto mb-3" />
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">
                      PIN Required
                    </h2>
                    <p className="text-sm text-gray-600">
                      This project is protected. Please enter the PIN to view details.
                    </p>
                  </div>
                  <form onSubmit={handlePinSubmit}>
                    <div className="mb-4">
                      <Input
                        label="Enter PIN"
                        type="text"
                        value={pin}
                        onChange={(e) => {
                          setPin(e.target.value);
                          setPinError('');
                        }}
                        placeholder="Enter project PIN"
                        required
                        autoFocus
                        className="text-center text-lg tracking-widest"
                      />
                      {pinError && (
                        <p className="text-sm text-red-600 mt-2 text-center">{pinError}</p>
                      )}
                    </div>
                    <div className="flex space-x-3">
                      <Button type="submit" className="flex-1">
                        Access Project
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setSelectedProject(null);
                          setProjectDetails(null);
                          setPin('');
                          setPinError('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Card>
              ) : loadingDetails ? (
                <div className="flex justify-center items-center min-h-[400px]">
                  <LoadingSpinner />
                </div>
              ) : projectDetails ? (
                // Project Details View
                <div className="max-w-4xl mx-auto space-y-6">
                  {/* Header */}
                  <Card>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                          {projectDetails.name}
                        </h1>
                        <p className="text-gray-600">Job Number: {projectDetails.job_number}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <StatusBadge status={getScheduleStatus(projectDetails)} />
                        <StatusBadge status={projectDetails.status} />
                      </div>
                    </div>
                  </Card>

                  {/* Progress Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <div className="text-center">
                        <p className="text-sm text-gray-600 mb-2">Production Progress</p>
                        <div className="relative w-24 h-24 mx-auto mb-2">
                          <svg className="transform -rotate-90 w-24 h-24">
                            <circle
                              cx="48"
                              cy="48"
                              r="40"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              className="text-gray-200"
                            />
                            <circle
                              cx="48"
                              cy="48"
                              r="40"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              strokeDasharray={`${2 * Math.PI * 40}`}
                              strokeDashoffset={`${2 * Math.PI * 40 * (1 - (typeof projectDetails.production_percent_complete === 'number' ? projectDetails.production_percent_complete : 0) / 100)}`}
                              className="text-primary transition-all"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xl font-bold text-gray-900">
                              {typeof projectDetails.production_percent_complete === 'number' ? projectDetails.production_percent_complete.toFixed(0) : 0}%
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">
                          {String(projectDetails.total_installed ?? 0)} / {String(projectDetails.total_quantity ?? 0)}
                        </p>
                      </div>
                    </Card>

                    <Card>
                      <div className="text-center">
                        <p className="text-sm text-gray-600 mb-2">Financial Progress</p>
                        <div className="relative w-24 h-24 mx-auto mb-2">
                          <svg className="transform -rotate-90 w-24 h-24">
                            <circle
                              cx="48"
                              cy="48"
                              r="40"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              className="text-gray-200"
                            />
                            <circle
                              cx="48"
                              cy="48"
                              r="40"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              strokeDasharray={`${2 * Math.PI * 40}`}
                              strokeDashoffset={`${2 * Math.PI * 40 * (1 - (typeof projectDetails.financial_percent_complete === 'number' ? projectDetails.financial_percent_complete : 0) / 100)}`}
                              className="text-green-500 transition-all"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xl font-bold text-gray-900">
                              {typeof projectDetails.financial_percent_complete === 'number' ? projectDetails.financial_percent_complete.toFixed(0) : 0}%
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">
                          ${(projectDetails.contract_value || 0).toLocaleString()}
                        </p>
                      </div>
                    </Card>

                    <Card>
                      <div className="text-center">
                        <p className="text-sm text-gray-600 mb-2">Schedule Status</p>
                        <div className="flex items-center justify-center mb-2">
                          <div
                            className={`w-16 h-16 rounded-full flex items-center justify-center ${
                              getScheduleStatus(projectDetails) === 'GREEN'
                                ? 'bg-green-100'
                                : getScheduleStatus(projectDetails) === 'YELLOW'
                                ? 'bg-yellow-100'
                                : 'bg-red-100'
                            }`}
                          >
                            <StatusBadge status={getScheduleStatus(projectDetails)} size="lg" />
                          </div>
                        </div>
                        {(() => {
                          const scheduleStatus = projectDetails.schedule_status;
                          if (scheduleStatus && typeof scheduleStatus === 'object' && 'days_late' in scheduleStatus) {
                            const daysLate = (scheduleStatus as { days_late?: number }).days_late;
                            if (typeof daysLate === 'number' && daysLate > 0) {
                              return (
                                <p className="text-xs text-red-600">
                                  {daysLate} days late
                                </p>
                              );
                            }
                          }
                          return null;
                        })()}
                        {(() => {
                          const scheduleStatus = projectDetails.schedule_status;
                          if (scheduleStatus && typeof scheduleStatus === 'object' && 'forecast_date' in scheduleStatus) {
                            const forecastDate = (scheduleStatus as { forecast_date?: string }).forecast_date;
                            if (forecastDate) {
                              return (
                                <p className="text-xs text-gray-500 mt-1">
                                  Forecast: {new Date(String(forecastDate)).toLocaleDateString()}
                                </p>
                              );
                            }
                          }
                          return null;
                        })()}
                      </div>
                    </Card>
                  </div>

                  {/* Project Information */}
                  <Card title="Project Information">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-500">Branch</label>
                        <p className="text-gray-900 mt-1">{String(projectDetails.branch_name || 'N/A')}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Status</label>
                        <p className="text-gray-900 mt-1">
                          <StatusBadge status={projectDetails.status} />
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Start Date</label>
                        <p className="text-gray-900 mt-1">
                          {projectDetails.start_date
                            ? new Date(String(projectDetails.start_date)).toLocaleDateString()
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Estimated End Date</label>
                        <p className="text-gray-900 mt-1">
                          {projectDetails.estimated_end_date
                            ? new Date(projectDetails.estimated_end_date).toLocaleDateString()
                            : 'N/A'}
                        </p>
                      </div>
                      {projectDetails.contract_value && (
                        <div>
                          <label className="text-sm font-medium text-gray-500">Contract Value</label>
                          <p className="text-gray-900 mt-1">
                            ${parseFloat(String(projectDetails.contract_value)).toLocaleString()}
                          </p>
                        </div>
                      )}
                      {projectDetails.contract_balance && (
                        <div>
                          <label className="text-sm font-medium text-gray-500">Contract Balance</label>
                          <p className="text-gray-900 mt-1">
                            ${parseFloat(String(projectDetails.contract_balance)).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Scopes of Work */}
                  {projectDetails.scopes && projectDetails.scopes.length > 0 && (
                    <Card title="Scopes of Work">
                      <div className="space-y-4">
                        {projectDetails.scopes.map((scope: ProjectScope, index: number) => (
                          <div
                            key={index}
                            className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h4 className="font-semibold text-gray-900">{scope.scope_type}</h4>
                                {scope.description && (
                                  <p className="text-sm text-gray-600 mt-1">{scope.description}</p>
                                )}
                              </div>
                              <StatusBadge
                                status={`${scope.percent_complete?.toFixed(0) || 0}%`}
                              />
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                              <div>
                                <span className="text-gray-500">Quantity:</span>
                                <p className="font-medium text-gray-900">
                                  {String(scope.quantity ?? '')} {scope.unit || ''}
                                </p>
                              </div>
                              <div>
                                <span className="text-gray-500">Installed:</span>
                                <p className="font-medium text-gray-900">
                                  {String(scope.installed ?? 0)} {scope.unit || ''}
                                </p>
                              </div>
                              <div>
                                <span className="text-gray-500">Remaining:</span>
                                <p className="font-medium text-gray-900">
                                  {String(scope.remaining ?? 0)} {scope.unit || ''}
                                </p>
                              </div>
                              <div>
                                <span className="text-gray-500">Progress:</span>
                                <p className="font-medium text-gray-900">
                                  {scope.percent_complete ? scope.percent_complete.toFixed(1) : 0}%
                                </p>
                              </div>
                            </div>
                            {scope.start_date && (
                              <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                                <span>Start: {new Date(String(scope.start_date)).toLocaleDateString()}</span>
                                {scope.end_date && (
                                  <span className="ml-4">
                                    End: {new Date(String(scope.end_date)).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Notes */}
                  {projectDetails.notes && (
                    <Card title="Notes">
                      <p className="text-gray-700 whitespace-pre-wrap">{String(projectDetails.notes)}</p>
                    </Card>
                  )}

                  {/* Last Updated */}
                  {projectDetails.updated_at && (
                    <div className="text-center text-xs text-gray-500 pt-4">
                      Last updated: {new Date(String(projectDetails.updated_at)).toLocaleString()}
                    </div>
                  )}
                </div>
              ) : (
                <Card className="max-w-md mx-auto">
                  <div className="text-center py-8">
                    <XCircleIcon className="h-12 w-12 text-red-400 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Unable to Load Project
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {error || 'Failed to load project details. Please try again.'}
                    </p>
                    <Button
                      onClick={() => {
                        const projectPin = selectedProject.public_pin && authenticatedPins.has(selectedProject.id)
                          ? selectedProject.public_pin
                          : undefined;
                        fetchProjectDetails(selectedProject.id, projectPin);
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
