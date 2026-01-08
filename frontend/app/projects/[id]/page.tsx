'use client';

import { use, useState } from 'react';
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
import api from '@/lib/api';
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { project, loading } = useProject(id);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  const canEditDelete = user?.role === 'ROOT_SUPERADMIN';
  const canViewFinancial = !['FOREMAN', 'LABORER', 'MASON', 'OPERATOR', 'BRICKLAYER', 'PLASTER'].includes(user?.role || '');

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

  if (!project) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="flex-1 p-6 bg-gray-50">
              <Card>
                <p className="text-center text-gray-500 py-8">Project not found</p>
              </Card>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const scheduleStatus = project.schedule_status?.status || 'GREEN';

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }

    setDeleteLoading(true);
    try {
      await api.delete(`/projects/projects/${id}/`);
      router.push('/projects');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      alert(error.response?.data?.detail || 'Failed to delete project');
      setDeleteLoading(false);
    }
  };

  return (
    <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <div className="max-w-7xl mx-auto">
                {/* Header Section */}
                <div className="mb-6">
                  <button
                    onClick={() => router.push('/projects')}
                    className="flex items-center text-sm md:text-base text-gray-600 hover:text-primary mb-4 transition-colors"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Projects
                  </button>
                  
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{project.name}</h1>
                      <p className="text-base md:text-lg text-gray-500">{project.job_number}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StatusBadge status={scheduleStatus} size="lg" />
                      {canEditDelete && (
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => router.push(`/projects/${id}/edit`)}
                            className="flex items-center"
                          >
                            <PencilIcon className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            onClick={handleDelete}
                            isLoading={deleteLoading}
                            className="flex items-center"
                          >
                            <TrashIcon className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card title="Project Overview">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div>
                      <label className="text-sm font-medium text-gray-500 block mb-1">Branch</label>
                      <p className="text-base text-gray-900 font-medium">{project.branch_detail?.name || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 block mb-1">Status</label>
                      <p className="text-base text-gray-900 font-medium">
                        <StatusBadge status={project.status} size="sm" />
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 block mb-1">Start Date</label>
                      <p className="text-base text-gray-900 font-medium">
                        {new Date(project.start_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 block mb-1">Estimated End Date</label>
                      <p className="text-base text-gray-900 font-medium">
                        {project.estimated_end_date
                          ? new Date(project.estimated_end_date).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })
                          : 'N/A'}
                      </p>
                    </div>
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

                <Card title="Progress">
                  <div className="space-y-6">
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

                <Card title="Scopes of Work">
                  {project.scopes && project.scopes.length > 0 ? (
                    <div className="space-y-4">
                      {project.scopes.map((scope: { id: number; scope_type: string; description?: string; percent_complete?: number; quantity?: number; installed?: number; remaining?: number; unit?: string; start_date?: string; end_date?: string; [key: string]: unknown }) => (
                        <div key={scope.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h4 className="font-semibold text-gray-900 text-base mb-1">{scope.scope_type}</h4>
                              {scope.description && (
                                <p className="text-sm text-gray-600 mt-1">{scope.description}</p>
                              )}
                            </div>
                            <StatusBadge 
                              status={`${scope.percent_complete ? scope.percent_complete.toFixed(0) : 0}%`} 
                              size="sm" 
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div className="text-center p-2 bg-white rounded">
                              <span className="text-xs text-gray-500 block mb-1">Quantity</span>
                              <span className="text-base font-semibold text-gray-900">{String(scope.quantity ?? 0)} {scope.unit || ''}</span>
                            </div>
                            <div className="text-center p-2 bg-white rounded">
                              <span className="text-xs text-gray-500 block mb-1">Installed</span>
                              <span className="text-base font-semibold text-green-600">{String(scope.installed ?? 0)} {scope.unit || ''}</span>
                            </div>
                            <div className="text-center p-2 bg-white rounded">
                              <span className="text-xs text-gray-500 block mb-1">Remaining</span>
                              <span className="text-base font-semibold text-orange-600">{String(scope.remaining ?? 0)} {scope.unit || ''}</span>
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
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No scopes of work defined for this project</p>
                  )}
                </Card>
              </div>

              <div className="space-y-6">
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
                            ${(project.contract_value - project.contract_balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
      </ProtectedRoute>
  );
}

