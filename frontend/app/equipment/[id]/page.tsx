'use client';

import { use, useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  WrenchScrewdriverIcon,
  CalendarDaysIcon,
  MapPinIcon,
  ClockIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

interface Equipment {
  id: number;
  asset_number: string;
  type: string;
  status: string;
  billing_date?: string;
  cycle_length: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  branch?: number;
  branch_detail?: {
    id: number;
    name: string;
  };
  project?: number;
  project_detail?: {
    id: number;
    name: string;
  };
}

export default function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  const canEditDelete = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN'].includes(user?.role || '');

  const fetchEquipment = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/equipment/equipment/${id}/`);
      setEquipment(response.data);
    } catch (error: unknown) {
      console.error('Failed to fetch equipment:', error);
      const err = error as { response?: { status?: number } };
      if (err.response?.status === 404) {
        setEquipment(null);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEquipment();
  }, [fetchEquipment]);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this equipment? This action cannot be undone.')) {
      return;
    }

    setDeleteLoading(true);
    try {
      await api.delete(`/equipment/equipment/${id}/`);
      router.push('/equipment');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      alert(error.response?.data?.detail || 'Failed to delete equipment');
      setDeleteLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ON_SITE':
        return 'text-green-600 bg-green-50';
      case 'IN_YARD':
        return 'text-blue-600 bg-blue-50';
      case 'IN_TRANSIT':
        return 'text-yellow-600 bg-yellow-50';
      case 'MAINTENANCE':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
            <Header />
            <main className="flex-1 p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <div className="max-w-7xl mx-auto">
                <LoadingSpinner />
              </div>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!equipment) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
            <Header />
            <main className="flex-1 p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <div className="max-w-7xl mx-auto">
                <Card>
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-4">Equipment not found</p>
                    <Button onClick={() => router.push('/equipment')}>
                      Back to Equipment
                    </Button>
                  </div>
                </Card>
              </div>
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
              {/* Header Section */}
              <div className="mb-6">
                <button
                  onClick={() => router.push('/equipment')}
                  className="flex items-center text-sm md:text-base text-gray-600 hover:text-primary mb-4 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Equipment
                </button>
                
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-lg ${getStatusColor(equipment.status)}`}>
                      <WrenchScrewdriverIcon className="h-8 w-8" />
                    </div>
                    <div>
                      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{equipment.type || 'Equipment'}</h1>
                      <p className="text-base md:text-lg text-gray-500">Asset #: {equipment.asset_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <StatusBadge status={equipment.status} size="lg" />
                    {canEditDelete && (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => router.push(`/equipment/${id}/edit`)}
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
                {/* Left Column - Main Details */}
                <div className="lg:col-span-2 space-y-6">
                  <Card title="Equipment Details">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Asset Number</label>
                        <p className="text-base text-gray-900 font-medium">{equipment.asset_number || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Equipment Type</label>
                        <p className="text-base text-gray-900 font-medium">{equipment.type || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500 block mb-1">Status</label>
                        <p className="text-base text-gray-900 font-medium">
                          <StatusBadge status={equipment.status} size="sm" />
                        </p>
                      </div>
                      {equipment.billing_date && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Billing Date</label>
                          <p className="text-base text-gray-900 font-medium">
                            {new Date(equipment.billing_date).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                      )}
                      {equipment.cycle_length && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Billing Cycle Length</label>
                          <p className="text-base text-gray-900 font-medium">{equipment.cycle_length} days</p>
                        </div>
                      )}
                      {equipment.branch && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Current Branch</label>
                          <p className="text-base text-gray-900 font-medium">{equipment.branch_detail?.name || equipment.branch || 'N/A'}</p>
                        </div>
                      )}
                      {equipment.project && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Assigned Project</label>
                          <p className="text-base text-gray-900 font-medium">
                            {equipment.project_detail?.name || equipment.project || 'N/A'}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>

                  {equipment.notes && (
                    <Card title="Notes">
                      <p className="text-gray-700 whitespace-pre-wrap">{equipment.notes}</p>
                    </Card>
                  )}

                  {/* Assignment History or Recent Activity */}
                  {equipment.created_at && (
                    <Card title="Metadata">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-500 block mb-1">Created On</label>
                          <p className="text-base text-gray-900 font-medium">
                            {new Date(equipment.created_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        {equipment.updated_at && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Last Updated</label>
                            <p className="text-base text-gray-900 font-medium">
                              {new Date(equipment.updated_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        )}
                      </div>
                    </Card>
                  )}
                </div>

                {/* Right Column - Sidebar Info */}
                <div className="space-y-6">
                  <Card title="Quick Info">
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-500">Status</span>
                          <StatusBadge status={equipment.status} size="sm" />
                        </div>
                      </div>
                      {equipment.billing_date && (
                        <div className="p-4 bg-blue-50 rounded-lg">
                          <div className="flex items-center mb-2">
                            <CalendarDaysIcon className="h-5 w-5 text-blue-600 mr-2" />
                            <span className="text-sm font-medium text-gray-500">Billing Date</span>
                          </div>
                          <p className="text-base font-semibold text-blue-700">
                            {new Date(equipment.billing_date).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                      {equipment.cycle_length && (
                        <div className="p-4 bg-green-50 rounded-lg">
                          <div className="flex items-center mb-2">
                            <ClockIcon className="h-5 w-5 text-green-600 mr-2" />
                            <span className="text-sm font-medium text-gray-500">Cycle Length</span>
                          </div>
                          <p className="text-base font-semibold text-green-700">
                            {equipment.cycle_length} days
                          </p>
                        </div>
                      )}
                      {equipment.branch_detail && (
                        <div className="p-4 bg-purple-50 rounded-lg">
                          <div className="flex items-center mb-2">
                            <MapPinIcon className="h-5 w-5 text-purple-600 mr-2" />
                            <span className="text-sm font-medium text-gray-500">Branch</span>
                          </div>
                          <p className="text-base font-semibold text-purple-700">
                            {equipment.branch_detail.name}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

