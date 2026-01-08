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
import api from '@/lib/api';
import { useRouter } from 'next/navigation';

interface User {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  role: string;
}

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { project, loading: projectLoading } = useProject(id);
  const { branches, loading: branchesLoading } = useBranches({ status: 'ACTIVE' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [projectManagers, setProjectManagers] = useState<User[]>([]);
  const [superintendents, setSuperintendents] = useState<User[]>([]);
  const [generalContractors, setGeneralContractors] = useState<User[]>([]);
  const [foremen, setForemen] = useState<User[]>([]);
  const [scopes, setScopes] = useState<Array<{
    id?: number;
    scope_type: string;
    quantity: string;
    unit: string;
    start_date: string;
    end_date: string;
    description: string;
  }>>([]);
  const [formData, setFormData] = useState({
    name: '',
    branch: '',
    general_contractor: '',
    project_manager: '',
    superintendent: '',
    foreman: '',
    qty_sq: '',
    start_date: '',
    duration: '',
    saturdays: false,
    full_weekends: false,
    contract_value: '',
    contract_balance: '',
    status: 'PENDING',
    is_public: false,
    public_pin: '',
    notes: '',
  });

  const canEdit = user?.role === 'ROOT_SUPERADMIN';

  useEffect(() => {
    // Fetch users by role
    const fetchUsers = async () => {
      try {
        const [pmRes, superRes, gcRes, foremanRes] = await Promise.all([
          api.get('/auth/users/?role=PROJECT_MANAGER'),
          api.get('/auth/users/?role=SUPERINTENDENT'),
          api.get('/auth/users/?role=GENERAL_CONTRACTOR'),
          api.get('/auth/users/?role=FOREMAN'),
        ]);
        
        setProjectManagers(pmRes.data.results || pmRes.data || []);
        setSuperintendents(superRes.data.results || superRes.data || []);
        setGeneralContractors(gcRes.data.results || gcRes.data || []);
        setForemen(foremanRes.data.results || foremanRes.data || []);
      } catch (err) {
        console.error('Failed to fetch users:', err);
      }
    };
    
    fetchUsers();
  }, []);

  // Populate form when project loads
  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || '',
        branch: project.branch?.toString() || '',
        general_contractor: project.general_contractor?.toString() || '',
        project_manager: project.project_manager?.toString() || '',
        superintendent: project.superintendent?.toString() || '',
        foreman: project.foreman?.toString() || '',
        qty_sq: project.qty_sq?.toString() || '',
        start_date: project.start_date ? new Date(project.start_date).toISOString().split('T')[0] : '',
        duration: project.duration?.toString() || '',
        saturdays: project.saturdays || false,
        full_weekends: project.full_weekends || false,
        contract_value: project.contract_value?.toString() || '',
        contract_balance: project.contract_balance?.toString() || '',
        status: project.status || 'PENDING',
        is_public: project.is_public || false,
        public_pin: project.public_pin || '',
        notes: project.notes || '',
      });
      
      // Populate scopes
      if (project.scopes && project.scopes.length > 0) {
        interface Scope {
          id: number;
          scope_type?: string;
          quantity?: number;
          unit?: string;
          start_date?: string;
          end_date?: string;
          description?: string;
        }
        setScopes(project.scopes.map((scope: Scope) => ({
          id: scope.id,
          scope_type: scope.scope_type || '',
          quantity: scope.quantity?.toString() || '',
          unit: scope.unit || 'Sq.Ft',
          start_date: scope.start_date ? new Date(scope.start_date).toISOString().split('T')[0] : '',
          end_date: scope.end_date ? new Date(scope.end_date).toISOString().split('T')[0] : '',
          description: scope.description || '',
        })));
      }
    }
  }, [project]);

  if (!canEdit) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
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
          <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
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
        qty_sq?: number;
        contract_value?: number;
        contract_balance?: number;
        public_pin?: string;
        scopes?: Array<{
          scope_type: string;
          quantity: number;
          unit: string;
          start_date?: string | null;
          end_date?: string | null;
          description: string;
        }>;
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

      if (formData.general_contractor) payload.general_contractor = parseInt(formData.general_contractor);
      if (formData.project_manager) payload.project_manager = parseInt(formData.project_manager);
      if (formData.superintendent) payload.superintendent = parseInt(formData.superintendent);
      if (formData.foreman) payload.foreman = parseInt(formData.foreman);
      if (formData.qty_sq) payload.qty_sq = parseFloat(formData.qty_sq);
      if (formData.contract_value) payload.contract_value = parseFloat(formData.contract_value);
      if (formData.contract_balance) payload.contract_balance = parseFloat(formData.contract_balance);
      if (formData.public_pin) payload.public_pin = formData.public_pin;
      
      // Add scopes if any
      if (scopes.length > 0) {
        payload.scopes = scopes.map(scope => ({
          scope_type: scope.scope_type,
          quantity: parseFloat(scope.quantity) || 0,
          unit: scope.unit || 'Sq.Ft',
          start_date: scope.start_date || null,
          end_date: scope.end_date || null,
          description: scope.description || '',
        }));
      }

      await api.patch(`/projects/projects/${id}/`, payload);
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
        <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
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

            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
              <div className="space-y-4 md:space-y-6">
                <Card title="Basic Information">
                  <div className="space-y-4">
                    <Input
                      label="Project Name *"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Downtown Office Building"
                      required
                    />

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Branch *</label>
                      <select
                        value={formData.branch}
                        onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                        className="input-field"
                        required
                        disabled={branchesLoading}
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
                      />
                      <Input
                        label="Duration (Days) *"
                        type="number"
                        value={formData.duration}
                        onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                        placeholder="e.g., 90"
                        required
                        min="1"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.saturdays}
                          onChange={(e) => setFormData({ ...formData, saturdays: e.target.checked })}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-gray-700">Include Saturdays as workdays</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.full_weekends}
                          onChange={(e) => setFormData({ ...formData, full_weekends: e.target.checked })}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-gray-700">Include full weekends as workdays</span>
                      </label>
                    </div>
                  </div>
                </Card>

                <Card title="Assignments">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Project Manager</label>
                      <select
                        value={formData.project_manager}
                        onChange={(e) => setFormData({ ...formData, project_manager: e.target.value })}
                        className="input-field"
                      >
                        <option value="">Select project manager</option>
                        {projectManagers.map((pm) => (
                          <option key={pm.id} value={pm.id}>
                            {pm.first_name} {pm.last_name} ({pm.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Superintendent</label>
                      <select
                        value={formData.superintendent}
                        onChange={(e) => setFormData({ ...formData, superintendent: e.target.value })}
                        className="input-field"
                      >
                        <option value="">Select superintendent</option>
                        {superintendents.map((superintendent) => (
                          <option key={superintendent.id} value={superintendent.id}>
                            {superintendent.first_name} {superintendent.last_name} ({superintendent.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">General Contractor</label>
                      <select
                        value={formData.general_contractor}
                        onChange={(e) => setFormData({ ...formData, general_contractor: e.target.value })}
                        className="input-field"
                      >
                        <option value="">Select general contractor</option>
                        {generalContractors.map((gc) => (
                          <option key={gc.id} value={gc.id}>
                            {gc.first_name} {gc.last_name} ({gc.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Foreman (Optional)</label>
                      <select
                        value={formData.foreman}
                        onChange={(e) => setFormData({ ...formData, foreman: e.target.value })}
                        className="input-field"
                      >
                        <option value="">Select foreman (optional)</option>
                        {foremen.map((foreman) => (
                          <option key={foreman.id} value={foreman.id}>
                            {foreman.first_name} {foreman.last_name} ({foreman.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </Card>

                <Card title="Quantity & Financial">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      label="Qty/Sq"
                      type="number"
                      step="0.01"
                      value={formData.qty_sq}
                      onChange={(e) => setFormData({ ...formData, qty_sq: e.target.value })}
                      placeholder="0.00"
                      helpText="Quantity per square foot"
                    />
                    <Input
                      label="Contract Value"
                      type="number"
                      step="0.01"
                      value={formData.contract_value}
                      onChange={(e) => setFormData({ ...formData, contract_value: e.target.value })}
                      placeholder="0.00"
                    />
                    <Input
                      label="Contract Balance"
                      type="number"
                      step="0.01"
                      value={formData.contract_balance}
                      onChange={(e) => setFormData({ ...formData, contract_balance: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </Card>

                <Card title="Scope of Work">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Add one or more scopes of work. Each scope can have its own start and end date.
                    </p>
                    {scopes.map((scope, index) => (
                      <div key={index} className="p-4 border rounded-lg bg-gray-50">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-medium text-gray-900">Scope {index + 1}</h4>
                          <button
                            type="button"
                            onClick={() => setScopes(scopes.filter((_, i) => i !== index))}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Scope Type *</label>
                            <select
                              value={scope.scope_type}
                              onChange={(e) => {
                                const newScopes = [...scopes];
                                newScopes[index].scope_type = e.target.value;
                                setScopes(newScopes);
                              }}
                              className="input-field"
                              required
                            >
                              <option value="">Select scope type</option>
                              <option value="CMU">CMU</option>
                              <option value="BRICK">BRICK</option>
                              <option value="CAST_STONE">CAST STONE</option>
                              <option value="MSV">MSV</option>
                              <option value="STUCCO">STUCCO</option>
                              <option value="EIFS">EIFS</option>
                              <option value="THIN_BRICK">THIN BRICK</option>
                              <option value="FBD_STONE">FBD STONE</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Quantity *</label>
                            <Input
                              type="number"
                              step="0.01"
                              value={scope.quantity}
                              onChange={(e) => {
                                const newScopes = [...scopes];
                                newScopes[index].quantity = e.target.value;
                                setScopes(newScopes);
                              }}
                              placeholder="0.00"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Unit</label>
                            <Input
                              value={scope.unit}
                              onChange={(e) => {
                                const newScopes = [...scopes];
                                newScopes[index].unit = e.target.value;
                                setScopes(newScopes);
                              }}
                              placeholder="Sq.Ft"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                            <Input
                              type="date"
                              value={scope.start_date}
                              onChange={(e) => {
                                const newScopes = [...scopes];
                                newScopes[index].start_date = e.target.value;
                                setScopes(newScopes);
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                            <Input
                              type="date"
                              value={scope.end_date}
                              onChange={(e) => {
                                const newScopes = [...scopes];
                                newScopes[index].end_date = e.target.value;
                                setScopes(newScopes);
                              }}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                            <textarea
                              value={scope.description}
                              onChange={(e) => {
                                const newScopes = [...scopes];
                                newScopes[index].description = e.target.value;
                                setScopes(newScopes);
                              }}
                              className="input-field"
                              rows={2}
                              placeholder="Additional description for this scope..."
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setScopes([...scopes, {
                        scope_type: '',
                        quantity: '',
                        unit: 'Sq.Ft',
                        start_date: '',
                        end_date: '',
                        description: '',
                      }])}
                      className="w-full py-2 px-4 border border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary hover:text-primary transition-colors"
                    >
                      + Add Scope of Work
                    </button>
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
                  <Button type="submit" isLoading={loading} className="flex-1">
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

