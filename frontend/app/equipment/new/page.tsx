'use client';

import { useState } from 'react';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline';

export default function NewEquipmentPage() {
 const router = useRouter();
 const { user } = useAuth();
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string>('');
 const [success, setSuccess] = useState(false);
 const [formData, setFormData] = useState({
  asset_number: '',
  type: '',
  billing_date: '',
  cycle_length: '28',
  status: 'IN_YARD',
  notes: '',
 });

 const canCreateEquipment = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'FOREMAN', 'PROJECT_MANAGER'].includes(user?.role || '');

 if (!canCreateEquipment) {
  return (
   <ProtectedRoute>
    <main className="flex-1 p-4 md:p-6 bg-gray-50">
       <Card>
        <div className="text-center py-8">
         <p className="text-red-600">You don&apos;t have permission to create equipment.</p>
        </div>
       </Card>
      </main>
   </ProtectedRoute>
  );
 }

 const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  setError('');
  setSuccess(false);

  try {
   interface EquipmentPayload {
    asset_number: string;
    type: string;
    cycle_length: number;
    status: string;
    notes: string;
    billing_date?: string;
   }

   const payload: EquipmentPayload = {
    asset_number: formData.asset_number,
    type: formData.type,
    cycle_length: parseInt(formData.cycle_length),
    status: formData.status,
    notes: formData.notes,
   };

   if (formData.billing_date) {
    payload.billing_date = formData.billing_date;
   }

   await api.post('/equipment/equipment/', payload);
   setSuccess(true);
   setTimeout(() => {
    router.push('/equipment');
   }, 1500);
  } catch (err: unknown) {
   const error = err as { response?: { data?: { detail?: string; asset_number?: string[]; type?: string[] } } };
   setError(
    error.response?.data?.detail || 
    error.response?.data?.asset_number?.[0] ||
    error.response?.data?.type?.[0] ||
    'Failed to create equipment'
   );
  } finally {
   setLoading(false);
  }
 };

 return (
  <ProtectedRoute>
   <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
      <div className="max-w-4xl mx-auto">
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
        <div className="flex items-center space-x-3">
         <WrenchScrewdriverIcon className="h-8 w-8 text-primary" />
         <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Add New Equipment</h1>
        </div>
       </div>

       <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
       <Card>
        <div className="space-y-4">
         <Input
          label="Asset Number *"
          value={formData.asset_number}
          onChange={(e) => setFormData({ ...formData, asset_number: e.target.value })}
          placeholder="e.g., EQ-001"
          required
          helpText="Unique identifier for this equipment"
         />

         <Input
          label="Equipment Type *"
          value={formData.type}
          onChange={(e) => setFormData({ ...formData, type: e.target.value })}
          placeholder="e.g., Lift, Forklift, Scissor Lift, Tool, etc."
          required
          helpText="Enter the type or category of equipment"
         />

         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
           label="Billing Date"
           type="date"
           value={formData.billing_date}
           onChange={(e) => setFormData({ ...formData, billing_date: e.target.value })}
           helpText="Start date for billing cycle"
          />
          <Input
           label="Cycle Length (Days) *"
           type="number"
           value={formData.cycle_length}
           onChange={(e) => setFormData({ ...formData, cycle_length: e.target.value })}
           required
           min="1"
           helpText="Default: 28 days"
          />
         </div>

         <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Status *</label>
          <select
           value={formData.status}
           onChange={(e) => setFormData({ ...formData, status: e.target.value })}
           className="input-field"
           required
          >
           <option value="IN_YARD">In Yard</option>
           <option value="ON_SITE">On Site</option>
           <option value="IN_TRANSIT">In Transit</option>
           <option value="MAINTENANCE">Maintenance</option>
          </select>
         </div>

         <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
          <textarea
           value={formData.notes}
           onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
           className="input-field"
           rows={4}
           placeholder="Additional notes about this equipment..."
          />
         </div>

         {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
           <p className="font-medium">Equipment created successfully!</p>
           <p className="text-sm mt-1">Redirecting to equipment list...</p>
          </div>
         )}

         {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
           {error}
          </div>
         )}

         <div className="flex space-x-4">
          <Button type="submit" isLoading={loading} className="flex-1">
           Create Equipment
          </Button>
          <Button
           type="button"
           variant="secondary"
           onClick={() => router.back()}
          >
           Cancel
          </Button>
         </div>
        </div>
       </Card>
      </form>
      </div>
     </main>
  </ProtectedRoute>
 );
}


