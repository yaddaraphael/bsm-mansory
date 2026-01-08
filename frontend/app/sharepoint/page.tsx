'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { CloudIcon, MagnifyingGlassIcon, DocumentIcon, FolderIcon } from '@heroicons/react/24/outline';
import api from '@/lib/api';

export default function SharePointPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  interface SharePointFile {
    id: string;
    name: string;
    type: string;
    size?: number;
    modified?: string;
    downloadUrl?: string;
    [key: string]: unknown;
  }

  interface SharePointFolder {
    id: string;
    name: string;
    path: string;
    itemCount?: number | null;
    [key: string]: unknown;
  }

  const [files, setFiles] = useState<SharePointFile[]>([]);
  const [folders, setFolders] = useState<SharePointFolder[]>([]);
  const [search, setSearch] = useState('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [error, setError] = useState<string>('');

  const canAccessSharePoint = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER', 'HR', 'FINANCE'].includes(user?.role || '');

  const fetchSharePointData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // This would connect to your SharePoint API
      // For now, showing a placeholder structure
      const response = await api.get(`/sharepoint/files/?path=${currentPath || 'root'}`);
      setFiles(response.data.files || []);
      setFolders(response.data.folders || []);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to fetch SharePoint files. Please ensure SharePoint integration is configured.');
      setFiles([]);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    if (canAccessSharePoint) {
      fetchSharePointData();
    }
  }, [canAccessSharePoint, fetchSharePointData]);

  if (!canAccessSharePoint) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <Card>
                <div className="text-center py-8">
                  <CloudIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">You don&apos;t have permission to access SharePoint files.</p>
                </div>
              </Card>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER', 'HR', 'FINANCE']}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                    <CloudIcon className="h-6 w-6 mr-2" />
                    SharePoint Files
                  </h1>
                  <p className="text-sm text-gray-600 mt-1">Access and manage files from SharePoint</p>
                </div>
              </div>

            {error && (
              <Card className="mb-6">
                <div className="bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700 px-4 py-3 rounded">
                  <p className="text-sm font-medium">{error}</p>
                  <p className="text-xs mt-1">SharePoint integration needs to be configured in the backend.</p>
                </div>
              </Card>
            )}

            <Card className="mb-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search files..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {currentPath && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const parentPath = currentPath.split('/').slice(0, -1).join('/');
                      setCurrentPath(parentPath);
                    }}
                  >
                    ← Back
                  </Button>
                )}
                <Button onClick={fetchSharePointData} isLoading={loading}>
                  Refresh
                </Button>
              </div>
            </Card>

            {loading ? (
              <LoadingSpinner />
            ) : (
              <div className="space-y-6">
                {/* Folders */}
                {folders.length > 0 && (
                  <Card title="Folders">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {folders
                        .filter((folder) => !search || folder.name.toLowerCase().includes(search.toLowerCase()))
                        .map((folder) => (
                          <div
                            key={folder.id || folder.name}
                            onClick={() => setCurrentPath(folder.path || `${currentPath}/${folder.name}`)}
                            className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                          >
                            <FolderIcon className="h-8 w-8 text-blue-500 mb-2" />
                            <p className="font-medium text-gray-900 truncate">{folder.name}</p>
                            {folder.itemCount !== undefined && folder.itemCount !== null && (
                              <p className="text-xs text-gray-500 mt-1">{String(folder.itemCount)} items</p>
                            )}
                          </div>
                        ))}
                    </div>
                  </Card>
                )}

                {/* Files */}
                {files.length > 0 && (
                  <Card title="Files">
                    <div className="space-y-2">
                      {files
                        .filter((file) => !search || file.name.toLowerCase().includes(search.toLowerCase()))
                        .map((file) => (
                          <div
                            key={file.id || file.name}
                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <DocumentIcon className="h-6 w-6 text-gray-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 truncate">{file.name}</p>
                                {file.size && (
                                  <p className="text-xs text-gray-500">
                                    {(file.size / 1024).toFixed(2)} KB
                                  </p>
                                )}
                                {file.modified && (
                                  <p className="text-xs text-gray-500">
                                    Modified: {new Date(file.modified).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              {file.downloadUrl && (
                                <a
                                  href={String(file.downloadUrl)}
                                  download
                                  className="text-primary hover:underline text-sm"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Download
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </Card>
                )}

                {!loading && folders.length === 0 && files.length === 0 && !error && (
                  <Card>
                    <div className="text-center py-8">
                      <CloudIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No files or folders found</p>
                      {currentPath && (
                        <Button
                          variant="secondary"
                          onClick={() => setCurrentPath('')}
                          className="mt-4"
                        >
                          Go to Root
                        </Button>
                      )}
                    </div>
                  </Card>
                )}
              </div>
            )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

