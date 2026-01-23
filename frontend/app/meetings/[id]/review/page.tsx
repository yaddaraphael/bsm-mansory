'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import api from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import StatusBar from '@/components/ui/StatusBar';

interface Phase {
  id?: number;
  phase_code: string;
  phase_description?: string;
  masons: number;
  operators: number;
  labors: number;
  quantity: number;
  installed_quantity: number;
  duration?: number | null;
  notes?: string;
  percent_complete?: number;
}

interface ProjectScope {
  id?: number;
  scope_type: string;
  description?: string;
  get_scope_type_display?: () => string;
}

interface Project {
  id: number;
  job_number: string;
  name: string;
  job_description?: string;
  spectrum_project_manager_name?: string;
  branch?: { id: number; name: string };
  branch_detail?: { id: number; name: string };
  project_manager?: { id: number; first_name: string; last_name: string; get_full_name: () => string };
  project_manager_detail?: { id: number; first_name: string; last_name: string; get_full_name: () => string };
  foreman?: { id: number; first_name: string; last_name: string; get_full_name: () => string };
  foreman_detail?: { id: number; first_name: string; last_name: string; get_full_name: () => string };
  scopes?: ProjectScope[];
  schedule_status?: { status: string };
  start_date?: string;
  estimated_end_date?: string;
  saturdays?: boolean;
  full_weekends?: boolean;
}

interface Meeting {
  id: number;
  meeting_date: string;
  branch?: { id: number; name: string };
  created_by?: { id: number; username: string; get_full_name: () => string };
  created_at: string;
  notes?: string;
  status?: string;
}

interface ActiveJob {
  id: number;
  job_number: string;
  name?: string;
  job_description?: string;
  spectrum_project_manager_name?: string;
  branch?: { id: number; name: string };
  branch_detail?: { id: number; name: string };
  project_manager?: { id: number; first_name: string; last_name: string };
  project_manager_detail?: { id: number; first_name: string; last_name: string };
  start_date?: string;
  estimated_end_date?: string;
  saturdays?: boolean;
  full_weekends?: boolean;
  scopes?: ProjectScope[];
  [key: string]: unknown; // Allow additional properties from API
}

interface JobDetails {
  dates?: {
    start_date?: string;
    est_start_date?: string;
    complete_date?: string;
    projected_complete_date?: string;
    est_complete_date?: string;
  };
  phases?: Array<{
    phase_code?: string;
    description?: string;
    jtd_quantity?: string;
    estimated_quantity?: string;
    start_date?: string;
    end_date?: string;
  }>;
}

interface ExistingJob {
  id?: number;
  project?: { id: number; job_number: string };
  phases?: Phase[];
  masons?: number;
  labors?: number;
  notes?: string;
  handoff_from_estimator?: boolean;
  handoff_to_foreman?: boolean;
  site_specific_safety_plan?: boolean;
  saturdays?: boolean;
  full_weekends?: boolean;
  selected_scope?: string;
}

interface MeetingJob {
  id?: number;
  project_id: number;
  project?: Project;
  masons: number;
  labors: number;
  notes: string;
  handoff_from_estimator?: boolean;
  handoff_to_foreman?: boolean;
  site_specific_safety_plan?: boolean;
  saturdays?: boolean;
  full_weekends?: boolean;
  selected_scope?: string;
  phases?: Phase[];
}

export default function MeetingReviewPage() {
  const router = useRouter();
  const params = useParams();
  const meetingId = params?.id as string;
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [meetingJobs, setMeetingJobs] = useState<MeetingJob[]>([]);
  const [allMeetingJobs, setAllMeetingJobs] = useState<MeetingJob[]>([]); // Store all jobs for filtering
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBranch, setFilterBranch] = useState<string>('ALL');
  const [filterProjectManager, setFilterProjectManager] = useState<string>('ALL');
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [projectManagers, setProjectManagers] = useState<{ id: string | number; name: string; full_name: string }[]>([]);
  const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set());
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [jobsPerPage, setJobsPerPage] = useState(50);

  const fetchMeetingData = useCallback(async () => {
    if (!meetingId) return;
    
    try {
      setLoading(true);
      
      // Fetch meeting details
      const meetingResponse = await api.get(`/meetings/meetings/${meetingId}/`);
      setMeeting(meetingResponse.data);
      
      // Fetch existing job entries
      const jobsResponse = await api.get(`/meetings/meetings/${meetingId}/jobs/`);
      const existingJobs: ExistingJob[] = jobsResponse.data || [];
      
      // Fetch active jobs
      const activeJobsResponse = await api.get('/meetings/meetings/active_jobs/');
      const activeJobs: ActiveJob[] = activeJobsResponse.data || [];
      
      // Batch fetch all job details at once (much faster than individual calls)
      const jobNumbers = activeJobs.map((j: ActiveJob) => j.job_number).filter(Boolean);
      let batchDetails: Record<string, JobDetails> = {};
      
      if (jobNumbers.length > 0) {
        try {
          const batchResponse = await api.post('/meetings/meetings/batch_job_details/', {
            job_numbers: jobNumbers
          });
          batchDetails = batchResponse.data || {};
        } catch (batchErr) {
          console.error('Error fetching batch job details:', batchErr);
        }
      }
      
      // Process jobs with batch-fetched details
      const jobsWithDetails = activeJobs.map((job: ActiveJob) => {
        try {
          const jobDetails = batchDetails[job.job_number] || {};
          
          // Get dates from SpectrumJobDates (prioritize from database)
          let startDate: string | null = null;
          let endDate: string | null = null;
          
          if (jobDetails.dates) {
            startDate = jobDetails.dates.start_date || jobDetails.dates.est_start_date || null;
            endDate = jobDetails.dates.complete_date || 
                     jobDetails.dates.projected_complete_date || 
                     jobDetails.dates.est_complete_date || 
                     null;
          }
          
          // Get phases from SpectrumPhaseEnhanced
          let phases: Phase[] = [];
          
          // Use phases from synced SpectrumPhaseEnhanced
          if (jobDetails.phases && Array.isArray(jobDetails.phases)) {
            phases = jobDetails.phases.map((sp) => ({
              phase_code: sp.phase_code || '',
              phase_description: sp.description || '',
              masons: 0,
              operators: 0,
              labors: 0,
              quantity: parseFloat(String(sp.jtd_quantity || sp.estimated_quantity || '0')),
              installed_quantity: 0, // Start with 0, user will fill in
              duration: sp.start_date && sp.end_date ? 
                Math.ceil((new Date(sp.end_date).getTime() - new Date(sp.start_date).getTime()) / (1000 * 60 * 60 * 24)) : null,
              notes: '',
            }));
          }
            
          // Find existing meeting job entry
          const existing = existingJobs.find((ej: ExistingJob) => {
            // Match by project ID or job number
            return (ej.project && (ej.project.id === job.id || ej.project.job_number === job.job_number));
          });
          
          if (existing) {
            // Merge existing phases with database phases (preserve user input)
            const existingPhasesMap = new Map<string, Phase>((existing.phases || []).map((p) => [p.phase_code, p]));
            const mergedPhases = phases.map(phase => {
              const existingPhase = existingPhasesMap.get(phase.phase_code);
              if (existingPhase) {
                // Keep existing user input, but update description if available
                return {
                  ...existingPhase,
                  phase_description: phase.phase_description || existingPhase.phase_description,
                  quantity: phase.quantity || existingPhase.quantity,
                  duration: phase.duration || existingPhase.duration,
                };
              }
              return phase;
            });
            
            // Add any existing phases that aren't in the database phases
            existing.phases?.forEach(existingPhase => {
              if (!mergedPhases.find(p => p.phase_code === existingPhase.phase_code)) {
                mergedPhases.push(existingPhase);
              }
            });
            
            phases = mergedPhases;
          }
          
          return {
            id: existing?.id,
            project_id: job.id,
            project: {
              id: job.id,
              job_number: job.job_number,
              name: job.name || '', // Use project name from API
              job_description: job.job_description || '', // Add job description
              spectrum_project_manager_name: job.spectrum_project_manager_name || '', // Add Spectrum PM name
              branch: job.branch_detail || job.branch || undefined, // Add branch data
              branch_detail: job.branch_detail || job.branch || undefined, // Add branch_detail
              project_manager: job.project_manager || undefined, // Add project_manager
              project_manager_detail: job.project_manager_detail || job.project_manager || undefined, // Add project_manager_detail
              start_date: startDate || undefined,
              estimated_end_date: endDate || undefined,
            } as Project,
            masons: existing?.masons || 0,
            labors: existing?.labors || 0,
            notes: existing?.notes || '',
            handoff_from_estimator: existing?.handoff_from_estimator || false,
            handoff_to_foreman: existing?.handoff_to_foreman || false,
            site_specific_safety_plan: existing?.site_specific_safety_plan || false,
            saturdays: existing?.saturdays,
            full_weekends: existing?.full_weekends,
            selected_scope: existing?.selected_scope || '',
            phases: phases,
          };
        } catch (err) {
          console.error(`Error processing project ${job.id}:`, err);
          return null;
        }
      });
      
      const validJobs: MeetingJob[] = jobsWithDetails.filter((j): j is NonNullable<typeof j> => j !== null);
      setAllMeetingJobs(validJobs);
      setMeetingJobs(validJobs);
      
      // Extract unique project managers from jobs for filter
      const uniquePMs = new Map<number | string, { id: number | string; name: string; full_name: string }>();
      validJobs.forEach(job => {
        const project = job.project;
        if (project?.project_manager_detail) {
          const pmId = project.project_manager_detail.id;
          const pmName = `${project.project_manager_detail.first_name || ''} ${project.project_manager_detail.last_name || ''}`.trim();
          if (pmName && !uniquePMs.has(pmId)) {
            uniquePMs.set(pmId, {
              id: pmId,
              name: pmName,
              full_name: pmName
            });
          }
        } else if (project?.project_manager) {
          const pmId = project.project_manager.id;
          const pmName = `${project.project_manager.first_name || ''} ${project.project_manager.last_name || ''}`.trim();
          if (pmName && !uniquePMs.has(pmId)) {
            uniquePMs.set(pmId, {
              id: pmId,
              name: pmName,
              full_name: pmName
            });
          }
        } else if (project?.spectrum_project_manager_name) {
          // For Spectrum PM names without User match, use the name as identifier
          const pmName = project.spectrum_project_manager_name;
          if (!uniquePMs.has(`spectrum_${pmName}`)) {
            uniquePMs.set(`spectrum_${pmName}`, {
              id: `spectrum_${pmName}`,
              name: pmName,
              full_name: pmName
            });
          }
        }
      });
      setProjectManagers(Array.from(uniquePMs.values()));
      
      setError(null);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to load meeting details');
      console.error('Error fetching meeting data:', err);
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    if (meetingId) {
      fetchMeetingData();
      fetchBranches();
    }
  }, [meetingId, fetchMeetingData]);
  
  // Auto-save draft every 30 seconds
  useEffect(() => {
    if (!meetingId || allMeetingJobs.length === 0) return;
    
    const autoSaveInterval = setInterval(async () => {
      try {
        const jobsToSave = allMeetingJobs
          .filter(job => job.project_id)
          .map(job => ({
            project_id: job.project_id,
            id: job.id,
            masons: job.masons || 0,
            labors: job.labors || 0,
            notes: job.notes || '',
            handoff_from_estimator: job.handoff_from_estimator || false,
            handoff_to_foreman: job.handoff_to_foreman || false,
            site_specific_safety_plan: job.site_specific_safety_plan || false,
            saturdays: job.saturdays !== undefined ? job.saturdays : (job.project?.saturdays || false),
            full_weekends: job.full_weekends !== undefined ? job.full_weekends : (job.project?.full_weekends || false),
            selected_scope: job.selected_scope || '',
            phases: (job.phases || []).map((phase: Phase) => ({
              id: phase.id,
              phase_code: phase.phase_code,
              phase_description: phase.phase_description || '',
              masons: phase.masons || 0,
              operators: phase.operators || 0,
              labors: phase.labors || 0,
              quantity: phase.quantity || 0,
              installed_quantity: phase.installed_quantity || 0,
              duration: phase.duration || null,
              notes: phase.notes || '',
            }))
          }));
        
        await api.post(`/meetings/meetings/${meetingId}/batch_save_jobs/`, {
          jobs: jobsToSave,
          is_draft: true
        });
        // Silently save - no user notification needed for auto-save
      } catch (err: unknown) {
        // Silently fail for auto-save - don't show error to user
        console.error('Auto-save failed:', err);
      }
    }, 30000); // Save every 30 seconds
    
    return () => clearInterval(autoSaveInterval);
  }, [meetingId, allMeetingJobs]);
  
  useEffect(() => {
    // Filter jobs based on search, branch, and project manager
    let filtered = [...allMeetingJobs];
    
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(job => {
        const project = job.project;
        const pmName = project?.project_manager_detail ? 
          `${project.project_manager_detail.first_name || ''} ${project.project_manager_detail.last_name || ''}`.trim() :
          project?.project_manager ?
          `${project.project_manager.first_name || ''} ${project.project_manager.last_name || ''}`.trim() :
          project?.spectrum_project_manager_name || '';
        return (
          project?.job_number?.toLowerCase().includes(searchLower) ||
          project?.name?.toLowerCase().includes(searchLower) ||
          project?.branch?.name?.toLowerCase().includes(searchLower) ||
          project?.branch_detail?.name?.toLowerCase().includes(searchLower) ||
          pmName.toLowerCase().includes(searchLower)
        );
      });
    }
    
    // Branch filter
    if (filterBranch !== 'ALL') {
      filtered = filtered.filter(job => {
        const project = job.project;
        const branchId = project?.branch?.id || project?.branch_detail?.id;
        return branchId?.toString() === filterBranch;
      });
    }
    
    // Project Manager filter
    if (filterProjectManager !== 'ALL') {
      filtered = filtered.filter(job => {
        const project = job.project;
        const pmId = project?.project_manager?.id || project?.project_manager_detail?.id;
        // Check if filter is for a Spectrum PM name (starts with "spectrum_")
        if (filterProjectManager.startsWith('spectrum_')) {
          const pmName = filterProjectManager.replace('spectrum_', '');
          return project?.spectrum_project_manager_name === pmName;
        }
        // Otherwise filter by User ID
        return pmId?.toString() === filterProjectManager;
      });
    }
    
    setMeetingJobs(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [searchTerm, filterBranch, filterProjectManager, allMeetingJobs]);
  
  // Pagination calculations
  const totalPages = Math.ceil(meetingJobs.length / jobsPerPage);
  const startIndex = (currentPage - 1) * jobsPerPage;
  const endIndex = startIndex + jobsPerPage;
  const paginatedJobs = meetingJobs.slice(startIndex, endIndex);
  
  // Reset to page 1 when page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [jobsPerPage]);
  
  const fetchBranches = async () => {
    try {
      const response = await api.get('/branches/?status=ACTIVE');
      setBranches(response.data.results || response.data || []);
    } catch (err) {
      console.error('Error fetching branches:', err);
    }
  };
  
  const toggleJobExpansion = (projectId: number) => {
    const newExpanded = new Set(expandedJobs);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedJobs(newExpanded);
  };

  const handleSaveMeetingJobs = async () => {
    if (!meetingId) return;

    try {
      setSaving(true);
      setError(null);
      
      // Prepare batch data for faster saving (use allMeetingJobs to save all data)
      const jobsToSave = allMeetingJobs
        .filter(job => job.project_id)
        .map(job => ({
          project_id: job.project_id,
          id: job.id, // Include ID if exists for update
          masons: job.masons || 0,
          labors: job.labors || 0,
          notes: job.notes || '',
          handoff_from_estimator: job.handoff_from_estimator || false,
          handoff_to_foreman: job.handoff_to_foreman || false,
          site_specific_safety_plan: job.site_specific_safety_plan || false,
          saturdays: job.saturdays !== undefined ? job.saturdays : (job.project?.saturdays || false),
          full_weekends: job.full_weekends !== undefined ? job.full_weekends : (job.project?.full_weekends || false),
          selected_scope: job.selected_scope || '',
          phases: (job.phases || []).map((phase: Phase) => ({
            id: phase.id, // Include ID if exists for update
            phase_code: phase.phase_code,
            phase_description: phase.phase_description || '',
            masons: phase.masons || 0,
            operators: phase.operators || 0,
            labors: phase.labors || 0,
            quantity: phase.quantity || 0,
            installed_quantity: phase.installed_quantity || 0,
            duration: phase.duration || null,
            notes: phase.notes || '',
          }))
        }));
      
      // Batch save all jobs and phases at once (as completed)
      await api.post(`/meetings/meetings/${meetingId}/batch_save_jobs/`, {
        jobs: jobsToSave,
        is_draft: false
      });
      
      router.push('/meetings');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to save meeting jobs');
      console.error('Error saving meeting jobs:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']}>
        <div className="min-h-screen bg-gray-50">
          <Sidebar />
          <div className="lg:pl-64">
            <Header />
            <main className="pt-16 md:pt-20 pb-8 px-4 sm:px-6 lg:px-8">
              <LoadingSpinner />
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']}>
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <div className="lg:pl-64">
          <Header />
          <main className="pt-16 md:pt-20 pb-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] pb-12">
              {/* Fixed Header */}
              <div className="flex-shrink-0 bg-gray-50 pb-2 mb-2 border-b border-gray-200 sticky top-16 md:top-20 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
                <div className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Button
                      variant="outline"
                      onClick={() => router.push('/meetings')}
                      className="flex items-center gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium"
                    >
                      <ArrowLeftIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Back</span>
                    </Button>
                    <div>
                      <h1 className="text-base sm:text-lg md:text-xl font-bold text-gray-900">
                        Review Meeting - {meeting ? new Date(meeting.meeting_date).toLocaleDateString() : ''}
                      </h1>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Fill in details for all active jobs
                        {meeting?.created_at && (
                          <span className="ml-1.5">
                            • Created: {new Date(meeting.created_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        if (!meetingId) return;
                        try {
                          setSaving(true);
                          setError(null);
                          const jobsToSave = allMeetingJobs
                            .filter(job => job.project_id)
                            .map(job => ({
                              project_id: job.project_id,
                              id: job.id,
                              masons: job.masons || 0,
                              labors: job.labors || 0,
                              notes: job.notes || '',
                              handoff_from_estimator: job.handoff_from_estimator || false,
                              handoff_to_foreman: job.handoff_to_foreman || false,
                              site_specific_safety_plan: job.site_specific_safety_plan || false,
                              saturdays: job.saturdays !== undefined ? job.saturdays : (job.project?.saturdays || false),
                              full_weekends: job.full_weekends !== undefined ? job.full_weekends : (job.project?.full_weekends || false),
                              selected_scope: job.selected_scope || '',
                              phases: (job.phases || []).map((phase: Phase) => ({
                                id: phase.id,
                                phase_code: phase.phase_code,
                                phase_description: phase.phase_description || '',
                                masons: phase.masons || 0,
                                operators: phase.operators || 0,
                                labors: phase.labors || 0,
                                quantity: phase.quantity || 0,
                                installed_quantity: phase.installed_quantity || 0,
                                duration: phase.duration || null,
                                notes: phase.notes || '',
                              }))
                            }));
                          await api.post(`/meetings/meetings/${meetingId}/batch_save_jobs/`, {
                            jobs: jobsToSave,
                            is_draft: true
                          });
                          router.push('/meetings');
                        } catch (err: unknown) {
                          const error = err as { response?: { data?: { detail?: string } } };
                          setError(error.response?.data?.detail || 'Failed to save draft');
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                      className="w-full sm:w-auto px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium"
                    >
                      {saving ? 'Saving...' : 'Save Draft'}
                    </Button>
                    <Button
                      onClick={handleSaveMeetingJobs}
                      disabled={saving}
                      className="w-full sm:w-auto px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium"
                    >
                      {saving ? 'Saving...' : 'Complete Meeting'}
                    </Button>
                  </div>
                </div>

                {error && (
                  <div className="mb-2 p-2 text-xs bg-red-50 border border-red-200 rounded-lg text-red-700">
                    {error}
                  </div>
                )}

                {/* Fixed Filters */}
                <Card className="p-2 sm:p-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="text"
                        placeholder="Search by job number, name, or branch..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 text-xs py-1.5"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Branch</label>
                    <select
                      value={filterBranch}
                      onChange={(e) => setFilterBranch(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-xs"
                    >
                      <option value="ALL">All Branches</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id.toString()}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Project Manager</label>
                    <select
                      value={filterProjectManager}
                      onChange={(e) => setFilterProjectManager(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-xs"
                    >
                      <option value="ALL">All Project Managers</option>
                      {projectManagers.map((pm) => (
                        <option key={pm.id} value={pm.id.toString()}>
                          {pm.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-end gap-1.5">
                    <div className="text-xs text-gray-600">
                      Showing {startIndex + 1}-{Math.min(endIndex, meetingJobs.length)} of {meetingJobs.length} jobs
                      {meetingJobs.length !== allMeetingJobs.length && ` (${allMeetingJobs.length} total)`}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-gray-600 whitespace-nowrap">Per page:</label>
                      <select
                        value={jobsPerPage}
                        onChange={(e) => {
                          setJobsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="px-1.5 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-xs"
                      >
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={150}>150</option>
                        <option value={200}>200</option>
                        <option value={300}>300</option>
                        <option value={400}>400</option>
                        <option value={500}>500</option>
                        <option value={750}>750</option>
                        <option value={1000}>1000</option>
                      </select>
                    </div>
                  </div>
                </div>
              </Card>
              </div>

              {/* Scrollable Jobs List */}
              <div className="flex-1 overflow-y-auto -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
                {meetingJobs.length === 0 ? (
                <Card>
                  <div className="text-center py-12">
                    <p className="text-gray-500">No active jobs found</p>
                  </div>
                </Card>
              ) : (
                <>
                  <div className="space-y-6">
                    {paginatedJobs.map((job) => {
                    const project = job.project;
                    const scopes = project?.scopes || [];
                    
                    const isExpanded = expandedJobs.has(job.project_id);
                    
                    return (
                      <Card key={job.project_id} className="p-3 sm:p-4">
                        {/* Job Header - Collapsible */}
                        <div 
                          className="mb-2 pb-2 border-b cursor-pointer hover:bg-gray-50 -m-3 sm:-m-4 p-3 sm:p-4 rounded-t-lg transition-colors"
                          onClick={() => toggleJobExpansion(job.project_id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1">
                              {isExpanded ? (
                                <ChevronUpIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                              ) : (
                                <ChevronDownIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-semibold text-sm sm:text-base text-gray-900 truncate">
                                    {project?.job_number}
                                    {project?.job_description && (
                                      <span className="ml-2 text-xs font-normal text-gray-600">
                                        - {project.job_description}
                                      </span>
                                    )}
                                  </h4>
                                  {project?.schedule_status && (
                                    <StatusBar status={project.schedule_status.status || 'GREEN'} />
                                  )}
                                </div>
                                {project?.name && (
                                  <p className="text-xs sm:text-sm text-gray-600 mt-0.5 truncate">{project.name}</p>
                                )}
                                <div className="flex items-center gap-2 sm:gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
                                  <span className="truncate">
                                    Branch: {project?.branch_detail?.name || project?.branch?.name || 'N/A'}
                                  </span>
                                  <span>•</span>
                                  <span className="truncate">
                                    PM: {project?.project_manager_detail ? 
                                      `${project.project_manager_detail.first_name || ''} ${project.project_manager_detail.last_name || ''}`.trim() : 
                                      project?.project_manager ?
                                      `${project.project_manager.first_name || ''} ${project.project_manager.last_name || ''}`.trim() :
                                      project?.spectrum_project_manager_name || 'N/A'}
                                  </span>
                                  <span>•</span>
                                  <span>Phases: {job.phases?.length || 0}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Expandable Content */}
                        {isExpanded && (
                          <div className="space-y-6">
                            {/* Job Details - Horizontal */}
                            <div className="pb-4 border-b">
                              <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                                  <p className="text-sm font-medium">
                                    {project?.start_date ? new Date(project.start_date).toLocaleDateString('en-GB', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric'
                                    }) : 'N/A'}
                                  </p>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                                  <p className="text-sm font-medium">
                                    {project?.estimated_end_date ? new Date(project.estimated_end_date).toLocaleDateString('en-GB', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric'
                                    }) : 'N/A'}
                                  </p>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Scope</label>
                                  <select
                                    value={job.selected_scope || ''}
                                    onChange={(e) => {
                                      const updated = [...allMeetingJobs];
                                      const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                      if (jobIndex !== -1) {
                                        updated[jobIndex].selected_scope = e.target.value;
                                        setAllMeetingJobs(updated);
                                        // Trigger filter update
                                        setMeetingJobs([...updated]);
                                      }
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="">Select Scope</option>
                                    {scopes.map((scope: ProjectScope) => {
                                      const displayName = scope.get_scope_type_display ? scope.get_scope_type_display() : 
                                                        (scope.scope_type === 'CMU' ? 'CMU' :
                                                         scope.scope_type === 'BRICK' ? 'BRICK' :
                                                         scope.scope_type === 'CAST_STONE' ? 'CAST STONE' :
                                                         scope.scope_type === 'MSV' ? 'MSV' :
                                                         scope.scope_type === 'STUCCO' ? 'STUCCO' :
                                                         scope.scope_type === 'EIFS' ? 'EIFS' :
                                                         scope.scope_type === 'THIN_BRICK' ? 'THIN BRICK' :
                                                         scope.scope_type === 'FBD_STONE' ? 'FBD STONE' :
                                                         scope.scope_type || 'N/A');
                                      return (
                                        <option key={scope.id} value={scope.scope_type}>
                                          {displayName}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
                                  <p className="text-sm font-medium">{project?.branch?.name || project?.branch_detail?.name || 'N/A'}</p>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 mt-4">
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Project Manager</label>
                                  <p className="text-sm font-medium">
                                    {project?.project_manager ? 
                                      `${project.project_manager.first_name} ${project.project_manager.last_name}` : 
                                      project?.project_manager_detail ?
                                      `${project.project_manager_detail.first_name} ${project.project_manager_detail.last_name}` :
                                      project?.spectrum_project_manager_name || 'N/A'}
                                  </p>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Foreman</label>
                                  <p className="text-sm font-medium">
                                    {project?.foreman ? 
                                      `${project.foreman.first_name} ${project.foreman.last_name}` : 
                                      project?.foreman_detail ?
                                      `${project.foreman_detail.first_name} ${project.foreman_detail.last_name}` :
                                      'N/A'}
                                  </p>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Saturday</label>
                                  <select
                                    value={job.saturdays !== undefined ? (job.saturdays ? 'Yes' : 'No') : (project?.saturdays ? 'Yes' : 'No')}
                                    onChange={(e) => {
                                      const updated = [...allMeetingJobs];
                                      const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                      if (jobIndex !== -1) {
                                        updated[jobIndex].saturdays = e.target.value === 'Yes';
                                        setAllMeetingJobs(updated);
                                        setMeetingJobs([...updated]);
                                      }
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Full Weekends</label>
                                  <select
                                    value={job.full_weekends !== undefined ? (job.full_weekends ? 'Yes' : 'No') : (project?.full_weekends ? 'Yes' : 'No')}
                                    onChange={(e) => {
                                      const updated = [...allMeetingJobs];
                                      const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                      if (jobIndex !== -1) {
                                        updated[jobIndex].full_weekends = e.target.value === 'Yes';
                                        setAllMeetingJobs(updated);
                                        setMeetingJobs([...updated]);
                                      }
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Handoff from Estimator</label>
                                  <select
                                    value={job.handoff_from_estimator ? 'Yes' : 'No'}
                                    onChange={(e) => {
                                      const updated = [...allMeetingJobs];
                                      const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                      if (jobIndex !== -1) {
                                        updated[jobIndex].handoff_from_estimator = e.target.value === 'Yes';
                                        setAllMeetingJobs(updated);
                                        setMeetingJobs([...updated]);
                                      }
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Handoff to Foreman</label>
                                  <select
                                    value={job.handoff_to_foreman ? 'Yes' : 'No'}
                                    onChange={(e) => {
                                      const updated = [...allMeetingJobs];
                                      const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                      if (jobIndex !== -1) {
                                        updated[jobIndex].handoff_to_foreman = e.target.value === 'Yes';
                                        setAllMeetingJobs(updated);
                                        setMeetingJobs([...updated]);
                                      }
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                  </select>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 mt-4">
                                <div className="lg:col-span-6">
                                  <label className="block text-xs font-medium text-gray-500 mb-1">Site Specific Safety Plan</label>
                                  <select
                                    value={job.site_specific_safety_plan ? 'Yes' : 'No'}
                                    onChange={(e) => {
                                      const updated = [...allMeetingJobs];
                                      const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                      if (jobIndex !== -1) {
                                        updated[jobIndex].site_specific_safety_plan = e.target.value === 'Yes';
                                        setAllMeetingJobs(updated);
                                        setMeetingJobs([...updated]);
                                      }
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                  </select>
                                </div>
                              </div>
                            </div>

                            {/* Phases Section - Horizontal Layout */}
                            <div className="mb-4">
                              <h5 className="text-sm font-semibold text-gray-900 mb-3">Phases</h5>
                              {job.phases && job.phases.length > 0 ? (
                                <div className="space-y-3">
                                  {job.phases.map((phase, phaseIndex) => {
                                    const percentComplete = phase.quantity > 0 
                                      ? Math.min(100, Math.max(0, ((phase.installed_quantity || 0) / phase.quantity) * 100)).toFixed(1)
                                      : '0.0';
                                    
                                    return (
                                      <div key={phaseIndex} className="p-4 border rounded-lg bg-gray-50">
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-3">
                                          <div className="lg:col-span-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Phase Code</label>
                                            <Input
                                              value={phase.phase_code}
                                              onChange={(e) => {
                                                const updated = [...allMeetingJobs];
                                                const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                                if (jobIndex !== -1) {
                                                  if (!updated[jobIndex].phases) updated[jobIndex].phases = [];
                                                  updated[jobIndex].phases![phaseIndex].phase_code = e.target.value;
                                                  setAllMeetingJobs(updated);
                                                  setMeetingJobs([...updated]);
                                                }
                                              }}
                                              className="text-sm"
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          </div>
                                          <div className="lg:col-span-4">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                            <Input
                                              value={phase.phase_description || ''}
                                              onChange={(e) => {
                                                const updated = [...allMeetingJobs];
                                                const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                                if (jobIndex !== -1) {
                                                  if (!updated[jobIndex].phases) updated[jobIndex].phases = [];
                                                  updated[jobIndex].phases![phaseIndex].phase_description = e.target.value;
                                                  setAllMeetingJobs(updated);
                                                  setMeetingJobs([...updated]);
                                                }
                                              }}
                                              className="text-sm"
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          </div>
                                          <div className="lg:col-span-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Masons</label>
                                            <Input
                                              type="number"
                                              min="0"
                                              value={phase.masons}
                                              onChange={(e) => {
                                                const updated = [...allMeetingJobs];
                                                const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                                if (jobIndex !== -1) {
                                                  if (!updated[jobIndex].phases) updated[jobIndex].phases = [];
                                                  updated[jobIndex].phases![phaseIndex].masons = parseInt(e.target.value) || 0;
                                                  setAllMeetingJobs(updated);
                                                  setMeetingJobs([...updated]);
                                                }
                                              }}
                                              className="text-sm"
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          </div>
                                          <div className="lg:col-span-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Operators</label>
                                            <Input
                                              type="number"
                                              min="0"
                                              value={phase.operators}
                                              onChange={(e) => {
                                                const updated = [...allMeetingJobs];
                                                const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                                if (jobIndex !== -1) {
                                                  if (!updated[jobIndex].phases) updated[jobIndex].phases = [];
                                                  updated[jobIndex].phases![phaseIndex].operators = parseInt(e.target.value) || 0;
                                                  setAllMeetingJobs(updated);
                                                  setMeetingJobs([...updated]);
                                                }
                                              }}
                                              className="text-sm"
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          </div>
                                          <div className="lg:col-span-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Labors</label>
                                            <Input
                                              type="number"
                                              min="0"
                                              value={phase.labors}
                                              onChange={(e) => {
                                                const updated = [...allMeetingJobs];
                                                const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                                if (jobIndex !== -1) {
                                                  if (!updated[jobIndex].phases) updated[jobIndex].phases = [];
                                                  updated[jobIndex].phases![phaseIndex].labors = parseInt(e.target.value) || 0;
                                                  setAllMeetingJobs(updated);
                                                  setMeetingJobs([...updated]);
                                                }
                                              }}
                                              className="text-sm"
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-3">
                                          <div className="lg:col-span-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Total Quantity</label>
                                            <Input
                                              type="number"
                                              step="0.01"
                                              min="0"
                                              value={phase.quantity}
                                              onChange={(e) => {
                                                const updated = [...allMeetingJobs];
                                                const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                                if (jobIndex !== -1) {
                                                  if (!updated[jobIndex].phases) updated[jobIndex].phases = [];
                                                  updated[jobIndex].phases![phaseIndex].quantity = parseFloat(e.target.value) || 0;
                                                  setAllMeetingJobs(updated);
                                                  setMeetingJobs([...updated]);
                                                }
                                              }}
                                              className="text-sm"
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          </div>
                                          <div className="lg:col-span-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Quantity Done</label>
                                            <Input
                                              type="number"
                                              step="0.01"
                                              min="0"
                                              value={phase.installed_quantity}
                                              onChange={(e) => {
                                                const updated = [...allMeetingJobs];
                                                const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                                if (jobIndex !== -1) {
                                                  if (!updated[jobIndex].phases) updated[jobIndex].phases = [];
                                                  updated[jobIndex].phases![phaseIndex].installed_quantity = parseFloat(e.target.value) || 0;
                                                  setAllMeetingJobs(updated);
                                                  setMeetingJobs([...updated]);
                                                }
                                              }}
                                              className="text-sm"
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          </div>
                                          <div className="lg:col-span-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Complete %</label>
                                            <Input
                                              value={`${percentComplete}%`}
                                              disabled
                                              className="text-sm bg-gray-100"
                                              title={`${phase.installed_quantity || 0} / ${phase.quantity || 0}`}
                                            />
                                          </div>
                                          <div className="lg:col-span-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Duration (days)</label>
                                            <Input
                                              type="number"
                                              min="0"
                                              value={phase.duration || ''}
                                              onChange={(e) => {
                                                const updated = [...allMeetingJobs];
                                                const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                                if (jobIndex !== -1) {
                                                  if (!updated[jobIndex].phases) updated[jobIndex].phases = [];
                                                  updated[jobIndex].phases![phaseIndex].duration = parseInt(e.target.value) || undefined;
                                                  setAllMeetingJobs(updated);
                                                  setMeetingJobs([...updated]);
                                                }
                                              }}
                                              className="text-sm"
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          </div>
                                          <div className="lg:col-span-4">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Phase Notes</label>
                                            <Input
                                              value={phase.notes || ''}
                                              onChange={(e) => {
                                                const updated = [...allMeetingJobs];
                                                const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                                if (jobIndex !== -1) {
                                                  if (!updated[jobIndex].phases) updated[jobIndex].phases = [];
                                                  updated[jobIndex].phases![phaseIndex].notes = e.target.value;
                                                  setAllMeetingJobs(updated);
                                                  setMeetingJobs([...updated]);
                                                }
                                              }}
                                              className="text-sm"
                                              placeholder="Phase-specific notes..."
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500">No phases found for this job</p>
                              )}
                            </div>

                            {/* Job Notes */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Job Notes</label>
                              <textarea
                                value={job.notes || ''}
                                onChange={(e) => {
                                  const updated = [...allMeetingJobs];
                                  const jobIndex = updated.findIndex(j => j.project_id === job.project_id);
                                  if (jobIndex !== -1) {
                                    updated[jobIndex].notes = e.target.value;
                                    setAllMeetingJobs(updated);
                                    setMeetingJobs([...updated]);
                                  }
                                }}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                placeholder="Job-specific notes..."
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                  </div>
                </>
              )}
              </div>
              
              {/* Fixed Pagination Footer */}
              {totalPages > 1 && (
                <div className="flex-shrink-0 sticky bottom-0 bg-gray-50 border-t border-gray-200 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 z-10">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                    <div className="text-xs text-gray-600">
                      Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="text-xs px-2 py-1"
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? "primary" : "outline"}
                              onClick={() => setCurrentPage(pageNum)}
                              className="text-xs px-2 py-1 min-w-[2rem]"
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="text-xs px-2 py-1"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
