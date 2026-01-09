'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Input from '@/components/ui/Input';
import { useEquipment } from '@/hooks/useEquipment';
import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/hooks/useAuth';

interface Equipment {
  id: number;
  type: string;
  [key: string]: unknown;
}

export default function EquipmentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search to prevent flickering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const { equipment, loading, error } = useEquipment({ 
    search: debouncedSearch, 
    status: statusFilter,
    type: typeFilter,
  });

  const canManageEquipment = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'FOREMAN'].includes(user?.role || '');

  if (loading && equipment.length === 0) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50">
              <div className="max-w-7xl mx-auto">
                <LoadingSpinner />
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
        <div className="flex-1 flex flex-col min-w-0 sidebar-content">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Equipment</h1>
              {canManageEquipment && (
                <button
                  onClick={() => router.push('/equipment/new')}
                  className="btn-primary w-full sm:w-auto"
                >
                  + Add Equipment
                </button>
              )}
            </div>

            {error && (
              <Card className="mb-6">
                <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded">
                  <p className="text-sm font-medium">{error}</p>
                </div>
              </Card>
            )}

            <Card className="mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search by asset number or type..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input-field"
                >
                  <option value="">All Statuses</option>
                  <option value="IN_YARD">In Yard</option>
                  <option value="ON_SITE">On Site</option>
                  <option value="IN_TRANSIT">In Transit</option>
                  <option value="MAINTENANCE">Maintenance</option>
                </select>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="input-field"
                >
                  <option value="">All Types</option>
                  {equipment.length > 0 && Array.from(new Set(equipment.map((eq: Equipment) => eq.type).filter(Boolean))).map((type: string) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </Card>

            {loading && equipment.length > 0 ? (
              <div className="text-center py-8">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {equipment.map((item) => (
                  <Card
                    key={item.id}
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => router.push(`/equipment/${item.id}`)}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center space-x-2">
                        <WrenchScrewdriverIcon className="h-6 w-6 text-primary" />
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{item.asset_number}</h3>
                          <p className="text-sm text-gray-500">{item.type || 'N/A'}</p>
                        </div>
                      </div>
                      <StatusBadge status={item.status} size="sm" />
                    </div>
                    <div className="space-y-2 text-sm">
                      {item.current_assignment && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Location:</span>
                            <span className="text-gray-900">
                              {item.current_assignment.project_name || item.current_assignment.branch_name || 'N/A'}
                            </span>
                          </div>
                          {item.current_assignment.foreman_name && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">Foreman:</span>
                              <span className="text-gray-900">{item.current_assignment.foreman_name}</span>
                            </div>
                          )}
                        </>
                      )}
                      {item.billing_date && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Billing Date:</span>
                          <span className="text-gray-900">
                            {new Date(item.billing_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {item.cycle_date && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Cycle Date:</span>
                          <span className="text-gray-900">
                            {new Date(item.cycle_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {!loading && equipment.length === 0 && (
              <Card>
                <div className="text-center py-8">
                  <WrenchScrewdriverIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No equipment found</p>
                  {canManageEquipment && (
                    <button
                      onClick={() => router.push('/equipment/new')}
                      className="btn-primary mt-4"
                    >
                      Add First Equipment
                    </button>
                  )}
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

