'use client';

import { use, useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { useProject } from '@/hooks/useProjects';
import { useSidebar } from '@/components/layout/SidebarContext';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { PlusIcon } from '@heroicons/react/24/outline';


export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { isCollapsed } = useSidebar();
  const { project, loading: projectLoading } = useProject(id);
  const { branches, loading: branchesLoading } = useBranches({ status: 'ACTIVE' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [comprehensiveData, setComprehensiveData] = useState<{
    phases?: Array<{
      phase_code: string;
      cost_type: string;
      description: string;
      status_code: string;
      [key: string]: unknown;
    }>;
  } | null>(null);
  const [loadingComprehensive, setLoadingComprehensive] = useState(false);
  const [scopeTypes, setScopeTypes] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [foremen, setForemen] = useState<Array<{ id: number; name: string }>>([]);
  const [scopes, setScopes] = useState<Array<{
    id?: number;
    scope_type_id: number;
    description: string;
    estimation_start_date: string;
    estimation_end_date: string;
    duration_days: string;
    saturdays: boolean;
    full_weekends: boolean;
    qty_sq_ft: string;
    foreman_id: string;
    masons: string;
    tenders: string;
    operators: string;
  }>>([]);
  const [editingScopeIndex, setEditingScopeIndex] = useState<number | null>(null);
  const [showAddScope, setShowAddScope] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    branch: '',
    start_date: '',
    duration: '',
    saturdays: false,
    full_weekends: false,
    status: 'PENDING',
    is_public: false,
    public_pin: '',
    notes: '',
  });

  const canEdit = user?.role === 'ROOT_SUPERADMIN';
  // Check if project is completed from Spectrum - disable all editing
  const isCompletedFromSystem = project?.status === 'COMPLETED' || project?.spectrum_status_code === 'C';
  const isReadOnly = isCompletedFromSystem || !canEdit;


  // Fetch comprehensive Spectrum data for phases (for reference only)
  useEffect(() => {
    const fetchComprehensiveData = async () => {
      if (!project?.job_number) return;
      
      setLoadingComprehensive(true);
      try {
        const encodedJobNumber = encodeURIComponent(project.job_number);
        const response = await api.get(`/spectrum/projects/${encodedJobNumber}/comprehensive/`);
        setComprehensiveData(response.data);
      } catch {
        console.log('Comprehensive Spectrum data not available for this project');
      } finally {
        setLoadingComprehensive(false);
      }
    };
    
    if (project) {
      fetchComprehensiveData();
    }
  }, [project]);

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

  // Populate form when project loads
  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || '',
        branch: project.branch?.toString() || '',
        start_date: project.start_date ? new Date(project.start_date).toISOString().split('T')[0] : '',
        duration: project.duration?.toString() || '',
        saturdays: project.saturdays || false,
        full_weekends: project.full_weekends || false,
        status: project.status || 'PENDING',
        is_public: project.is_public || false,
        public_pin: project.public_pin || '',
        notes: project.notes || '',
      });
      
    }
  }, [project]);

  if (!canEdit) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 sidebar-content">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <Card>
                <div className="text-center py-8">
                  <p className="text-red-600">You don&apos;t have permission to edit projects.</p>
                </div>
              </Card>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (projectLoading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 sidebar-content">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <LoadingSpinner />
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isCompletedFromSystem) {
      setError('Cannot edit a project that is completed from the system');
      return;
    }
    
    if (!canEdit) {
      setError('You do not have permission to edit projects');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      interface ProjectPayload {
        name: string;
        branch: number;
        start_date: string;
        duration: number;
        saturdays: boolean;
        full_weekends: boolean;
        status: string;
        is_public: boolean;
        notes?: string;
        general_contractor?: number;
        project_manager?: number;
        superintendent?: number;
        foreman?: number;
        public_pin?: string;
        scopes?: Array<{
          scope_type: string;
          quantity: number;
          unit: string;
          start_date?: string | null;
          end_date?: string | null;
          description: string;
        }>;
        phase_quantities?: Record<string, number>;
      }

      const payload: ProjectPayload = {
        name: formData.name,
        branch: parseInt(formData.branch),
        start_date: formData.start_date,
        duration: parseInt(formData.duration),
        saturdays: formData.saturdays,
        full_weekends: formData.full_weekends,
        status: formData.status,
        is_public: formData.is_public,
        notes: formData.notes,
      };

      if (formData.public_pin) payload.public_pin = formData.public_pin;
      
      // Save scopes separately via API
      // We'll handle scopes in a separate API call after project update

      await api.patch(`/projects/projects/${id}/`, payload);
      
      // Save/update scopes
      if (scopes.length > 0) {
        for (const scope of scopes) {
          // Skip scopes without a valid scope_type_id
          if (!scope.scope_type_id || scope.scope_type_id === 0) {
            continue;
          }
          
          const scopePayload: any = {
            project: parseInt(id),
            scope_type_id: scope.scope_type_id,
            description: scope.description || '',
            qty_sq_ft: parseFloat(scope.qty_sq_ft) || 0,
            // Don't send masons, tenders, operators - these are controlled by meetings
            saturdays: scope.saturdays,
            full_weekends: scope.full_weekends,
          };
          
          if (scope.estimation_start_date) {
            scopePayload.estimation_start_date = scope.estimation_start_date;
          }
          if (scope.estimation_end_date) {
            scopePayload.estimation_end_date = scope.estimation_end_date;
          }
          if (scope.duration_days) {
            scopePayload.duration_days = parseInt(scope.duration_days);
          }
          if (scope.foreman_id) {
            scopePayload.foreman_id = parseInt(scope.foreman_id);
          }
          
          if (scope.id) {
            // Update existing scope
            await api.patch(`/projects/scopes/${scope.id}/`, scopePayload);
          } else {
            // Create new scope
            await api.post('/projects/scopes/', scopePayload);
          }
        }
      }
      
      setSuccess(true);
      setTimeout(() => {
        router.push(`/projects/${id}`);
      }, 1500);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string; name?: string[]; branch?: string[] } } };
      setError(
        error.response?.data?.detail || 
        error.response?.data?.name?.[0] ||
        error.response?.data?.branch?.[0] ||
        'Failed to update project'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['ROOT_SUPERADMIN']}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 sidebar-content">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="mb-4 md:mb-6">
              <button
                onClick={() => router.push(`/projects/${id}`)}
                className="text-sm md:text-base text-gray-600 hover:text-primary mb-2"
              >
                ← Back to Project
              </button>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Edit Project</h1>
            </div>

            {isCompletedFromSystem && (
              <Card className="mb-6 bg-yellow-50 border-yellow-200">
                <div className="flex items-center gap-2 text-yellow-800">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="font-medium">This project is completed from the system. Editing is disabled.</p>
                </div>
              </Card>
            )}

            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto w-full px-2 sm:px-4">
              <div className="space-y-4 md:space-y-6">
                <Card title="Basic Information">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Project Name *</label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Downtown Office Building"
                        required
                        readOnly
                        disabled
                        className="bg-gray-100 cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-500 mt-1">Project name cannot be changed</p>
                    </div>

                    {project?.job_number && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Job Number</label>
                        <Input
                          value={project.job_number}
                          readOnly
                          disabled
                          className="bg-gray-100 cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-500 mt-1">Job number cannot be changed</p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Branch *</label>
                      <select
                        value={formData.branch}
                        onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                        className="input-field"
                        required
                        disabled={branchesLoading || isReadOnly}
                      >
                        <option value="">Select a branch</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name} ({branch.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Status *</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="input-field"
                        required
                        disabled={isReadOnly}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="ACTIVE">Active</option>
                        <option value="ON_HOLD">On Hold</option>
                        <option value="COMPLETED">Completed</option>
                      </select>
                    </div>
                  </div>
                </Card>

                <Card title="Schedule">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="Start Date *"
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        required
                        disabled={isReadOnly}
                      />
                      <Input
                        label="Duration (Days) *"
                        type="number"
                        value={formData.duration}
                        onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                        placeholder="e.g., 90"
                        required
                        min="1"
                        disabled={isReadOnly}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.saturdays}
                          onChange={(e) => setFormData({ ...formData, saturdays: e.target.checked })}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                          disabled={isReadOnly}
                        />
                        <span className="text-sm text-gray-700">Include Saturdays as workdays</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.full_weekends}
                          onChange={(e) => setFormData({ ...formData, full_weekends: e.target.checked })}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                          disabled={isReadOnly}
                        />
                        <span className="text-sm text-gray-700">Include full weekends as workdays</span>
                      </label>
                    </div>
                  </div>
                </Card>


                <Card title="Project Scopes">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm text-gray-600">
                        Manage scopes for this project. Scopes track progress, dates, and resources.
                      </p>
                      {!isReadOnly && (
                        <Button
                          variant="primary"
                          onClick={() => {
                            setScopes([...scopes, {
                              scope_type_id: 0,
                              description: '',
                              estimation_start_date: '',
                              estimation_end_date: '',
                              duration_days: '',
                              saturdays: false,
                              full_weekends: false,
                              qty_sq_ft: '',
                              foreman_id: '',
                              masons: '',
                              tenders: '',
                              operators: '',
                            }]);
                            setEditingScopeIndex(scopes.length);
                            setShowAddScope(true);
                          }}
                          className="flex items-center gap-2"
                        >
                          <PlusIcon className="h-5 w-5" />
                          Add Scope
                        </Button>
                      )}
                    </div>
                    
                    {scopes.length > 0 ? (
                      <div className="space-y-4">
                        {scopes.map((scope, idx) => {
                          const isEditing = editingScopeIndex === idx;
                          const scopeType = scopeTypes.find(st => st.id === scope.scope_type_id);
                          
                          return (
                            <div key={idx} className="p-4 border border-gray-200 rounded-lg bg-white">
                              <div className="flex justify-between items-center mb-4">
                                <h4 className="font-semibold text-gray-900">
                                  {scopeType ? scopeType.name : 'New Scope'}
                                </h4>
                                {!isReadOnly && (
                                  <div className="flex gap-2">
                                    {isEditing ? (
                                      <>
                                        <Button
                                          variant="primary"
                                          size="sm"
                                          onClick={() => setEditingScopeIndex(null)}
                                        >
                                          Done
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => setEditingScopeIndex(idx)}
                                        >
                                          Edit
                                        </Button>
                                        <Button
                                          variant="danger"
                                          size="sm"
                                          onClick={async () => {
                                            if (scope.id) {
                                              try {
                                                await api.delete(`/projects/scopes/${scope.id}/`);
                                              } catch (err) {
                                                console.error('Failed to delete scope:', err);
                                              }
                                            }
                                            setScopes(scopes.filter((_, i) => i !== idx));
                                          }}
                                        >
                                          Delete
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                              
                              {isEditing ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Scope Type *</label>
                                    <select
                                      value={scope.scope_type_id}
                                      onChange={(e) => {
                                        const updated = [...scopes];
                                        updated[idx].scope_type_id = parseInt(e.target.value);
                                        setScopes(updated);
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                      required
                                      disabled={isReadOnly}
                                    >
                                      <option value="0">Select Scope Type</option>
                                      {scopeTypes.map((st) => (
                                        <option key={st.id} value={st.id}>{st.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Foreman</label>
                                    <select
                                      value={scope.foreman_id}
                                      onChange={(e) => {
                                        const updated = [...scopes];
                                        updated[idx].foreman_id = e.target.value;
                                        setScopes(updated);
                                      }}
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
                                      value={scope.description}
                                      onChange={(e) => {
                                        const updated = [...scopes];
                                        updated[idx].description = e.target.value;
                                        setScopes(updated);
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                      rows={2}
                                      disabled={isReadOnly}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimation Start Date</label>
                                    <Input
                                      type="date"
                                      value={scope.estimation_start_date}
                                      onChange={(e) => {
                                        const updated = [...scopes];
                                        updated[idx].estimation_start_date = e.target.value;
                                        setScopes(updated);
                                      }}
                                      disabled={isReadOnly}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimation End Date</label>
                                    <Input
                                      type="date"
                                      value={scope.estimation_end_date}
                                      onChange={(e) => {
                                        const updated = [...scopes];
                                        updated[idx].estimation_end_date = e.target.value;
                                        setScopes(updated);
                                      }}
                                      disabled={isReadOnly}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Days)</label>
                                    <Input
                                      type="number"
                                      value={scope.duration_days}
                                      onChange={(e) => {
                                        const updated = [...scopes];
                                        updated[idx].duration_days = e.target.value;
                                        setScopes(updated);
                                      }}
                                      min="0"
                                      disabled={isReadOnly}
                                    />
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={scope.saturdays}
                                        onChange={(e) => {
                                          const updated = [...scopes];
                                          updated[idx].saturdays = e.target.checked;
                                          setScopes(updated);
                                        }}
                                        disabled={isReadOnly}
                                        className="rounded border-gray-300 text-primary focus:ring-primary"
                                      />
                                      <span className="text-sm font-medium text-gray-700">Saturdays</span>
                                    </label>
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={scope.full_weekends}
                                        onChange={(e) => {
                                          const updated = [...scopes];
                                          updated[idx].full_weekends = e.target.checked;
                                          setScopes(updated);
                                        }}
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
                                      value={scope.qty_sq_ft}
                                      onChange={(e) => {
                                        const updated = [...scopes];
                                        updated[idx].qty_sq_ft = e.target.value;
                                        setScopes(updated);
                                      }}
                                      step="0.01"
                                      min="0"
                                      required
                                      disabled={isReadOnly}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Initial quantity. Installed quantity will be updated from meetings.</p>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Masons <span className="text-xs text-gray-500">(Updated from meetings)</span>
                                    </label>
                                    <Input
                                      type="number"
                                      value={scope.masons || '0'}
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
                                      value={scope.tenders || '0'}
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
                                      value={scope.operators || '0'}
                                      disabled
                                      className="bg-gray-100 cursor-not-allowed"
                                      min="0"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Controlled by meetings</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                                  {scope.description && (
                                    <div>
                                      <span className="text-gray-500">Description:</span>
                                      <p className="font-medium text-gray-900">{scope.description}</p>
                                    </div>
                                  )}
                                  {scope.estimation_start_date && (
                                    <div>
                                      <span className="text-gray-500">Start Date:</span>
                                      <p className="font-medium text-gray-900">
                                        {new Date(scope.estimation_start_date).toLocaleDateString()}
                                      </p>
                                    </div>
                                  )}
                                  {scope.estimation_end_date && (
                                    <div>
                                      <span className="text-gray-500">End Date:</span>
                                      <p className="font-medium text-gray-900">
                                        {new Date(scope.estimation_end_date).toLocaleDateString()}
                                      </p>
                                    </div>
                                  )}
                                  {scope.duration_days && (
                                    <div>
                                      <span className="text-gray-500">Duration:</span>
                                      <p className="font-medium text-gray-900">{scope.duration_days} days</p>
                                    </div>
                                  )}
                                  {scope.qty_sq_ft && (
                                    <div>
                                      <span className="text-gray-500">Qty/sq.ft:</span>
                                      <p className="font-medium text-gray-900">{parseFloat(scope.qty_sq_ft).toLocaleString()}</p>
                                    </div>
                                  )}
                                  {scope.foreman_id && (
                                    <div>
                                      <span className="text-gray-500">Foreman:</span>
                                      <p className="font-medium text-gray-900">
                                        {foremen.find(f => f.id === parseInt(scope.foreman_id))?.name || 'N/A'}
                                      </p>
                                    </div>
                                  )}
                                  {(scope.masons || scope.tenders || scope.operators) && (
                                    <div>
                                      <span className="text-gray-500">Resources:</span>
                                      <p className="font-medium text-gray-900">
                                        {scope.masons ? `${scope.masons} M` : ''}
                                        {scope.masons && (scope.tenders || scope.operators) ? ', ' : ''}
                                        {scope.tenders ? `${scope.tenders} T` : ''}
                                        {scope.tenders && scope.operators ? ', ' : ''}
                                        {scope.operators ? `${scope.operators} O` : ''}
                                      </p>
                                    </div>
                                  )}
                                  {(scope.saturdays || scope.full_weekends) && (
                                    <div>
                                      <span className="text-gray-500">Schedule:</span>
                                      <p className="font-medium text-gray-900">
                                        {scope.saturdays && 'Saturdays '}
                                        {scope.full_weekends && 'Full Weekends'}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-gray-500 mb-4">No scopes defined for this project</p>
                        {!isReadOnly && (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setScopes([{
                                scope_type_id: 0,
                                description: '',
                                estimation_start_date: '',
                                estimation_end_date: '',
                                duration_days: '',
                                saturdays: false,
                                full_weekends: false,
                                qty_sq_ft: '',
                                foreman_id: '',
                                masons: '',
                                tenders: '',
                                operators: '',
                              }]);
                              setEditingScopeIndex(0);
                            }}
                          >
                            Add First Scope
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>

                <Card title="Public Access">
                  <div className="space-y-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.is_public}
                        onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                        disabled={isReadOnly}
                      />
                      <span className="text-sm text-gray-700">Make this project publicly visible</span>
                    </label>
                    {formData.is_public && (
                      <Input
                        label="Public PIN (Optional)"
                        value={formData.public_pin}
                        onChange={(e) => setFormData({ ...formData, public_pin: e.target.value })}
                        placeholder="Optional PIN for public access"
                        maxLength={10}
                        disabled={isReadOnly}
                      />
                    )}
                  </div>
                </Card>

                <Card title="Notes">
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input-field"
                    rows={4}
                    placeholder="Additional notes about this project..."
                    disabled={isReadOnly}
                  />
                </Card>

                {success && (
                  <Card>
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                      <p className="font-medium">Project updated successfully!</p>
                      <p className="text-sm mt-1">Redirecting to project details...</p>
                    </div>
                  </Card>
                )}

                {error && (
                  <Card>
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                      {error}
                    </div>
                  </Card>
                )}

                <div className="flex space-x-4">
                  <Button type="submit" isLoading={loading} className="flex-1" disabled={isReadOnly}>
                    Update Project
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => router.push(`/projects/${id}`)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </form>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

