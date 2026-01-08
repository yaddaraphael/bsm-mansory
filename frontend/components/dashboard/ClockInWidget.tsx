'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProjects';
import api from '@/lib/api';
import { PlayIcon, StopIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';

interface TimeEntry {
  id: number;
  clock_in: string;
  scope?: string;
  project_detail?: {
    job_number?: string;
    name?: string;
  };
}

interface Project {
  id: number;
  job_number: string;
  name: string;
}

interface ProjectScope {
  id: number;
  scope_type: string;
  description?: string;
}

interface ClockInWidgetProps {
  activeEntry: TimeEntry | null;
  activeLoading: boolean;
  refetchActive: () => void;
  onClockChange?: () => void; // Callback when clock in/out happens
}

export default function ClockInWidget({ activeEntry, activeLoading, refetchActive, onClockChange }: ClockInWidgetProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { projects } = useProjects({ status: 'ACTIVE' });
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedScope, setSelectedScope] = useState<string>('');
  const [isClocking, setIsClocking] = useState(false);
  const [error, setError] = useState('');
  const [availableScopes, setAvailableScopes] = useState<ProjectScope[]>([]);
  const [loadingScopes, setLoadingScopes] = useState(false);
  
  const isForeman = user?.role === 'FOREMAN';

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

    fetchProjectScopes();
  }, [selectedProject]);

  const handleClockIn = async () => {
    if (!selectedProject) {
      setError('Please select a project');
      return;
    }
    
    if (isForeman && !selectedScope) {
      setError('Foremen must specify scope of work');
      return;
    }

    setIsClocking(true);
    setError('');
    try {
      await api.post('/time/entries/clock_in/', {
        project: selectedProject,
        scope: selectedScope || null,
        source: 'web',
      });
      await refetchActive();
      setSelectedProject('');
      setSelectedScope('');
      if (onClockChange) onClockChange();
      router.push('/time/my-time');
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
      await refetchActive();
      if (onClockChange) onClockChange();
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
      <Card>
        <LoadingSpinner size="sm" />
      </Card>
    );
  }

  return (
    <Card title="Clock In/Out" className="mb-6">
      {activeEntry ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800">Currently Clocked In</p>
                <p className="text-lg font-bold text-green-900 mt-1">
                  {activeEntry.project_detail?.job_number || 'N/A'} - {activeEntry.project_detail?.name || 'N/A'}
                </p>
                <p className="text-sm text-green-700 mt-1">
                  Since: {new Date(activeEntry.clock_in).toLocaleTimeString()}
                </p>
                {activeEntry.scope && (
                  <p className="text-sm text-green-700">Scope: {activeEntry.scope}</p>
                )}
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse mr-2"></div>
                <span className="text-green-700 font-medium">Active</span>
              </div>
            </div>
          </div>
          <Button
            onClick={handleClockOut}
            isLoading={isClocking}
            variant="danger"
            className="w-full"
          >
            <StopIcon className="h-5 w-5 mr-2" />
            Clock Out
          </Button>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-3">Not currently clocked in</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                <select
                  value={selectedProject}
                  onChange={(e) => {
                    setSelectedProject(e.target.value);
                    setError('');
                  }}
                  className="input-field w-full"
                >
                  <option value="">Select a project...</option>
                  {projects.map((project: Project) => (
                    <option key={project.id} value={project.id}>
                      {project.job_number} - {project.name}
                    </option>
                  ))}
                </select>
              </div>
              {isForeman && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scope *</label>
                  {loadingScopes ? (
                    <div className="input-field w-full flex items-center">
                      <span className="text-gray-500 text-sm">Loading scopes...</span>
                    </div>
                  ) : availableScopes.length > 0 ? (
                    <select
                      value={selectedScope}
                      onChange={(e) => {
                        setSelectedScope(e.target.value);
                        setError('');
                      }}
                      className="input-field w-full"
                      disabled={!selectedProject}
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
                    <div className="input-field w-full bg-yellow-50 border-yellow-200">
                      <span className="text-yellow-700 text-xs">
                        No scopes defined for this project.
                      </span>
                    </div>
                  ) : (
                    <select
                      className="input-field w-full"
                      disabled
                    >
                      <option value="">Select a project first...</option>
                    </select>
                  )}
                </div>
              )}
            </div>
          </div>
          <Button
            onClick={handleClockIn}
            isLoading={isClocking}
            className="w-full"
          >
            <PlayIcon className="h-5 w-5 mr-2" />
            Clock In
          </Button>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
              {error}
            </div>
          )}
          <button
            onClick={() => router.push('/time/clock')}
            className="w-full text-sm text-primary hover:underline"
          >
            Go to full clock in/out page →
          </button>
        </div>
      )}
    </Card>
  );
}

