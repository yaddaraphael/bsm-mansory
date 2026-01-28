'use client';

import { use, useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';
import { useProject, type ProjectScope } from '@/hooks/useProjects';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSidebar } from '@/components/layout/SidebarContext';
import api from '@/lib/api';
import { PencilIcon, TrashIcon, CheckIcon, XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
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

interface ScopeType {
  id: number;
  code?: string;
  name?: string;
  is_active?: boolean;
}

interface Foreman {
  id: number;
  name: string;
  is_active?: boolean;
}

const normalizeScopeKey = (value?: string) =>
  value ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';

const getScopeKeyCandidates = (scope: ProjectScope) => {
  const rawKeys: string[] = [];
  if (typeof scope.scope_type === 'object' && scope.scope_type) {
    if (scope.scope_type.name) rawKeys.push(scope.scope_type.name);
    if (scope.scope_type.code) rawKeys.push(scope.scope_type.code);
  } else if (typeof scope.scope_type === 'string') {
    rawKeys.push(scope.scope_type);
  }
  if (scope.scope_type_detail?.name) rawKeys.push(scope.scope_type_detail.name);
  if (scope.scope_type_detail?.code) rawKeys.push(scope.scope_type_detail.code);

  return Array.from(
    new Set(rawKeys.map((key) => normalizeScopeKey(key)).filter(Boolean))
  );
};

const getMatchingPhasesForScope = (phases: MeetingPhase[], scope: ProjectScope) => {
  const scopeKeys = getScopeKeyCandidates(scope);
  if (scopeKeys.length === 0) return [];

  const exact = phases.filter((phase) => {
    const phaseKey = normalizeScopeKey(phase.phase_code);
    return !!phaseKey && scopeKeys.some((key) => key === phaseKey);
  });
  if (exact.length > 0) return exact;

  return phases.filter((phase) => {
    const phaseKey = normalizeScopeKey(phase.phase_code);
    return !!phaseKey && scopeKeys.some((key) => phaseKey.includes(key) || key.includes(phaseKey));
  });
};

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
  const [scopeUpdates, setScopeUpdates] = useState<Record<number, Partial<ProjectScope>>>({});
  const [savingScope, setSavingScope] = useState<number | null>(null);
  const [meetingPhases, setMeetingPhases] = useState<MeetingPhase[]>([]);
  const [scopeTypes, setScopeTypes] = useState<ScopeType[]>([]);
  const [foremen, setForemen] = useState<Foreman[]>([]);
  const [showAddScopeModal, setShowAddScopeModal] = useState(false);
  const [newScope, setNewScope] = useState<Partial<ProjectScope>>({});
  const [installedByScope, setInstalledByScope] = useState<Record<number, number>>({});
  
  const canEditDelete = user?.role === 'ROOT_SUPERADMIN';
  const canEditPhases = ['ROOT_SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER'].includes(user?.role || '');
  
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
        const phases = response.data.phases || [];
        setMeetingPhases(phases);
      } catch (err) {
        console.error('Failed to fetch meeting phases:', err);
        setMeetingPhases([]);
      }
    };
    
    if (project) {
      fetchMeetingPhases();
    }
  }, [project]);

  useEffect(() => {
    if (!project?.scopes || meetingPhases.length === 0) {
      setInstalledByScope({});
      return;
    }

    const map: Record<number, number> = {};
    for (const scope of project.scopes) {
      const matching = getMatchingPhasesForScope(meetingPhases, scope);
      if (matching.length === 0) {
        map[scope.id] = Number(scope.installed || 0);
        continue;
      }

      const sorted = [...matching].sort((a, b) => {
        const aDate = a.meeting_date || a.updated_at || '';
        const bDate = b.meeting_date || b.updated_at || '';
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      });

      const installedValues = sorted.map((p) => Number(p.installed_quantity || 0));
      const installedTotal = installedValues.length
        ? installedValues.reduce((a, b) => a + b, 0)
        : Number(scope.installed || 0);

      map[scope.id] = installedTotal;
    }

    setInstalledByScope(map);
  }, [project?.scopes, meetingPhases]);

  // Fetch scope types and foremen
  useEffect(() => {
    const fetchScopeTypesAndForemen = async () => {
      try {
        const [scopeTypesRes, foremenRes] = await Promise.all([
          api.get('/projects/scope-types/'),
          api.get('/projects/foremen/')
        ]);
        setScopeTypes(scopeTypesRes.data.results || scopeTypesRes.data || []);
        setForemen(foremenRes.data.results || foremenRes.data || []);
      } catch (err) {
        console.error('Failed to fetch scope types or foremen:', err);
      }
    };
    
    fetchScopeTypesAndForemen();
  }, []);

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
  if (!project) {
    return null;
  }

  // Show "COMPLETED" status for completed projects, otherwise use schedule status
  const scheduleStatus = isCompleted ? 'COMPLETED' : (project.schedule_status?.status || 'GREEN');
  const projectScopes = project.scopes || [];

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
    if (!updates) {
      setEditingScope(null);
      setScopeUpdates({});
      return;
    }

    setSavingScope(scopeId);
    try {
      const scope = projectScopes.find((s: ProjectScope) => s.id === scopeId);
      if (!scope) return;

      const updatedData: Partial<ProjectScope> = {
        ...updates,
        scope_type_id: updates.scope_type_id !== undefined ? updates.scope_type_id : (typeof scope.scope_type === 'object' ? scope.scope_type.id : scope.scope_type),
        foreman_id: updates.foreman_id !== undefined ? updates.foreman_id : (scope.foreman ? (typeof scope.foreman === 'object' ? scope.foreman.id : scope.foreman) : null),
        // Don't update installed, masons, tenders, operators - these are controlled by meetings
        installed: undefined,
        masons: undefined,
        tenders: undefined,
        operators: undefined,
      };

      await api.patch(`/projects/scopes/${scopeId}/`, updatedData);
      
      // Refetch project data to get updated values
      await refetchProject();
      
      setEditingScope(null);
      setScopeUpdates({});
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      alert(error.response?.data?.detail || 'Failed to update scope');
    } finally {
      setSavingScope(null);
    }
  };

  const handleCreateScope = async () => {
    if (!canEditPhases || isReadOnly || !project) return;
    
    if (!newScope.scope_type_id) {
      alert('Please select a scope type');
      return;
    }

    if (!newScope.qty_sq_ft || parseFloat(String(newScope.qty_sq_ft)) <= 0) {
      alert('Please enter a valid initial quantity (qty/sq.ft) greater than 0');
      return;
    }

    setSavingScope(-1); // Use -1 to indicate creating
    try {
      // Ensure scope_type_id is a valid integer
      const scopeTypeId = typeof newScope.scope_type_id === 'string' 
        ? parseInt(newScope.scope_type_id, 10) 
        : Number(newScope.scope_type_id);
      
      if (!scopeTypeId || isNaN(scopeTypeId)) {
        alert('Please select a valid scope type');
        setSavingScope(null);
        return;
      }

      type ScopePayload = {
        project: number;
        scope_type_id: number;
        description: string;
        saturdays: boolean;
        full_weekends: boolean;
        qty_sq_ft: number;
        estimation_start_date?: string;
        estimation_end_date?: string;
        duration_days?: number;
        foreman_id?: number;
      };

      const scopeData: ScopePayload = {
        project: project.id,
        scope_type_id: scopeTypeId,
        description: newScope.description || '',
        saturdays: newScope.saturdays || false,
        full_weekends: newScope.full_weekends || false,
        qty_sq_ft: parseFloat(String(newScope.qty_sq_ft)),
      };

      // Add optional fields only if they have values
      if (newScope.estimation_start_date) {
        scopeData.estimation_start_date = newScope.estimation_start_date;
      }
      if (newScope.estimation_end_date) {
        scopeData.estimation_end_date = newScope.estimation_end_date;
      }
      if (newScope.duration_days) {
        scopeData.duration_days = parseInt(String(newScope.duration_days));
      }
      if (newScope.foreman_id) {
        scopeData.foreman_id = newScope.foreman_id;
      }

      // Note: masons, tenders, operators are controlled by meetings, not sent here

      await api.post('/projects/scopes/', scopeData);
      
      // Refetch project data
      await refetchProject();
      
      setShowAddScopeModal(false);
      setNewScope({});
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } & Record<string, string[] | string> } };
      let errorMessage = 'Failed to create scope';
      
      if (error.response?.data) {
        // Check for detail message
        if (error.response.data.detail) {
          errorMessage = error.response.data.detail;
        } else {
          // Check for field-specific errors
          const fieldErrors = Object.entries(error.response.data)
            .map(([field, messages]) => {
              const msg = Array.isArray(messages) ? messages.join(', ') : String(messages);
              return `${field}: ${msg}`;
            })
            .join('\n');
          if (fieldErrors) {
            errorMessage = fieldErrors;
          }
        }
      }
      
      console.error('Scope creation error:', error.response?.data);
      alert(errorMessage);
    } finally {
      setSavingScope(null);
    }
  };

  const handleDeleteScope = async (scopeId: number) => {
    if (!canEditPhases || isReadOnly) return;
    
    if (!confirm('Are you sure you want to delete this scope?')) {
      return;
    }

    setSavingScope(scopeId);
    try {
      await api.delete(`/projects/scopes/${scopeId}/`);
      
      // Refetch project data
      await refetchProject();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      alert(error.response?.data?.detail || 'Failed to delete scope');
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
                        <StatusBadge status={project.status || 'PENDING'} size="sm" />
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
                          <p className={`text-base font-medium ${(project.schedule_status?.days_late ?? 0) > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {project.schedule_status?.days_late ?? 0} {(project.schedule_status?.days_late ?? 0) === 1 ? 'day' : 'days'}
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
                    {(() => {
                      const totalQty = projectScopes.reduce(
                        (acc: number, s: ProjectScope) => acc + Number(s.qty_sq_ft ?? s.quantity ?? 0),
                        0
                      );
                      const totalInstalled = projectScopes.reduce((acc: number, s: ProjectScope) => {
                        const scoped = installedByScope[s.id];
                        return acc + Number(scoped ?? s.installed ?? 0);
                      }, 0);
                      const percent = totalQty > 0 ? (totalInstalled / totalQty) * 100 : 0;

                      return (
                        <div>
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-sm font-medium text-gray-700">Production Progress</span>
                            <span className="text-lg font-bold text-primary">
                              {percent.toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div
                              className="bg-primary h-3 rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(percent, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                      <div className="text-center">
                        <label className="text-xs font-medium text-gray-500 block mb-1">Total Quantity</label>
                        <p className="text-xl font-bold text-gray-900">
                          {projectScopes.reduce(
                            (acc: number, s: ProjectScope) => acc + Number(s.qty_sq_ft ?? s.quantity ?? 0),
                            0
                          )}
                        </p>
                      </div>
                      <div className="text-center">
                        <label className="text-xs font-medium text-gray-500 block mb-1">Installed</label>
                        <p className="text-xl font-bold text-green-600">
                          {projectScopes.reduce((acc: number, s: ProjectScope) => {
                            const scoped = installedByScope[s.id];
                            return acc + Number(scoped ?? s.installed ?? 0);
                          }, 0)}
                        </p>
                      </div>
                      <div className="text-center">
                        <label className="text-xs font-medium text-gray-500 block mb-1">Remaining</label>
                        <p className="text-xl font-bold text-orange-600">
                          {(() => {
                            const totalQty = projectScopes.reduce(
                              (acc: number, s: ProjectScope) => acc + Number(s.qty_sq_ft ?? s.quantity ?? 0),
                              0
                            );
                            const totalInstalled = projectScopes.reduce((acc: number, s: ProjectScope) => {
                              const scoped = installedByScope[s.id];
                              return acc + Number(scoped ?? s.installed ?? 0);
                            }, 0);
                            return Math.max(0, totalQty - totalInstalled);
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card title="Project Scopes">
                  <div className="space-y-4">
                    {/* Header with Add Scope button */}
                    {canEditPhases && !isReadOnly && (
                      <div className="flex justify-end mb-4">
                        <Button
                          variant="primary"
                          onClick={() => setShowAddScopeModal(true)}
                          className="flex items-center gap-2"
                        >
                          <PlusIcon className="h-5 w-5" />
                          Add Scope
                        </Button>
                      </div>
                    )}
                    
                    {/* Project Scopes */}
                    {projectScopes.length > 0 ? (
                      projectScopes.map((scope: ProjectScope) => {
                        const scopeTypeName = typeof scope.scope_type === 'object' && scope.scope_type?.name 
                          ? scope.scope_type.name 
                          : (scope.scope_type_detail?.name || String(scope.scope_type || 'N/A'));
                        const scopeTypeId = typeof scope.scope_type === 'object' && scope.scope_type?.id
                          ? scope.scope_type.id
                          : (scope.scope_type_id || scope.scope_type_detail?.id);
                        
                        // Find matching meeting phases for installed quantity updates
                        const matchingMeetingPhases = getMatchingPhasesForScope(meetingPhases, scope);

                        const totalQuantity = scope.qty_sq_ft ?? scope.quantity ?? 0;
                        const installedFromMeetings = installedByScope[scope.id] ?? scope.installed ?? 0;

                        const balance = Math.max(totalQuantity - installedFromMeetings, 0);
                        const percentComplete = totalQuantity > 0 ? (installedFromMeetings / totalQuantity) * 100 : 0;
                        const latestMeetingPhase = matchingMeetingPhases.reduce<MeetingPhase | undefined>((acc, cur) => {
                          const aDate = acc?.meeting_date || acc?.updated_at || '';
                          const bDate = cur.meeting_date || cur.updated_at || '';
                          return !acc || new Date(bDate).getTime() > new Date(aDate).getTime() ? cur : acc;
                        }, undefined);
                        
                        const isEditing = editingScope === scope.id;
                        const updates = scopeUpdates[scope.id] || {};
                        
                        return (
                          <div key={scope.id} className="p-4 md:p-6 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-900 text-base md:text-lg mb-1">{scopeTypeName}</h4>
                                {scope.description && (
                                  <p className="text-sm text-gray-600 mt-1">{scope.description}</p>
                                )}
                                {scope.foreman_detail?.name && (
                                  <p className="text-xs text-blue-600 mt-1">Foreman: {scope.foreman_detail.name}</p>
                                )}
                                {latestMeetingPhase?.meeting_date && (
                                  <p className="text-xs text-green-600 mt-1">
                                    Last meeting update: {new Date(latestMeetingPhase.meeting_date).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <StatusBadge 
                                  status={`${percentComplete.toFixed(1)}%`} 
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
                                      <>
                                        <button
                                          onClick={() => setEditingScope(scope.id)}
                                          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                          title="Edit Scope"
                                        >
                                          <PencilIcon className="h-5 w-5" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteScope(scope.id)}
                                          disabled={savingScope === scope.id}
                                          className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50 transition-colors"
                                          title="Delete Scope"
                                        >
                                          <TrashIcon className="h-5 w-5" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {isEditing ? (
                              <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Scope Type</label>
                                    <select
                                      value={updates.scope_type_id ?? scopeTypeId ?? ''}
                                      onChange={(e) => setScopeUpdates({
                                        ...scopeUpdates,
                                        [scope.id]: { ...updates, scope_type_id: parseInt(e.target.value) }
                                      })}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                      disabled={isReadOnly}
                                    >
                                      <option value="">Select Scope Type</option>
                                      {scopeTypes.map((st) => (
                                        <option key={st.id} value={st.id}>{st.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Foreman</label>
                                    <select
                                      value={updates.foreman_id !== undefined ? (updates.foreman_id || '') : (scope.foreman_id || '')}
                                      onChange={(e) => setScopeUpdates({
                                        ...scopeUpdates,
                                        [scope.id]: { ...updates, foreman_id: e.target.value ? parseInt(e.target.value) : null }
                                      })}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                      disabled={isReadOnly}
                                    >
                                      <option value="">No Foreman</option>
                                      {foremen.map((f) => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                    <textarea
                                      value={updates.description !== undefined ? updates.description : (scope.description || '')}
                                      onChange={(e) => setScopeUpdates({
                                        ...scopeUpdates,
                                        [scope.id]: { ...updates, description: e.target.value }
                                      })}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                      rows={2}
                                      disabled={isReadOnly}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimation Start Date</label>
                                    <Input
                                      type="date"
                                      value={updates.estimation_start_date !== undefined ? updates.estimation_start_date : (scope.estimation_start_date || '')}
                                      onChange={(e) => setScopeUpdates({
                                        ...scopeUpdates,
                                        [scope.id]: { ...updates, estimation_start_date: e.target.value }
                                      })}
                                      disabled={isReadOnly}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimation End Date</label>
                                    <Input
                                      type="date"
                                      value={updates.estimation_end_date !== undefined ? updates.estimation_end_date : (scope.estimation_end_date || '')}
                                      onChange={(e) => setScopeUpdates({
                                        ...scopeUpdates,
                                        [scope.id]: { ...updates, estimation_end_date: e.target.value }
                                      })}
                                      disabled={isReadOnly}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Days)</label>
                                    <Input
                                      type="number"
                                      value={updates.duration_days !== undefined ? updates.duration_days : (scope.duration_days || '')}
                                      onChange={(e) => setScopeUpdates({
                                        ...scopeUpdates,
                                        [scope.id]: { ...updates, duration_days: e.target.value ? parseInt(e.target.value) : undefined }
                                      })}
                                      min="0"
                                      disabled={isReadOnly}
                                    />
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={updates.saturdays !== undefined ? updates.saturdays : (scope.saturdays || false)}
                                        onChange={(e) => setScopeUpdates({
                                          ...scopeUpdates,
                                          [scope.id]: { ...updates, saturdays: e.target.checked }
                                        })}
                                        disabled={isReadOnly}
                                        className="rounded border-gray-300 text-primary focus:ring-primary"
                                      />
                                      <span className="text-sm font-medium text-gray-700">Saturdays</span>
                                    </label>
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={updates.full_weekends !== undefined ? updates.full_weekends : (scope.full_weekends || false)}
                                        onChange={(e) => setScopeUpdates({
                                          ...scopeUpdates,
                                          [scope.id]: { ...updates, full_weekends: e.target.checked }
                                        })}
                                        disabled={isReadOnly}
                                        className="rounded border-gray-300 text-primary focus:ring-primary"
                                      />
                                      <span className="text-sm font-medium text-gray-700">Full Weekends</span>
                                    </label>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Qty/sq.ft (Initial) *</label>
                                    <Input
                                      type="number"
                                      value={updates.qty_sq_ft !== undefined ? updates.qty_sq_ft : (scope.qty_sq_ft ?? scope.quantity ?? 0)}
                                      onChange={(e) => setScopeUpdates({
                                        ...scopeUpdates,
                                        [scope.id]: { ...updates, qty_sq_ft: parseFloat(e.target.value) || 0 }
                                      })}
                                      step="0.01"
                                      min="0"
                                      required
                                      disabled={isReadOnly}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Initial quantity. Installed quantity will be updated from meetings.</p>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Installed <span className="text-xs text-gray-500">(Updated from meetings)</span>
                                    </label>
                                    <Input
                                      type="number"
                                      value={installedFromMeetings}
                                      step="0.01"
                                      min="0"
                                      disabled
                                      className="bg-gray-100 cursor-not-allowed"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Controlled by meetings</p>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Masons <span className="text-xs text-gray-500">(Updated from meetings)</span>
                                    </label>
                                    <Input
                                      type="number"
                                      value={scope.masons || 0}
                                      min="0"
                                      disabled
                                      className="bg-gray-100 cursor-not-allowed"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Controlled by meetings</p>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Tenders <span className="text-xs text-gray-500">(Updated from meetings)</span>
                                    </label>
                                    <Input
                                      type="number"
                                      value={scope.tenders || 0}
                                      min="0"
                                      disabled
                                      className="bg-gray-100 cursor-not-allowed"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Controlled by meetings</p>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Operators <span className="text-xs text-gray-500">(Updated from meetings)</span>
                                    </label>
                                    <Input
                                      type="number"
                                      value={scope.operators || 0}
                                      min="0"
                                      disabled
                                      className="bg-gray-100 cursor-not-allowed"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Controlled by meetings</p>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                {/* Scope Metrics Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4">
                                  <div className="text-center p-3 md:p-4 bg-gray-50 rounded-lg border border-gray-200">
                                    <span className="text-xs font-medium text-gray-500 block mb-2">Qty/sq.ft</span>
                                    <p className="text-lg md:text-xl font-bold text-gray-900">
                                      {totalQuantity.toLocaleString()}
                                    </p>
                                  </div>
                                  <div className="text-center p-3 md:p-4 bg-green-50 rounded-lg border border-green-200">
                                    <span className="text-xs font-medium text-gray-500 block mb-2">Installed</span>
                                    <p className="text-lg md:text-xl font-bold text-green-600">
                                      {installedFromMeetings.toLocaleString()}
                                    </p>
                                    {latestMeetingPhase && (
                                      <p className="text-xs text-green-600 mt-1">From meetings</p>
                                    )}
                                  </div>
                                  <div className="text-center p-3 md:p-4 bg-orange-50 rounded-lg border border-orange-200">
                                    <span className="text-xs font-medium text-gray-500 block mb-2">Remaining</span>
                                    <p className="text-lg md:text-xl font-bold text-orange-600">
                                      {balance.toLocaleString()}
                                    </p>
                                  </div>
                                  <div className="text-center p-3 md:p-4 bg-blue-50 rounded-lg border border-blue-200">
                                    <span className="text-xs font-medium text-gray-500 block mb-2">Completion</span>
                                    <p className="text-lg md:text-xl font-bold text-blue-600">
                                      {percentComplete.toFixed(1)}%
                                    </p>
                                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                                      <div
                                        className={`h-2 rounded-full transition-all ${
                                          percentComplete >= 100 ? 'bg-green-500' :
                                          percentComplete >= 75 ? 'bg-blue-500' :
                                          percentComplete >= 50 ? 'bg-yellow-500' :
                                          'bg-orange-500'
                                        }`}
                                        style={{ width: `${Math.min(percentComplete, 100)}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Scope Details Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                                  {(scope.estimation_start_date || scope.estimation_end_date) && (
                                    <>
                                      {scope.estimation_start_date && (
                                        <div>
                                          <span className="text-xs font-medium text-gray-500">Start Date</span>
                                          <p className="text-sm font-medium text-gray-900">
                                            {new Date(scope.estimation_start_date).toLocaleDateString()}
                                          </p>
                                        </div>
                                      )}
                                      {scope.estimation_end_date && (
                                        <div>
                                          <span className="text-xs font-medium text-gray-500">End Date</span>
                                          <p className="text-sm font-medium text-gray-900">
                                            {new Date(scope.estimation_end_date).toLocaleDateString()}
                                          </p>
                                        </div>
                                      )}
                                      {Number(scope.duration_days) > 0 && (
                                        <div>
                                          <span className="text-xs font-medium text-gray-500">Duration</span>
                                          <p className="text-sm font-medium text-gray-900">{scope.duration_days} days</p>
                                        </div>
                                      )}
                                    </>
                                  )}
                                  {(scope.saturdays || scope.full_weekends) && (
                                    <div>
                                      <span className="text-xs font-medium text-gray-500">Work Schedule</span>
                                      <p className="text-sm font-medium text-gray-900">
                                        {scope.saturdays && 'Saturdays '}
                                        {scope.full_weekends && 'Full Weekends'}
                                      </p>
                                    </div>
                                  )}
                                  {(scope.masons || scope.tenders || scope.operators) && (
                                    <div>
                                      <span className="text-xs font-medium text-gray-500">Resources</span>
                                      <p className="text-sm font-medium text-gray-900">
                                        {scope.masons ? `${scope.masons} Masons` : ''}
                                        {scope.masons && (scope.tenders || scope.operators) ? ', ' : ''}
                                        {scope.tenders ? `${scope.tenders} Tenders` : ''}
                                        {scope.tenders && scope.operators ? ', ' : ''}
                                        {scope.operators ? `${scope.operators} Operators` : ''}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-gray-500">No scopes defined for this project</p>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Add Scope Modal */}
                {showAddScopeModal && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                      <h2 className="text-xl font-bold mb-4">Add New Scope</h2>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Scope Type *</label>
                          <select
                            value={newScope.scope_type_id || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setNewScope({ 
                                ...newScope, 
                                scope_type_id: value ? parseInt(value, 10) : undefined 
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                            required
                          >
                            <option value="">Select Scope Type</option>
                            {scopeTypes.map((st) => (
                              <option key={st.id} value={st.id}>{st.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                          <textarea
                            value={newScope.description || ''}
                            onChange={(e) => setNewScope({ ...newScope, description: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                            rows={3}
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Estimation Start Date</label>
                            <Input
                              type="date"
                              value={newScope.estimation_start_date || ''}
                              onChange={(e) => setNewScope({ ...newScope, estimation_start_date: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Estimation End Date</label>
                            <Input
                              type="date"
                              value={newScope.estimation_end_date || ''}
                              onChange={(e) => setNewScope({ ...newScope, estimation_end_date: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Days)</label>
                            <Input
                              type="number"
                              value={newScope.duration_days || ''}
                              onChange={(e) => setNewScope({ ...newScope, duration_days: e.target.value ? parseInt(e.target.value) : undefined })}
                              min="0"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Foreman</label>
                            <select
                              value={newScope.foreman_id || ''}
                              onChange={(e) => setNewScope({ ...newScope, foreman_id: e.target.value ? parseInt(e.target.value) : undefined })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                            >
                              <option value="">No Foreman</option>
                              {foremen.map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={newScope.saturdays || false}
                                onChange={(e) => setNewScope({ ...newScope, saturdays: e.target.checked })}
                                className="rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <span className="text-sm font-medium text-gray-700">Saturdays</span>
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={newScope.full_weekends || false}
                                onChange={(e) => setNewScope({ ...newScope, full_weekends: e.target.checked })}
                                className="rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <span className="text-sm font-medium text-gray-700">Full Weekends</span>
                            </label>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Qty/sq.ft (Initial) *
                            </label>
                            <Input
                              type="number"
                              value={newScope.qty_sq_ft || ''}
                              onChange={(e) => setNewScope({ ...newScope, qty_sq_ft: parseFloat(e.target.value) || 0 })}
                              step="0.01"
                              min="0"
                              required
                            />
                            <p className="text-xs text-gray-500 mt-1">Initial quantity. Installed quantity will be updated from meetings.</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Masons <span className="text-xs text-gray-500">(Updated from meetings)</span>
                            </label>
                            <Input
                              type="number"
                              value={newScope.masons || '0'}
                              disabled
                              className="bg-gray-100 cursor-not-allowed"
                              min="0"
                            />
                            <p className="text-xs text-gray-500 mt-1">Controlled by meetings</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Tenders <span className="text-xs text-gray-500">(Updated from meetings)</span>
                            </label>
                            <Input
                              type="number"
                              value={newScope.tenders || '0'}
                              disabled
                              className="bg-gray-100 cursor-not-allowed"
                              min="0"
                            />
                            <p className="text-xs text-gray-500 mt-1">Controlled by meetings</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Operators <span className="text-xs text-gray-500">(Updated from meetings)</span>
                            </label>
                            <Input
                              type="number"
                              value={newScope.operators || '0'}
                              disabled
                              className="bg-gray-100 cursor-not-allowed"
                              min="0"
                            />
                            <p className="text-xs text-gray-500 mt-1">Controlled by meetings</p>
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end pt-4">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowAddScopeModal(false);
                              setNewScope({});
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleCreateScope}
                            disabled={savingScope === -1 || !newScope.scope_type_id}
                            isLoading={savingScope === -1}
                          >
                            Create Scope
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </div>
                )}
              </div>

              <div className="space-y-4 md:space-y-6 w-full">
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
