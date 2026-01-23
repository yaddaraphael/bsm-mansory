'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { 
  PlusIcon, 
  MagnifyingGlassIcon,
  DocumentArrowDownIcon,
  PencilIcon,
  TrashIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';

interface Meeting {
  id: number;
  meeting_date: string;
  created_by: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
  };
  branch: {
    id: number;
    name: string;
  } | null;
  notes: string | null;
  meeting_jobs_count: number;
  created_at: string;
}

interface Project {
  id: number;
  job_number: string;
  name: string;
  branch: {
    id: number;
    name: string;
  };
  project_manager: {
    id: number;
    first_name: string;
    last_name: string;
  } | null;
}

interface Phase {
  id?: number;
  phase_code: string;
  phase_description?: string;
  masons: number;
  operators: number;
  labors: number;
  quantity: number;
  installed_quantity: number;
  duration?: number;
  notes?: string;
  percent_complete?: number;
}

interface MeetingJob {
  id?: number;
  project_id: number;
  project?: Project & {
    start_date?: string;
    estimated_end_date?: string;
    saturdays?: boolean;
    full_weekends?: boolean;
    foreman?: {
      id: number;
      first_name: string;
      last_name: string;
    } | null;
    scopes?: Array<{
      id: number;
      scope_type: string;
      description?: string;
    }>;
  };
  masons: number;
  labors: number;
  notes: string;
  handoff_from_estimator?: boolean;
  handoff_to_foreman?: boolean;
  site_specific_safety_plan?: boolean;
  phases?: Phase[];
}

export default function MeetingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);
  const [activeJobs, setActiveJobs] = useState<Project[]>([]);
  const [meetingJobs, setMeetingJobs] = useState<MeetingJob[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  
  // New meeting form state
  const [newMeetingDate, setNewMeetingDate] = useState('');
  const [newMeetingBranch, setNewMeetingBranch] = useState<number | null>(null);
  const [newMeetingNotes, setNewMeetingNotes] = useState('');
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [meetingsPerPage, setMeetingsPerPage] = useState(50);
  
  // Filter state
  const [filterBranch, setFilterBranch] = useState<number | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMeetings();
    fetchBranches();
  }, []);

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/meetings/meetings/');
      setMeetings(response.data.results || response.data || []);
      setError(null);
    } catch (err) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to load meetings');
      console.error('Error fetching meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await api.get('/branches/?status=ACTIVE');
      setBranches(response.data.results || response.data || []);
    } catch (err) {
      console.error('Error fetching branches:', err);
    }
  };

  const fetchActiveJobs = async () => {
    try {
      const response = await api.get('/meetings/meetings/active_jobs/');
      setActiveJobs(response.data || []);
      
      // Initialize meeting jobs with all active jobs
      const initialJobs: MeetingJob[] = response.data.map((job: Project) => ({
        project_id: job.id,
        project: job,
        masons: 0,
        labors: 0,
        notes: '',
      }));
      setMeetingJobs(initialJobs);
    } catch (err) {
      const error = err as { response?: { data?: { detail?: string } } };
      console.error('Error fetching active jobs:', err);
      setError(error.response?.data?.detail || 'Failed to load active jobs');
    }
  };

  const handleOpenReview = (meeting: Meeting) => {
    router.push(`/meetings/${meeting.id}/review`);
  };

  const handleSaveMeetingJobs = async () => {
    // This function is for the old modal - now we use the review page
    // Keeping it for compatibility but it should navigate instead
    if (selectedMeeting) {
      router.push(`/meetings/${selectedMeeting.id}/review`);
    }
  };

  const handleCreateMeeting = async () => {
    if (!newMeetingDate) {
      setError('Meeting date is required');
      return;
    }

    try {
      setSaving(true);
      const response = await api.post('/meetings/meetings/', {
        meeting_date: newMeetingDate,
        branch_id: newMeetingBranch,
        notes: newMeetingNotes,
      });
      
      // After creating meeting, navigate to review page
      router.push(`/meetings/${response.data.id}/review`);
      
      // Reset form
      setNewMeetingDate('');
      setNewMeetingBranch(null);
      setNewMeetingNotes('');
      setShowCreateModal(false);
    } catch (err) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to create meeting');
      console.error('Error creating meeting:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = async (meetingId: number) => {
    try {
      const response = await api.get(`/meetings/meetings/${meetingId}/export_pdf/`, {
        responseType: 'blob',
      });
      
      // Check if response is successful
      if (response.status === 200 && response.data) {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `meeting_${meetingId}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } else {
        setError('Failed to export PDF: Invalid response');
      }
    } catch (err) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to export PDF';
      setError(errorMessage);
      console.error('Error exporting PDF:', err);
    }
  };

  const handleExportExcel = async (meetingId: number) => {
    try {
      const response = await api.get(`/meetings/meetings/${meetingId}/export_excel/`, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `meeting_${meetingId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Failed to export Excel');
      console.error('Error exporting Excel:', err);
    }
  };

  const handleDeleteMeeting = async () => {
    if (!meetingToDelete) return;

    try {
      await api.delete(`/meetings/meetings/${meetingToDelete.id}/`);
      await fetchMeetings();
      setError(null);
      setShowDeleteModal(false);
      setMeetingToDelete(null);
    } catch (err) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to delete meeting');
      console.error('Error deleting meeting:', err);
    }
  };

  const openDeleteModal = (meeting: Meeting) => {
    setMeetingToDelete(meeting);
    setShowDeleteModal(true);
  };

  const filteredMeetings = meetings.filter(meeting => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = (
      meeting.meeting_date.toLowerCase().includes(searchLower) ||
      (meeting.branch?.name.toLowerCase().includes(searchLower) || '') ||
      (meeting.notes?.toLowerCase().includes(searchLower) || '')
    );
    
    // Filter by branch
    const matchesBranch = !filterBranch || meeting.branch?.id === filterBranch;
    
    // Filter by date range
    const meetingDate = new Date(meeting.meeting_date);
    const matchesDateFrom = !filterDateFrom || meetingDate >= new Date(filterDateFrom);
    const matchesDateTo = !filterDateTo || meetingDate <= new Date(filterDateTo);
    
    return matchesSearch && matchesBranch && matchesDateFrom && matchesDateTo;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredMeetings.length / meetingsPerPage);
  const startIndex = (currentPage - 1) * meetingsPerPage;
  const endIndex = startIndex + meetingsPerPage;
  const paginatedMeetings = filteredMeetings.slice(startIndex, endIndex);

  // Reset to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <ProtectedRoute allowedRoles={['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PROJECT_MANAGER']}>
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <div className="lg:pl-64">
          <Header />
          <main className="pt-16 md:pt-20 pb-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
              {/* Fixed Header */}
              <div className="flex-shrink-0 bg-gray-50 pb-4 mb-4 border-b border-gray-200 sticky top-16 md:top-20 z-20">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Meetings</h1>
                    <p className="mt-1 text-xs sm:text-sm text-gray-500">
                      Review active jobs and track masons, operators, labors, and notes
                    </p>
                  </div>
                  {/* Only admins can create new meetings */}
                  {(user?.role === 'ROOT_SUPERADMIN' || user?.role === 'SUPERADMIN' || user?.role === 'ADMIN') && (
                    <Button
                      onClick={() => {
                        const today = new Date().toISOString().split('T')[0];
                        setNewMeetingDate(today);
                        setShowCreateModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold bg-primary hover:bg-primary/90 shadow-lg"
                    >
                      <PlusIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                      <span className="hidden sm:inline">Create New Meeting</span>
                      <span className="sm:hidden">New Meeting</span>
                    </Button>
                  )}
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                  </div>
                )}

                {/* Search and Filters */}
                <div className="mb-2 space-y-2">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search meetings by date, branch, or notes..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 sm:pl-10 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={filterBranch || ''}
                      onChange={(e) => {
                        setFilterBranch(e.target.value ? parseInt(e.target.value) : null);
                        setCurrentPage(1);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                    >
                      <option value="">All Branches</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="date"
                      placeholder="From Date"
                      value={filterDateFrom}
                      onChange={(e) => {
                        setFilterDateFrom(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="text-sm"
                    />
                    <Input
                      type="date"
                      placeholder="To Date"
                      value={filterDateTo}
                      onChange={(e) => {
                        setFilterDateTo(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="text-sm"
                    />
                  </div>
                </div>

                {/* Pagination Info and Page Size Selector */}
                {filteredMeetings.length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2">
                    <div className="text-xs sm:text-sm text-gray-600">
                      Showing {startIndex + 1}-{Math.min(endIndex, filteredMeetings.length)} of {filteredMeetings.length} meetings
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs sm:text-sm text-gray-600">Per page:</label>
                      <select
                        value={meetingsPerPage}
                        onChange={(e) => {
                          setMeetingsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-xs sm:text-sm"
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
                )}
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto">

                {/* Meetings List */}
                {loading ? (
                  <LoadingSpinner />
                ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {paginatedMeetings.length === 0 ? (
                      <Card>
                        <div className="text-center py-8 sm:py-12">
                          <CalendarIcon className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-gray-400" />
                          <h3 className="mt-2 text-sm font-medium text-gray-900">No meetings</h3>
                          <p className="mt-1 text-xs sm:text-sm text-gray-500">
                            Get started by creating a new meeting.
                          </p>
                        </div>
                      </Card>
                    ) : (
                      paginatedMeetings.map((meeting) => (
                        <Card key={meeting.id} className="p-3 sm:p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                                  {new Date(meeting.meeting_date).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </h3>
                                {meeting.branch && (
                                  <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded flex-shrink-0">
                                    {meeting.branch.name}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs sm:text-sm text-gray-500 truncate">
                                {meeting.created_by.first_name} {meeting.created_by.last_name}
                                {' • '}
                                {meeting.meeting_jobs_count} job{meeting.meeting_jobs_count !== 1 ? 's' : ''}
                              </p>
                              {meeting.notes && (
                                <p className="mt-1 text-xs sm:text-sm text-gray-700 line-clamp-1">
                                  {meeting.notes}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                              <Button
                                variant="outline"
                                onClick={() => handleOpenReview(meeting)}
                                className="text-xs px-2 py-1 sm:px-3 sm:py-1.5"
                              >
                                <PencilIcon className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                <span className="hidden sm:inline">Review</span>
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => handleExportPDF(meeting.id)}
                                className="text-xs px-2 py-1 sm:px-3 sm:py-1.5"
                                title="Export PDF"
                              >
                                <DocumentArrowDownIcon className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                <span className="hidden sm:inline">PDF</span>
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => handleExportExcel(meeting.id)}
                                className="text-xs px-2 py-1 sm:px-3 sm:py-1.5"
                                title="Export Excel"
                              >
                                <DocumentArrowDownIcon className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                <span className="hidden sm:inline">Excel</span>
                              </Button>
                              {(user?.role === 'ROOT_SUPERADMIN' || user?.role === 'SUPERADMIN' || user?.role === 'ADMIN') && (
                                <Button
                                  variant="outline"
                                  onClick={() => openDeleteModal(meeting)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs px-2 py-1 sm:px-3 sm:py-1.5"
                                  title="Delete Meeting"
                                >
                                  <TrashIcon className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                  <span className="hidden sm:inline">Delete</span>
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex-shrink-0 mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-xs sm:text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="text-xs px-2 py-1 sm:px-3 sm:py-1.5"
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
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
                            className="text-xs px-2 py-1 sm:px-3 sm:py-1.5 min-w-[2rem]"
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
                      className="text-xs px-2 py-1 sm:px-3 sm:py-1.5"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Create Meeting Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Create New Meeting</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Meeting Date *
                  </label>
                  <Input
                    type="date"
                    value={newMeetingDate}
                    onChange={(e) => setNewMeetingDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Branch (Optional)
                  </label>
                  <select
                    value={newMeetingBranch || ''}
                    onChange={(e) => setNewMeetingBranch(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="">All Branches</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={newMeetingNotes}
                    onChange={(e) => setNewMeetingNotes(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="General meeting notes..."
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewMeetingDate('');
                      setNewMeetingBranch(null);
                      setNewMeetingNotes('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleCreateMeeting} disabled={saving}>
                    {saving ? 'Creating...' : 'Create & Review'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Old modal removed - now using full page - code removed to fix TypeScript errors */}
        {false && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <Card className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">
                  Review Meeting - {selectedMeeting?.meeting_date ? new Date((selectedMeeting as Meeting).meeting_date).toLocaleDateString() : ''}
                </h2>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowReviewModal(false);
                    setSelectedMeeting(null);
                    setMeetingJobs([]);
                  }}
                >
                  Close
                </Button>
              </div>

              <div className="space-y-4">
                {meetingJobs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No active jobs found
                  </div>
                ) : (
                  <div className="space-y-6">
                    {meetingJobs.map((job: MeetingJob, index: number) => {
                      const project = job.project;
                      const scopes = project?.scopes || [];
                      const scopeTypes = scopes.map((s: { scope_type?: string }) => s.scope_type).filter(Boolean).join(', ') || 'N/A';
                      
                      return (
                        <Card key={job.project_id} className="p-6">
                          {/* Job Header */}
                          <div className="mb-4 pb-4 border-b">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              <div>
                                <h4 className="font-semibold text-gray-900">{project?.job_number}</h4>
                                <p className="text-sm text-gray-600">{project?.name}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Start Date</p>
                                <p className="text-sm font-medium">{project?.start_date ? new Date(project.start_date).toLocaleDateString() : 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">End Date</p>
                                <p className="text-sm font-medium">{project?.estimated_end_date ? new Date(project.estimated_end_date).toLocaleDateString() : 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Scope</p>
                                <p className="text-sm font-medium">{scopeTypes}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                              <div>
                                <p className="text-xs text-gray-500">Branch</p>
                                <p className="text-sm font-medium">{project?.branch?.name || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Project Manager</p>
                                <p className="text-sm font-medium">
                                  {project?.project_manager ? `${project.project_manager.first_name} ${project.project_manager.last_name}` : 'N/A'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Foreman</p>
                                <p className="text-sm font-medium">
                                  {project?.foreman ? `${project.foreman.first_name} ${project.foreman.last_name}` : 'N/A'}
                                </p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                              <div>
                                <p className="text-xs text-gray-500">Saturday</p>
                                <p className="text-sm font-medium">{project?.saturdays ? 'Yes' : 'No'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Full Weekends</p>
                                <p className="text-sm font-medium">{project?.full_weekends ? 'Yes' : 'No'}</p>
                              </div>
                            </div>
                          </div>

                          {/* Yes/No Checkboxes */}
                          <div className="mb-4 pb-4 border-b">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={job.handoff_from_estimator || false}
                                  onChange={(e) => {
                                    const updated = [...meetingJobs];
                                    updated[index].handoff_from_estimator = e.target.checked;
                                    setMeetingJobs(updated);
                                  }}
                                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                />
                                <span className="text-sm font-medium text-gray-700">Handoff from Estimator</span>
                              </label>
                              <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={job.handoff_to_foreman || false}
                                  onChange={(e) => {
                                    const updated = [...meetingJobs];
                                    updated[index].handoff_to_foreman = e.target.checked;
                                    setMeetingJobs(updated);
                                  }}
                                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                />
                                <span className="text-sm font-medium text-gray-700">Handoff to Foreman</span>
                              </label>
                              <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={job.site_specific_safety_plan || false}
                                  onChange={(e) => {
                                    const updated = [...meetingJobs];
                                    updated[index].site_specific_safety_plan = e.target.checked;
                                    setMeetingJobs(updated);
                                  }}
                                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                />
                                <span className="text-sm font-medium text-gray-700">Site Specific Safety Plan</span>
                              </label>
                            </div>
                          </div>

                          {/* Phases Section */}
                          <div className="mb-4">
                            <h5 className="text-sm font-semibold text-gray-900 mb-3">Phases</h5>
                            {job.phases && job.phases.length > 0 ? (
                              <div className="space-y-3">
                                {job.phases.map((phase: Phase, phaseIndex: number) => {
                                  const percentComplete = phase.quantity > 0 
                                    ? ((phase.installed_quantity / phase.quantity) * 100).toFixed(1)
                                    : '0.0';
                                  
                                  return (
                                    <div key={phaseIndex} className="p-3 border rounded-lg bg-gray-50">
                                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-2">
                                        <div className="md:col-span-3">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Phase Code</label>
                                          <Input
                                            value={phase.phase_code}
                                            onChange={(e) => {
                                              const updated = [...meetingJobs];
                                              if (!updated[index].phases) updated[index].phases = [];
                                              updated[index].phases[phaseIndex].phase_code = e.target.value;
                                              setMeetingJobs(updated);
                                            }}
                                            className="text-sm"
                                          />
                                        </div>
                                        <div className="md:col-span-9">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                          <Input
                                            value={phase.phase_description || ''}
                                            onChange={(e) => {
                                              const updated = [...meetingJobs];
                                              if (!updated[index].phases) updated[index].phases = [];
                                              updated[index].phases[phaseIndex].phase_description = e.target.value;
                                              setMeetingJobs(updated);
                                            }}
                                            className="text-sm"
                                          />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-2">
                                        <div className="md:col-span-3">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Masons</label>
                                          <Input
                                            type="number"
                                            min="0"
                                            value={phase.masons}
                                            onChange={(e) => {
                                              const updated = [...meetingJobs];
                                              if (!updated[index].phases) updated[index].phases = [];
                                              updated[index].phases[phaseIndex].masons = parseInt(e.target.value) || 0;
                                              setMeetingJobs(updated);
                                            }}
                                            className="text-sm"
                                          />
                                        </div>
                                        <div className="md:col-span-3">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Operators</label>
                                          <Input
                                            type="number"
                                            min="0"
                                            value={phase.operators}
                                            onChange={(e) => {
                                              const updated = [...meetingJobs];
                                              if (!updated[index].phases) updated[index].phases = [];
                                              updated[index].phases[phaseIndex].operators = parseInt(e.target.value) || 0;
                                              setMeetingJobs(updated);
                                            }}
                                            className="text-sm"
                                          />
                                        </div>
                                        <div className="md:col-span-3">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Labors</label>
                                          <Input
                                            type="number"
                                            min="0"
                                            value={phase.labors}
                                            onChange={(e) => {
                                              const updated = [...meetingJobs];
                                              if (!updated[index].phases) updated[index].phases = [];
                                              updated[index].phases[phaseIndex].labors = parseInt(e.target.value) || 0;
                                              setMeetingJobs(updated);
                                            }}
                                            className="text-sm"
                                          />
                                        </div>
                                        <div className="md:col-span-3">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Duration (days)</label>
                                          <Input
                                            type="number"
                                            min="0"
                                            value={phase.duration || ''}
                                            onChange={(e) => {
                                              const updated = [...meetingJobs];
                                              if (!updated[index].phases) updated[index].phases = [];
                                              updated[index].phases[phaseIndex].duration = parseInt(e.target.value) || undefined;
                                              setMeetingJobs(updated);
                                            }}
                                            className="text-sm"
                                          />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-2">
                                        <div className="md:col-span-4">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={phase.quantity}
                                            onChange={(e) => {
                                              const updated = [...meetingJobs];
                                              if (!updated[index].phases) updated[index].phases = [];
                                              updated[index].phases[phaseIndex].quantity = parseFloat(e.target.value) || 0;
                                              setMeetingJobs(updated);
                                            }}
                                            className="text-sm"
                                          />
                                        </div>
                                        <div className="md:col-span-4">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Installed Quantity</label>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={phase.installed_quantity}
                                            onChange={(e) => {
                                              const updated = [...meetingJobs];
                                              if (!updated[index].phases) updated[index].phases = [];
                                              updated[index].phases[phaseIndex].installed_quantity = parseFloat(e.target.value) || 0;
                                              setMeetingJobs(updated);
                                            }}
                                            className="text-sm"
                                          />
                                        </div>
                                        <div className="md:col-span-4">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Complete %</label>
                                          <Input
                                            value={`${percentComplete}%`}
                                            disabled
                                            className="text-sm bg-gray-100"
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Phase Notes</label>
                                        <textarea
                                          value={phase.notes || ''}
                                          onChange={(e) => {
                                            const updated = [...meetingJobs];
                                            if (!updated[index].phases) updated[index].phases = [];
                                            updated[index].phases[phaseIndex].notes = e.target.value;
                                            setMeetingJobs(updated);
                                          }}
                                          rows={2}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                          placeholder="Phase-specific notes..."
                                        />
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
                                const updated = [...meetingJobs];
                                updated[index].notes = e.target.value;
                                setMeetingJobs(updated);
                              }}
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                              placeholder="Job-specific notes..."
                            />
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2 justify-end pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowReviewModal(false);
                      setSelectedMeeting(null);
                      setMeetingJobs([]);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveMeetingJobs} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Meeting'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Delete Meeting Modal */}
        {showDeleteModal && meetingToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <TrashIcon className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Delete Meeting</h2>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>
              
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">Meeting Date:</span>
                    <span className="text-gray-900">
                      {new Date(meetingToDelete.meeting_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  {meetingToDelete.branch && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Branch:</span>
                      <span className="text-gray-900">{meetingToDelete.branch.name}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">Jobs:</span>
                    <span className="text-gray-900">{meetingToDelete.meeting_jobs_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">Created:</span>
                    <span className="text-gray-900">
                      {new Date(meetingToDelete.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">Created By:</span>
                    <span className="text-gray-900">
                      {meetingToDelete.created_by.first_name} {meetingToDelete.created_by.last_name}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setMeetingToDelete(null);
                  }}
                  className="px-4 py-2"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteMeeting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white"
                >
                  Delete Meeting
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
