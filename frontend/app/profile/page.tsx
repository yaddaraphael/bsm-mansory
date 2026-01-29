'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { UserCircleIcon } from '@heroicons/react/24/outline';

export default function ProfilePage() {
 const { user, refresh } = useAuth();
 const [isEditing, setIsEditing] = useState(false);
 const [loading, setLoading] = useState(false);
 const [formData, setFormData] = useState({
  phone_number: '',
  city: '',
  current_location: '',
 });

 useEffect(() => {
  if (user) {
   setFormData({
    phone_number: user.phone_number || '',
    city: user.city || '',
    current_location: user.current_location || '',
   });
  }
 }, [user]);

 const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  try {
   await api.patch('/auth/profile/', formData);
   await refresh();
   setIsEditing(false);
  } catch (error) {
   console.error('Update error:', error);
  } finally {
   setLoading(false);
  }
 };

 if (!user) {
  return <LoadingSpinner />;
 }

 return (
  <ProtectedRoute>
   <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 md:mb-6">My Profile</h1>

      <div className="max-w-4xl mx-auto">
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
       <div className="lg:col-span-2 space-y-6">
        <Card title="Personal Information">
         {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-4">
           <Input
            label="Phone Number"
            value={formData.phone_number}
            onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
           />
           <Input
            label="City"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
           />
           <Input
            label="Current Location"
            value={formData.current_location}
            onChange={(e) => setFormData({ ...formData, current_location: e.target.value })}
           />
           <div className="flex space-x-4">
            <Button type="submit" isLoading={loading}>
             Save Changes
            </Button>
            <Button
             type="button"
             variant="secondary"
             onClick={() => {
              setIsEditing(false);
              setFormData({
               phone_number: user.phone_number || '',
               city: user.city || '',
               current_location: user.current_location || '',
              });
             }}
            >
             Cancel
            </Button>
           </div>
          </form>
         ) : (
          <div className="space-y-4">
           <div>
            <label className="text-sm font-medium text-gray-500">Full Name</label>
            <p className="text-gray-900">
             {user.first_name} {user.last_name}
            </p>
           </div>
           <div>
            <label className="text-sm font-medium text-gray-500">Email</label>
            <p className="text-gray-900">{user.email}</p>
           </div>
           <div>
            <label className="text-sm font-medium text-gray-500">Username</label>
            <p className="text-gray-900">{user.username}</p>
           </div>
           <div>
            <label className="text-sm font-medium text-gray-500">Employee Number</label>
            <p className="text-gray-900">{user.employee_number || 'N/A'}</p>
           </div>
           <div>
            <label className="text-sm font-medium text-gray-500">Phone Number</label>
            <p className="text-gray-900">{user.phone_number || 'N/A'}</p>
           </div>
           <div>
            <label className="text-sm font-medium text-gray-500">City</label>
            <p className="text-gray-900">{user.city || 'N/A'}</p>
           </div>
           <div>
            <label className="text-sm font-medium text-gray-500">Current Location</label>
            <p className="text-gray-900">{user.current_location || 'N/A'}</p>
           </div>
           <div>
            <label className="text-sm font-medium text-gray-500">Role</label>
            <p className="text-gray-900">{user.role_display || user.role}</p>
           </div>
           <div>
            <label className="text-sm font-medium text-gray-500">Scope</label>
            <p className="text-gray-900">{user.scope_display || user.scope}</p>
           </div>
           <Button onClick={() => setIsEditing(true)}>Edit Profile</Button>
          </div>
         )}
        </Card>

        <Card title="Invitation Information">
         <div className="space-y-4">
          {user.invited_by_name && (
           <div>
            <label className="text-sm font-medium text-gray-500">Invited By</label>
            <p className="text-gray-900">{user.invited_by_name}</p>
           </div>
          )}
          {user.invited_on && (
           <div>
            <label className="text-sm font-medium text-gray-500">Invited On</label>
            <p className="text-gray-900">
             {new Date(user.invited_on).toLocaleDateString()}
            </p>
           </div>
          )}
          {user.role_assigned_by_name && (
           <div>
            <label className="text-sm font-medium text-gray-500">Role Assigned By</label>
            <p className="text-gray-900">{user.role_assigned_by_name}</p>
           </div>
          )}
         </div>
        </Card>
       </div>

       <div>
        <Card title="Profile Picture">
         <div className="flex flex-col items-center">
          {user.profile_picture ? (
           // eslint-disable-next-line @next/next/no-img-element
           <img
            src={user.profile_picture}
            alt="Profile"
            className="w-32 h-32 rounded-full object-cover"
           />
          ) : (
           <UserCircleIcon className="w-32 h-32 text-gray-400" />
          )}
          <p className="mt-4 text-sm text-gray-500 text-center">
           Profile picture upload coming soon
          </p>
         </div>
        </Card>
       </div>
      </div>
      </div>
     </main>
  </ProtectedRoute>
 );
}


