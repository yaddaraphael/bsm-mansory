// frontend/hooks/useProjects.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '@/lib/api';
import type { AxiosError } from 'axios';

/** ---------- Types ---------- */

export interface Project {
  id: number;
  job_number: string;
  name: string;

  branch?: number | { id: number; name?: string };
  project_manager?: number;
  spectrum_status_code?: string;
  status?: string;

  branch_detail?: { id: number; name: string };

  project_manager_detail?: {
    id: number;
    first_name: string;
    last_name: string;
  };

  spectrum_project_manager_name?: string;
  production_percent_complete?: number;

  start_date?: string;
  duration?: number;
  saturdays?: boolean;
  full_weekends?: boolean;
  is_public?: boolean;
  public_pin?: string;
  notes?: string;
  spectrum_division_code?: string;
  client_name?: string;
  work_location?: string;
  schedule_status?: {
    status?: string;
    forecast_date?: string;
    days_late?: number;
  };
  qty_sq?: number;
  created_at?: string;
  updated_at?: string;

  spectrum_est_start_date?: string;
  spectrum_start_date?: string;
  spectrum_projected_complete_date?: string;
  spectrum_complete_date?: string;

  projected_complete_date?: string;
  actual_complete_date?: string;

  scopes?: ProjectScope[];
}

export interface ProjectScope {
  id: number;
  scope_type: number | { id: number; code?: string; name?: string };
  scope_type_id?: number;
  scope_type_detail?: { id: number; code?: string; name?: string };
  description?: string;
  estimation_start_date?: string;
  estimation_end_date?: string;
  duration_days?: number;
  saturdays?: boolean;
  full_weekends?: boolean;
  qty_sq_ft?: number;
  quantity?: number;
  installed?: number;
  remaining?: number;
  percent_complete?: number;
  masons?: number;
  tenders?: number;
  operators?: number;
  foreman?: number | { id: number; name: string } | null;
  foreman_id?: number | null;
  foreman_detail?: { id: number; name: string };
}

export interface PaginatedResponse<T> {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

export interface ProjectsFilters {
  status?: string;
  branch?: string;
  search?: string;
  project_manager?: string;

  page?: number;
  page_size?: number;

  enabled?: boolean;
}

type ErrorDetailResponse = {
  detail?: string;
};

type ProjectsApiResponse = PaginatedResponse<Project> | Project[];

/** Narrowing helpers (no any) */
const isPaginated = (data: unknown): data is PaginatedResponse<Project> => {
  if (typeof data !== 'object' || data === null) return false;
  const maybe = data as Record<string, unknown>;
  return (
    typeof maybe.count === 'number' &&
    Array.isArray(maybe.results)
  );
};

const isProjectArray = (data: unknown): data is Project[] => Array.isArray(data);

const getErrorMessage = (err: unknown, fallback: string): string => {
  const axiosErr = err as AxiosError<ErrorDetailResponse>;
  const detail = axiosErr.response?.data?.detail;
  return detail || axiosErr.message || fallback;
};

/** ---------- Hooks ---------- */

export function useProjects(filters: ProjectsFilters = {}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Memoize normalized filter values (stable deps)
  const normalized = useMemo(() => {
    return {
      status: filters.status ?? '',
      branch: filters.branch ?? '',
      search: filters.search ?? '',
      project_manager: filters.project_manager ?? '',
      page: filters.page ?? 1,
      page_size: filters.page_size ?? 50,
      enabled: filters.enabled ?? true,
    };
  }, [filters.status, filters.branch, filters.search, filters.project_manager, filters.page, filters.page_size, filters.enabled]);

  const buildUrl = useCallback((): string => {
    const params = new URLSearchParams();

    if (normalized.status) params.append('status', normalized.status);
    if (normalized.branch) params.append('branch', normalized.branch);
    if (normalized.search) params.append('search', normalized.search);
    if (normalized.project_manager) params.append('project_manager', normalized.project_manager);

    params.append('page', String(normalized.page));
    params.append('page_size', String(normalized.page_size));

    return `/projects/projects/?${params.toString()}`;
  }, [normalized]);

  const cancelInFlight = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const fetchProjects = useCallback(async () => {
    if (!normalized.enabled) {
      setLoading(false);
      return;
    }

    // cancel + create new controller
    cancelInFlight();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      setError(null);

      const url = buildUrl();
      const res = await api.get<ProjectsApiResponse>(url, { signal: controller.signal });

      const data = res.data;

      if (isPaginated(data)) {
        setProjects(data.results);
        setCount(data.count);
        return;
      }

      if (isProjectArray(data)) {
        setProjects(data);
        setCount(data.length);
        return;
      }

      // Unexpected response shape
      setProjects([]);
      setCount(0);
      setError('Unexpected projects response format');
    } catch (err: unknown) {
      // ignore aborts
      const name = err instanceof Error ? err.name : '';
      if (name === 'AbortError' || name === 'CanceledError') return;

      setProjects([]);
      setCount(0);
      setError(getErrorMessage(err, 'Failed to fetch projects'));
    } finally {
      setLoading(false);
    }
  }, [buildUrl, cancelInFlight, normalized.enabled]);

  useEffect(() => {
    fetchProjects();
    return () => cancelInFlight();
  }, [fetchProjects, cancelInFlight]);

  return { projects, count, loading, error, refetch: fetchProjects };
}

export function useProject(id: string | null) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const encodedId = useMemo(() => {
    if (!id) return null;
    return encodeURIComponent(id);
  }, [id]);

  useEffect(() => {
    if (!id || !encodedId) {
      setProject(null);
      setLoading(false);
      setError(null);
      return;
    }

    let mounted = true;

    const fetchProject = async () => {
      try {
        setLoading(true);
        setError(null);

        // attempt #1 encoded
        try {
          const res = await api.get<Project>(`/projects/projects/${encodedId}/`);
          if (!mounted) return;
          setProject(res.data);
        } catch (first: unknown) {
          // if non-numeric job_number, attempt #2 raw
          const isNumeric = /^\d+$/.test(id);
          const looksLikeJob = id.includes('-') || id.includes(' ') || !isNumeric;

          if (looksLikeJob) {
            const res = await api.get<Project>(`/projects/projects/${id}/`);
            if (!mounted) return;
            setProject(res.data);
          } else {
            throw first;
          }
        }
      } catch (err: unknown) {
        if (!mounted) return;
        setProject(null);
        setError(getErrorMessage(err, 'Failed to fetch project'));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchProject();

    return () => {
      mounted = false;
    };
  }, [id, encodedId]);

  const refetch = useCallback(async () => {
    if (!encodedId) return;

    try {
      setLoading(true);
      setError(null);
      const res = await api.get<Project>(`/projects/projects/${encodedId}/`);
      setProject(res.data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to fetch project'));
    } finally {
      setLoading(false);
    }
  }, [encodedId]);

  return { project, loading, error, refetch };
}
