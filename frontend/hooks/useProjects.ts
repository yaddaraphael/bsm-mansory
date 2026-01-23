import { useState, useEffect, useMemo, useRef } from 'react';
import api from '@/lib/api';

export function useProjects(filters?: { status?: string; branch?: string; search?: string }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Memoize filter values to prevent unnecessary re-renders
  const status = filters?.status || '';
  const branch = filters?.branch || '';
  const search = filters?.search || '';

  useEffect(() => {
    // Cancel previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    const fetchProjects = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (branch) params.append('branch', branch);
        if (search) params.append('search', search);

        const queryString = params.toString();
        const url = `/projects/projects${queryString ? '?' + queryString : ''}`;
        const response = await api.get(url, {
          signal: abortControllerRef.current?.signal,
        });
        
        // Handle both paginated and non-paginated responses
        // If results exist, it's paginated; otherwise it's a list
        const projectsData = response.data.results || response.data || [];
        setProjects(Array.isArray(projectsData) ? projectsData : []);
        setError(null);
      } catch (err: any) {
        // Don't set error if request was aborted
        if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
          setError(err.response?.data?.detail || 'Failed to fetch projects');
          setProjects([]);
        }
      } finally {
        setLoading(false);
      }
    };

    // Always fetch on mount and when filters change
    fetchProjects();

    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [status, branch, search]);

  const refetch = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (branch) params.append('branch', branch);
      if (search) params.append('search', search);

      const response = await api.get(`/projects/projects/?${params.toString()}`, {
        signal: abortControllerRef.current?.signal,
      });
      // Handle both paginated and non-paginated responses
      const projectsData = response.data.results || response.data || [];
      setProjects(Array.isArray(projectsData) ? projectsData : []);
      setError(null);
    } catch (err: any) {
      if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
        setError(err.response?.data?.detail || 'Failed to fetch projects');
      }
    } finally {
      setLoading(false);
    }
  };

  return { projects, loading, error, refetch };
}

export function useProject(id: string | null) {
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchProject();
    }
  }, [id]);

  const fetchProject = async () => {
    try {
      setLoading(true);
      // Don't encode here - the API library handles URL encoding automatically
      // Next.js router also handles encoding, so manual encoding causes double encoding
      const response = await api.get(`/projects/projects/${id}/`);
      setProject(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch project');
    } finally {
      setLoading(false);
    }
  };

  return { project, loading, error, refetch: fetchProject };
}

