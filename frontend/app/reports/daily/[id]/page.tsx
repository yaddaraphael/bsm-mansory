'use client';

import { use, useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { DocumentArrowDownIcon, EnvelopeIcon, TrashIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';

interface LaborEntry {
  id: number;
  employee: number;
  employee_detail?: {
    first_name: string;
    last_name: string;
    employee_id?: string;
  };
  phase: string;
  regular_hours: number;
  overtime_hours: number;
  quantity: number | null;
  comment: string;
}

interface ConfirmedWorker {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  employee_number?: string;
  name?: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  scope?: string;
  regular_hours?: number;
  overtime_hours?: number;
}

interface ConfirmedWorkersResponse {
  total_workers: number;
  workers_by_role: Record<string, ConfirmedWorker[]>;
}

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
  location?: string;
  foreman: number;
  foreman_detail?: {
    first_name: string;
    last_name: string;
  };
  status: string;
  labor_entries?: LaborEntry[];
  photos?: string[];
  approved_by?: number;
  approved_by_detail?: {
    first_name: string;
    last_name: string;
    email?: string;
  };
  approved_on?: string;
  approved_at?: string;
  approval_notes?: string;
  completed_at?: string;
  weather_sunny?: boolean;
  weather_cloudy?: boolean;
  weather_rain?: boolean;
  weather_wind?: boolean;
  weather_snow?: boolean;
  temperature_am?: string;
  temperature_pm?: string;
  weather_notes?: string;
  work_performed?: string;
  delays_by_others?: string;
  notes?: string;
  total_regular_hours?: number;
  total_overtime_hours?: number;
  total_labor_hours?: number;
  [key: string]: unknown;
}

export default function DailyReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [approvalDescription, setApprovalDescription] = useState('');
  const [confirmedWorkers, setConfirmedWorkers] = useState<ConfirmedWorkersResponse | null>(null);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [error, setError] = useState('');

  const canApprove = user?.role && ['SUPERINTENDENT', 'PROJECT_MANAGER', 'ADMIN', 'ROOT_SUPERADMIN', 'SUPERADMIN', 'GENERAL_CONTRACTOR'].includes(user.role);
  const canDelete = (user?.role === 'ROOT_SUPERADMIN' || user?.role === 'SUPERADMIN') || 
                    (user?.role === 'FOREMAN' && report?.foreman === user?.id && report?.status !== 'APPROVED');

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/projects/daily-reports/${id}/`);
      setReport(response.data);
    } catch (error: unknown) {
      console.error('Failed to fetch report:', error);
      const err = error as { response?: { status?: number } };
      if (err.response?.status === 404) {
        setReport(null);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchConfirmedWorkers = useCallback(async () => {
    try {
      setLoadingWorkers(true);
      const response = await api.get(`/projects/daily-reports/${id}/confirmed_workers/`);
      setConfirmedWorkers(response.data);
    } catch (error: unknown) {
      console.error('Failed to fetch confirmed workers:', error);
      setConfirmedWorkers(null);
    } finally {
      setLoadingWorkers(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    if (report) {
      fetchConfirmedWorkers();
    }
  }, [report, fetchConfirmedWorkers]);

  const handleApprove = async () => {
    setActionLoading(true);
    setError('');
    try {
      await api.post(`/projects/daily-reports/${id}/approve/`, {
        description: approvalDescription.trim() || undefined,
      });
      await fetchReport();
      setShowApproveModal(false);
      setApprovalDescription('');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Failed to approve report');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError('Please provide a rejection reason');
      return;
    }
    
    setActionLoading(true);
    setError('');
    try {
      await api.post(`/projects/daily-reports/${id}/reject/`, { reason: rejectReason });
      await fetchReport();
      setShowRejectModal(false);
      setRejectReason('');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Failed to reject report');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    setError('');
    try {
      await api.delete(`/projects/daily-reports/${id}/`);
      router.push('/reports/daily');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Failed to delete report');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await api.get(`/projects/daily-reports/${id}/pdf/`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `daily_report_${report?.report_number || id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || 'Failed to download PDF');
    }
  };

  const handleEmail = async () => {
    if (!emailAddress || !emailAddress.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setActionLoading(true);
    setError('');
    try {
      await api.post(`/projects/daily-reports/${id}/email/`, { email: emailAddress });
      setShowEmailModal(false);
      setEmailAddress('');
      // Show success - you could use a toast notification here
      alert('Report sent successfully!');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Failed to send email');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="flex-1 p-6 bg-gray-50">
              <LoadingSpinner />
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!report) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="flex-1 p-6 bg-gray-50">
              <Card>
                <p className="text-center text-gray-500 py-8">Report not found</p>
              </Card>
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
                <div>
                  <button
                    onClick={() => router.push('/reports/daily')}
                    className="text-sm text-gray-600 hover:text-primary mb-2"
                  >
                    ← Back to Daily Reports
                  </button>
                  <h1 className="text-2xl font-bold text-gray-900">
                    Daily Report {report.report_number || `#${report.id}`}
                  </h1>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                  <StatusBadge status={report.status} size="lg" />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={handleDownloadPDF}
                      className="flex items-center text-sm"
                      disabled={actionLoading}
                    >
                      <DocumentArrowDownIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Download PDF</span>
                      <span className="sm:hidden">PDF</span>
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleEmail}
                      className="flex items-center text-sm"
                      disabled={actionLoading}
                    >
                      <EnvelopeIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Email Report</span>
                      <span className="sm:hidden">Email</span>
                    </Button>
                    {canDelete && (
                      <Button
                        variant="danger"
                        onClick={handleDelete}
                        className="flex items-center text-sm"
                        disabled={actionLoading}
                      >
                        <TrashIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
                        <span className="hidden sm:inline">Delete</span>
                        <span className="sm:hidden">Del</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <Card title="Report Information">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Job Number</label>
                        {report.project_detail?.job_number ? (
                          <button
                            onClick={() => router.push(`/projects/${report.project}`)}
                            className="text-base text-primary hover:underline font-medium"
                          >
                            {report.project_detail.job_number}
                          </button>
                        ) : (
                          <p className="text-base text-gray-900 font-medium">N/A</p>
                        )}
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Project</label>
                        {report.project_detail?.name ? (
                          <button
                            onClick={() => router.push(`/projects/${report.project}`)}
                            className="text-base text-primary hover:underline font-medium"
                          >
                            {report.project_detail.name}
                          </button>
                        ) : (
                          <p className="text-base text-gray-900 font-medium">N/A</p>
                        )}
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Date</label>
                        <p className="text-base text-gray-900 font-medium">
                          {new Date(report.date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Phase/Scope</label>
                        <p className="text-base text-gray-900 font-medium">{report.phase || 'N/A'}</p>
                      </div>
                      {report.location && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Location</label>
                          <p className="text-base text-gray-900 font-medium">{String(report.location || '')}</p>
                        </div>
                      )}
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Created By</label>
                        {report.foreman_detail ? (
                          <button
                            onClick={() => router.push(`/users/${report.foreman}`)}
                            className="text-base text-primary hover:underline font-medium"
                          >
                            {report.foreman_detail.first_name} {report.foreman_detail.last_name}
                          </button>
                        ) : (
                          <p className="text-base text-gray-900 font-medium">N/A</p>
                        )}
                      </div>
                      {report.completed_at && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Completed</label>
                          <p className="text-base text-gray-900 font-medium">
                            {report.completed_at ? new Date(String(report.completed_at)).toLocaleString() : 'N/A'}
                          </p>
                        </div>
                      )}
                      {report.approved_by && (
                        <>
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Approved By</label>
                            <p className="text-base text-gray-900 font-medium">
                              {report.approved_by_detail?.first_name} {report.approved_by_detail?.last_name}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Approved On</label>
                            <p className="text-base text-gray-900 font-medium">
                              {report.approved_on ? new Date(report.approved_on).toLocaleString() : 'N/A'}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </Card>

                  <Card title="Weather">
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-2">Conditions</label>
                        <div className="flex flex-wrap gap-2">
                          {report.weather_sunny && <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded">Sunny</span>}
                          {report.weather_cloudy && <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded">Cloudy</span>}
                          {report.weather_rain && <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded">Rain</span>}
                          {report.weather_wind && <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded">Wind</span>}
                          {report.weather_snow && <span className="px-3 py-1 bg-white text-gray-800 rounded border">Snow</span>}
                          {!report.weather_sunny && !report.weather_cloudy && !report.weather_rain && !report.weather_wind && !report.weather_snow && (
                            <span className="text-gray-500">No conditions specified</span>
                          )}
                        </div>
                      </div>
                      {(report.temperature_am || report.temperature_pm) && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Temperature (AM)</label>
                            <p className="text-base text-gray-900">{String(report.temperature_am || 'N/A')}°F</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Temperature (PM)</label>
                            <p className="text-base text-gray-900">{String(report.temperature_pm || 'N/A')}°F</p>
                          </div>
                        </div>
                      )}
                      {report.weather_notes && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Additional Notes</label>
                          <p className="text-base text-gray-900">{String(report.weather_notes || '')}</p>
                        </div>
                      )}
                    </div>
                  </Card>

                  <Card title="Labor">
                    {report.labor_entries && report.labor_entries.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phase</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Reg</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">OT</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comment</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {report.labor_entries.map((entry: LaborEntry) => (
                              <tr key={entry.id}>
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {entry.employee ? (
                                    <button
                                      onClick={() => router.push(`/users/${entry.employee}`)}
                                      className="text-primary hover:underline font-medium"
                                    >
                                      {entry.employee_detail?.employee_id || 'N/A'} - {entry.employee_detail ? `${entry.employee_detail.first_name} ${entry.employee_detail.last_name}` : 'N/A'}
                                    </button>
                                  ) : (
                                    <span>{entry.employee_detail?.employee_id || 'N/A'} - {entry.employee_detail ? `${entry.employee_detail.first_name} ${entry.employee_detail.last_name}` : 'N/A'}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900">{entry.phase || '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 text-right">{entry.regular_hours || '0.00'}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 text-right">{entry.overtime_hours || '0.00'}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 text-right">{entry.quantity || '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-500">{entry.comment || '-'}</td>
                              </tr>
                            ))}
                            <tr className="bg-gray-50 font-semibold">
                              <td colSpan={2} className="px-4 py-3 text-sm text-gray-900">Total</td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">{String(report.total_regular_hours ?? '0.00')}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">{String(report.total_overtime_hours ?? '0.00')}</td>
                              <td colSpan={2} className="px-4 py-3 text-sm text-gray-900 text-right">
                                Total Hours: {String(report.total_labor_hours ?? '0.00')}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-4">No labor entries</p>
                    )}
                  </Card>

                  {report.work_performed && (
                    <Card title="Work Performed">
                      <p className="text-base text-gray-900 whitespace-pre-wrap">{String(report.work_performed || '')}</p>
                    </Card>
                  )}

                  <Card title="Safety">
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-gray-700 w-48">Safety Meeting Held:</span>
                        {report.safety_meeting_held ? (
                          <CheckCircleIcon className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircleIcon className="h-5 w-5 text-red-600" />
                        )}
                      </div>
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-gray-700 w-48">JHA Review:</span>
                        {report.jha_review ? (
                          <CheckCircleIcon className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircleIcon className="h-5 w-5 text-red-600" />
                        )}
                      </div>
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-gray-700 w-48">Scaffolding Inspected:</span>
                        {report.scaffolding_inspected ? (
                          <CheckCircleIcon className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircleIcon className="h-5 w-5 text-red-600" />
                        )}
                      </div>
                    </div>
                  </Card>

                  {report.delays_by_others && (
                    <Card title="Delays By Others">
                      <p className="text-base text-gray-900 whitespace-pre-wrap">{String(report.delays_by_others || '')}</p>
                    </Card>
                  )}

                  {report.notes && (
                    <Card title="Notes">
                      <p className="text-base text-gray-900 whitespace-pre-wrap">{String(report.notes || '')}</p>
                    </Card>
                  )}

                  {report.photos && report.photos.length > 0 && (
                    <Card title={`Attachments (${report.photos.length})`}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {report.photos.map((photo: string, index: number) => {
                          // Construct proper image URL
                          let imageUrl = photo;
                          
                          if (!photo.startsWith('http')) {
                            // Get base URL (without /api)
                            const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api')
                              .replace('/api', '');
                            
                            // If it already starts with /media/, use it directly
                            if (photo.startsWith('/media/')) {
                              imageUrl = `${baseUrl}${photo}`;
                            } else if (photo.startsWith('media/')) {
                              imageUrl = `${baseUrl}/${photo}`;
                            } else {
                              // Add /media/ prefix if not present
                              const cleanPath = photo.startsWith('/') ? photo.substring(1) : photo;
                              imageUrl = `${baseUrl}/media/${cleanPath}`;
                            }
                          }
                          
                          return (
                            <div key={index} className="relative group">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={imageUrl}
                                alt={`Attachment ${index + 1}`}
                                className="w-full h-48 object-cover rounded-lg border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
                                onError={(e) => {
                                  console.error('Image load error:', imageUrl);
                                  // Show error placeholder
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  const parent = (e.target as HTMLImageElement).parentElement;
                                  if (parent) {
                                    parent.innerHTML = `
                                      <div class="w-full h-48 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                                        <p class="text-gray-400 text-sm">Image not available</p>
                                      </div>
                                    `;
                                  }
                                }}
                                onClick={() => window.open(imageUrl, '_blank')}
                              />
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity rounded-lg flex items-center justify-center">
                                <span className="text-white opacity-0 group-hover:opacity-100 text-sm">Click to view full size</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}
                </div>

                <div className="space-y-6">
                  {/* Confirmed Workers Section */}
                  {confirmedWorkers && confirmedWorkers.total_workers > 0 && (
                    <Card title="Confirmed Workers (from Clock In/Out)">
                      {loadingWorkers ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <div className="space-y-4">
                          {Object.entries(confirmedWorkers.workers_by_role || {}).map(([role, workers]) => (
                            <div key={role} className="border-b last:border-0 pb-4 last:pb-0">
                              <h4 className="font-semibold text-gray-900 mb-2 capitalize">{role} ({workers.length})</h4>
                              <div className="space-y-2">
                                {workers.map((worker: ConfirmedWorker) => (
                                  <div key={worker.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                    <div className="flex items-center space-x-3">
                                      <div>
                                        <button
                                          onClick={() => router.push(`/users/${worker.id}`)}
                                          className="font-medium text-primary hover:underline"
                                        >
                                          {worker.employee_number} - {worker.name}
                                        </button>
                                        {worker.scope && (
                                          <p className="text-xs text-gray-500">Scope: {String(worker.scope)}</p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right text-sm">
                                      <p className="font-medium">
                                        {worker.clock_in && new Date(worker.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - {worker.clock_out ? new Date(worker.clock_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'In Progress'}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {worker.total_hours.toFixed(2)} hrs
                                        {worker.overtime_hours && worker.overtime_hours > 0 && (
                                          <span className="text-orange-600"> ({worker.regular_hours ? worker.regular_hours.toFixed(2) : '0.00'} reg + {worker.overtime_hours.toFixed(2)} OT)</span>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  )}

                  {canApprove && report.status === 'SUBMITTED' && (
                    <Card>
                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <Button
                            onClick={() => {
                              setShowApproveModal(true);
                              setApprovalDescription('');
                              setError('');
                            }}
                            isLoading={actionLoading}
                            className="flex-1 flex items-center justify-center"
                          >
                            <CheckCircleIcon className="h-5 w-5 mr-2" />
                            Approve Report
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => {
                              setShowRejectModal(true);
                              setRejectReason('');
                              setError('');
                            }}
                            disabled={actionLoading}
                            className="flex-1 flex items-center justify-center"
                          >
                            <XCircleIcon className="h-5 w-5 mr-2" />
                            Reject Report
                          </Button>
                        </div>
                      </div>
                      {error && (
                        <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                          {error}
                        </div>
                      )}
                    </Card>
                  )}

                  {/* Approval Info for Higher Roles */}
                  {report.approved_by && (user?.role === 'ROOT_SUPERADMIN' || user?.role === 'SUPERADMIN' || user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER' || user?.role === 'SUPERINTENDENT') && (
                    <Card title="Approval Information">
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Approved By</label>
                          <p className="text-base text-gray-900 font-medium">
                            {report.approved_by_detail?.first_name} {report.approved_by_detail?.last_name}
                            {report.approved_by_detail?.email && (
                              <span className="text-sm text-gray-500 ml-2">({report.approved_by_detail.email})</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Approved On</label>
                          <p className="text-base text-gray-900 font-medium">
                            {report.approved_on ? new Date(String(report.approved_on)).toLocaleString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : 'N/A'}
                          </p>
                        </div>
                        {report.notes && typeof report.notes === 'string' && report.notes.includes('[Approval Note]:') && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Approval Notes</label>
                            <p className="text-base text-gray-900 whitespace-pre-wrap">
                              {report.notes.split('[Approval Note]:')[1]?.trim() || report.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          if (!actionLoading) {
            setShowDeleteModal(false);
            setError('');
          }
        }}
        title="Delete Daily Report"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            Are you sure you want to delete this daily report? This action cannot be undone.
          </p>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="flex justify-end space-x-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setError('');
              }}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              isLoading={actionLoading}
              disabled={actionLoading}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Email Modal */}
      <Modal
        isOpen={showEmailModal}
        onClose={() => {
          if (!actionLoading) {
            setShowEmailModal(false);
            setEmailAddress('');
            setError('');
          }
        }}
        title="Email Daily Report"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <Input
              type="email"
              value={emailAddress}
              onChange={(e) => {
                setEmailAddress(e.target.value);
                setError('');
              }}
              placeholder="recipient@example.com"
              className="w-full"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="flex justify-end space-x-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowEmailModal(false);
                setEmailAddress('');
                setError('');
              }}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEmail}
              isLoading={actionLoading}
              disabled={actionLoading || !emailAddress}
            >
              Send Email
            </Button>
          </div>
        </div>
      </Modal>

      {/* Approve Modal */}
      <Modal
        isOpen={showApproveModal}
        onClose={() => {
          if (!actionLoading) {
            setShowApproveModal(false);
            setApprovalDescription('');
            setError('');
          }
        }}
        title="Approve Daily Report"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            Are you sure you want to approve this daily report?
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Approval Notes (Optional)
            </label>
            <textarea
              value={approvalDescription}
              onChange={(e) => {
                setApprovalDescription(e.target.value);
                setError('');
              }}
              className="input-field w-full"
              rows={4}
              placeholder="Add any notes about this approval..."
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="flex justify-end space-x-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowApproveModal(false);
                setApprovalDescription('');
                setError('');
              }}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              isLoading={actionLoading}
              disabled={actionLoading}
            >
              <CheckCircleIcon className="h-5 w-5 mr-2" />
              Approve Report
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => {
          if (!actionLoading) {
            setShowRejectModal(false);
            setRejectReason('');
            setError('');
          }
        }}
        title="Reject Daily Report"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                setError('');
              }}
              placeholder="Please provide a reason for rejecting this report..."
              className="input-field w-full"
              rows={4}
              required
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="flex justify-end space-x-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowRejectModal(false);
                setRejectReason('');
                setError('');
              }}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleReject}
              isLoading={actionLoading}
              disabled={actionLoading || !rejectReason.trim()}
            >
              <XCircleIcon className="h-5 w-5 mr-2" />
              Reject Report
            </Button>
          </div>
        </div>
      </Modal>
    </ProtectedRoute>
  );
}

