'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useProjects } from '@/hooks/useProjects';
import { useActiveClockIn } from '@/hooks/useTimeEntries';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { ClockIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';

export default function ClockInOutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { projects } = useProjects({ status: 'ACTIVE' });
  const { activeEntry, loading: activeLoading, refetch } = useActiveClockIn();
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedScope, setSelectedScope] = useState<string>('');
  const [costCode, setCostCode] = useState<string>('');
  const [isClocking, setIsClocking] = useState(false);
  const [error, setError] = useState<string>('');
  interface ProjectScope {
    id: number;
    scope_type: string;
    description?: string;
  }

  const [availableScopes, setAvailableScopes] = useState<ProjectScope[]>([]);
  const [loadingScopes, setLoadingScopes] = useState(false);
  
  const isForeman = user?.role === 'FOREMAN';

  // Superadmins don't need to clock in
  const isSuperadmin = user?.role === 'ROOT_SUPERADMIN' || user?.role === 'SUPERADMIN';
  
  // Fetch scopes when project is selected
  useEffect(() => {
    const fetchProjectScopes = async () => {
      if (!selectedProject) {
        setAvailableScopes([]);
        setSelectedScope('');
        return;
      }

      try {
        setLoadingScopes(true);
        const response = await api.get(`/projects/projects/${selectedProject}/`);
        const project = response.data;
        // Get scopes from the project
        if (project.scopes && project.scopes.length > 0) {
          setAvailableScopes(project.scopes);
        } else {
          setAvailableScopes([]);
        }
        // Reset selected scope when project changes
        setSelectedScope('');
      } catch (err: unknown) {
        console.error('Failed to fetch project scopes:', err);
        setAvailableScopes([]);
      } finally {
        setLoadingScopes(false);
      }
    };

    if (!isSuperadmin) {
      fetchProjectScopes();
    }
  }, [selectedProject, isSuperadmin]);
  
  if (isSuperadmin) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50">
              <Card>
                <div className="text-center py-8">
                  <p className="text-base md:text-lg text-gray-600">
                    Superadmins do not need to clock in/out.
                  </p>
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="mt-4 btn-primary w-full sm:w-auto"
                  >
                    Go to Dashboard
                  </button>
                </div>
              </Card>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const handleClockIn = async () => {
    if (!selectedProject) {
      setError('Please select a project');
      return;
    }
    
    // Foremen must provide scope
    if (isForeman && !selectedScope) {
      setError('Foremen must specify scope of work when clocking in');
      return;
    }

    setIsClocking(true);
    setError('');
    try {
      await api.post('/time/entries/clock_in/', {
        project: selectedProject,
        scope: selectedScope || null,
        cost_code: costCode || null,
        source: 'web',
      });
      await refetch();
      setSelectedProject('');
      setSelectedScope('');
      setCostCode('');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to clock in');
    } finally {
      setIsClocking(false);
    }
  };

  const handleClockOut = async () => {
    setIsClocking(true);
    setError('');
    try {
      await api.post('/time/entries/clock_out/');
      await refetch();
      router.push('/time/my-time');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to clock out');
    } finally {
      setIsClocking(false);
    }
  };

  if (activeLoading) {
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

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 sidebar-content">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Clock In/Out</h1>

            <div className="max-w-2xl mx-auto">
              {activeEntry ? (
                <Card>
                  <div className="text-center space-y-6">
                    <div className="flex justify-center">
                      <div className="bg-green-100 rounded-full p-6">
                        <ClockIcon className="h-16 w-16 text-green-600" />
                      </div>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Currently Clocked In</h2>
                      <p className="text-gray-600">
                        Project: {activeEntry.project_detail?.name || activeEntry.project_detail?.job_number}
                      </p>
                      <p className="text-gray-600">
                        Clocked in: {new Date(activeEntry.clock_in).toLocaleString()}
                      </p>
                      {activeEntry.total_hours > 0 && (
                        <p className="text-lg font-semibold text-primary mt-2">
                          Hours today: {activeEntry.total_hours.toFixed(2)}
                        </p>
                      )}
                    </div>
                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                        {error}
                      </div>
                    )}
                    <Button
                      onClick={handleClockOut}
                      isLoading={isClocking}
                      className="w-full"
                      variant="red"
                    >
                      Clock Out
                    </Button>
                  </div>
                </Card>
              ) : (
                <Card>
                  <div className="space-y-6">
                    <div className="text-center">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Clock In</h2>
                      <p className="text-gray-600">Select a project to clock in</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Project {isForeman && '*'}
                      </label>
                      <select
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                        className="input-field"
                        disabled={isClocking}
                        required={isForeman}
                      >
                        <option value="">Choose a project...</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.job_number} - {project.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {isForeman && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Scope of Work *
                          </label>
                          {loadingScopes ? (
                            <div className="input-field flex items-center">
                              <span className="text-gray-500">Loading scopes...</span>
                            </div>
                          ) : availableScopes.length > 0 ? (
                            <select
                              value={selectedScope}
                              onChange={(e) => setSelectedScope(e.target.value)}
                              className="input-field"
                              disabled={isClocking || !selectedProject}
                              required
                            >
                              <option value="">Select scope...</option>
                              {availableScopes.map((scope: ProjectScope) => (
                                <option key={scope.id} value={scope.scope_type}>
                                  {scope.scope_type.replace('_', ' ')}
                                  {scope.description && ` - ${scope.description.substring(0, 30)}`}
                                </option>
                              ))}
                            </select>
                          ) : selectedProject ? (
                            <div className="input-field bg-yellow-50 border-yellow-200">
                              <span className="text-yellow-700 text-sm">
                                No scopes defined for this project. Please contact the project manager.
                              </span>
                            </div>
                          ) : (
                            <select
                              className="input-field"
                              disabled
                            >
                              <option value="">Select a project first...</option>
                            </select>
                          )}
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Cost Code (Optional)
                          </label>
                          <input
                            type="text"
                            value={costCode}
                            onChange={(e) => setCostCode(e.target.value)}
                            className="input-field"
                            disabled={isClocking}
                            placeholder="Enter cost code..."
                          />
                        </div>
                      </>
                    )}

                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                        {error}
                      </div>
                    )}

                    <Button
                      onClick={handleClockIn}
                      isLoading={isClocking}
                      disabled={!selectedProject || (isForeman && !selectedScope)}
                      className="w-full"
                    >
                      Clock In
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

