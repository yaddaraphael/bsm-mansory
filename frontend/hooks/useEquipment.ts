import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';

export function useEquipment(filters?: { status?: string; type?: string; search?: string }) {
  const [equipment, setEquipment] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Memoize filter values to prevent unnecessary re-renders
  const status = filters?.status || '';
  const type = filters?.type || '';
  const search = filters?.search || '';

  useEffect(() => {
    // Cancel previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    const fetchEquipment = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (type) params.append('type', type);
        if (search) params.append('search', search);

        const response = await api.get(`/equipment/equipment/?${params.toString()}`, {
          signal: abortControllerRef.current?.signal,
        });
        
        setEquipment(response.data.results || response.data || []);
      } catch (err: any) {
        // Don't set error if request was aborted
        if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
          setError(err.response?.data?.detail || 'Failed to fetch equipment');
          setEquipment([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchEquipment();

    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [status, type, search]);

  const refetch = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (type) params.append('type', type);
      if (search) params.append('search', search);

      const response = await api.get(`/equipment/equipment/?${params.toString()}`, {
        signal: abortControllerRef.current?.signal,
      });
      setEquipment(response.data.results || response.data || []);
      setError(null);
    } catch (err: any) {
      if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
        setError(err.response?.data?.detail || 'Failed to fetch equipment');
      }
    } finally {
      setLoading(false);
    }
  };

  return { equipment, loading, error, refetch };
}

