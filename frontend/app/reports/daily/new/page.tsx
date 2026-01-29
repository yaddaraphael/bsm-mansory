'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useProjects } from '@/hooks/useProjects';
import type { Project, ProjectScope } from '@/hooks/useProjects';
import api from '@/lib/api';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { PlusIcon, TrashIcon, PhotoIcon } from '@heroicons/react/24/outline';

interface LaborEntry {
 id?: number;
 employee: string;
 phase: string;
 regular_hours: number;
 overtime_hours: number;
 quantity: number | null;
 comment: string;
}

export default function NewDailyReportPage() {
 const router = useRouter();
 const { projects } = useProjects({ status: 'ACTIVE' });
 const [loading, setLoading] = useState(false);
 interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  employee_id?: string;
  employee_number?: string;
 }

 const [employees, setEmployees] = useState<Employee[]>([]);
 // eslint-disable-next-line @typescript-eslint/no-unused-vars
 const [loadingEmployees, setLoadingEmployees] = useState(false);
 const [formData, setFormData] = useState({
  project: '',
  date: new Date().toISOString().split('T')[0],
  phase: '',
  location: '',
  weather_sunny: false,
  weather_cloudy: false,
  weather_rain: false,
  weather_wind: false,
  weather_snow: false,
  temperature_am: '',
  temperature_pm: '',
  weather_notes: '',
  work_performed: '',
  safety_meeting_held: false,
  jha_review: false,
  scaffolding_inspected: false,
  delays_by_others: '',
  masons_count: 0,
  tenders_count: 0,
  operators_count: 0,
  notes: '',
  blockers: [] as string[],
  installed_quantities: {} as Record<string, number>,
 });
 const [laborEntries, setLaborEntries] = useState<LaborEntry[]>([]);
 const [photos, setPhotos] = useState<File[]>([]);
 const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
 const [selectedProject, setSelectedProject] = useState<Project | null>(null);
 const [error, setError] = useState<string>('');

 const getScopeKey = (scope: ProjectScope) => {
  if (typeof scope.scope_type === 'object') {
   return scope.scope_type.name || scope.scope_type.code || String(scope.scope_type.id);
  }
  return String(scope.scope_type);
 };

 useEffect(() => {
  fetchEmployees();
 }, []);

 useEffect(() => {
  if (formData.project) {
   const project = projects.find((p) => p.id.toString() === formData.project);
   setSelectedProject(project ?? null);
   if (project) {
    // Auto-populate location from project
    if (project.work_location) {
     setFormData((prev) => ({ ...prev, location: project.work_location || '' }));
    }
    
    // Initialize installed quantities from scopes
    if (project.scopes) {
     const quantities: Record<string, number> = {};
     project.scopes.forEach((scope: ProjectScope) => {
      quantities[getScopeKey(scope)] = 0;
     });
     setFormData((prev) => ({ ...prev, installed_quantities: quantities }));
    }
   }
  } else {
   // Reset when no project is selected
   setSelectedProject(null);
   setFormData((prev) => ({ ...prev, location: '', phase: '' }));
  }
 }, [formData.project, projects]);

 const fetchEmployees = async () => {
  try {
   setLoadingEmployees(true);
   const response = await api.get('/auth/users/?role__in=LABORER,MASON,OPERATOR,BRICKLAYER,PLASTER,FOREMAN');
   setEmployees(response.data.results || response.data || []);
  } catch (error) {
   console.error('Failed to fetch employees:', error);
  } finally {
   setLoadingEmployees(false);
  }
 };

 const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files) {
   const newFiles = Array.from(e.target.files);
   setPhotos((prev) => [...prev, ...newFiles]);
   
   // Create previews
   newFiles.forEach((file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
     setPhotoPreviews((prev) => [...prev, reader.result as string]);
    };
    reader.readAsDataURL(file);
   });
  }
 };

 const removePhoto = (index: number) => {
  setPhotos((prev) => prev.filter((_, i) => i !== index));
  setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
 };

 const addLaborEntry = () => {
  setLaborEntries((prev) => [
   ...prev,
   {
    employee: '',
    phase: formData.phase || '',
    regular_hours: 0,
    overtime_hours: 0,
    quantity: null,
    comment: '',
   },
  ]);
 };

 const removeLaborEntry = (index: number) => {
  setLaborEntries((prev) => prev.filter((_, i) => i !== index));
 };

 const updateLaborEntry = (index: number, field: keyof LaborEntry, value: string | number | null) => {
  setLaborEntries((prev) => {
   const updated = [...prev];
   updated[index] = { ...updated[index], [field]: value };
   return updated;
  });
 };

 const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  setError('');

  try {
   // Prepare labor entries data
   const laborEntriesData = laborEntries
    .filter((entry) => entry.employee)
    .map((entry) => ({
     employee: entry.employee,
     phase: entry.phase,
     regular_hours: entry.regular_hours,
     overtime_hours: entry.overtime_hours,
     quantity: entry.quantity,
     comment: entry.comment,
    }));

   // First, create the daily report with labor entries
   const reportData = {
    ...formData,
    installed_quantities: formData.installed_quantities,
    blockers: formData.blockers,
    status: 'SUBMITTED', // Submit directly for approval
    labor_entries: laborEntriesData,
    photos: [], // Will be updated after photo upload
   };

   const reportResponse = await api.post('/projects/daily-reports/', reportData);
   const reportId = reportResponse.data.id;

   // Upload photos if any
   if (photos.length > 0) {
    try {
     const photoUrls: string[] = [];
     
     // Upload each photo file
     for (const photo of photos) {
      const formData = new FormData();
      formData.append('photo', photo);
      
      try {
       // Use axios directly for file uploads to avoid Content-Type header issues
       const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
       const token = localStorage.getItem('access_token');
       
       const uploadResponse = await axios.post(
        `${API_URL}/projects/daily-reports/${reportId}/upload_photo/`,
        formData,
        {
         headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': token ? `Bearer ${token}` : '',
         },
        }
       );
       if (uploadResponse.data.url) {
        photoUrls.push(uploadResponse.data.url);
       }
      } catch (uploadError: unknown) {
       console.error('Failed to upload photo:', uploadError);
       // Continue with other photos even if one fails
      }
     }
     
     // Update report with photo URLs (if any were successfully uploaded)
     if (photoUrls.length > 0) {
      await api.patch(`/projects/daily-reports/${reportId}/`, {
       photos: photoUrls,
      });
     }
    } catch (photoError) {
     console.error('Failed to process photos:', photoError);
     // Continue even if photo upload fails
    }
   }

   router.push('/reports/daily');
  } catch (err: unknown) {
   const error = err as { response?: { data?: { detail?: string; error?: string } | string } };
   const errorMessage = (typeof error.response?.data === 'object' && error.response.data !== null
    ? (error.response.data.detail || error.response.data.error)
    : typeof error.response?.data === 'string'
    ? error.response.data
    : 'Failed to submit daily report') || 'Failed to submit daily report';
   setError(errorMessage);
  } finally {
   setLoading(false);
  }
 };

 const updateQuantity = (scopeType: string, value: number) => {
  setFormData((prev) => ({
   ...prev,
   installed_quantities: {
    ...prev.installed_quantities,
    [scopeType]: value,
   },
  }));
 };

 return (
  <ProtectedRoute>
   <main className="flex-1 p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
      <div className="max-w-5xl mx-auto">
       <h1 className="text-2xl font-bold text-gray-900 mb-6">New Daily Report</h1>

       <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card title="Basic Information">
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
           <label className="block text-sm font-medium text-gray-700 mb-2">
            Project <span className="text-red-500">*</span>
           </label>
           <select
            value={formData.project}
            onChange={(e) => setFormData({ ...formData, project: e.target.value })}
            className="input-field"
            required
           >
            <option value="">Select a project...</option>
            {projects.map((project) => (
             <option key={project.id} value={project.id}>
              {project.job_number} - {project.name}
             </option>
            ))}
           </select>
          </div>

          <div>
           <label className="block text-sm font-medium text-gray-700 mb-2">
            Date <span className="text-red-500">*</span>
           </label>
           <Input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
           />
          </div>

          <div>
           <label className="block text-sm font-medium text-gray-700 mb-2">
            Phase/Scope
           </label>
           {selectedProject?.scopes && selectedProject.scopes.length > 0 ? (
            <select
             value={formData.phase}
             onChange={(e) => setFormData({ ...formData, phase: e.target.value })}
             className="input-field"
            >
             <option value="">Select a scope...</option>
             {selectedProject.scopes.map((scope: ProjectScope) => (
              <option key={scope.id} value={getScopeKey(scope)}>
               {getScopeKey(scope)}
              </option>
             ))}
            </select>
           ) : (
            <Input
             type="text"
             value={formData.phase}
             onChange={(e) => setFormData({ ...formData, phase: e.target.value })}
             placeholder={selectedProject ? "No scopes available. Enter phase manually..." : "Select a project first..."}
             disabled={!selectedProject}
            />
           )}
          </div>

          <div>
           <label className="block text-sm font-medium text-gray-700 mb-2">
            Location
           </label>
           <Input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="Work location"
           />
          </div>
         </div>
        </Card>

        {/* Weather Section */}
        <Card title="Weather">
         <div className="space-y-4">
          <div>
           <label className="block text-sm font-medium text-gray-700 mb-2">
            Conditions
           </label>
           <div className="flex flex-wrap gap-4">
            <label className="flex items-center">
             <input
              type="checkbox"
              checked={formData.weather_sunny}
              onChange={(e) => setFormData({ ...formData, weather_sunny: e.target.checked })}
              className="mr-2"
             />
             <span>Sunny</span>
            </label>
            <label className="flex items-center">
             <input
              type="checkbox"
              checked={formData.weather_cloudy}
              onChange={(e) => setFormData({ ...formData, weather_cloudy: e.target.checked })}
              className="mr-2"
             />
             <span>Cloudy</span>
            </label>
            <label className="flex items-center">
             <input
              type="checkbox"
              checked={formData.weather_rain}
              onChange={(e) => setFormData({ ...formData, weather_rain: e.target.checked })}
              className="mr-2"
             />
             <span>Rain</span>
            </label>
            <label className="flex items-center">
             <input
              type="checkbox"
              checked={formData.weather_wind}
              onChange={(e) => setFormData({ ...formData, weather_wind: e.target.checked })}
              className="mr-2"
             />
             <span>Wind</span>
            </label>
            <label className="flex items-center">
             <input
              type="checkbox"
              checked={formData.weather_snow}
              onChange={(e) => setFormData({ ...formData, weather_snow: e.target.checked })}
              className="mr-2"
             />
             <span>Snow</span>
            </label>
           </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
             Temperature (AM) °F
            </label>
            <Input
             type="number"
             value={formData.temperature_am}
             onChange={(e) => setFormData({ ...formData, temperature_am: e.target.value })}
             placeholder="e.g., 33"
            />
           </div>
           <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
             Temperature (PM) °F
            </label>
            <Input
             type="number"
             value={formData.temperature_pm}
             onChange={(e) => setFormData({ ...formData, temperature_pm: e.target.value })}
             placeholder="e.g., 47"
            />
           </div>
          </div>

          <div>
           <label className="block text-sm font-medium text-gray-700 mb-2">
            Additional Notes
           </label>
           <textarea
            value={formData.weather_notes}
            onChange={(e) => setFormData({ ...formData, weather_notes: e.target.value })}
            className="input-field"
            rows={2}
            placeholder="Additional weather notes..."
           />
          </div>
         </div>
        </Card>

        {/* Labor Section */}
        <Card title="Labor">
         <div className="space-y-4">
          <div className="flex justify-between items-center">
           <p className="text-sm text-gray-600">Add employees and their hours worked</p>
           <Button
            type="button"
            variant="secondary"
            onClick={addLaborEntry}
            className="flex items-center"
           >
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Employee
           </Button>
          </div>

          {laborEntries.length > 0 && (
           <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
             <thead className="bg-gray-50">
              <tr>
               <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
               <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phase</th>
               <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Reg Hours</th>
               <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">OT Hours</th>
               <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
               <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comment</th>
               <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
             </thead>
             <tbody className="bg-white divide-y divide-gray-200">
              {laborEntries.map((entry, index) => (
               <tr key={index}>
                <td className="px-4 py-3">
                 <select
                  value={entry.employee}
                  onChange={(e) => updateLaborEntry(index, 'employee', e.target.value)}
                  className="input-field text-sm"
                  required
                 >
                  <option value="">Select employee...</option>
                  {employees.map((emp) => (
                   <option key={emp.id} value={emp.id}>
                    {emp.employee_number} - {emp.first_name} {emp.last_name}
                   </option>
                  ))}
                 </select>
                </td>
                <td className="px-4 py-3">
                 {selectedProject?.scopes && selectedProject.scopes.length > 0 ? (
                  <select
                   value={entry.phase}
                   onChange={(e) => updateLaborEntry(index, 'phase', e.target.value)}
                   className="input-field text-sm"
                  >
                   <option value="">Select scope...</option>
                   {selectedProject.scopes.map((scope: ProjectScope) => (
                    <option key={scope.id} value={getScopeKey(scope)}>
                     {getScopeKey(scope)}
                    </option>
                   ))}
                  </select>
                 ) : (
                  <Input
                   type="text"
                   value={entry.phase}
                   onChange={(e) => updateLaborEntry(index, 'phase', e.target.value)}
                   className="text-sm"
                   placeholder="Phase"
                  />
                 )}
                </td>
                <td className="px-4 py-3">
                 <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={entry.regular_hours}
                  onChange={(e) => updateLaborEntry(index, 'regular_hours', parseFloat(e.target.value) || 0)}
                  className="text-sm text-right"
                 />
                </td>
                <td className="px-4 py-3">
                 <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={entry.overtime_hours}
                  onChange={(e) => updateLaborEntry(index, 'overtime_hours', parseFloat(e.target.value) || 0)}
                  className="text-sm text-right"
                 />
                </td>
                <td className="px-4 py-3">
                 <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={entry.quantity || ''}
                  onChange={(e) => updateLaborEntry(index, 'quantity', e.target.value ? parseFloat(e.target.value) : null)}
                  className="text-sm text-right"
                  placeholder="-"
                 />
                </td>
                <td className="px-4 py-3">
                 <Input
                  type="text"
                  value={entry.comment}
                  onChange={(e) => updateLaborEntry(index, 'comment', e.target.value)}
                  className="text-sm"
                  placeholder="Comment"
                 />
                </td>
                <td className="px-4 py-3 text-center">
                 <button
                  type="button"
                  onClick={() => removeLaborEntry(index)}
                  className="text-red-600 hover:text-red-800"
                 >
                  <TrashIcon className="h-5 w-5" />
                 </button>
                </td>
               </tr>
              ))}
             </tbody>
            </table>
           </div>
          )}
         </div>
        </Card>

        {/* Work Performed */}
        <Card title="Work Performed">
         <textarea
          value={formData.work_performed}
          onChange={(e) => setFormData({ ...formData, work_performed: e.target.value })}
          className="input-field"
          rows={6}
          placeholder="Describe the work performed today..."
         />
        </Card>

        {/* Safety Section */}
        <Card title="Safety">
         <div className="space-y-3">
          <label className="flex items-center">
           <input
            type="checkbox"
            checked={formData.safety_meeting_held}
            onChange={(e) => setFormData({ ...formData, safety_meeting_held: e.target.checked })}
            className="mr-3 h-4 w-4"
           />
           <span className="text-sm font-medium text-gray-700">Safety Meeting Held</span>
          </label>
          <label className="flex items-center">
           <input
            type="checkbox"
            checked={formData.jha_review}
            onChange={(e) => setFormData({ ...formData, jha_review: e.target.checked })}
            className="mr-3 h-4 w-4"
           />
           <span className="text-sm font-medium text-gray-700">JHA Review For Work Performed</span>
          </label>
          <label className="flex items-center">
           <input
            type="checkbox"
            checked={formData.scaffolding_inspected}
            onChange={(e) => setFormData({ ...formData, scaffolding_inspected: e.target.checked })}
            className="mr-3 h-4 w-4"
           />
           <span className="text-sm font-medium text-gray-700">Scaffolding Inspected</span>
          </label>
         </div>
        </Card>

        {/* Delays By Others */}
        <Card title="Delays By Others">
         <textarea
          value={formData.delays_by_others}
          onChange={(e) => setFormData({ ...formData, delays_by_others: e.target.value })}
          className="input-field"
          rows={3}
          placeholder="Describe any delays caused by others..."
         />
        </Card>

        {/* Legacy Crew Counts (kept for backward compatibility) */}
        <Card title="Crew Counts (Legacy)">
         <div className="grid grid-cols-3 gap-4">
          <div>
           <label className="block text-sm font-medium text-gray-700 mb-2">Masons</label>
           <Input
            type="number"
            min="0"
            value={formData.masons_count}
            onChange={(e) =>
             setFormData({ ...formData, masons_count: parseInt(e.target.value) || 0 })
            }
           />
          </div>
          <div>
           <label className="block text-sm font-medium text-gray-700 mb-2">Tenders</label>
           <Input
            type="number"
            min="0"
            value={formData.tenders_count}
            onChange={(e) =>
             setFormData({ ...formData, tenders_count: parseInt(e.target.value) || 0 })
            }
           />
          </div>
          <div>
           <label className="block text-sm font-medium text-gray-700 mb-2">Operators</label>
           <Input
            type="number"
            min="0"
            value={formData.operators_count}
            onChange={(e) =>
             setFormData({ ...formData, operators_count: parseInt(e.target.value) || 0 })
            }
           />
          </div>
         </div>
        </Card>

        {/* Installed Quantities */}
        {selectedProject?.scopes && selectedProject.scopes.length > 0 && (
         <Card title="Installed Quantities">
          <div className="space-y-4">
           {selectedProject.scopes.map((scope: ProjectScope) => (
            <div key={scope.id}>
             <label className="block text-sm font-medium text-gray-700 mb-2">
              {getScopeKey(scope)}
             </label>
             <Input
              type="number"
              min="0"
              step="0.01"
              value={formData.installed_quantities[getScopeKey(scope)] || 0}
              onChange={(e) =>
               updateQuantity(getScopeKey(scope), parseFloat(e.target.value) || 0)
              }
             />
            </div>
           ))}
          </div>
         </Card>
        )}

        {/* Attachments */}
        <Card title="Attachments">
         <div className="space-y-4">
          <div>
           <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Photos
           </label>
           <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
             <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <PhotoIcon className="w-10 h-10 mb-3 text-gray-400" />
              <p className="mb-2 text-sm text-gray-500">
               <span className="font-semibold">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
             </div>
             <input
              type="file"
              className="hidden"
              multiple
              accept="image/*"
              onChange={handlePhotoChange}
             />
            </label>
           </div>
          </div>

          {photoPreviews.length > 0 && (
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {photoPreviews.map((preview, index) => (
             <div key={index} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
               src={preview}
               alt={`Preview ${index + 1}`}
               className="w-full h-32 object-cover rounded-lg border border-gray-200"
              />
              <button
               type="button"
               onClick={() => removePhoto(index)}
               className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
              >
               <TrashIcon className="h-4 w-4" />
              </button>
             </div>
            ))}
           </div>
          )}
         </div>
        </Card>

        {/* Notes */}
        <Card title="Notes">
         <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="input-field"
          rows={4}
          placeholder="Additional notes..."
         />
        </Card>

        {error && (
         <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
         </div>
        )}

        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
         <Button type="submit" isLoading={loading} className="flex-1">
          Submit for Approval
         </Button>
         <Button
          type="button"
          variant="secondary"
          onClick={async () => {
           // Save as draft
           try {
            setLoading(true);
            const laborEntriesData = laborEntries
             .filter((entry) => entry.employee)
             .map((entry) => ({
              employee: entry.employee,
              phase: entry.phase,
              regular_hours: entry.regular_hours,
              overtime_hours: entry.overtime_hours,
              quantity: entry.quantity,
              comment: entry.comment,
             }));

            const reportData = {
             ...formData,
             installed_quantities: formData.installed_quantities,
             blockers: formData.blockers,
             status: 'DRAFT',
             labor_entries: laborEntriesData,
             photos: [],
            };

            await api.post('/projects/daily-reports/', reportData);
            router.push('/reports/daily');
           } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Failed to save draft');
           } finally {
            setLoading(false);
           }
          }}
          disabled={loading}
          className="sm:w-auto"
         >
          Save as Draft
         </Button>
         <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
          disabled={loading}
          className="sm:w-auto"
         >
          Cancel
         </Button>
        </div>
       </form>
      </div>
     </main>
  </ProtectedRoute>
 );
}

