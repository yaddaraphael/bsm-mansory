'use client';

import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import clsx from 'clsx';
import { useBranches } from '@/hooks/useBranches';

type TabType = 'profile' | 'security' | 'privacy' | 'notifications' | 'portal-passwords';

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Profile form data
  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    city: '',
    current_location: '',
  });

  // Security form data
  const [securityData, setSecurityData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  // Notification preferences
  const [notificationPrefs, setNotificationPrefs] = useState({
    email_notifications: true,
    in_app_notifications: true,
  });

  useEffect(() => {
    if (user) {
      setProfileData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        phone_number: user.phone_number || '',
        city: user.city || '',
        current_location: user.current_location || '',
      });
    }
  }, [user]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      await api.patch('/auth/profile/', profileData);
      setMessage({ type: 'success', text: 'Profile updated successfully' });
      await refresh();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      setMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to update profile',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (securityData.new_password !== securityData.confirm_password) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    if (securityData.new_password.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password/', {
        current_password: securityData.current_password,
        new_password: securityData.new_password,
      });
      setMessage({ type: 'success', text: 'Password changed successfully' });
      setSecurityData({ current_password: '', new_password: '', confirm_password: '' });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      setMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to change password',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationUpdate = async () => {
    setLoading(true);
    try {
      await api.patch('/auth/profile/', {
        notification_preferences: notificationPrefs,
      });
      setMessage({ type: 'success', text: 'Notification preferences updated successfully' });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      setMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to update notification preferences',
      });
    } finally {
      setLoading(false);
    }
  };

  // Portal password management state
  const [hqPassword, setHqPassword] = useState('');
  const [hqPasswordConfirm, setHqPasswordConfirm] = useState('');
  const [hqPasswordStatus, setHqPasswordStatus] = useState<{ has_password: boolean } | null>(null);
  const [branchPasswords, setBranchPasswords] = useState<Record<number, string>>({});
  const [branchPasswordStatuses, setBranchPasswordStatuses] = useState<Record<number, boolean>>({});
  const { branches } = useBranches({});
  
  const isAdmin = ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN'].includes(user?.role || '');
  const isBranchManager = user?.role === 'BRANCH_MANAGER';
  
  useEffect(() => {
    if (isAdmin) {
      // Fetch HQ portal password status
      api.get('/projects/portal/hq/password/status/')
        .then(res => setHqPasswordStatus(res.data))
        .catch(() => setHqPasswordStatus({ has_password: false }));
      
      // Fetch branch password statuses
      if (branches && branches.length > 0) {
        branches.forEach(branch => {
          api.get(`/branches/${branch.id}/portal-password-status/`)
            .then(res => {
              setBranchPasswordStatuses(prev => ({
                ...prev,
                [branch.id]: res.data.has_password
              }));
            })
            .catch(() => {
              setBranchPasswordStatuses(prev => ({
                ...prev,
                [branch.id]: false
              }));
            });
        });
      }
    } else if (isBranchManager) {
      // Branch manager: fetch their branch's password status
      // Use user.division to find their branch
      if (user?.division) {
        api.get(`/branches/${user.division}/portal-password-status/`)
          .then(res => {
            setBranchPasswordStatuses(prev => ({
              ...prev,
              [user.division!]: res.data.has_password
            }));
          })
          .catch(() => {});
      }
    }
  }, [isAdmin, isBranchManager, branches, user]);
  
  const handleSetHqPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    
    if (hqPassword !== hqPasswordConfirm) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    
    if (hqPassword.length < 4) {
      setMessage({ type: 'error', text: 'Password must be at least 4 characters' });
      return;
    }
    
    setLoading(true);
    try {
      const response = await api.post('/projects/portal/hq/password/', { password: hqPassword });
      setMessage({ 
        type: 'success', 
        text: response.data.detail + (response.data.password ? ` Password: ${response.data.password}` : '') 
      });
      setHqPassword('');
      setHqPasswordConfirm('');
      setHqPasswordStatus({ has_password: true });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      setMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to set HQ portal password',
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handleSetBranchPassword = async (branchId: number, password: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setMessage(null);
    
    if (!password || password.length < 4) {
      setMessage({ type: 'error', text: 'Password must be at least 4 characters' });
      return;
    }
    
    setLoading(true);
    try {
      await api.post(`/branches/${branchId}/set-portal-password/`, { password });
      setMessage({ type: 'success', text: 'Branch portal password set successfully' });
      setBranchPasswords(prev => ({ ...prev, [branchId]: '' }));
      setBranchPasswordStatuses(prev => ({ ...prev, [branchId]: true }));
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      setMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to set branch portal password',
      });
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: TabType; name: string }[] = [
    { id: 'profile', name: 'Profile' },
    { id: 'security', name: 'Security' },
    { id: 'privacy', name: 'Privacy' },
    { id: 'notifications', name: 'Notifications' },
    ...(isAdmin || isBranchManager ? [{ id: 'portal-passwords' as TabType, name: 'Portal Passwords' }] : []),
  ];

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 sidebar-content">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 md:mb-6">Settings</h1>

            <div className="max-w-4xl mx-auto">
              {/* Tabs */}
              <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-8">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setMessage(null);
                      }}
                      className={clsx(
                        'py-4 px-1 border-b-2 font-medium text-sm',
                        activeTab === tab.id
                          ? 'border-primary text-primary'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      )}
                    >
                      {tab.name}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab Content */}
              <div className="space-y-6">
                {message && (
                  <div
                    className={`p-4 rounded ${
                      message.type === 'success'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {message.text}
                  </div>
                )}

                {/* Profile Tab */}
                {activeTab === 'profile' && (
                  <Card title="Profile Information">
                    <form onSubmit={handleProfileUpdate} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          label="First Name"
                          value={profileData.first_name}
                          onChange={(e) =>
                            setProfileData({ ...profileData, first_name: e.target.value })
                          }
                          required
                        />
                        <Input
                          label="Last Name"
                          value={profileData.last_name}
                          onChange={(e) =>
                            setProfileData({ ...profileData, last_name: e.target.value })
                          }
                          required
                        />
                      </div>

                      <Input
                        label="Email"
                        type="email"
                        value={profileData.email}
                        onChange={(e) =>
                          setProfileData({ ...profileData, email: e.target.value })
                        }
                        required
                        readOnly
                        helpText="Email cannot be changed"
                      />

                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-sm font-medium text-gray-700 mb-2">Account Information</p>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Username:</span>
                            <span className="text-gray-900 font-medium">{user?.username}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Role:</span>
                            <span className="text-gray-900 font-medium">{user?.role_display || user?.role}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Employee Number:</span>
                            <span className="text-gray-900 font-medium">{user?.employee_number || 'N/A'}</span>
                          </div>
                        </div>
                      </div>

                      <Input
                        label="Phone Number"
                        value={profileData.phone_number}
                        onChange={(e) =>
                          setProfileData({ ...profileData, phone_number: e.target.value })
                        }
                      />

                      <Input
                        label="City"
                        value={profileData.city}
                        onChange={(e) =>
                          setProfileData({ ...profileData, city: e.target.value })
                        }
                      />

                      <Input
                        label="Current Location"
                        value={profileData.current_location}
                        onChange={(e) =>
                          setProfileData({ ...profileData, current_location: e.target.value })
                        }
                        helpText="Your current work location"
                      />

                      <Button type="submit" isLoading={loading}>
                        Save Changes
                      </Button>
                    </form>
                  </Card>
                )}

                {/* Security Tab */}
                {activeTab === 'security' && (
                  <Card title="Change Password">
                    <form onSubmit={handlePasswordChange} className="space-y-4">
                      <Input
                        label="Current Password"
                        type="password"
                        value={securityData.current_password}
                        onChange={(e) =>
                          setSecurityData({ ...securityData, current_password: e.target.value })
                        }
                        required
                        showPasswordToggle
                      />
                      <Input
                        label="New Password"
                        type="password"
                        value={securityData.new_password}
                        onChange={(e) =>
                          setSecurityData({ ...securityData, new_password: e.target.value })
                        }
                        required
                        helpText="Must be at least 8 characters"
                        showPasswordToggle
                      />
                      <Input
                        label="Confirm New Password"
                        type="password"
                        value={securityData.confirm_password}
                        onChange={(e) =>
                          setSecurityData({ ...securityData, confirm_password: e.target.value })
                        }
                        required
                        showPasswordToggle
                      />
                      <Button type="submit" isLoading={loading}>
                        Change Password
                      </Button>
                    </form>
                  </Card>
                )}

                {/* Privacy Tab */}
                {activeTab === 'privacy' && (
                  <Card title="Privacy Settings">
                    <div className="space-y-4">
                      <p className="text-gray-600">
                        Privacy settings and data management options will be available here.
                      </p>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600">
                          Your account data is protected and only accessible to authorized personnel.
                        </p>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Notifications Tab */}
                {activeTab === 'notifications' && (
                  <Card title="Notification Preferences">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">Email Notifications</p>
                          <p className="text-sm text-gray-500">
                            Receive notifications via email
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notificationPrefs.email_notifications}
                            onChange={(e) =>
                              setNotificationPrefs({
                                ...notificationPrefs,
                                email_notifications: e.target.checked,
                              })
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">In-App Notifications</p>
                          <p className="text-sm text-gray-500">
                            Show notifications in the application
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notificationPrefs.in_app_notifications}
                            onChange={(e) =>
                              setNotificationPrefs({
                                ...notificationPrefs,
                                in_app_notifications: e.target.checked,
                              })
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>

                      <Button onClick={handleNotificationUpdate} isLoading={loading}>
                        Save Preferences
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Portal Passwords Tab */}
                {(activeTab === 'portal-passwords' && (isAdmin || isBranchManager)) && (
                  <div className="space-y-6">
                    {/* HQ Portal Password (Admin only) */}
                    {isAdmin && (
                      <Card title="HQ Portal Password">
                        <div className="space-y-4">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-800">
                              <strong>Status:</strong> {hqPasswordStatus?.has_password ? 'Password is set' : 'No password set'}
                            </p>
                            <p className="text-xs text-blue-600 mt-2">
                              The HQ portal shows all public projects across all divisions. Access at: <code>/public/hq/</code>
                            </p>
                          </div>
                          
                          <form onSubmit={handleSetHqPassword} className="space-y-4">
                            <Input
                              label="HQ Portal Password"
                              type="password"
                              value={hqPassword}
                              onChange={(e) => setHqPassword(e.target.value)}
                              required
                              showPasswordToggle
                              helpText="Minimum 4 characters"
                            />
                            <Input
                              label="Confirm Password"
                              type="password"
                              value={hqPasswordConfirm}
                              onChange={(e) => setHqPasswordConfirm(e.target.value)}
                              required
                              showPasswordToggle
                            />
                            <Button type="submit" isLoading={loading}>
                              {hqPasswordStatus?.has_password ? 'Update HQ Portal Password' : 'Set HQ Portal Password'}
                            </Button>
                          </form>
                          
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <p className="text-sm text-yellow-800">
                              <strong>Note:</strong> After setting the password, you must update the <code>HQ_PORTAL_PASSWORD</code> environment variable in your .env file or settings for the change to take effect.
                            </p>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* Branch Portal Passwords */}
                    <Card title={isAdmin ? "Division/Branch Portal Passwords" : "My Branch Portal Password"}>
                      <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                          {isAdmin 
                            ? "Set passwords for each division's public portal. Each division can only see projects from their own division."
                            : "Set or change the portal password for your branch. This allows access to your division's public project portal."
                          }
                        </p>
                        
                        {isAdmin && branches && branches.length > 0 && (
                          <div className="space-y-4">
                            {branches.map((branch) => (
                              <div key={branch.id} className="border rounded-lg p-4">
                                <div className="flex justify-between items-start mb-3">
                                  <div>
                                    <h4 className="font-medium text-gray-900">{branch.name}</h4>
                                    <p className="text-sm text-gray-500">
                                      Division: {branch.spectrum_division_code || branch.code || 'N/A'}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                      Portal URL: <code>/public/branch/{branch.spectrum_division_code || branch.code}/</code>
                                    </p>
                                  </div>
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    branchPasswordStatuses[branch.id] 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {branchPasswordStatuses[branch.id] ? 'Password Set' : 'No Password'}
                                  </span>
                                </div>
                                <form onSubmit={(e) => handleSetBranchPassword(branch.id, branchPasswords[branch.id] || '', e)} className="flex gap-2">
                                  <Input
                                    type="password"
                                    value={branchPasswords[branch.id] || ''}
                                    onChange={(e) => setBranchPasswords(prev => ({ ...prev, [branch.id]: e.target.value }))}
                                    placeholder="Enter new password"
                                    className="flex-1"
                                    showPasswordToggle
                                    required
                                  />
                                  <Button type="submit" isLoading={loading} size="sm">
                                    {branchPasswordStatuses[branch.id] ? 'Update' : 'Set'}
                                  </Button>
                                </form>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {isBranchManager && branches && branches.length > 0 && (() => {
                          const userBranch = user?.division ? branches.find(b => b.id === user.division) : null;
                          return userBranch ? (
                            <div className="border rounded-lg p-4">
                              <div className="mb-3">
                                <h4 className="font-medium text-gray-900">{userBranch.name}</h4>
                                <p className="text-sm text-gray-500">
                                  Division: {userBranch.spectrum_division_code || userBranch.code || 'N/A'}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  Portal URL: <code>/public/branch/{userBranch.spectrum_division_code || userBranch.code}/</code>
                                </p>
                              </div>
                              <form onSubmit={(e) => handleSetBranchPassword(userBranch.id, branchPasswords[userBranch.id] || '', e)} className="space-y-3">
                                <Input
                                  label="Portal Password"
                                  type="password"
                                  value={branchPasswords[userBranch.id] || ''}
                                  onChange={(e) => setBranchPasswords(prev => ({ ...prev, [userBranch.id]: e.target.value }))}
                                  required
                                  showPasswordToggle
                                  helpText="Minimum 4 characters"
                                />
                                <Button type="submit" isLoading={loading}>
                                  {branchPasswordStatuses[userBranch.id] ? 'Update Portal Password' : 'Set Portal Password'}
                                </Button>
                              </form>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">No branch assigned to your account. Please contact an administrator.</p>
                          );
                        })()}
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
