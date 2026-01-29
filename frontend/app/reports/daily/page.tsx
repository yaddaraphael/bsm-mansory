'use client';

import { useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import DataTable from '@/components/ui/DataTable';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProjects';
import api from '@/lib/api';
import { PlusIcon, MagnifyingGlassIcon, DocumentArrowDownIcon, EnvelopeIcon, TrashIcon } from '@heroicons/react/24/outline';

interface DailyReport {
 id: number;
 report_number: string;
 project: number;
 project_detail?: {
  job_number: string;
  name: string;
 };
 date: string;
 phase: string;
 foreman: number;
 foreman_detail?: {
  first_name: string;
  last_name: string;
 };
 status: string;
 attachments_count: number;
 created_at: string;
}

export default function DailyReportsPage() {
 const router = useRouter();
 const { user } = useAuth();
 const { projects } = useProjects({ status: 'ACTIVE' });
 const [reports, setReports] = useState<DailyReport[]>([]);
 const [loading, setLoading] = useState(true);
 const [searchTerm, setSearchTerm] = useState('');
 const [statusFilter, setStatusFilter] = useState('');
 const [projectFilter, setProjectFilter] = useState('');
 const [dateFilter, setDateFilter] = useState('');
 const [phaseFilter, setPhaseFilter] = useState('');
 const [currentPage, setCurrentPage] = useState(1);
 const [totalPages, setTotalPages] = useState(1);
 const [totalCount, setTotalCount] = useState(0);
 const [statusCounts, setStatusCounts] = useState({
  DRAFT: 0,
  SUBMITTED: 0,
  APPROVED: 0,
  REJECTED: 0,
 });
 const [actionLoading, setActionLoading] = useState<number | null>(null);
 // eslint-disable-next-line @typescript-eslint/no-unused-vars
 const [showDeleteModal, setShowDeleteModal] = useState<number | null>(null);
 // eslint-disable-next-line @typescript-eslint/no-unused-vars
 const [showEmailModal, setShowEmailModal] = useState<number | null>(null);
 const [emailAddress, setEmailAddress] = useState('');
 // eslint-disable-next-line @typescript-eslint/no-unused-vars
 const [emailError, setEmailError] = useState('');

 const canCreate = user?.role === 'FOREMAN';
 const canDelete = user?.role === 'ROOT_SUPERADMIN' || user?.role === 'SUPERADMIN';

 const fetchReports = useCallback(async () => {
  try {
   setLoading(true);
   const params = new URLSearchParams({
    page: currentPage.toString(),
   });
   
   if (statusFilter) params.append('status', statusFilter);
   if (projectFilter) params.append('project', projectFilter);
   if (dateFilter) params.append('date', dateFilter);
   if (phaseFilter) params.append('phase', phaseFilter);
   if (searchTerm) params.append('search', searchTerm);

   const response = await api.get(`/projects/daily-reports/?${params.toString()}`);
   setReports(response.data.results || response.data || []);
   setTotalPages(Math.ceil((response.data.count || 0) / 20));
   setTotalCount(response.data.count || 0);
   
   // Calculate status counts from all reports (fetch without filters for counts)
   try {
    const allReportsResponse = await api.get('/projects/daily-reports/?page_size=1000');
    const allReports = allReportsResponse.data.results || allReportsResponse.data || [];
    const counts = {
     DRAFT: allReports.filter((r: DailyReport) => r.status === 'DRAFT').length,
     SUBMITTED: allReports.filter((r: DailyReport) => r.status === 'SUBMITTED').length,
     APPROVED: allReports.filter((r: DailyReport) => r.status === 'APPROVED').length,
     REJECTED: allReports.filter((r: DailyReport) => r.status === 'REJECTED').length,
    };
    setStatusCounts(counts);
   } catch (err) {
    console.error('Failed to fetch status counts:', err);
   }
  } catch (error) {
   console.error('Failed to fetch reports:', error);
  } finally {
   setLoading(false);
  }
 }, [currentPage, statusFilter, projectFilter, dateFilter, phaseFilter, searchTerm]);

 useEffect(() => {
  fetchReports();
 }, [fetchReports]);

 // eslint-disable-next-line @typescript-eslint/no-unused-vars
 const handleDelete = async (reportId: number) => {
  setActionLoading(reportId);
  try {
   await api.delete(`/projects/daily-reports/${reportId}/`);
   await fetchReports();
   setShowDeleteModal(null);
  } catch (error: unknown) {
   const err = error as { response?: { data?: { error?: string } } };
   console.error('Failed to delete report:', err);
  } finally {
   setActionLoading(null);
  }
 };

 const handleDeleteClick = (reportId: number) => {
  setShowDeleteModal(reportId);
  setEmailError('');
 };

 const handleDownloadPDF = async (reportId: number) => {
  try {
   const response = await api.get(`/projects/daily-reports/${reportId}/pdf/`, {
    responseType: 'blob',
   });
   const url = window.URL.createObjectURL(new Blob([response.data]));
   const link = document.createElement('a');
   link.href = url;
   link.setAttribute('download', `daily_report_${reportId}.pdf`);
   document.body.appendChild(link);
   link.click();
   link.remove();
  } catch (error: unknown) {
   const err = error as { response?: { data?: { error?: string } } };
   alert(err.response?.data?.error || 'Failed to download PDF');
  }
 };

 // eslint-disable-next-line @typescript-eslint/no-unused-vars
 const handleEmail = async (reportId: number) => {
  if (!emailAddress || !emailAddress.includes('@')) {
   setEmailError('Please enter a valid email address');
   return;
  }

  setActionLoading(reportId);
  setEmailError('');
  try {
   await api.post(`/projects/daily-reports/${reportId}/email/`, { email: emailAddress });
   setShowEmailModal(null);
   setEmailAddress('');
   // Show success message
   alert('Report sent successfully!');
  } catch (error: unknown) {
   const err = error as { response?: { data?: { error?: string } } };
   setEmailError(err.response?.data?.error || 'Failed to send email');
  } finally {
   setActionLoading(null);
  }
 };

 const handleEmailClick = (reportId: number) => {
  setShowEmailModal(reportId);
  setEmailAddress('');
  setEmailError('');
 };

 return (
  <ProtectedRoute>
   <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
      <div className="max-w-7xl mx-auto">
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Daily Reports</h1>
        {canCreate && (
         <Button 
          onClick={() => router.push('/reports/daily/new')}
          className="w-full sm:w-auto"
         >
          <PlusIcon className="h-5 w-5 mr-2" />
          New Daily Report
         </Button>
        )}
       </div>

       {/* Search and Filters */}
       <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
         <div className="lg:col-span-2">
          <div className="relative">
           <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
           <Input
            type="text"
            placeholder="Search by report number, job number, phase..."
            value={searchTerm}
            onChange={(e) => {
             setSearchTerm(e.target.value);
             setCurrentPage(1);
            }}
            className="pl-10"
           />
          </div>
         </div>
         <div>
          <select
           value={statusFilter}
           onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
           }}
           className="input-field"
          >
           <option value="">All Statuses</option>
           <option value="DRAFT">Draft</option>
           <option value="SUBMITTED">Awaiting Approval</option>
           <option value="APPROVED">Approved</option>
           <option value="REJECTED">Rejected</option>
          </select>
         </div>
         <div>
          <select
           value={projectFilter}
           onChange={(e) => {
            setProjectFilter(e.target.value);
            setCurrentPage(1);
           }}
           className="input-field"
          >
           <option value="">All Projects</option>
           {projects.map((project) => (
            <option key={project.id} value={project.id}>
             {project.job_number} - {project.name}
            </option>
           ))}
          </select>
         </div>
         <div>
          <Input
           type="date"
           value={dateFilter}
           onChange={(e) => {
            setDateFilter(e.target.value);
            setCurrentPage(1);
           }}
           placeholder="Filter by date"
          />
         </div>
        </div>
        <div className="mt-4">
         <Input
          type="text"
          placeholder="Filter by phase..."
          value={phaseFilter}
          onChange={(e) => {
           setPhaseFilter(e.target.value);
           setCurrentPage(1);
          }}
         />
        </div>
       </Card>

       {/* Status Summary Cards */}
       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
         <div className="p-4">
          <div className="flex items-center justify-between">
           <div>
            <p className="text-sm text-gray-600">Draft</p>
            <p className="text-2xl font-bold text-gray-700">{statusCounts.DRAFT}</p>
           </div>
           <StatusBadge status="DRAFT" size="sm" />
          </div>
         </div>
        </Card>
        <Card>
         <div className="p-4">
          <div className="flex items-center justify-between">
           <div>
            <p className="text-sm text-gray-600">Awaiting Approval</p>
            <p className="text-2xl font-bold text-yellow-600">{statusCounts.SUBMITTED}</p>
           </div>
           <StatusBadge status="SUBMITTED" size="sm" />
          </div>
         </div>
        </Card>
        <Card>
         <div className="p-4">
          <div className="flex items-center justify-between">
           <div>
            <p className="text-sm text-gray-600">Approved</p>
            <p className="text-2xl font-bold text-green-600">{statusCounts.APPROVED}</p>
           </div>
           <StatusBadge status="APPROVED" size="sm" />
          </div>
         </div>
        </Card>
        <Card>
         <div className="p-4">
          <div className="flex items-center justify-between">
           <div>
            <p className="text-sm text-gray-600">Rejected</p>
            <p className="text-2xl font-bold text-red-600">{statusCounts.REJECTED}</p>
           </div>
           <StatusBadge status="REJECTED" size="sm" />
          </div>
         </div>
        </Card>
       </div>

       {/* Reports Table */}
       <Card>
        {loading ? (
         <LoadingSpinner />
        ) : (
         <>
          <div className="mb-4 text-sm text-gray-600">
           Showing {reports.length} of {totalCount} reports
          </div>
          <DataTable
           data={reports}
           columns={[
            {
             header: 'Report #',
             accessor: (row: DailyReport) => (
              <button
               onClick={() => router.push(`/reports/daily/${row.id}`)}
               className="text-primary hover:underline font-medium"
              >
               {row.report_number || `#${row.id}`}
              </button>
             ),
            },
            {
             header: 'Job',
             accessor: (row: DailyReport) => (
              row.project_detail?.job_number ? (
               <button
                onClick={() => router.push(`/projects/${row.project}`)}
                className="text-primary hover:underline font-medium"
               >
                {row.project_detail.job_number}
               </button>
              ) : 'N/A'
             ),
            },
            {
             header: 'Project',
             accessor: (row: DailyReport) => (
              row.project_detail?.name ? (
               <button
                onClick={() => router.push(`/projects/${row.project}`)}
                className="text-primary hover:underline font-medium"
               >
                {row.project_detail.name}
               </button>
              ) : 'N/A'
             ),
            },
            {
             header: 'Phase/Scope',
             accessor: (row: DailyReport) => row.phase || '-',
            },
            {
             header: 'Date',
             accessor: (row: DailyReport) => new Date(row.date).toLocaleDateString(),
            },
            {
             header: 'Created By',
             accessor: (row: DailyReport) => 
              row.foreman_detail 
               ? (
                <button
                 onClick={() => router.push(`/users/${row.foreman}`)}
                 className="text-primary hover:underline font-medium"
                >
                 {row.foreman_detail.first_name} {row.foreman_detail.last_name}
                </button>
               )
               : 'N/A',
            },
            {
             header: 'Status',
             accessor: (row: DailyReport) => <StatusBadge status={row.status} size="sm" />,
            },
            {
             header: 'Attachments',
             accessor: (row: DailyReport) => (
              <span className="text-sm text-gray-600">{row.attachments_count || 0}</span>
             ),
            },
            {
             header: 'Actions',
             accessor: (row: DailyReport) => (
              <div className="flex items-center space-x-2 flex-wrap gap-2">
               <button
                onClick={() => handleDownloadPDF(row.id)}
                className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                title="Download PDF"
               >
                <DocumentArrowDownIcon className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">PDF</span>
               </button>
               <button
                onClick={() => handleEmailClick(row.id)}
                className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100 transition-colors"
                title="Email Report"
                disabled={actionLoading === row.id}
               >
                <EnvelopeIcon className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Email</span>
               </button>
               {(canDelete || (user?.role === 'FOREMAN' && row.status !== 'APPROVED')) && (
                <button
                 onClick={() => handleDeleteClick(row.id)}
                 className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 transition-colors"
                 title="Delete Report"
                 disabled={actionLoading === row.id}
                >
                 <TrashIcon className="h-4 w-4 mr-1" />
                 <span className="hidden sm:inline">Delete</span>
                </button>
               )}
              </div>
             ),
            },
           ]}
           emptyMessage="No daily reports found"
          />

          {/* Pagination */}
          {totalPages > 1 && (
           <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-600">
             Page {currentPage} of {totalPages}
            </div>
            <div className="flex space-x-2">
             <Button
              variant="secondary"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
             >
              Previous
             </Button>
             <Button
              variant="secondary"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
             >
              Next
             </Button>
            </div>
           </div>
          )}
         </>
        )}
       </Card>
      </div>
     </main>
  </ProtectedRoute>
 );
}

