'use client';

import { use, useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';
import { useProject } from '@/hooks/useProjects';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSidebar } from '@/components/layout/SidebarContext';
import api from '@/lib/api';
import { PencilIcon, TrashIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Input from '@/components/ui/Input';

interface MeetingPhase {
  phase_code: string;
  phase_description?: string;
  quantity?: number;
  installed_quantity?: number;
  percent_complete?: number;
  meeting_date?: string;
  updated_at?: string;
}

interface ProjectScope {
  id: number;
  scope_type: string;
  description?: string;
  percent_complete?: number;
  quantity?: number;
  installed?: number;
  remaining?: number;
  unit?: string;
  start_date?: string;
  end_date?: string;
  [key: string]: unknown;
}

interface ComprehensiveProjectData {
  job: {
    company_code: string;
    job_number: string;
    job_description: string;
    division: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    zip_code: string;
    project_manager: string;
    superintendent: string;
    estimator: string;
    customer_code: string;
    customer_name: string;
    status_code: string;
    contract_number: string;
    original_contract: number;
    phone: string;
    fax_phone: string;
    owner_name: string;
    comment: string;
    price_method_code: string;
  };
  project: {
    id: number;
    name: string;
    status: string;
    branch: string;
    contract_value: number;
    start_date: string;
    end_date: string;
  } | null;
  dates: {
    est_start_date: string;
    est_complete_date: string;
    projected_complete_date: string;
    create_date: string;
    start_date: string;
    complete_date: string;
  } | null;
  phases: Array<{
    phase_code: string;
    cost_type: string;
    description: string;
    status_code: string;
    jtd_quantity: number;
    jtd_hours: number;
    jtd_actual_dollars: number;
    projected_quantity: number;
    projected_hours: number;
    projected_dollars: number;
    estimated_quantity: number;
    estimated_hours: number;
    current_estimated_dollars: number;
    start_date: string;
    end_date: string;
    complete_date: string;
    comment: string;
  }>;
  udf: {
    udf1: string;
    udf2: string;
    udf3: string;
    udf4: string;
    udf5: string;
    udf6: string;
    udf7: string;
    udf8: string;
    udf9: string;
    udf10: string;
    udf11: string;
    udf12: string;
    udf13: string;
    udf14: string;
    udf15: string;
    udf16: string;
    udf17: string;
    udf18: string;
    udf19: string;
    udf20: string;
  } | null;
  cost_projections: Array<{
    phase_code: string;
    cost_type: string;
    transaction_date: string;
    amount: number;
    projected_hours: number;
    projected_quantity: number;
    note: string;
    operator: string;
  }>;
  contacts: Array<{
    contact_id: number;
    first_name: string;
    last_name: string;
    title: string;
    phone_number: string;
    email1: string;
    email2: string;
    email3: string;
    addr_1: string;
    addr_city: string;
    addr_state: string;
  }>;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { isCollapsed } = useSidebar();
  const { project, loading, error: projectError, refetch: refetchProject } = useProject(id);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [comprehensiveData, setComprehensiveData] = useState<ComprehensiveProjectData | null>(null);
  const [loadingComprehensive, setLoadingComprehensive] = useState(false);
  const [editingScope, setEditingScope] = useState<number | null>(null);
  const [scopeUpdates, setScopeUpdates] = useState<Record<number, { quantity?: number; installed?: number }>>({});
  const [savingScope, setSavingScope] = useState<number | null>(null);
  const [meetingPhases, setMeetingPhases] = useState<MeetingPhase[]>([]);
  
  const canEditDelete = user?.role === 'ROOT_SUPERADMIN';
  const canEditPhases = ['ROOT_SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER'].includes(user?.role || '');
  const canViewFinancial = !['FOREMAN', 'LABORER', 'MASON', 'OPERATOR', 'BRICKLAYER', 'PLASTER'].includes(user?.role || '');
  
  // Check if project is completed
  const isCompleted = project?.status === 'COMPLETED' || project?.spectrum_status_code === 'C';
  const isReadOnly = isCompleted;
  
  // Fetch comprehensive Spectrum data
  useEffect(() => {
    const fetchComprehensiveData = async () => {
      if (!project?.job_number) return;
      
      setLoadingComprehensive(true);
      try {
        const encodedJobNumber = encodeURIComponent(project.job_number);
        const response = await api.get(`/spectrum/projects/${encodedJobNumber}/comprehensive/`);
        setComprehensiveData(response.data);
      } catch {
        // Silently fail if comprehensive data is not available
        console.log('Comprehensive Spectrum data not available for this project');
      } finally {
        setLoadingComprehensive(false);
      }
    };
    
    if (project) {
      fetchComprehensiveData();
    }
  }, [project]);

  // Fetch meeting phases for this project
  useEffect(() => {
    const fetchMeetingPhases = async () => {
      if (!project?.id) return;
      
      try {
        const response = await api.get(`/meetings/meetings/project_phases/?project_id=${project.id}`);
        setMeetingPhases(response.data.phases || []);
      } catch (err) {
        console.error('Failed to fetch meeting phases:', err);
        setMeetingPhases([]);
      }
    };
    
    if (project) {
      fetchMeetingPhases();
    }
  }, [project]);

  // Handle responsive sidebar margin
  const [sidebarMargin, setSidebarMargin] = useState('0');
  useEffect(() => {
    const updateMargin = () => {
      if (window.innerWidth >= 1024) {
        setSidebarMargin(isCollapsed ? '80px' : '256px');
      } else {
        setSidebarMargin('0');
      }
    };
    
    updateMargin();
    window.addEventListener('resize', updateMargin);
    return () => window.removeEventListener('resize', updateMargin);
  }, [isCollapsed]);

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

  if (!loading && !project) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="flex-1 p-6 bg-gray-50">
              <Card>
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">Project not found</p>
                  <p className="text-sm text-gray-400 mb-2">ID: {id}</p>
                  {projectError && (
                    <p className="text-sm text-red-500 mb-4">Error: {projectError}</p>
                  )}
                  <Button onClick={() => router.push('/projects')} variant="secondary">
                    Back to Projects
                  </Button>
                </div>
              </Card>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // Show "COMPLETED" status for completed projects, otherwise use schedule status
  const scheduleStatus = isCompleted ? 'COMPLETED' : (project.schedule_status?.status || 'GREEN');

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }

    setDeleteLoading(true);
    try {
      await api.delete(`/projects/projects/${encodeURIComponent(id)}/`);
      router.push('/projects');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      alert(error.response?.data?.detail || 'Failed to delete project');
      setDeleteLoading(false);
    }
  };

  const handleScopeUpdate = async (scopeId: number) => {
    if (!canEditPhases || isReadOnly) return;
    
    const updates = scopeUpdates[scopeId];
    if (!updates || (!updates.quantity && !updates.installed)) {
      setEditingScope(null);
      setScopeUpdates({});
      return;
    }

    setSavingScope(scopeId);
    try {
      const scope = project.scopes.find((s: ProjectScope) => s.id === scopeId);
      if (!scope) return;

      const updatedData = {
        ...scope,
        quantity: updates.quantity !== undefined ? updates.quantity : scope.quantity,
        installed: updates.installed !== undefined ? updates.installed : scope.installed,
      };

      await api.patch(`/projects/scopes/${scopeId}/`, updatedData);
      
      // Refetch project data to get updated values
      await refetchProject();
      
      setEditingScope(null);
      setScopeUpdates({});
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      alert(error.response?.data?.detail || 'Failed to update phase');
    } finally {
      setSavingScope(null);
    }
  };

  return (
    <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div 
            className="flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out"
            style={{ marginLeft: sidebarMargin }}
          >
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <div className="max-w-7xl mx-auto w-full px-2 sm:px-4">
                {/* Header Section */}
                <div className="mb-4 md:mb-6 w-full">
                  <button
                    onClick={() => router.push('/projects')}
                    className="flex items-center text-sm md:text-base text-gray-600 hover:text-primary mb-3 md:mb-4 transition-colors"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Projects
                  </button>
                  
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 md:gap-4 w-full">
                    <div className="flex-1 min-w-0">
                      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-1 md:mb-2 break-words">{project.name}</h1>
                      <p className="text-sm md:text-base lg:text-lg text-gray-500 break-words">{project.job_number}</p>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 flex-shrink-0 flex-wrap">
                      <StatusBadge status={scheduleStatus} size="lg" />
                      {canEditDelete && !isReadOnly && (
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => router.push(`/projects/${id}/edit`)}
                            className="flex items-center text-xs sm:text-sm"
                          >
                            <PencilIcon className="h-4 w-4 mr-1 sm:mr-2" />
                            <span className="hidden sm:inline">Edit</span>
                          </Button>
                          <Button
                            variant="danger"
                            onClick={handleDelete}
                            isLoading={deleteLoading}
                            className="flex items-center text-xs sm:text-sm"
                          >
                            <TrashIcon className="h-4 w-4 mr-1 sm:mr-2" />
                            <span className="hidden sm:inline">Delete</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 w-full">
              <div className="lg:col-span-2 space-y-4 md:space-y-6 w-full">
                <Card title="Project Overview">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 w-full">
                    <div>
                      <label className="text-sm font-medium text-gray-500 block mb-1">Division</label>
                      <p className="text-base text-gray-900 font-medium">{project.branch_detail?.name || 'N/A'}</p>
                      {project.spectrum_division_code && (
                        <p className="text-xs text-gray-400 mt-1">Code: {project.spectrum_division_code}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 block mb-1">Status</label>
                      <p className="text-base text-gray-900 font-medium">
                        <StatusBadge status={project.status} size="sm" />
                      </p>
                    </div>
                    {project.client_name && (
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Client Name</label>
                        <p className="text-base text-gray-900 font-medium">{project.client_name}</p>
                      </div>
                    )}
                    {project.work_location && (
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Work Location</label>
                        <p className="text-base text-gray-900 font-medium">{project.work_location}</p>
                      </div>
                    )}
                    {/* Spectrum Dates - Priority */}
                    {project.spectrum_est_start_date && (
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Est. Start Date (Spectrum)</label>
                        <p className="text-base text-gray-900 font-medium">
                          {new Date(project.spectrum_est_start_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    )}
                    {project.spectrum_start_date && (
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Actual Start Date (Spectrum)</label>
                        <p className="text-base text-gray-900 font-medium">
                          {new Date(project.spectrum_start_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    )}
                    {project.spectrum_projected_complete_date && (
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Projected Complete Date (Spectrum)</label>
                        <p className="text-base text-gray-900 font-medium">
                          {new Date(project.spectrum_projected_complete_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    )}
                    {project.spectrum_complete_date && (
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Actual Complete Date (Spectrum)</label>
                        <p className="text-base text-gray-900 font-medium">
                          {new Date(project.spectrum_complete_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    )}
                    {project.qty_sq && (
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Quantity per Square Foot</label>
                        <p className="text-base text-gray-900 font-medium">{Number(project.qty_sq).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                      </div>
                    )}
                    {project.schedule_status && (
                      <>
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Forecast Date</label>
                          <p className="text-base text-gray-900 font-medium">
                            {project.schedule_status.forecast_date
                              ? new Date(project.schedule_status.forecast_date).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Days Late</label>
                          <p className={`text-base font-medium ${project.schedule_status.days_late > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {project.schedule_status.days_late || 0} {project.schedule_status.days_late === 1 ? 'day' : 'days'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </Card>

                {project.notes && (
                  <Card title="Project Notes">
                    <div className="prose max-w-none">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{project.notes}</p>
                    </div>
                  </Card>
                )}

                <Card title="Progress">
                  <div className="space-y-4 md:space-y-6 w-full">
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-medium text-gray-700">Production Progress</span>
                        <span className="text-lg font-bold text-primary">
                          {project.production_percent_complete?.toFixed(1) || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-primary h-3 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(project.production_percent_complete || 0, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                    {canViewFinancial && (
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-medium text-gray-700">Financial Progress</span>
                          <span className="text-lg font-bold text-blue-600">
                            {project.financial_percent_complete?.toFixed(1) || 0}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(project.financial_percent_complete || 0, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                      <div className="text-center">
                        <label className="text-xs font-medium text-gray-500 block mb-1">Total Quantity</label>
                        <p className="text-xl font-bold text-gray-900">
                          {project.total_quantity || 0}
                        </p>
                      </div>
                      <div className="text-center">
                        <label className="text-xs font-medium text-gray-500 block mb-1">Installed</label>
                        <p className="text-xl font-bold text-green-600">
                          {project.total_installed || 0}
                        </p>
                      </div>
                      <div className="text-center">
                        <label className="text-xs font-medium text-gray-500 block mb-1">Remaining</label>
                        <p className="text-xl font-bold text-orange-600">
                          {project.remaining || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card title="Project Phases & Quantities">
                  <div className="space-y-4">
                    {/* Use Spectrum phases if available, otherwise fall back to project scopes */}
                    {comprehensiveData?.phases && comprehensiveData.phases.length > 0 ? (
                      comprehensiveData.phases.map((spectrumPhase, idx: number) => {
                        // Find matching project scope for this Spectrum phase
                        const matchingScope = project.scopes?.find((scope: ProjectScope) => 
                          scope.scope_type && (
                            spectrumPhase.phase_code?.toUpperCase().includes(scope.scope_type) ||
                            scope.scope_type === spectrumPhase.phase_code ||
                            spectrumPhase.description?.toUpperCase().includes(scope.scope_type)
                          )
                        );
                        
                        // Find matching meeting phase
                        const matchingMeetingPhase = meetingPhases.find((phase: MeetingPhase) => 
                          phase.phase_code === spectrumPhase.phase_code
                        );
                        
                        // Initial quantity comes from project scope, installed comes from meetings
                        const totalQuantity = matchingScope?.quantity ?? 0;
                        const installedFromMeetings = matchingMeetingPhase?.installed_quantity ?? matchingScope?.installed ?? 0;
                        const balance = Math.max(totalQuantity - installedFromMeetings, 0);
                        
                        const scopeId = matchingScope?.id;
                        const isEditing = editingScope === scopeId;
                        const updates = scopeId ? (scopeUpdates[scopeId] || {}) : {};
                        const currentQuantity = updates.quantity !== undefined ? updates.quantity : totalQuantity;
                        const currentInstalled = updates.installed !== undefined ? updates.installed : installedFromMeetings;
                        const currentRemaining = currentQuantity - currentInstalled;
                        const currentPercent = currentQuantity > 0 ? (currentInstalled / currentQuantity) * 100 : 0;

                        return (
                          <div key={idx} className="p-4 md:p-6 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-900 text-base md:text-lg mb-1">
                                  {spectrumPhase.phase_code} - {spectrumPhase.description || 'No description'}
                                </h4>
                                {spectrumPhase.cost_type && (
                                  <p className="text-xs text-gray-500 mt-1">Cost Type: {spectrumPhase.cost_type}</p>
                                )}
                                {matchingMeetingPhase?.meeting_date && (
                                  <p className="text-xs text-blue-600 mt-1">
                                    Last meeting update: {new Date(matchingMeetingPhase.meeting_date).toLocaleDateString()}
                                  </p>
                                )}
                                {!matchingScope && canEditPhases && (
                                  <p className="text-xs text-orange-600 mt-1 font-medium">Set initial quantity to track progress</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <StatusBadge 
                                  status={`${currentPercent.toFixed(1)}%`} 
                                  size="sm" 
                                />
                                {canEditPhases && matchingScope && !isReadOnly && (
                                  <div className="flex gap-1">
                                    {isEditing ? (
                                      <>
                                        <button
                                          onClick={() => handleScopeUpdate(scopeId!)}
                                          disabled={savingScope === scopeId}
                                          className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50 transition-colors"
                                          title="Save"
                                        >
                                          <CheckIcon className="h-5 w-5" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingScope(null);
                                            setScopeUpdates({});
                                          }}
                                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                          title="Cancel"
                                        >
                                          <XMarkIcon className="h-5 w-5" />
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => setEditingScope(scopeId!)}
                                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                        title="Edit Initial Quantity"
                                      >
                                        <PencilIcon className="h-5 w-5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* Phase Metrics Grid - Responsive */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4">
                              <div className="text-center p-3 md:p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-xs font-medium text-gray-500 block mb-2">Initial Quantity</span>
                                {isEditing && matchingScope ? (
                                  <Input
                                    type="number"
                                    value={currentQuantity}
                                    onChange={(e) => setScopeUpdates({
                                      ...scopeUpdates,
                                      [scopeId!]: { ...updates, quantity: parseFloat(e.target.value) || 0 }
                                    })}
                                    className="text-center text-base font-semibold w-full"
                                    step="0.01"
                                    min="0"
                                    placeholder="Set initial qty"
                                  />
                                ) : (
                                  <div>
                                    <p className="text-lg md:text-xl font-bold text-gray-900">
                                      {totalQuantity.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">{matchingScope?.unit || 'Sq.Ft'}</p>
                                  </div>
                                )}
                                {!matchingScope && canEditPhases && !isReadOnly && (
                                  <Button
                                    variant="secondary"
                                    onClick={() => router.push(`/projects/${id}/edit`)}
                                    className="mt-2 text-xs"
                                  >
                                    Add Scope
                                  </Button>
                                )}
                                {matchingScope && totalQuantity === 0 && canEditPhases && !isEditing && (
                                  <p className="text-xs text-orange-600 mt-1 font-medium">Click edit to set initial quantity</p>
                                )}
                              </div>
                              
                              <div className="text-center p-3 md:p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-xs font-medium text-gray-500 block mb-2">Installed (from Meetings)</span>
                                {isEditing && matchingScope ? (
                                  <Input
                                    type="number"
                                    value={currentInstalled}
                                    onChange={(e) => setScopeUpdates({
                                      ...scopeUpdates,
                                      [scopeId!]: { ...updates, installed: parseFloat(e.target.value) || 0 }
                                    })}
                                    className="text-center text-base font-semibold w-full"
                                    step="0.01"
                                    min="0"
                                  />
                                ) : (
                                  <div>
                                    <p className="text-lg md:text-xl font-bold text-green-600">
                                      {installedFromMeetings.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">{matchingScope?.unit || 'Sq.Ft'}</p>
                                  </div>
                                )}
                                {matchingMeetingPhase && (
                                  <p className="text-xs text-blue-600 mt-1 font-medium">Updated from meetings</p>
                                )}
                                {!matchingMeetingPhase && installedFromMeetings === 0 && (
                                  <p className="text-xs text-gray-400 mt-1">No meeting updates yet</p>
                                )}
                              </div>
                              
                              <div className="text-center p-3 md:p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-xs font-medium text-gray-500 block mb-2">Balance</span>
                                <div>
                                  <p className="text-lg md:text-xl font-bold text-orange-600">
                                    {isEditing ? currentRemaining.toLocaleString() : balance.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">{matchingScope?.unit || 'Sq.Ft'}</p>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Remaining to install</p>
                              </div>
                              
                              <div className="text-center p-3 md:p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-xs font-medium text-gray-500 block mb-2">Completion Rate</span>
                                <div>
                                  <p className="text-lg md:text-xl font-bold text-primary">
                                    {currentPercent.toFixed(1)}%
                                  </p>
                                  <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                                    <div
                                      className={`h-2.5 rounded-full transition-all duration-300 ${
                                        currentPercent >= 100 ? 'bg-green-500' :
                                        currentPercent >= 75 ? 'bg-primary' :
                                        currentPercent >= 50 ? 'bg-yellow-500' :
                                        'bg-orange-500'
                                      }`}
                                      style={{ width: `${Math.min(currentPercent, 100)}%` }}
                                    ></div>
                                  </div>
                                  <p className="text-xs text-gray-400 mt-1">Progress indicator</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : project.scopes && project.scopes.length > 0 ? (
                      project.scopes.map((scope: ProjectScope) => {
                        // Find matching meeting phase for this scope
                        const matchingMeetingPhase = meetingPhases.find((phase: MeetingPhase) => 
                          phase.phase_code?.toUpperCase().includes(scope.scope_type) || 
                          scope.scope_type === phase.phase_code
                        );
                        
                        // Use meeting phase data if available, otherwise use scope data
                        // Initial quantity comes from scope, installed comes from meetings
                        const totalQuantity = scope.quantity ?? 0;
                        const installedFromMeetings = matchingMeetingPhase?.installed_quantity ?? scope.installed ?? 0;
                        const balance = Math.max(totalQuantity - installedFromMeetings, 0);
                        
                        const isEditing = editingScope === scope.id;
                        const updates = scopeUpdates[scope.id] || {};
                        const currentQuantity = updates.quantity !== undefined ? updates.quantity : totalQuantity;
                        const currentInstalled = updates.installed !== undefined ? updates.installed : installedFromMeetings;
                        const currentRemaining = currentQuantity - currentInstalled;
                        const currentPercent = currentQuantity > 0 ? (currentInstalled / currentQuantity) * 100 : 0;

                        return (
                          <div key={scope.id} className="p-4 md:p-6 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-900 text-base md:text-lg mb-1">{scope.scope_type}</h4>
                                {scope.description && (
                                  <p className="text-sm text-gray-600 mt-1">{scope.description}</p>
                                )}
                                {matchingMeetingPhase?.meeting_date && (
                                  <p className="text-xs text-blue-600 mt-1">
                                    Last meeting update: {new Date(matchingMeetingPhase.meeting_date).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <StatusBadge 
                                  status={`${currentPercent.toFixed(1)}%`} 
                                  size="sm" 
                                />
                                {canEditPhases && !isReadOnly && (
                                  <div className="flex gap-1">
                                    {isEditing ? (
                                      <>
                                        <button
                                          onClick={() => handleScopeUpdate(scope.id)}
                                          disabled={savingScope === scope.id}
                                          className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50 transition-colors"
                                          title="Save"
                                        >
                                          <CheckIcon className="h-5 w-5" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingScope(null);
                                            setScopeUpdates({});
                                          }}
                                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                          title="Cancel"
                                        >
                                          <XMarkIcon className="h-5 w-5" />
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => setEditingScope(scope.id)}
                                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                        title="Edit Initial Quantity"
                                      >
                                        <PencilIcon className="h-5 w-5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* Phase Metrics Grid - Responsive */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4">
                              <div className="text-center p-3 md:p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-xs font-medium text-gray-500 block mb-2">Initial Quantity</span>
                                {isEditing ? (
                                  <Input
                                    type="number"
                                    value={currentQuantity}
                                    onChange={(e) => setScopeUpdates({
                                      ...scopeUpdates,
                                      [scope.id]: { ...updates, quantity: parseFloat(e.target.value) || 0 }
                                    })}
                                    className="text-center text-base font-semibold w-full"
                                    step="0.01"
                                    min="0"
                                    placeholder="Set initial qty"
                                  />
                                ) : (
                                  <div>
                                    <p className="text-lg md:text-xl font-bold text-gray-900">
                                      {totalQuantity.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">{scope.unit || 'Sq.Ft'}</p>
                                  </div>
                                )}
                                {!isEditing && totalQuantity === 0 && canEditPhases && !isReadOnly && (
                                  <p className="text-xs text-orange-600 mt-1 font-medium">Click edit to set initial quantity</p>
                                )}
                              </div>
                              
                              <div className="text-center p-3 md:p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-xs font-medium text-gray-500 block mb-2">Installed (from Meetings)</span>
                                {isEditing ? (
                                  <Input
                                    type="number"
                                    value={currentInstalled}
                                    onChange={(e) => setScopeUpdates({
                                      ...scopeUpdates,
                                      [scope.id]: { ...updates, installed: parseFloat(e.target.value) || 0 }
                                    })}
                                    className="text-center text-base font-semibold w-full"
                                    step="0.01"
                                    min="0"
                                  />
                                ) : (
                                  <div>
                                    <p className="text-lg md:text-xl font-bold text-green-600">
                                      {installedFromMeetings.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">{scope.unit || 'Sq.Ft'}</p>
                                  </div>
                                )}
                                {matchingMeetingPhase && (
                                  <p className="text-xs text-blue-600 mt-1 font-medium">Updated from meetings</p>
                                )}
                                {!matchingMeetingPhase && installedFromMeetings === 0 && (
                                  <p className="text-xs text-gray-400 mt-1">No meeting updates yet</p>
                                )}
                              </div>
                              
                              <div className="text-center p-3 md:p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-xs font-medium text-gray-500 block mb-2">Balance</span>
                                <div>
                                  <p className="text-lg md:text-xl font-bold text-orange-600">
                                    {isEditing ? currentRemaining.toLocaleString() : balance.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">{scope.unit || 'Sq.Ft'}</p>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Remaining to install</p>
                              </div>
                              
                              <div className="text-center p-3 md:p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                                <span className="text-xs font-medium text-gray-500 block mb-2">Completion Rate</span>
                                <div>
                                  <p className="text-lg md:text-xl font-bold text-primary">
                                    {currentPercent.toFixed(1)}%
                                  </p>
                                  <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                                    <div
                                      className={`h-2.5 rounded-full transition-all duration-300 ${
                                        currentPercent >= 100 ? 'bg-green-500' :
                                        currentPercent >= 75 ? 'bg-primary' :
                                        currentPercent >= 50 ? 'bg-yellow-500' :
                                        'bg-orange-500'
                                      }`}
                                      style={{ width: `${Math.min(currentPercent, 100)}%` }}
                                    ></div>
                                  </div>
                                  <p className="text-xs text-gray-400 mt-1">Progress indicator</p>
                                </div>
                              </div>
                            </div>
                            
                            {(scope.start_date || scope.end_date) && (
                              <div className="pt-3 border-t border-gray-200 text-xs text-gray-500">
                                {scope.start_date && (
                                  <span>Start: {new Date(String(scope.start_date)).toLocaleDateString()}</span>
                                )}
                                {scope.start_date && scope.end_date && <span className="mx-2">•</span>}
                                {scope.end_date && (
                                  <span>End: {new Date(String(scope.end_date)).toLocaleDateString()}</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : loadingComprehensive ? (
                      <div className="text-center py-12">
                        <LoadingSpinner />
                        <p className="text-gray-500 mt-4">Loading phases from Spectrum...</p>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-gray-500 mb-4">No phases available for this project</p>
                        {canEditPhases && !isReadOnly && (
                          <Button
                            variant="secondary"
                            onClick={() => router.push(`/projects/${id}/edit`)}
                          >
                            Add Scopes
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              <div className="space-y-4 md:space-y-6 w-full">
                <Card title="Team">
                  <div className="space-y-4">
                    {project.project_manager && (
                      <div 
                        className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                        onClick={() => router.push(`/users/${project.project_manager}`)}
                      >
                        <label className="text-xs font-medium text-gray-500 block mb-1">Project Manager</label>
                        <p className="text-base font-semibold text-primary hover:underline">
                          {project.project_manager_detail?.first_name || ''}{' '}
                          {project.project_manager_detail?.last_name || ''}
                        </p>
                        {project.project_manager_detail?.email && (
                          <p className="text-sm text-gray-500 mt-1">{project.project_manager_detail.email}</p>
                        )}
                      </div>
                    )}
                    {project.superintendent && (
                      <div 
                        className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                        onClick={() => router.push(`/users/${project.superintendent}`)}
                      >
                        <label className="text-xs font-medium text-gray-500 block mb-1">Superintendent</label>
                        <p className="text-base font-semibold text-primary hover:underline">
                          {project.superintendent_detail?.first_name || ''}{' '}
                          {project.superintendent_detail?.last_name || ''}
                        </p>
                        {project.superintendent_detail?.email && (
                          <p className="text-sm text-gray-500 mt-1">{project.superintendent_detail.email}</p>
                        )}
                      </div>
                    )}
                    {project.foreman && (
                      <div 
                        className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                        onClick={() => router.push(`/users/${project.foreman}`)}
                      >
                        <label className="text-xs font-medium text-gray-500 block mb-1">Foreman</label>
                        <p className="text-base font-semibold text-primary hover:underline">
                          {project.foreman_detail?.first_name || ''}{' '}
                          {project.foreman_detail?.last_name || ''}
                        </p>
                        {project.foreman_detail?.email && (
                          <p className="text-sm text-gray-500 mt-1">{project.foreman_detail.email}</p>
                        )}
                      </div>
                    )}
                    {project.general_contractor && (
                      <div 
                        className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                        onClick={() => router.push(`/users/${project.general_contractor}`)}
                      >
                        <label className="text-xs font-medium text-gray-500 block mb-1">General Contractor</label>
                        <p className="text-base font-semibold text-primary hover:underline">
                          {project.general_contractor_detail?.first_name || ''}{' '}
                          {project.general_contractor_detail?.last_name || ''}
                        </p>
                        {project.general_contractor_detail?.email && (
                          <p className="text-sm text-gray-500 mt-1">{project.general_contractor_detail.email}</p>
                        )}
                      </div>
                    )}
                    {!project.project_manager && !project.superintendent && !project.foreman && !project.general_contractor && (
                      <p className="text-sm text-gray-500 text-center py-4">No team members assigned</p>
                    )}
                  </div>
                </Card>

                {canViewFinancial && (
                  <Card title="Financial">
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <label className="text-xs font-medium text-gray-500 block mb-2">Contract Value</label>
                        <p className="text-2xl font-bold text-blue-700">
                          ${project.contract_value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <label className="text-xs font-medium text-gray-500 block mb-2">Contract Balance</label>
                        <p className="text-2xl font-bold text-gray-700">
                          ${project.contract_balance?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                        </p>
                      </div>
                      {project.contract_value && project.contract_balance && (
                        <div className="p-4 bg-green-50 rounded-lg">
                          <label className="text-xs font-medium text-gray-500 block mb-2">Estimated Revenue</label>
                          <p className="text-2xl font-bold text-green-700">
                            ${(Number(project.contract_value) - Number(project.contract_balance)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                <Card title="Project Information">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Job Number</span>
                      <span className="font-medium text-gray-900">{project.job_number}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Created</span>
                      <span className="font-medium text-gray-900">
                        {project.created_at
                          ? new Date(project.created_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Last Updated</span>
                      <span className="font-medium text-gray-900">
                        {project.updated_at
                          ? new Date(project.updated_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'N/A'}
                      </span>
                    </div>
                    {project.is_public && (
                      <div className="flex justify-between py-2">
                        <span className="text-gray-500">Public Access</span>
                        <span className="font-medium text-green-600">Enabled</span>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Spectrum Job Information */}
                {loadingComprehensive && (
                  <Card title="Loading Spectrum Data">
                    <div className="flex justify-center py-8">
                      <LoadingSpinner />
                    </div>
                  </Card>
                )}
                {!loadingComprehensive && comprehensiveData && (
                  <>
                    <Card title="Spectrum Job Information">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {comprehensiveData.job.division && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Division</label>
                            <p className="text-base text-gray-900">{comprehensiveData.job.division}</p>
                          </div>
                        )}
                        {comprehensiveData.job.customer_name && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Customer</label>
                            <p className="text-base text-gray-900">{comprehensiveData.job.customer_name}</p>
                          </div>
                        )}
                        {comprehensiveData.job.project_manager && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Project Manager</label>
                            <p className="text-base text-gray-900">{comprehensiveData.job.project_manager}</p>
                          </div>
                        )}
                        {comprehensiveData.job.superintendent && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Superintendent</label>
                            <p className="text-base text-gray-900">{comprehensiveData.job.superintendent}</p>
                          </div>
                        )}
                        {comprehensiveData.job.original_contract && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Original Contract</label>
                            <p className="text-base text-gray-900">${comprehensiveData.job.original_contract.toLocaleString()}</p>
                          </div>
                        )}
                        {comprehensiveData.job.status_code && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Status</label>
                            <p className="text-base text-gray-900">
                              {comprehensiveData.job.status_code === 'A' ? 'Active' 
                               : comprehensiveData.job.status_code === 'I' ? 'Inactive'
                               : comprehensiveData.job.status_code === 'C' ? 'Complete'
                               : comprehensiveData.job.status_code}
                            </p>
                          </div>
                        )}
                      </div>
                    </Card>

                    {/* Job Dates */}
                    {comprehensiveData.dates && (
                      <Card title="Job Dates">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {comprehensiveData.dates.est_start_date && (
                            <div>
                              <label className="text-sm font-medium text-gray-500 block mb-1">Est. Start Date</label>
                              <p className="text-base text-gray-900">{new Date(comprehensiveData.dates.est_start_date).toLocaleDateString()}</p>
                            </div>
                          )}
                          {comprehensiveData.dates.est_complete_date && (
                            <div>
                              <label className="text-sm font-medium text-gray-500 block mb-1">Est. Complete Date</label>
                              <p className="text-base text-gray-900">{new Date(comprehensiveData.dates.est_complete_date).toLocaleDateString()}</p>
                            </div>
                          )}
                          {comprehensiveData.dates.projected_complete_date && (
                            <div>
                              <label className="text-sm font-medium text-gray-500 block mb-1">Projected Complete Date</label>
                              <p className="text-base text-gray-900">{new Date(comprehensiveData.dates.projected_complete_date).toLocaleDateString()}</p>
                            </div>
                          )}
                          {comprehensiveData.dates.start_date && (
                            <div>
                              <label className="text-sm font-medium text-gray-500 block mb-1">Actual Start Date</label>
                              <p className="text-base text-gray-900">{new Date(comprehensiveData.dates.start_date).toLocaleDateString()}</p>
                            </div>
                          )}
                          {comprehensiveData.dates.complete_date && (
                            <div>
                              <label className="text-sm font-medium text-gray-500 block mb-1">Actual Complete Date</label>
                              <p className="text-base text-gray-900">{new Date(comprehensiveData.dates.complete_date).toLocaleDateString()}</p>
                            </div>
                          )}
                        </div>
                      </Card>
                    )}

                    {/* Phases */}
                    {comprehensiveData.phases && comprehensiveData.phases.length > 0 && (
                      <Card title={`Phases (${comprehensiveData.phases.length})`}>
                        <div className="space-y-3">
                          {comprehensiveData.phases.map((phase, idx) => (
                            <div 
                              key={idx} 
                              className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              {/* First Column: Code, Type, Description */}
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-gray-900">{phase.phase_code}</span>
                                  {phase.cost_type && (
                                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{phase.cost_type}</span>
                                  )}
                                </div>
                                {phase.description && (
                                  <div className="text-sm text-gray-700">{phase.description}</div>
                                )}
                              </div>
                              
                              {/* Second Column: JTD, Projected, Estimated, Status */}
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] font-medium text-gray-500 uppercase block mb-1">JTD Cost</label>
                                  <p className="text-sm text-gray-900">
                                    {phase.jtd_actual_dollars ? `$${phase.jtd_actual_dollars.toLocaleString()}` : '-'}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-[10px] font-medium text-gray-500 uppercase block mb-1">Projected Cost</label>
                                  <p className="text-sm text-gray-900">
                                    {phase.projected_dollars ? `$${phase.projected_dollars.toLocaleString()}` : '-'}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-[10px] font-medium text-gray-500 uppercase block mb-1">Estimated Cost</label>
                                  <p className="text-sm text-gray-900">
                                    {phase.current_estimated_dollars ? `$${phase.current_estimated_dollars.toLocaleString()}` : '-'}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-[10px] font-medium text-gray-500 uppercase block mb-1">Status</label>
                                  <div className="mt-0.5">
                                    <StatusBadge status={phase.status_code || 'N/A'} size="sm" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}

                    {/* Cost Projections */}
                    {comprehensiveData.cost_projections && comprehensiveData.cost_projections.length > 0 && (
                      <Card title={`Cost Projections (${comprehensiveData.cost_projections.length})`}>
                        <div className="overflow-x-auto w-full">
                          <table className="w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phase</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transaction Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Projected Hours</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Projected Quantity</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {comprehensiveData.cost_projections.map((proj, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 text-sm text-gray-900">{proj.phase_code}</td>
                                  <td className="px-4 py-3 text-sm text-gray-900">{proj.cost_type}</td>
                                  <td className="px-4 py-3 text-sm text-gray-900">
                                    {proj.transaction_date ? new Date(proj.transaction_date).toLocaleDateString() : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900">
                                    {proj.amount ? `$${proj.amount.toLocaleString()}` : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900">{proj.projected_hours || '-'}</td>
                                  <td className="px-4 py-3 text-sm text-gray-900">{proj.projected_quantity || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    )}

                    {/* UDFs */}
                    {comprehensiveData.udf && (
                      <Card title="User Defined Fields">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => {
                            const udfValue = comprehensiveData.udf?.[`udf${num}` as keyof typeof comprehensiveData.udf] as string;
                            if (!udfValue) return null;
                            return (
                              <div key={num}>
                                <label className="text-sm font-medium text-gray-500 block mb-1">UDF{num}</label>
                                <p className="text-base text-gray-900">{udfValue}</p>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    )}

                    {/* Contacts */}
                    {comprehensiveData.contacts && comprehensiveData.contacts.length > 0 && (
                      <Card title={`Contacts (${comprehensiveData.contacts.length})`}>
                        <div className="space-y-4">
                          {comprehensiveData.contacts.map((contact) => (
                            <div key={contact.contact_id} className="p-4 border border-gray-200 rounded-lg">
                              <h4 className="font-semibold text-gray-900 mb-2">
                                {contact.first_name} {contact.last_name}
                                {contact.title && <span className="text-sm font-normal text-gray-500 ml-2">- {contact.title}</span>}
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                                {contact.phone_number && (
                                  <div>
                                    <span className="font-medium">Phone:</span> {contact.phone_number}
                                  </div>
                                )}
                                {contact.email1 && (
                                  <div>
                                    <span className="font-medium">Email:</span> {contact.email1}
                                  </div>
                                )}
                                {contact.addr_1 && (
                                  <div>
                                    <span className="font-medium">Address:</span> {contact.addr_1}
                                    {contact.addr_city && `, ${contact.addr_city}`}
                                    {contact.addr_state && ` ${contact.addr_state}`}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}
                  </>
                )}
              </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

