'use client';

import { use, useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import api from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeftIcon,
  LockClosedIcon,
  ChartBarIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';

export default function PublicProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
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

  interface PublicProject {
    id: number;
    job_number: string;
    name: string;
    status: string;
    public_pin?: string;
    production_percent_complete?: number;
    financial_percent_complete?: number;
    branch_name?: string;
    start_date?: string;
    estimated_end_date?: string;
    schedule_status?: {
      status: string;
      forecast_date?: string;
      days_late?: number;
    };
    scopes?: ProjectScope[];
    total_quantity?: number;
    total_installed?: number;
    remaining?: number;
    contract_value?: number;
    contract_balance?: number;
    updated_at?: string;
    [key: string]: unknown;
  }

  const [project, setProject] = useState<PublicProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [pin, setPin] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);

  const fetchProject = useCallback(async (projectPin?: string) => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (projectPin) {
        params.append('pin', projectPin);
      }
      const response = await api.get(`/projects/public/projects/${id}/?${params.toString()}`);
      setProject(response.data);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string }; status?: number } };
      if (error.response?.status === 403) {
        // PIN required
        setShowPinModal(true);
        setError('');
      } else {
        setError(error.response?.data?.detail || 'Failed to load project');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const pinParam = searchParams?.get('pin');
    if (pinParam) {
      setPin(pinParam);
    }
    fetchProject(pinParam || undefined);
  }, [id, searchParams, fetchProject]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return;
    fetchProject(pin);
    setShowPinModal(false);
  };

  const getScheduleStatus = (project: PublicProject) => {
    if (project?.schedule_status) {
      return project.schedule_status.status;
    }
    return 'GREEN';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'GREEN':
        return 'bg-green-500';
      case 'YELLOW':
        return 'bg-yellow-500';
      case 'RED':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error && !showPinModal) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Button variant="secondary" onClick={() => router.push('/public')}>
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <div className="text-center py-8">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={() => router.push('/public')}>Back to Projects</Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="secondary" onClick={() => router.push('/public')}>
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                <p className="text-sm text-gray-600">{project.job_number}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <StatusBadge status={getScheduleStatus(project)} size="lg" />
              {project.public_pin && (
                <LockClosedIcon className="h-6 w-6 text-gray-400" title="PIN Protected" />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Progress Card */}
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Project Progress</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Production Progress</span>
                    <span className="text-sm font-medium text-gray-900">
                      {project.production_percent_complete ? project.production_percent_complete.toFixed(1) : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${getStatusColor(getScheduleStatus(project))}`}
                      style={{ width: `${project.production_percent_complete || 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Financial Progress</span>
                    <span className="text-sm font-medium text-gray-900">
                      {project.financial_percent_complete ? project.financial_percent_complete.toFixed(1) : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-500 h-3 rounded-full transition-all"
                      style={{ width: `${project.financial_percent_complete || 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Project Overview */}
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Project Overview</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Branch</label>
                  <p className="text-gray-900 mt-1">{String(project.branch_name || 'N/A')}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <p className="text-gray-900 mt-1">
                    <StatusBadge status={project.status} size="sm" />
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Start Date</label>
                  <p className="text-gray-900 mt-1">
                    {project.start_date ? new Date(String(project.start_date)).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Estimated End Date</label>
                  <p className="text-gray-900 mt-1">
                    {project.estimated_end_date
                      ? new Date(String(project.estimated_end_date)).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
                {project.schedule_status && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Forecast Date</label>
                      <p className="text-gray-900 mt-1">
                        {project.schedule_status.forecast_date ? new Date(String(project.schedule_status.forecast_date)).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Days Late</label>
                      <p className="text-gray-900 mt-1">
                        {project.schedule_status.days_late || 0} days
                      </p>
                    </div>
                  </>
                )}
              </div>
            </Card>

            {/* Scopes of Work */}
            {project.scopes && project.scopes.length > 0 && (
              <Card>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Scopes of Work</h2>
                <div className="space-y-4">
                  {project.scopes.map((scope: ProjectScope) => (
                    <div key={scope.id} className="border-b pb-4 last:border-0">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium text-gray-900">{scope.scope_type}</h4>
                        <span className="text-sm text-gray-500">
                          {scope.percent_complete ? scope.percent_complete.toFixed(1) : 0}% complete
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Quantity: </span>
                          <span className="text-gray-900">{String(scope.quantity ?? '')}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Installed: </span>
                          <span className="text-gray-900">{String(scope.installed ?? '')}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Remaining: </span>
                          <span className="text-gray-900">{String(scope.remaining ?? '')}</span>
                        </div>
                      </div>
                      {scope.start_date && scope.end_date && (
                        <div className="mt-2 text-xs text-gray-500">
                          {new Date(String(scope.start_date)).toLocaleDateString()} - {new Date(String(scope.end_date)).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Stats Card */}
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Statistics</h2>
              <div className="space-y-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-center text-gray-600 mb-1">
                    <ChartBarIcon className="h-5 w-5 mr-2" />
                    <span className="text-sm">Total Quantity</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-700">
                    {String(project.total_quantity ?? 0)}
                  </p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center justify-center text-gray-600 mb-1">
                    <ChartBarIcon className="h-5 w-5 mr-2" />
                    <span className="text-sm">Installed</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700">
                    {String(project.total_installed ?? 0)}
                  </p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="flex items-center justify-center text-gray-600 mb-1">
                    <ChartBarIcon className="h-5 w-5 mr-2" />
                    <span className="text-sm">Remaining</span>
                  </div>
                  <p className="text-2xl font-bold text-yellow-700">
                    {String(project.remaining ?? 0)}
                  </p>
                </div>
              </div>
            </Card>

            {/* Financial Card */}
            {project.contract_value && (
              <Card>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Contract Value</label>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      ${project.contract_value?.toLocaleString() || '0.00'}
                    </p>
                  </div>
                  {project.contract_balance && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Contract Balance</label>
                      <p className="text-lg font-semibold text-gray-900 mt-1">
                        ${project.contract_balance?.toLocaleString() || '0.00'}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Last Updated */}
            {project.updated_at && (
              <Card>
                <div className="text-center">
                  <CalendarDaysIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Last Updated</p>
                  <p className="text-sm font-medium text-gray-900 mt-1">
                    {new Date(project.updated_at).toLocaleString()}
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                PIN Required
              </h3>
              <p className="text-sm text-gray-600">
                This project is protected. Please enter the PIN to view details.
              </p>
            </div>
            <form onSubmit={handlePinSubmit}>
              <div className="mb-4">
                <Input
                  label="PIN"
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter PIN"
                  required
                  autoFocus
                />
              </div>
              <div className="flex space-x-3">
                <Button type="submit" className="flex-1">
                  Access Project
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push('/public')}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

