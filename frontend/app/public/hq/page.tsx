'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
}

interface ProjectDetails {
  project: Project;
  spectrum_data?: any;
}

const ITEMS_PER_PAGE = 20;

export default function HQPortalPage() {
  const router = useRouter();
  
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
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'PENDING'>('ALL');
  const [divisionFilter, setDivisionFilter] = useState<string>('ALL');

  useEffect(() => {
    const savedPassword = sessionStorage.getItem('hq_portal_password');
    if (savedPassword) {
      setPassword(savedPassword);
      fetchProjects(savedPassword);
    }
  }, []);

  const fetchProjects = async (pwd: string) => {
    setLoading(true);
    setError(null);
    setAuthenticated(false);
    
    try {
      const response = await api.get('/projects/public/hq/projects/', {
        params: { password: pwd }
      });
      
      let projectsData = [];
      if (Array.isArray(response.data)) {
        projectsData = response.data;
      } else if (response.data && Array.isArray(response.data.results)) {
        projectsData = response.data.results;
      } else if (response.data && typeof response.data === 'object') {
        projectsData = Object.values(response.data).find((val: any) => Array.isArray(val)) as any[] || [];
      }
      
      setAllProjects(projectsData);
      setAuthenticated(true);
      sessionStorage.setItem('hq_portal_password', pwd);
      setError(null);
    } catch (err: any) {
      console.error('HQ Portal authentication error:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Invalid password or unable to load projects.';
      setError(errorMessage);
      setAuthenticated(false);
      sessionStorage.removeItem('hq_portal_password');
      setAllProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectDetails = async (project: Project) => {
    setLoadingDetails(true);
    try {
      // Try to fetch comprehensive details from Spectrum
      try {
        const detailsResponse = await api.get(`/spectrum/projects/${encodeURIComponent(project.job_number)}/comprehensive/`);
        // The API returns data directly, not nested
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

  // Get unique divisions for filter (combine code and name to avoid duplicates)
  const divisions = useMemo(() => {
    const divMap = new Map<string, { code: string; name: string }>();
    allProjects.forEach(p => {
      const code = p.branch_code || '';
      const name = p.branch_name || '';
      if (code || name) {
        // Use code as key if available, otherwise use name
        const key = code || name;
        if (!divMap.has(key)) {
          divMap.set(key, { code, name });
        }
      }
    });
    // Return array of objects with code and name, sorted by code
    return Array.from(divMap.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));
  }, [allProjects]);

  // Filter projects
  const filteredProjects = useMemo(() => {
    let filtered = allProjects.filter(project => {
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
      
      // Division filter
      if (divisionFilter !== 'ALL') {
        // divisionFilter is now a key (code or name)
        if (project.branch_code !== divisionFilter && project.branch_name !== divisionFilter) {
          return false;
        }
      }
      
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          project.name?.toLowerCase().includes(searchLower) ||
          project.job_number?.toLowerCase().includes(searchLower) ||
          project.branch_name?.toLowerCase().includes(searchLower) ||
          project.branch_code?.toLowerCase().includes(searchLower)
        );
      }
      
      return true;
    });
    
    return filtered;
  }, [allProjects, statusFilter, divisionFilter, searchTerm]);

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

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">HQ Portal Access</h1>
            <p className="text-gray-600">Enter the HQ portal password to view all projects</p>
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                HQ Portal Password
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
              <h1 className="text-2xl font-bold text-gray-900">HQ Portal</h1>
              <p className="text-sm text-gray-600 mt-1">All public projects across all divisions</p>
            </div>
            <button
              onClick={() => {
                sessionStorage.removeItem('hq_portal_password');
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
        <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-start sm:items-center">
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
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Division:</span>
            <select
              value={divisionFilter}
              onChange={(e) => {
                setDivisionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Divisions</option>
              {divisions.map(div => (
                <option key={div.key} value={div.key}>
                  {div.code && div.name ? `${div.code} - ${div.name}` : div.code || div.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Left Sidebar - Project List - Fixed */}
        <div className="w-full md:w-80 lg:w-96 border-r bg-white flex flex-col flex-shrink-0" style={{ height: 'calc(100vh - 200px)' }}>
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
                      {project.branch_name && (
                        <p className="text-xs text-gray-400 mt-1">
                          {project.branch_name} {project.branch_code ? `(${project.branch_code})` : ''}
                        </p>
                      )}
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

        {/* Right Side - Project Details - Fixed */}
        <div className="w-full md:flex-1 overflow-y-auto bg-gray-50 min-w-0" style={{ height: 'calc(100vh - 200px)' }}>
          {selectedProject ? (
            <div className="p-6">
              {loadingDetails ? (
                <LoadingSpinner />
              ) : (
                <Card>
                  <div className="space-y-6">
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
                        {selectedProject.branch_name && (
                          <span className="text-sm text-gray-600">
                            {selectedProject.branch_name} {selectedProject.branch_code ? `(${selectedProject.branch_code})` : ''}
                          </span>
                        )}
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
                              ? new Date(projectDetails.spectrum_data.dates.start_date).toLocaleDateString()
                              : projectDetails?.spectrum_data?.dates?.est_start_date
                              ? new Date(projectDetails.spectrum_data.dates.est_start_date).toLocaleDateString()
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
                              ? new Date(projectDetails.spectrum_data.dates.complete_date).toLocaleDateString()
                              : projectDetails?.spectrum_data?.dates?.projected_complete_date
                              ? new Date(projectDetails.spectrum_data.dates.projected_complete_date).toLocaleDateString()
                              : projectDetails?.spectrum_data?.dates?.est_complete_date
                              ? new Date(projectDetails.spectrum_data.dates.est_complete_date).toLocaleDateString()
                              : selectedProject.estimated_end_date
                              ? new Date(selectedProject.estimated_end_date).toLocaleDateString()
                              : 'N/A'}
                          </p>
                        </div>
                      )}
                      {selectedProject.contract_value && (
                        <div>
                          <label className="text-sm font-medium text-gray-500">Contract Value</label>
                          <p className="text-gray-900">${selectedProject.contract_value.toLocaleString()}</p>
                        </div>
                      )}
                    </div>

                    {/* Progress */}
                    {(selectedProject.production_percent_complete != null || selectedProject.financial_percent_complete != null) && (
                      <div className="space-y-4">
                        {selectedProject.production_percent_complete != null && (
                          <div>
                            <div className="flex justify-between text-sm mb-2">
                              <span className="font-medium text-gray-700">Production Progress</span>
                              <span className="text-gray-900">{Number(selectedProject.production_percent_complete).toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                              <div
                                className="bg-blue-600 h-3 rounded-full transition-all"
                                style={{ width: `${Math.min(100, Math.max(0, Number(selectedProject.production_percent_complete)))}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {selectedProject.financial_percent_complete != null && (
                          <div>
                            <div className="flex justify-between text-sm mb-2">
                              <span className="font-medium text-gray-700">Financial Progress</span>
                              <span className="text-gray-900">{Number(selectedProject.financial_percent_complete).toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                              <div
                                className="bg-green-600 h-3 rounded-full transition-all"
                                style={{ width: `${Math.min(100, Math.max(0, Number(selectedProject.financial_percent_complete)))}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

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
                                  <span className="text-gray-900">{new Date(projectDetails.spectrum_data.dates.est_start_date).toLocaleDateString()}</span>
                                </div>
                              )}
                              {projectDetails.spectrum_data.dates.est_complete_date && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Est. Complete Date:</span>
                                  <span className="text-gray-900">{new Date(projectDetails.spectrum_data.dates.est_complete_date).toLocaleDateString()}</span>
                                </div>
                              )}
                              {projectDetails.spectrum_data.dates.projected_complete_date && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Projected Complete Date:</span>
                                  <span className="text-gray-900 font-medium">{new Date(projectDetails.spectrum_data.dates.projected_complete_date).toLocaleDateString()}</span>
                                </div>
                              )}
                              {projectDetails.spectrum_data.dates.start_date && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Actual Start Date:</span>
                                  <span className="text-gray-900">{new Date(projectDetails.spectrum_data.dates.start_date).toLocaleDateString()}</span>
                                </div>
                              )}
                              {projectDetails.spectrum_data.dates.complete_date && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Actual Complete Date:</span>
                                  <span className="text-gray-900">{new Date(projectDetails.spectrum_data.dates.complete_date).toLocaleDateString()}</span>
                                </div>
                              )}
                              {projectDetails.spectrum_data.dates.create_date && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Create Date:</span>
                                  <span className="text-gray-900">{new Date(projectDetails.spectrum_data.dates.create_date).toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Phases */}
                        {projectDetails.spectrum_data.phases && projectDetails.spectrum_data.phases.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700 mb-3">Phases ({projectDetails.spectrum_data.phases.length})</h4>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                              {projectDetails.spectrum_data.phases.map((phase: any, idx: number) => (
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
                        {projectDetails.spectrum_data.udf && Object.values(projectDetails.spectrum_data.udf).some((val: any) => val) && (
                          <div>
                            <h4 className="font-medium text-gray-700 mb-3">User Defined Fields</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {Object.entries(projectDetails.spectrum_data.udf).map(([key, value]: [string, any]) => 
                                value ? (
                                  <div key={key} className="flex justify-between">
                                    <span className="text-gray-600">{key.toUpperCase()}:</span>
                                    <span className="text-gray-900">{value}</span>
                                  </div>
                                ) : null
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Contacts */}
                        {projectDetails.spectrum_data.contacts && projectDetails.spectrum_data.contacts.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700 mb-3">Contacts ({projectDetails.spectrum_data.contacts.length})</h4>
                            <div className="space-y-2">
                              {projectDetails.spectrum_data.contacts.map((contact: any, idx: number) => (
                                <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                                  <div className="font-medium text-gray-900">
                                    {contact.first_name} {contact.last_name}
                                    {contact.title && <span className="text-gray-600 font-normal ml-2">({contact.title})</span>}
                                  </div>
                                  {contact.phone_number && (
                                    <p className="text-sm text-gray-600">Phone: {contact.phone_number}</p>
                                  )}
                                  {contact.email1 && (
                                    <p className="text-sm text-gray-600">Email: {contact.email1}</p>
                                  )}
                                  {contact.addr_1 && (
                                    <p className="text-sm text-gray-600">
                                      {contact.addr_1}
                                      {contact.addr_city && `, ${contact.addr_city}`}
                                      {contact.addr_state && ` ${contact.addr_state}`}
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
      </div>
    </div>
  );
}
