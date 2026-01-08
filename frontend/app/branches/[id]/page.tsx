'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import DataTable from '@/components/ui/DataTable';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import {
  BuildingOfficeIcon,
  PhoneIcon,
  EnvelopeIcon,
  PlusIcon,
  PencilIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';

export default function BranchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const branchId = params.id as string;

  const [loading, setLoading] = useState(true);
  interface BranchData {
    branch: {
      id: number;
      name: string;
      code: string;
      address: string;
      status: string;
      notes?: string;
      created_at?: string;
      updated_at?: string;
    };
    employee_count: number;
    active_employees: number;
    employees: Array<{ id?: string | number; [key: string]: unknown }>;
    project_count: number;
    active_projects: number;
    projects: Array<{ id?: string | number; job_number?: string; name?: string; status?: string; [key: string]: unknown }>;
    revenue: {
      total_contract_value: number;
      total_contract_balance: number;
      estimated_revenue: number;
    };
    contacts: Contact[];
    equipment_count: number;
  }

  interface Contact {
    id: number;
    name: string;
    title: string;
    email: string;
    phone: string;
    role: string;
    role_display?: string;
    get_role_display?: () => string;
    is_primary: boolean;
    notes: string;
  }

  const [branchData, setBranchData] = useState<BranchData | null>(null);
  const [error, setError] = useState<string>('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactLoading, setContactLoading] = useState(false);

  const [contactForm, setContactForm] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    role: 'OTHER',
    is_primary: false,
    notes: '',
  });

  const canViewDetails = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR', 'FINANCE'].includes(user?.role || '');
  const canManageContacts = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN'].includes(user?.role || '');

  const fetchBranchDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      // Use the standard REST endpoint to get branch data
      const response = await api.get(`/branches/${branchId}/`);
      const branch = response.data;
      
      // Set branch data in a format that matches the expected structure
      setBranchData({
        branch: branch,
        employee_count: 0,
        active_employees: 0,
        employees: [],
        project_count: 0,
        active_projects: 0,
        projects: [],
        revenue: {
          total_contract_value: 0,
          total_contract_balance: 0,
          estimated_revenue: 0,
        },
        contacts: [],
        equipment_count: 0,
      });
    } catch (err: unknown) {
      console.error('Error fetching branch details:', err);
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to fetch branch details';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (branchId && canViewDetails) {
      fetchBranchDetails();
    }
  }, [branchId, canViewDetails, fetchBranchDetails]);

  const handleAddEditContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchData) {
      setError('Branch data not available');
      return;
    }
    setContactLoading(true);
    try {
      if (editingContact) {
        await api.patch(`/branches/contacts/${editingContact.id}/`, { ...contactForm, branch: branchData.branch.id });
      } else {
        await api.post(`/branches/${branchId}/contacts/`, { ...contactForm, branch: branchData.branch.id });
      }
      setShowAddContact(false);
      setEditingContact(null);
      setContactForm({
        name: '',
        title: '',
        email: '',
        phone: '',
        role: 'OTHER',
        is_primary: false,
        notes: '',
      });
      fetchBranchDetails();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      alert(error.response?.data?.detail || 'Failed to save contact');
    } finally {
      setContactLoading(false);
    }
  };

  const handleDeleteContact = async (contactId: number) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      await api.delete(`/branches/contacts/${contactId}/`);
      fetchBranchDetails();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      alert(error.response?.data?.detail || 'Failed to delete contact');
    }
  };

  const startEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setContactForm({
      name: contact.name,
      title: contact.title || '',
      email: contact.email || '',
      phone: contact.phone || '',
      role: contact.role,
      is_primary: contact.is_primary,
      notes: contact.notes || '',
    });
    setShowAddContact(true);
  };

  if (!canViewDetails) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <div className="max-w-7xl mx-auto">
                <Card>
                  <div className="text-center py-8">
                    <p className="text-red-600">You don&apos;t have permission to view branch details.</p>
                  </div>
                </Card>
              </div>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <div className="max-w-7xl mx-auto">
                <LoadingSpinner />
              </div>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error || !branchData || !branchData.branch) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <div className="max-w-7xl mx-auto">
                <Card>
                  <div className="text-center py-8">
                    <p className="text-red-600">{error || 'Branch not found'}</p>
                    <Button onClick={() => router.push('/branches')} className="mt-4">
                      Back to Branches
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

  const branch = branchData.branch;

  const employeeColumns = [
    {
      header: 'Name',
      accessor: (row: { id?: string | number; first_name?: string; last_name?: string; [key: string]: unknown }) => 
        `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'N/A',
    },
    {
      header: 'Employee ID',
      accessor: (row: { id?: string | number; employee_id?: string; employee_number?: string; [key: string]: unknown }) => 
        row.employee_id || row.employee_number || 'N/A',
    },
    {
      header: 'Role',
      accessor: (row: { id?: string | number; role?: string; role_display?: string; [key: string]: unknown }) => 
        row.role_display || row.role || 'N/A',
    },
  ];

  const projectColumns = [
    {
      header: 'Job Number',
      accessor: (row: { id?: string | number; job_number?: string; [key: string]: unknown }) => 
        row.job_number || 'N/A',
    },
    {
      header: 'Project Name',
      accessor: (row: { id?: string | number; name?: string; [key: string]: unknown }) => 
        row.name || 'N/A',
    },
    {
      header: 'Status',
      accessor: (row: { id?: string | number; status?: string; [key: string]: unknown }) => 
        row.status ? <StatusBadge status={String(row.status)} size="sm" /> : 'N/A',
    },
  ];

  return (
    <ProtectedRoute allowedRoles={['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR', 'FINANCE']}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-7xl mx-auto">
              {/* Header Section */}
              <div className="mb-6">
                <button
                  onClick={() => router.push('/branches')}
                  className="flex items-center text-sm md:text-base text-gray-600 hover:text-primary mb-4 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Branches
                </button>
                
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <BuildingOfficeIcon className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">
                        {branch.name || 'Branch'}
                      </h1>
                      <p className="text-base md:text-lg text-gray-500">Code: {branch.code || 'N/A'}</p>
                    </div>
                  </div>
                  <StatusBadge status={branch.status || 'ACTIVE'} size="lg" />
                </div>
              </div>


              {/* Branch Information - Matching Creation Form Structure */}
              <Card title="Branch Information" className="mb-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Branch Name</label>
                      <p className="text-base text-gray-900 font-medium">{branch.name || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Branch Code</label>
                      <p className="text-base text-gray-900 font-medium">{branch.code || 'N/A'}</p>
                    </div>
                  </div>

                  {branch.address && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                      <p className="text-base text-gray-900 font-medium">{branch.address}</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <StatusBadge status={branch.status || 'ACTIVE'} size="sm" />
                  </div>

                  {branch.notes && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                      <p className="text-gray-700 whitespace-pre-wrap">{branch.notes}</p>
                    </div>
                  )}

                  {(branch.created_at || branch.updated_at) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
                      {branch.created_at && (
                        <div>
                          <label className="block text-sm font-medium text-gray-500 mb-1">Created On</label>
                          <div className="flex items-center text-gray-900">
                            <CalendarDaysIcon className="h-4 w-4 mr-1 text-gray-500" />
                            <span className="text-sm">
                              {new Date(branch.created_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>
                      )}
                      {branch.updated_at && (
                        <div>
                          <label className="block text-sm font-medium text-gray-500 mb-1">Last Updated</label>
                          <div className="flex items-center text-gray-900">
                            <CalendarDaysIcon className="h-4 w-4 mr-1 text-gray-500" />
                            <span className="text-sm">
                              {new Date(branch.updated_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {/* Employees Section */}
              <Card title={`Employees (${branchData.employee_count || 0})`} className="mb-6">
                {(branchData.employees || []).length > 0 ? (
                  <DataTable
                    data={branchData.employees}
                    columns={employeeColumns}
                    emptyMessage="No employees found"
                    onRowClick={(row) => router.push(`/users/${row.id}`)}
                  />
                ) : (
                  <p className="text-gray-500 text-center py-4">No employees assigned to this branch</p>
                )}
              </Card>

              {/* Projects Section */}
              <Card title={`Projects (${branchData.project_count || 0})`} className="mb-6">
                {(branchData.projects || []).length > 0 ? (
                  <DataTable
                    data={branchData.projects}
                    columns={projectColumns}
                    emptyMessage="No projects found"
                    onRowClick={(row) => router.push(`/projects/${row.id}`)}
                  />
                ) : (
                  <p className="text-gray-500 text-center py-4">No projects for this branch</p>
                )}
              </Card>

              {/* Revenue Section */}
              <Card title="Revenue Information" className="mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Total Contract Value</p>
                    <p className="text-2xl font-bold text-blue-700">
                      ${(branchData.revenue?.total_contract_value || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Estimated Revenue</p>
                    <p className="text-2xl font-bold text-green-700">
                      ${(branchData.revenue?.estimated_revenue || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Contract Balance</p>
                    <p className="text-2xl font-bold text-yellow-700">
                      ${(branchData.revenue?.total_contract_balance || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Contacts Section */}
              <Card
                title={`Contacts (${(branchData.contacts || []).length})`}
                className="mb-6"
                action={
                  canManageContacts && (
                    <Button
                      onClick={() => {
                        setShowAddContact(!showAddContact);
                        setEditingContact(null);
                        setContactForm({
                          name: '',
                          title: '',
                          email: '',
                          phone: '',
                          role: 'OTHER',
                          is_primary: false,
                          notes: '',
                        });
                      }}
                      className="flex items-center"
                    >
                      <PlusIcon className="h-5 w-5 mr-2" />
                      {showAddContact ? 'Cancel' : 'Add Contact'}
                    </Button>
                  )
                }
              >
                {showAddContact && (
                  <form
                    onSubmit={handleAddEditContact}
                    className="mb-6 p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Name"
                        value={contactForm.name}
                        onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                        required
                      />
                      <Input
                        label="Title"
                        value={contactForm.title}
                        onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })}
                      />
                      <Input
                        label="Email"
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      />
                      <Input
                        label="Phone"
                        value={contactForm.phone}
                        onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                        <select
                          value={contactForm.role}
                          onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
                          className="input-field"
                        >
                          <option value="MANAGER">Manager</option>
                          <option value="SUPERVISOR">Supervisor</option>
                          <option value="SAFETY">Safety Officer</option>
                          <option value="HR">HR Contact</option>
                          <option value="FINANCE">Finance Contact</option>
                          <option value="ADMIN">Administrative</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="is_primary"
                          checked={contactForm.is_primary}
                          onChange={(e) => setContactForm({ ...contactForm, is_primary: e.target.checked })}
                          className="mr-2"
                        />
                        <label htmlFor="is_primary" className="text-sm text-gray-700">
                          Primary Contact
                        </label>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                        <textarea
                          value={contactForm.notes}
                          onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                          rows={3}
                          className="input-field w-full"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end mt-4">
                      <Button type="submit" isLoading={contactLoading}>
                        {editingContact ? 'Update Contact' : 'Add Contact'}
                      </Button>
                    </div>
                  </form>
                )}

                {(branchData.contacts || []).length > 0 ? (
                  <div className="space-y-4">
                    {(branchData.contacts || []).map((contact: Contact) => (
                      <div
                        key={contact.id}
                        className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-semibold text-gray-900">{contact.name}</h4>
                              {contact.is_primary && (
                                <span className="px-2 py-1 text-xs bg-primary text-white rounded">
                                  Primary
                                </span>
                              )}
                              <span className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded">
                                {contact.get_role_display ? contact.get_role_display() : (contact.role_display || contact.role?.replace('_', ' '))}
                              </span>
                            </div>
                            {contact.title && (
                              <p className="text-sm text-gray-600 mt-1">{contact.title}</p>
                            )}
                            <div className="mt-2 space-y-1">
                              {contact.email && (
                                <div className="flex items-center text-sm text-gray-600">
                                  <EnvelopeIcon className="h-4 w-4 mr-2" />
                                  <a href={`mailto:${contact.email}`} className="hover:text-primary">
                                    {contact.email}
                                  </a>
                                </div>
                              )}
                              {contact.phone && (
                                <div className="flex items-center text-sm text-gray-600">
                                  <PhoneIcon className="h-4 w-4 mr-2" />
                                  <a href={`tel:${contact.phone}`} className="hover:text-primary">
                                    {contact.phone}
                                  </a>
                                </div>
                              )}
                            </div>
                            {contact.notes && (
                              <p className="text-sm text-gray-500 mt-2">{contact.notes}</p>
                            )}
                          </div>
                          {canManageContacts && (
                            <div className="flex space-x-2">
                              <button
                                onClick={() => startEditContact(contact)}
                                className="text-primary hover:text-primary/80"
                              >
                                <PencilIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleDeleteContact(contact.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No contacts added yet</p>
                )}
              </Card>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
