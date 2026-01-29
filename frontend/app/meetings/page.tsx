'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
 CalendarIcon,
} from '@heroicons/react/24/outline';
import { useRouter, useSearchParams } from 'next/navigation';
import { isAxiosError } from 'axios';

interface Meeting {
 id: number;
 meeting_date: string;
 week_number: number | null;
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
 status?: string;
}

type Branch = { id: number; name: string };

type DRFPage<T> = {
 count: number;
 next: string | null;
 previous: string | null;
 results: T[];
};

type ApiErrorBody = { detail?: string };

function useDebounce<T>(value: T, delayMs: number) {
 const [debounced, setDebounced] = useState(value);

 useEffect(() => {
  const t = setTimeout(() => setDebounced(value), delayMs);
  return () => clearTimeout(t);
 }, [value, delayMs]);

 return debounced;
}

function isRequestCanceled(err: unknown): boolean {
 // axios v1 cancellation usually comes as AxiosError with code ERR_CANCELED
 if (isAxiosError(err) && err.code === 'ERR_CANCELED') return true;
 // sometimes name is CanceledError
 if (err instanceof Error && err.name === 'CanceledError') return true;
 return false;
}

function getErrorMessage(err: unknown, fallback: string): string {
 if (isAxiosError<ApiErrorBody>(err)) {
  return err.response?.data?.detail || err.message || fallback;
 }
 if (err instanceof Error) return err.message || fallback;
 return fallback;
}

type MeetingListParams = {
 page: number;
 page_size: number;
 ordering: string;
 search?: string;
 branch?: number;
 date_from?: string;
 date_to?: string;
 status?: string;
};

function MeetingsPageContent() {
 const router = useRouter();
 const searchParams = useSearchParams();
 const { user } = useAuth();

 // Data
 const [meetings, setMeetings] = useState<Meeting[]>([]);
 const [totalCount, setTotalCount] = useState(0);
 const [branches, setBranches] = useState<Branch[]>([]);

 // UI state
 const [loading, setLoading] = useState(true);
 const [branchesLoading, setBranchesLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [success, setSuccess] = useState<string | null>(null);

 // Filters (server-side)
 const [searchTerm, setSearchTerm] = useState('');
 const debouncedSearch = useDebounce(searchTerm, 350);

 const [filterBranch, setFilterBranch] = useState<number | null>(null);
 const [filterDateFrom, setFilterDateFrom] = useState('');
 const [filterDateTo, setFilterDateTo] = useState('');
 const [filterStatus, setFilterStatus] = useState<'ALL' | 'DRAFT' | 'COMPLETED'>('ALL');

 // Pagination (server-side)
 const [currentPage, setCurrentPage] = useState(1);
 const [meetingsPerPage, setMeetingsPerPage] = useState(50);
 const [refreshKey, setRefreshKey] = useState(0);

 // Modals
 const [showCreateModal, setShowCreateModal] = useState(false);
 const [showDeleteModal, setShowDeleteModal] = useState(false);
 const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);

 // New meeting form
 const [newMeetingDate, setNewMeetingDate] = useState('');
 const [newMeetingBranch, setNewMeetingBranch] = useState<number | null>(null);
 const [newMeetingNotes, setNewMeetingNotes] = useState('');
 const [saving, setSaving] = useState(false);

 // Used to cancel in-flight requests when filters/page change quickly
 const abortRef = useRef<AbortController | null>(null);

 // Open create modal based on query param (?create=true)
 useEffect(() => {
  const shouldCreate = searchParams?.get('create') === 'true';
  if (shouldCreate && !showCreateModal) {
   const today = new Date().toISOString().split('T')[0];
   setNewMeetingDate(today);
   setShowCreateModal(true);
   router.replace('/meetings', { scroll: false });
  }
 }, [searchParams, showCreateModal, router]);

 // Fetch branches (once)
 useEffect(() => {
  const run = async () => {
   try {
    setBranchesLoading(true);
    const res = await api.get<DRFPage<Branch> | Branch[]>('/branches/?status=ACTIVE');
    const data = res.data;

    if (Array.isArray(data)) {
     setBranches(data);
    } else {
     setBranches(data.results ?? []);
    }
   } catch (err: unknown) {
    console.error('Error fetching branches:', err);
   } finally {
    setBranchesLoading(false);
   }
  };
  run();
 }, []);

 // Reset to page 1 when filters change
 useEffect(() => {
  setCurrentPage(1);
 }, [debouncedSearch, filterBranch, filterDateFrom, filterDateTo, filterStatus, meetingsPerPage]);

 useEffect(() => {
  if (!success) return;
  const t = setTimeout(() => setSuccess(null), 3000);
  return () => clearTimeout(t);
 }, [success]);

 // Fetch meetings whenever filters/page change (server-side)
 useEffect(() => {
  const fetchMeetings = async () => {
   try {
    setLoading(true);
    setError(null);
    setSuccess(null);

    // cancel old request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params: MeetingListParams = {
     page: currentPage,
     page_size: meetingsPerPage,
     ordering: '-meeting_date',
    };

    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (filterBranch) params.branch = filterBranch;
    if (filterDateFrom) params.date_from = filterDateFrom;
    if (filterDateTo) params.date_to = filterDateTo;
    if (filterStatus !== 'ALL') params.status = filterStatus;

    const res = await api.get<DRFPage<Meeting> | Meeting[]>('/meetings/meetings/', {
     params,
     signal: controller.signal,
    });

    const data = res.data;

    if (Array.isArray(data)) {
     setMeetings(data);
     setTotalCount(data.length);
    } else {
     setMeetings(data.results ?? []);
     setTotalCount(typeof data.count === 'number' ? data.count : (data.results?.length ?? 0));
    }
   } catch (err: unknown) {
    if (isRequestCanceled(err)) return;

    const msg = getErrorMessage(err, 'Failed to load meetings');
    setError(msg);
    console.error('Error fetching meetings:', err);
   } finally {
    setLoading(false);
   }
  };

  fetchMeetings();

  return () => {
   abortRef.current?.abort();
  };
 }, [
  currentPage,
  meetingsPerPage,
  debouncedSearch,
  filterBranch,
  filterDateFrom,
  filterDateTo,
  filterStatus,
  refreshKey,
 ]);

 const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / meetingsPerPage)), [totalCount, meetingsPerPage]);

 const startIndex = (currentPage - 1) * meetingsPerPage;
 const endIndex = startIndex + meetings.length; // actual end index based on returned page size

 const handleOpenReview = (meeting: Meeting) => {
  router.push(`/meetings/${meeting.id}/review`);
 };

 const handleCreateMeeting = async () => {
  if (!newMeetingDate) {
   setError('Meeting date is required');
   return;
  }

  try {
   setSaving(true);
   const res = await api.post<{ id: number }>('/meetings/meetings/', {
    meeting_date: newMeetingDate,
    branch_id: newMeetingBranch,
    notes: newMeetingNotes,
   });

   router.push(`/meetings/${res.data.id}/review`);

   setNewMeetingDate('');
   setNewMeetingBranch(null);
   setNewMeetingNotes('');
   setShowCreateModal(false);
  } catch (err: unknown) {
   const msg = getErrorMessage(err, 'Failed to create meeting');
   setError(msg);
   console.error('Error creating meeting:', err);
  } finally {
   setSaving(false);
  }
 };

 const handleExportPDF = async (meetingId: number) => {
  try {
   const response = await api.get<Blob>(`/meetings/meetings/${meetingId}/export_pdf/`, {
    responseType: 'blob',
   });

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
  } catch (err: unknown) {
   const msg = getErrorMessage(err, 'Failed to export PDF');
   setError(msg);
   console.error('Error exporting PDF:', err);
  }
 };

 const handleExportExcel = async (meetingId: number) => {
  try {
   const response = await api.get<Blob>(`/meetings/meetings/${meetingId}/export_excel/`, {
    responseType: 'blob',
   });

   const url = window.URL.createObjectURL(new Blob([response.data]));
   const link = document.createElement('a');
   link.href = url;
   link.setAttribute('download', `meeting_${meetingId}.xlsx`);
   document.body.appendChild(link);
   link.click();
   link.remove();
   window.URL.revokeObjectURL(url);
  } catch (err: unknown) {
   const msg = getErrorMessage(err, 'Failed to export Excel');
   setError(msg);
   console.error('Error exporting Excel:', err);
  }
 };

 const openDeleteModal = (meeting: Meeting) => {
  setMeetingToDelete(meeting);
  setShowDeleteModal(true);
 };

 const handleDeleteMeeting = async () => {
  if (!meetingToDelete) return;

  try {
   await api.delete(`/meetings/meetings/${meetingToDelete.id}/`);
   setShowDeleteModal(false);
   setMeetingToDelete(null);
   setCurrentPage(1);
   setRefreshKey((k) => k + 1);
   setSuccess('Meeting deleted successfully.');
  } catch (err: unknown) {
   const msg = getErrorMessage(err, 'Failed to delete meeting');
   setError(msg);
   console.error('Error deleting meeting:', err);
  }
 };

 return (
  <ProtectedRoute allowedRoles={['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PROJECT_MANAGER']}>
   <div className="min-h-screen bg-gray-50">
    <div className="">
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
        {success && (
         <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
         </div>
        )}

        {/* Search and Filters */}
        <div className="mb-2 space-y-2">
         <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
          <Input
           type="text"
           placeholder="Search meetings by date, branch, or notes..."
           value={searchTerm}
           onChange={(e) => setSearchTerm(e.target.value)}
           className="pl-9 sm:pl-10 text-sm"
          />
         </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
         <select
          value={filterBranch || ''}
          onChange={(e) => setFilterBranch(e.target.value ? parseInt(e.target.value, 10) : null)}
          disabled={branchesLoading}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
         >
          <option value="">All Branches</option>
          {branches.map((b) => (
           <option key={b.id} value={b.id}>
            {b.name}
           </option>
          ))}
         </select>

         <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'ALL' | 'DRAFT' | 'COMPLETED')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
         >
          <option value="ALL">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="COMPLETED">Completed</option>
         </select>

         <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="text-sm" />
         <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="text-sm" />
        </div>
        </div>

        {/* Pagination Info */}
        {totalCount > 0 && (
         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2">
          <div className="text-xs sm:text-sm text-gray-600">
           Showing {startIndex + 1}-{Math.min(endIndex, totalCount)} of {totalCount} meetings
          </div>
          <div className="flex items-center gap-2">
           <label className="text-xs sm:text-sm text-gray-600">Per page:</label>
           <select
            value={meetingsPerPage}
            onChange={(e) => setMeetingsPerPage(Number(e.target.value))}
            className="px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-xs sm:text-sm"
           >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
           </select>
          </div>
         </div>
        )}
       </div>

       {/* Scrollable Content */}
       <div className="flex-1 overflow-y-auto">
        {loading ? (
         <LoadingSpinner />
        ) : (
         <div className="space-y-2 sm:space-y-3">
          {meetings.length === 0 ? (
           <Card>
            <div className="text-center py-8 sm:py-12">
             <CalendarIcon className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-gray-400" />
             <h3 className="mt-2 text-sm font-medium text-gray-900">No meetings</h3>
             <p className="mt-1 text-xs sm:text-sm text-gray-500">
              Try adjusting filters or create a new meeting.
             </p>
            </div>
           </Card>
          ) : (
           meetings.map((meeting) => (
            <Card key={meeting.id} className="p-3 sm:p-4">
             <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
              <div className="flex-1 min-w-0">
               <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                 {new Date(meeting.meeting_date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                 })}
                </h3>
                {meeting.status && (
                 <span
                  className={`px-1.5 py-0.5 text-xs font-medium rounded flex-shrink-0 ${
                   meeting.status === 'COMPLETED'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800'
                  }`}
                 >
                  {meeting.status === 'COMPLETED' ? 'Completed' : 'Draft'}
                 </span>
                )}
                {meeting.week_number && (
                 <span className="px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 rounded flex-shrink-0">
                  Week {meeting.week_number}
                 </span>
                )}
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
                {' • '}
                Created:{' '}
                {new Date(meeting.created_at).toLocaleString('en-US', {
                 month: 'short',
                 day: 'numeric',
                 year: 'numeric',
                 hour: '2-digit',
                 minute: '2-digit',
                })}
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
           onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
           disabled={currentPage === 1}
           className="text-xs px-2 py-1 sm:px-3 sm:py-1.5"
          >
           Previous
          </Button>

          <div className="flex items-center gap-1">
           {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) pageNum = i + 1;
            else if (currentPage <= 3) pageNum = i + 1;
            else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
            else pageNum = currentPage - 2 + i;

            return (
             <Button
              key={pageNum}
              variant={currentPage === pageNum ? 'primary' : 'outline'}
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
           onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
         <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Date *</label>
         <Input type="date" value={newMeetingDate} onChange={(e) => setNewMeetingDate(e.target.value)} required />
        </div>

        <div>
         <label className="block text-sm font-medium text-gray-700 mb-1">Branch (Optional)</label>
         <select
          value={newMeetingBranch || ''}
          onChange={(e) => setNewMeetingBranch(e.target.value ? parseInt(e.target.value, 10) : null)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
         >
          <option value="">All Branches</option>
          {branches.map((b) => (
           <option key={b.id} value={b.id}>
            {b.name}
           </option>
          ))}
         </select>
        </div>

        <div>
         <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
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
           if (searchParams?.get('create') === 'true') {
            router.replace('/meetings', { scroll: false });
           }
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

       <div className="mb-6 p-4 bg-gray-50 rounded-lg text-sm">
        <div className="flex justify-between">
         <span className="font-medium text-gray-700">Meeting Date:</span>
         <span className="text-gray-900">
          {new Date(meetingToDelete.meeting_date).toLocaleDateString('en-US', {
           year: 'numeric',
           month: 'short',
           day: 'numeric',
          })}
         </span>
        </div>
       </div>

       <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => { setShowDeleteModal(false); setMeetingToDelete(null); }}>
         Cancel
        </Button>
        <Button onClick={handleDeleteMeeting} className="bg-red-600 hover:bg-red-700 text-white">
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

export default function MeetingsPage() {
 return (
  <Suspense
   fallback={
    <main className="flex-1 flex items-center justify-center bg-gray-50">
     <LoadingSpinner />
    </main>
   }
  >
   <MeetingsPageContent />
  </Suspense>
 );
}
