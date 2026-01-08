'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { ClockIcon } from '@heroicons/react/24/outline';

export default function MyTimePage() {
  const router = useRouter();
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'quarter' | 'half_year' | 'year' | 'all'>('week');
  const [selectedDate, setSelectedDate] = useState<string>('');
  interface TimeSummary {
    total_hours?: number;
    regular_hours?: number;
    overtime_hours?: number;
    days_worked?: number;
  }

  interface TimeEntry {
    id: number;
    date: string;
    clock_in: string;
    clock_out?: string;
    total_hours?: number;
    regular_hours?: number;
    overtime_hours?: number;
    status: string;
    project?: {
      id: number;
      name: string;
      job_number: string;
    };
  }

  const [summary, setSummary] = useState<TimeSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async (period: 'day' | 'week' | 'month' | 'quarter' | 'half_year' | 'year' | 'all') => {
    setLoadingSummary(true);
    try {
      const response = await api.get(`/time/entries/summary/?period=${period}`);
      setSummary(response.data);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      // If specific date is selected, use it
      if (selectedDate) {
        const response = await api.get(`/time/entries/?date=${selectedDate}`);
        const fetchedEntries = response.data.results || response.data || [];
        setEntries(Array.isArray(fetchedEntries) ? fetchedEntries : []);
      } else {
        // For period-based filtering, fetch all user's entries and filter client-side
        // This is more efficient than making multiple API calls
        const response = await api.get('/time/entries/my_time/');
        let allEntries = response.data || [];
        
        if (!Array.isArray(allEntries)) {
          allEntries = [];
        }
        
        // Filter by period if not 'all'
        if (period !== 'all') {
          const now = new Date();
          let startDate: Date;
          let endDate: Date = new Date(now);
          
          if (period === 'day') {
            startDate = new Date(now);
            endDate = new Date(now);
          } else if (period === 'week') {
            const dayOfWeek = now.getDay();
            startDate = new Date(now);
            startDate.setDate(now.getDate() - dayOfWeek);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
          } else if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          } else if (period === 'quarter') {
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
          } else if (period === 'half_year') {
            const half = Math.floor(now.getMonth() / 6);
            startDate = new Date(now.getFullYear(), half * 6, 1);
            endDate = new Date(now.getFullYear(), (half + 1) * 6, 0);
          } else if (period === 'year') {
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31);
          } else {
            startDate = new Date(now);
            endDate = new Date(now);
          }
          
          // Filter entries by date range
          allEntries = allEntries.filter((entry: TimeEntry) => {
            const entryDate = new Date(entry.date);
            return entryDate >= startDate && entryDate <= endDate;
          });
        }
        
        setEntries(allEntries);
      }
    } catch (error) {
      console.error('Failed to fetch entries:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [period, selectedDate]);

  useEffect(() => {
    fetchSummary(period);
    fetchEntries();
  }, [period, selectedDate, fetchSummary, fetchEntries]);

  // Group entries by date
  const groupedEntries = entries.reduce((acc: Record<string, TimeEntry[]>, entry: TimeEntry) => {
    const dateKey = new Date(entry.date).toLocaleDateString();
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(entry);
    return acc;
  }, {});

  interface DateTotals {
    totalHours: number;
    totalRegular: number;
    totalOT: number;
    count: number;
  }

  // Calculate totals for each date
  const dateTotals = Object.keys(groupedEntries).reduce((acc: Record<string, DateTotals>, dateKey: string) => {
    const dayEntries = groupedEntries[dateKey];
    const totalHours = dayEntries.reduce((sum: number, e: TimeEntry) => sum + (parseFloat(String(e.total_hours || 0)) || 0), 0);
    const totalRegular = dayEntries.reduce((sum: number, e: TimeEntry) => sum + (parseFloat(String(e.regular_hours || 0)) || 0), 0);
    const totalOT = dayEntries.reduce((sum: number, e: TimeEntry) => sum + (parseFloat(String(e.overtime_hours || 0)) || 0), 0);
    acc[dateKey] = { totalHours, totalRegular, totalOT, count: dayEntries.length };
    return acc;
  }, {});

  const columns = [
    {
      header: 'Project',
      accessor: (row: TimeEntry) => {
        const project = row.project as { job_number?: string; name?: string } | undefined;
        return (
          <div>
            <p className="font-medium">{project?.job_number || 'N/A'}</p>
            <p className="text-xs text-gray-500">{project?.name || ''}</p>
          </div>
        );
      },
    },
    {
      header: 'Clock In',
      accessor: (row: TimeEntry) => (
        <div>
          <p className="font-medium">{new Date(row.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
          <p className="text-xs text-gray-500">{new Date(row.clock_in).toLocaleDateString()}</p>
        </div>
      ),
    },
    {
      header: 'Clock Out',
      accessor: (row: TimeEntry) => row.clock_out ? (
        <div>
          <p className="font-medium">{new Date(row.clock_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
          <p className="text-xs text-gray-500">{new Date(row.clock_out).toLocaleDateString()}</p>
        </div>
      ) : (
        <span className="text-yellow-600 font-medium">In Progress</span>
      ),
    },
    {
      header: 'Regular Hours',
      accessor: (row: TimeEntry) => (
        <span className="font-medium text-green-600">
          {row.regular_hours ? parseFloat(String(row.regular_hours)).toFixed(2) : '0.00'} hrs
        </span>
      ),
    },
    {
      header: 'Overtime',
      accessor: (row: TimeEntry) => (
        <span className="font-medium text-orange-600">
          {row.overtime_hours ? parseFloat(String(row.overtime_hours)).toFixed(2) : '0.00'} hrs
        </span>
      ),
    },
    {
      header: 'Total Hours',
      accessor: (row: TimeEntry) => (
        <span className="font-bold text-primary">
          {row.total_hours ? parseFloat(String(row.total_hours)).toFixed(2) : '0.00'} hrs
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (row: TimeEntry) => <StatusBadge status={row.status} size="sm" />,
    },
  ];

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-6xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">My Time</h1>
                <button
                  onClick={() => router.push('/time/clock')}
                  className="btn-primary flex items-center space-x-2 w-full sm:w-auto"
                >
                  <ClockIcon className="h-5 w-5" />
                  <span>Clock In/Out</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-6">
              <Card>
                <h3 className="text-lg font-semibold mb-2">Today</h3>
                {loadingSummary ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <p className="text-3xl font-bold text-primary">
                    {summary?.total_hours?.toFixed(2) || '0.00'} hrs
                  </p>
                )}
              </Card>
              <Card>
                <h3 className="text-lg font-semibold mb-2">This Week</h3>
                {loadingSummary ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <>
                    <p className="text-3xl font-bold text-primary">
                      {summary?.total_hours?.toFixed(2) || '0.00'} hrs
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {summary?.regular_hours?.toFixed(2) || '0.00'} regular /{' '}
                      {summary?.overtime_hours?.toFixed(2) || '0.00'} OT
                    </p>
                  </>
                )}
              </Card>
              <Card>
                <h3 className="text-lg font-semibold mb-2">Days Worked</h3>
                {loadingSummary ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <p className="text-3xl font-bold text-primary">
                    {summary?.days_worked || 0}
                  </p>
                )}
              </Card>
            </div>

            <Card title="Time Entries">
              <div className="mb-4 flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Period</label>
                  <select
                    value={period}
                    onChange={(e) => {
                      const newPeriod = e.target.value as 'day' | 'week' | 'month' | 'quarter' | 'half_year' | 'year';
                      setPeriod(newPeriod);
                      setSelectedDate(''); // Clear date when period changes
                      fetchSummary(newPeriod);
                    }}
                    className="input-field w-full sm:w-auto"
                  >
                    <option value="day">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="quarter">This Quarter</option>
                    <option value="half_year">This Half Year</option>
                    <option value="year">This Year</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Or Select Specific Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      if (e.target.value) {
                        setPeriod('day'); // Reset to day when date is selected
                      }
                    }}
                    className="input-field w-full sm:w-auto"
                    max={new Date().toISOString().split('T')[0]} // Don't allow future dates
                  />
                </div>
                {selectedDate && (
                  <div className="flex items-end">
                    <button
                      onClick={() => {
                        setSelectedDate('');
                        setPeriod('week');
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors text-sm font-medium"
                    >
                      Clear Date
                    </button>
                  </div>
                )}
              </div>
              {loading ? (
                <LoadingSpinner />
              ) : Object.keys(groupedEntries).length === 0 ? (
                <p className="text-center text-gray-500 py-8">No time entries found</p>
              ) : (
                <div className="space-y-6">
                  {Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()).map((dateKey) => {
                    const dayEntries = groupedEntries[dateKey];
                    const totals = dateTotals[dateKey];
                    return (
                      <div key={dateKey} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{dateKey}</h3>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-gray-600">
                                <span className="font-medium text-green-600">{totals.totalRegular.toFixed(2)}</span> regular
                              </span>
                              <span className="text-gray-600">
                                <span className="font-medium text-orange-600">{totals.totalOT.toFixed(2)}</span> OT
                              </span>
                              <span className="text-gray-600">
                                <span className="font-bold text-primary">{totals.totalHours.toFixed(2)}</span> total hrs
                              </span>
                              <span className="text-gray-500">({totals.count} {totals.count === 1 ? 'entry' : 'entries'})</span>
                            </div>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <DataTable
                            data={dayEntries}
                            columns={columns}
                            emptyMessage="No entries for this date"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

