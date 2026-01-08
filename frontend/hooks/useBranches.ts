import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';

export interface Branch {
  id: number;
  name: string;
  code: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  notes?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export function useBranches(filters?: { status?: string; search?: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const status = filters?.status || '';
  const search = filters?.search || '';

  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    const fetchBranches = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (search) params.append('search', search);

        const response = await api.get(`/branches/?${params.toString()}`, {
          signal: abortControllerRef.current?.signal,
        });
        
        setBranches(response.data.results || response.data || []);
      } catch (err: any) {
        if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
          setError(err.response?.data?.detail || 'Failed to fetch branches');
          setBranches([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchBranches();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [status, search]);

  const refetch = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (search) params.append('search', search);

      const response = await api.get(`/branches/?${params.toString()}`, {
        signal: abortControllerRef.current?.signal,
      });
      setBranches(response.data.results || response.data || []);
      setError(null);
    } catch (err: any) {
      if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
        setError(err.response?.data?.detail || 'Failed to fetch branches');
      }
    } finally {
      setLoading(false);
    }
  };

  return { branches, loading, error, refetch };
}

