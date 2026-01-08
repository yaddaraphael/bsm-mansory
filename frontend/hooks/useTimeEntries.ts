import { useState, useEffect } from 'react';
import api from '@/lib/api';

export function useTimeEntries(filters?: { project?: string; date?: string; status?: string }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEntries();
  }, [filters]);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters?.project) params.append('project', filters.project);
      if (filters?.date) params.append('date', filters.date);
      if (filters?.status) params.append('status', filters.status);

      const response = await api.get(`/time/entries/?${params.toString()}`);
      setEntries(response.data.results || response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch time entries');
    } finally {
      setLoading(false);
    }
  };

  return { entries, loading, error, refetch: fetchEntries };
}

export function useActiveClockIn() {
  const [activeEntry, setActiveEntry] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveEntry();
  }, []);

  const fetchActiveEntry = async () => {
    try {
      setLoading(true);
      const response = await api.get('/time/entries/my_time/');
      const entries = response.data;
      const active = entries.find((e: any) => !e.clock_out);
      setActiveEntry(active || null);
    } catch (err) {
      setActiveEntry(null);
    } finally {
      setLoading(false);
    }
  };

  return { activeEntry, loading, refetch: fetchActiveEntry };
}

