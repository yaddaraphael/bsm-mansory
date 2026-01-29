// app/meetings/[id]/review/page.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import api from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import StatusBar from '@/components/ui/StatusBar';

// ---------------- Types ----------------
interface Phase {
  id?: number;
  phase_code: string;
  phase_description?: string;
  masons: number;
  operators: number;
  labors: number;
  quantity: number;
  installed_quantity: number; // TOTAL installed (cumulative) stored for this meeting’s save
  duration?: number | null;
  notes?: string;
  percent_complete?: number;
}

interface ScopeType {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

interface ProjectScope {
  id: number;
  scope_type: number | { id: number; code: string; name: string };
  scope_type_detail?: ScopeType;
  description?: string;
  qty_sq_ft: number;
  installed: number;
  masons: number;
  tenders: number;
  operators: number;
  // some APIs include these:
  project?: number | { id: number };
  remaining?: number;
  percent_complete?: number;
  foreman?: number | { id: number; name: string } | null;
  foreman_detail?: { id: number; name: string };
  previous_meeting_installed?: number;
  previous_balance?: number;
}

interface Project {
  id: number;
  job_number: string;
  name: string;
  job_description?: string;
  spectrum_project_manager_name?: string;
  branch?: { id: number; name: string };
  branch_detail?: { id: number; name: string };
  project_manager?: { id: number; first_name: string; last_name: string };
  project_manager_detail?: { id: number; first_name: string; last_name: string };
  foreman?: { id: number; first_name: string; last_name: string };
  foreman_detail?: { id: number; first_name: string; last_name: string };
  scopes?: ProjectScope[];
  schedule_status?: { status: string };
  start_date?: string;
  estimated_end_date?: string;
  saturdays?: boolean;
  full_weekends?: boolean;
}

interface Meeting {
  id: number;
  meeting_date: string;
  branch?: { id: number; name: string } | null;
  created_by?: { id: number; username: string };
  created_at: string;
  notes?: string;
  status?: string;
}

interface ActiveJob {
  id: number; // project id
  job_number: string;
  name?: string;
  job_description?: string;
  spectrum_project_manager_name?: string;
  branch?: { id: number; name: string };
  branch_detail?: { id: number; name: string };
  project_manager?: { id: number; first_name: string; last_name: string };
  project_manager_detail?: { id: number; first_name: string; last_name: string };
  start_date?: string;
  estimated_end_date?: string;
  saturdays?: boolean;
  full_weekends?: boolean;
  scopes?: ProjectScope[];
  [key: string]: unknown;
}

interface JobDetails {
  dates?: {
    start_date?: string;
    est_start_date?: string;
    complete_date?: string;
    projected_complete_date?: string;
    est_complete_date?: string;
  };
  phases?: Array<{
    phase_code?: string;
    description?: string;
    jtd_quantity?: string;
    estimated_quantity?: string;
    start_date?: string;
    end_date?: string;
  }>;
  scopes?: ProjectScope[];
}

interface ExistingJob {
  id?: number;
  project_id?: number;
  project?: { id: number; job_number: string };
  phases?: Phase[];
  masons?: number;
  labors?: number;
  notes?: string;
  handoff_from_estimator?: boolean;
  handoff_to_foreman?: boolean;
  site_specific_safety_plan?: boolean;
  saturdays?: boolean;
  full_weekends?: boolean;
  selected_scope?: string;
}

interface MeetingJob {
  id?: number;
  project_id: number;
  project: Project; // make required (fix TS2322)
  masons: number;
  labors: number;
  notes: string;
  handoff_from_estimator: boolean;
  handoff_to_foreman: boolean;
  site_specific_safety_plan: boolean;
  saturdays?: boolean;
  full_weekends?: boolean;
  selected_scope?: string; // now used as *scope filter within this project*
  phases: Phase[];
  projectScopes: ProjectScope[]; // scopes loaded for UI
}

// ---------------- Helpers ----------------
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const scopeKey = (projectId: number, scopeCode: string) => `${projectId}__${scopeCode}`;

const normalizeScopeKey = (value?: string) => (value ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');

const safeNumber = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const pmDisplay = (p?: Project) => {
  if (!p) return 'N/A';
  if (p.project_manager_detail) {
    return `${p.project_manager_detail.first_name || ''} ${p.project_manager_detail.last_name || ''}`.trim() || 'N/A';
  }
  if (p.project_manager) {
    return `${p.project_manager.first_name || ''} ${p.project_manager.last_name || ''}`.trim() || 'N/A';
  }
  return p.spectrum_project_manager_name || 'N/A';
};

const branchDisplay = (p?: Project) => p?.branch_detail?.name || p?.branch?.name || 'N/A';

const scopeTypeCodeOf = (scope: ProjectScope, scopeTypes: ScopeType[]) => {
  if (typeof scope.scope_type === 'object') return scope.scope_type.code;
  if (scope.scope_type_detail?.code) return scope.scope_type_detail.code;
  return scopeTypes.find((st) => st.id === scope.scope_type)?.code || '';
};

const scopeTypeNameOf = (scope: ProjectScope, scopeTypes: ScopeType[]) => {
  if (typeof scope.scope_type === 'object') return scope.scope_type.name;
  if (scope.scope_type_detail?.name) return scope.scope_type_detail.name;
  return scopeTypes.find((st) => st.id === scope.scope_type)?.name || '';
};

const scopeBelongsToProject = (scope: ProjectScope, projectId: number) => {
  const sp = scope.project;
  if (typeof sp === 'number') return sp === projectId;
  if (typeof sp === 'object' && sp && 'id' in sp) return (sp as { id: number }).id === projectId;
  // if API doesn't include project field, assume it's already filtered by backend
  return true;
};

export default function MeetingReviewPage() {
  const router = useRouter();
  const params = useParams();
  const meetingId = (params?.id as string) || '';

  // data state
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [allMeetingJobs, setAllMeetingJobs] = useState<MeetingJob[]>([]);
  const [meetingJobs, setMeetingJobs] = useState<MeetingJob[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [projectManagers, setProjectManagers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [scopeTypes, setScopeTypes] = useState<ScopeType[]>([]);

  // previous meeting tracking: key = `${projectId}_${scopeCodeOrName}`
  const [previousMeetingData, setPreviousMeetingData] = useState<
    Record<string, { installed_quantity: number; masons: number; operators: number; labors: number }>
  >({});
  const batchScopeMapRef = useRef<
    Record<string, Record<string, { previous_meeting_installed?: number; previous_balance?: number }>>
  >({});

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading meeting…');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBranch, setFilterBranch] = useState<string>('ALL');
  const [filterProjectManager, setFilterProjectManager] = useState<string>('ALL');

  // pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [jobsPerPage, setJobsPerPage] = useState(50);

  // expand/collapse
  const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set());

  // input draft for Installed This Meeting (delta) so typing works
  const [installedDraft, setInstalledDraft] = useState<Record<string, string>>({});

  // abort controller for fetch
  const abortRef = useRef<AbortController | null>(null);

  // ---------------- API helpers ----------------
  const fetchBranches = useCallback(async () => {
    try {
      const res = await api.get('/branches/?status=ACTIVE');
      setBranches(res.data.results || res.data || []);
    } catch (e) {
      console.error('Error fetching branches:', e);
    }
  }, []);

  const fetchScopeTypes = useCallback(async () => {
    try {
      const res = await api.get('/projects/scope-types/');
      const data = res.data.results || res.data || [];
      setScopeTypes(data);
      return data as ScopeType[];
    } catch (e) {
      console.error('Error fetching scope types:', e);
      return [] as ScopeType[];
    }
  }, []);

  // ensure phase exists then patch fields
  const ensurePhase = useCallback(
    (
      projectId: number,
      code: string,
      description: string,
      scope: ProjectScope,
      patch: Partial<Phase>,
      baselineInstalled: number,
    ) => {
      setAllMeetingJobs((prev) => {
        const updated = prev.map((j) => {
          if (j.project_id !== projectId) return j;

          const phases = [...(j.phases || [])];
          const idx = phases.findIndex((p) => p.phase_code === code);

          const base: Phase = {
            phase_code: code,
            phase_description: description,
            masons: safeNumber(scope.masons, 0),
            operators: safeNumber(scope.operators, 0),
            labors: safeNumber(scope.tenders, 0),
            quantity: safeNumber(scope.qty_sq_ft, 0),
            installed_quantity: baselineInstalled, // start from baseline total installed
            duration: null,
            notes: '',
          };

          if (idx === -1) {
            phases.push({ ...base, ...patch, installed_quantity: patch.installed_quantity ?? base.installed_quantity });
          } else {
            phases[idx] = { ...phases[idx], ...patch };
          }

          return { ...j, phases };
        });

        return updated;
      });
    },
    [],
  );

  const buildPMFilters = useCallback((jobs: MeetingJob[]) => {
    const map = new Map<string, string>();

    for (const job of jobs) {
      const p = job.project;
      if (p.project_manager_detail) {
        const id = String(p.project_manager_detail.id);
        const name = `${p.project_manager_detail.first_name || ''} ${p.project_manager_detail.last_name || ''}`.trim();
        if (name) map.set(id, name);
      } else if (p.project_manager) {
        const id = String(p.project_manager.id);
        const name = `${p.project_manager.first_name || ''} ${p.project_manager.last_name || ''}`.trim();
        if (name) map.set(id, name);
      } else if (p.spectrum_project_manager_name) {
        const key = `spectrum_${p.spectrum_project_manager_name}`;
        map.set(key, p.spectrum_project_manager_name);
      }
    }

    setProjectManagers(Array.from(map.entries()).map(([id, full_name]) => ({ id, full_name })));
  }, []);

  // ---------------- Main fetch ----------------
  const fetchMeetingData = useCallback(async () => {
    if (!meetingId) return;

    setLoading(true);
    setError(null);

    // show loading message immediately (fix “blank for 4 seconds”)
    setLoadingMessage('Loading meeting…');

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // ensure scope types loaded once (for codes/names)
      let effectiveScopeTypes = scopeTypes;
      if (scopeTypes.length === 0) {
        setLoadingMessage('Loading scope types…');
        effectiveScopeTypes = await fetchScopeTypes();
      }

      setLoadingMessage('Loading meeting header…');
      const meetingRes = await api.get<Meeting>(`/meetings/meetings/${meetingId}/`, {
        signal: controller.signal as unknown as AbortSignal,
      });
      setMeeting(meetingRes.data);

      setLoadingMessage('Loading existing meeting entries…');
      const existingJobsRes = await api.get<ExistingJob[]>(`/meetings/meetings/${meetingId}/jobs/`, {
        signal: controller.signal as unknown as AbortSignal,
      });
      const existingJobs = existingJobsRes.data || [];

      setLoadingMessage('Loading active jobs…');
      const activeJobsRes = await api.get<ActiveJob[]>('/meetings/meetings/active_jobs/?include_scopes=0', {
        signal: controller.signal as unknown as AbortSignal,
      });
      const activeJobs = activeJobsRes.data || [];

      // batch job details (IMPORTANT: trailing slash to avoid APPEND_SLASH POST crash)
      let batchDetails: Record<string, JobDetails> = {};
      const existingProjectIds = new Set<number>(
        existingJobs.map((ej) => ej.project_id ?? ej.project?.id).filter((x): x is number => typeof x === 'number'),
      );
      const jobNumbers = activeJobs
        .filter((j) => existingProjectIds.has(j.id))
        .map((j) => j.job_number)
        .filter(Boolean);

      if (jobNumbers.length > 0) {
        setLoadingMessage('Loading job dates…');
        try {
          const batchRes = await api.post<Record<string, JobDetails>>(
            '/meetings/meetings/batch_job_details/', // ✅ keep trailing slash
            { job_numbers: jobNumbers, meeting_id: parseInt(meetingId, 10) },
            { signal: controller.signal as unknown as AbortSignal },
          );
          batchDetails = batchRes.data || {};
        } catch (e) {
          // If backend returns 405/500, continue without blocking the whole UI
          console.error('batch_job_details failed:', e);
        }
      }

      // backend previous meeting lookup (by job number + normalized scope key)
      const batchScopeLookup: Record<string, Record<string, { previous_meeting_installed?: number; previous_balance?: number }>> =
        {};
      for (const [jobNumber, details] of Object.entries(batchDetails)) {
        const scopes = details.scopes || [];
        if (!scopes.length) continue;
        const map: Record<string, { previous_meeting_installed?: number; previous_balance?: number }> = {};
        for (const sc of scopes) {
          const code = scopeTypeCodeOf(sc, effectiveScopeTypes);
          const name = scopeTypeNameOf(sc, effectiveScopeTypes);
          const key1 = normalizeScopeKey(code);
          const key2 = normalizeScopeKey(name);
          const entry = {
            previous_meeting_installed: sc.previous_meeting_installed,
            previous_balance: sc.previous_balance,
          };
          if (key1) map[key1] = entry;
          if (key2) map[key2] = entry;
        }
        batchScopeLookup[jobNumber] = map;
      }
      batchScopeMapRef.current = batchScopeLookup;

      // Load scopes ONLY for projects that have existing meeting entries (fast initial load)

      const projectScopesMap: Record<number, ProjectScope[]> = {};
      if (existingProjectIds.size > 0) {
        setLoadingMessage('Loading scopes for existing entries…');
        const promises = activeJobs
          .filter((j) => existingProjectIds.has(j.id))
          .map(async (j) => {
            try {
              const pr = await api.get(`/projects/projects/${j.id}/`, {
                signal: controller.signal as unknown as AbortSignal,
              });
              const scopes = (pr.data?.scopes || []) as ProjectScope[];
              const filtered = scopes.filter((s) => scopeBelongsToProject(s, j.id));
              const lookup = batchScopeLookup[j.job_number] || {};
              projectScopesMap[j.id] = filtered.map((s) => {
                const code = scopeTypeCodeOf(s, effectiveScopeTypes);
                const name = scopeTypeNameOf(s, effectiveScopeTypes);
                const key1 = normalizeScopeKey(code);
                const key2 = normalizeScopeKey(name);
                const match = (key1 && lookup[key1]) || (key2 && lookup[key2]);
                if (!match) return s;
                return {
                  ...s,
                  previous_meeting_installed: match.previous_meeting_installed,
                  previous_balance: match.previous_balance,
                };
              });
            } catch (e) {
              console.error(`scope fetch failed for project ${j.id}:`, e);
              projectScopesMap[j.id] = [];
            }
          });
        await Promise.all(promises);
      }

      // previous meeting data (installed + balance)
      setLoadingMessage('Loading previous meeting…');
      const prevMap: Record<string, { installed_quantity: number; masons: number; operators: number; labors: number }> =
        {};

      const currentMeetingDate = meetingRes.data.meeting_date;
      if (currentMeetingDate) {
        try {
          // get meetings list (no date filter in backend right now)
          const allMeetingsRes = await api.get('/meetings/meetings/', {
            params: { ordering: '-meeting_date', page_size: 500 },
            signal: controller.signal as unknown as AbortSignal,
          });
          const allMeetings: Meeting[] = allMeetingsRes.data?.results || allMeetingsRes.data || [];
          const currentDate = new Date(currentMeetingDate);

          const prevMeeting = allMeetings.find(
            (m) => m.status === 'COMPLETED' && new Date(m.meeting_date) < currentDate,
          );
          if (prevMeeting?.id) {
            const prevJobsRes = await api.get(`/meetings/meetings/${prevMeeting.id}/jobs/`, {
              signal: controller.signal as unknown as AbortSignal,
            });
            const prevJobs = prevJobsRes.data || [];
            for (const pj of prevJobs) {
              const pid = pj.project_id || pj.project?.id;
              if (!pid) continue;
              if (pj.phases && Array.isArray(pj.phases)) {
                for (const ph of pj.phases as Phase[]) {
                  const k1 = `${pid}_${ph.phase_code}`;
                  prevMap[k1] = {
                    installed_quantity: safeNumber(ph.installed_quantity, 0),
                    masons: safeNumber(ph.masons, 0),
                    operators: safeNumber(ph.operators, 0),
                    labors: safeNumber(ph.labors, 0),
                  };
                }
              }
            }
          }
        } catch (e) {
          console.error('previous meeting load failed:', e);
        }
      }
      setPreviousMeetingData(prevMap);

      // Build jobs array
      setLoadingMessage('Preparing jobs…');

      const loadedScopeTypes = effectiveScopeTypes.length ? effectiveScopeTypes : scopeTypes; // may still be empty in edge cases

      const jobs: MeetingJob[] = activeJobs.map((job) => {
        const existing = existingJobs.find((ej) => {
          const ejPid = ej.project_id ?? ej.project?.id;
          return ejPid === job.id || ej.project?.job_number === job.job_number;
        });

        // project dates from batch
        const details = batchDetails[job.job_number] || {};
        let startDate: string | undefined;
        let endDate: string | undefined;
        if (details.dates) {
          startDate = details.dates.start_date || details.dates.est_start_date || job.start_date;
          endDate =
            details.dates.complete_date ||
            details.dates.projected_complete_date ||
            details.dates.est_complete_date ||
            job.estimated_end_date;
        } else {
          startDate = job.start_date;
          endDate = job.estimated_end_date;
        }

        // scopes:
        const scopes = (projectScopesMap[job.id] || []).filter((s) => scopeBelongsToProject(s, job.id));

        // phases: use existing phases if present; else create from scopes
        const phases: Phase[] = [];
        const existingPhases = existing?.phases || [];

        // map existing phases by code
        const existingMap = new Map<string, Phase>(existingPhases.map((p) => [p.phase_code, p]));

        // create from scopes
        for (const sc of scopes) {
          const code = scopeTypeCodeOf(sc, loadedScopeTypes);
          const name = scopeTypeNameOf(sc, loadedScopeTypes);
          const desc = sc.description || name;

          const ex = code ? existingMap.get(code) : undefined;

          const prev1 = prevMap[`${job.id}_${code}`];
          const backendPrev = sc.previous_meeting_installed;
          const baselineInstalled =
            backendPrev !== undefined ? safeNumber(backendPrev, 0) : prev1?.installed_quantity ?? 0;

          if (ex) {
            const rawInstalled = safeNumber(ex.installed_quantity, baselineInstalled);
            const correctedInstalled =
              rawInstalled < baselineInstalled ? baselineInstalled + rawInstalled : rawInstalled;
            phases.push({
              ...ex,
              phase_code: code,
              phase_description: desc || ex.phase_description,
              quantity: safeNumber(sc.qty_sq_ft, ex.quantity),
              // keep meeting’s stored installed_total (cumulative) if exists
              installed_quantity: correctedInstalled,
              masons: safeNumber(ex.masons, safeNumber(sc.masons, 0)),
              operators: safeNumber(ex.operators, safeNumber(sc.operators, 0)),
              labors: safeNumber(ex.labors, safeNumber(sc.tenders, 0)),
            });
          } else {
            // baseline installed from previous meeting
            phases.push({
              phase_code: code,
              phase_description: desc,
              masons: safeNumber(sc.masons, 0),
              operators: safeNumber(sc.operators, 0),
              labors: safeNumber(sc.tenders, 0),
              quantity: safeNumber(sc.qty_sq_ft, 0),
              installed_quantity: baselineInstalled, // start from baseline
              duration: null,
              notes: '',
            });
          }
        }

        // also include any existing phases that don't appear in scopes (legacy)
        for (const ph of existingPhases) {
          if (!ph.phase_code) continue;
          if (!phases.find((p) => p.phase_code === ph.phase_code)) {
            phases.push(ph);
          }
        }

        const project: Project = {
          id: job.id,
          job_number: job.job_number,
          name: job.name || '',
          job_description: job.job_description || '',
          spectrum_project_manager_name: job.spectrum_project_manager_name || '',
          branch: job.branch || job.branch_detail,
          branch_detail: job.branch_detail || job.branch,
          project_manager: job.project_manager,
          project_manager_detail: job.project_manager_detail || job.project_manager,
          start_date: startDate,
          estimated_end_date: endDate,
          saturdays: job.saturdays,
          full_weekends: job.full_weekends,
          scopes: [], // we store actual scopes on MeetingJob.projectScopes
        };

        return {
          id: existing?.id,
          project_id: job.id,
          project,
          masons: safeNumber(existing?.masons, 0),
          labors: safeNumber(existing?.labors, 0),
          notes: existing?.notes || '',
          handoff_from_estimator: !!existing?.handoff_from_estimator,
          handoff_to_foreman: !!existing?.handoff_to_foreman,
          site_specific_safety_plan: !!existing?.site_specific_safety_plan,
          saturdays: existing?.saturdays,
          full_weekends: existing?.full_weekends,
          selected_scope: existing?.selected_scope || '',
          phases,
          projectScopes: scopes,
        };
      });

      setAllMeetingJobs(jobs);
      setMeetingJobs(jobs);
      buildPMFilters(jobs);

      setLoading(false);
      setLoadingMessage('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string; name?: string; code?: string };
      if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      setError(e?.response?.data?.detail || e?.message || 'Failed to load meeting details');
      setLoading(false);
    }
  }, [meetingId, scopeTypes, fetchScopeTypes, buildPMFilters]);

  useEffect(() => {
    if (!meetingId) return;
    fetchMeetingData();
    fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  // ---------------- Filtering ----------------
  useEffect(() => {
    let filtered = [...allMeetingJobs];

    // search
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      filtered = filtered.filter((j) => {
        const p = j.project;
        return (
          p.job_number.toLowerCase().includes(s) ||
          p.name.toLowerCase().includes(s) ||
          branchDisplay(p).toLowerCase().includes(s) ||
          pmDisplay(p).toLowerCase().includes(s)
        );
      });
    }

    // branch filter
    if (filterBranch !== 'ALL') {
      filtered = filtered.filter((j) => {
        const bid = j.project.branch_detail?.id || j.project.branch?.id;
        return String(bid || '') === filterBranch;
      });
    }

    // PM filter (supports spectrum_)
    if (filterProjectManager !== 'ALL') {
      filtered = filtered.filter((j) => {
        const p = j.project;

        if (filterProjectManager.startsWith('spectrum_')) {
          const name = filterProjectManager.replace('spectrum_', '');
          return (p.spectrum_project_manager_name || '') === name;
        }

        const pmId = p.project_manager_detail?.id || p.project_manager?.id;
        return String(pmId || '') === filterProjectManager;
      });
    }

    setMeetingJobs(filtered);
    setCurrentPage(1);
  }, [searchTerm, filterBranch, filterProjectManager, allMeetingJobs]);

  // pagination
  const totalPages = useMemo(() => Math.max(1, Math.ceil(meetingJobs.length / jobsPerPage)), [meetingJobs.length, jobsPerPage]);
  const startIndex = (currentPage - 1) * jobsPerPage;
  const endIndex = startIndex + jobsPerPage;
  const paginatedJobs = meetingJobs.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [jobsPerPage]);

  // ---------------- Expand + lazy scope load ----------------
  const toggleJobExpansion = useCallback(
    async (projectId: number) => {
      setExpandedJobs((prev) => {
        const next = new Set(prev);
        if (next.has(projectId)) next.delete(projectId);
        else next.add(projectId);
        return next;
      });

      // lazy load scopes if missing
      const job = allMeetingJobs.find((j) => j.project_id === projectId);
      if (!job) return;

      if (!job.projectScopes || job.projectScopes.length === 0) {
        try {
          const pr = await api.get(`/projects/projects/${projectId}/`);
          const scopes = (pr.data?.scopes || []) as ProjectScope[];
          const filteredScopes = scopes.filter((s) => scopeBelongsToProject(s, projectId));
          const jobNumber = job.project?.job_number || '';

          let lookup = batchScopeMapRef.current[jobNumber] || {};
          if (!Object.keys(lookup).length && jobNumber) {
            try {
              const detailsRes = await api.post<Record<string, JobDetails>>(
                '/meetings/meetings/batch_job_details/',
                { job_numbers: [jobNumber], meeting_id: parseInt(meetingId, 10) },
              );
              const details = detailsRes.data?.[jobNumber];
              if (details?.scopes?.length) {
                const map: Record<string, { previous_meeting_installed?: number; previous_balance?: number }> = {};
                for (const sc of details.scopes) {
                  const code = scopeTypeCodeOf(sc, scopeTypes);
                  const name = scopeTypeNameOf(sc, scopeTypes);
                  const key1 = normalizeScopeKey(code);
                  const key2 = normalizeScopeKey(name);
                  const entry = {
                    previous_meeting_installed: sc.previous_meeting_installed,
                    previous_balance: sc.previous_balance,
                  };
                  if (key1) map[key1] = entry;
                  if (key2) map[key2] = entry;
                }
                lookup = map;
                batchScopeMapRef.current = { ...batchScopeMapRef.current, [jobNumber]: map };
              }
            } catch (e) {
              console.error(`batch_job_details failed for ${jobNumber}:`, e);
            }
          }

          const mergedScopes = filteredScopes.map((s) => {
            const code = scopeTypeCodeOf(s, scopeTypes);
            const name = scopeTypeNameOf(s, scopeTypes);
            const key1 = normalizeScopeKey(code);
            const key2 = normalizeScopeKey(name);
            const match = (key1 && lookup[key1]) || (key2 && lookup[key2]);
            if (!match) return s;
            return {
              ...s,
              previous_meeting_installed: match.previous_meeting_installed,
              previous_balance: match.previous_balance,
            };
          });

          setAllMeetingJobs((prev) => {
            const updated = prev.map((j) => (j.project_id === projectId ? { ...j, projectScopes: mergedScopes } : j));
            return updated;
          });
        } catch (e) {
          console.error(`lazy scope fetch failed for project ${projectId}:`, e);
        }
      }
    },
    [allMeetingJobs, scopeTypes, meetingId],
  );

  // ---------------- Save (draft + complete) ----------------
  const buildJobsToSave = useCallback(() => {
    return allMeetingJobs
      .filter((j) => j.project_id)
      .map((j) => ({
        project_id: j.project_id,
        id: j.id,
        masons: j.masons || 0,
        labors: j.labors || 0,
        notes: j.notes || '',
        handoff_from_estimator: !!j.handoff_from_estimator,
        handoff_to_foreman: !!j.handoff_to_foreman,
        site_specific_safety_plan: !!j.site_specific_safety_plan,
        saturdays: j.saturdays !== undefined ? j.saturdays : !!j.project?.saturdays,
        full_weekends: j.full_weekends !== undefined ? j.full_weekends : !!j.project?.full_weekends,
        selected_scope: j.selected_scope || '',
        phases: (j.phases || []).map((p) => ({
          id: p.id,
          phase_code: p.phase_code,
          phase_description: p.phase_description || '',
          masons: p.masons || 0,
          operators: p.operators || 0,
          labors: p.labors || 0,
          quantity: round2(p.quantity || 0),
          installed_quantity: round2(Math.min(p.quantity || 0, p.installed_quantity || 0)), // cumulative total installed
          duration: p.duration ?? null,
          notes: p.notes || '',
        })),
      }));
  }, [allMeetingJobs]);

  const saveDraftAndExit = useCallback(async () => {
    if (!meetingId) return;
    try {
      setSaving(true);
      setError(null);
      await api.post(`/meetings/meetings/${meetingId}/batch_save_jobs/`, {
        jobs: buildJobsToSave(),
        is_draft: true,
      });
      router.push('/meetings');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  }, [meetingId, buildJobsToSave, router]);

  const completeMeeting = useCallback(async () => {
    if (!meetingId) return;
    try {
      setSaving(true);
      setError(null);
      await api.post(`/meetings/meetings/${meetingId}/batch_save_jobs/`, {
        jobs: buildJobsToSave(),
        is_draft: false,
      });
      router.push('/meetings');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Failed to complete meeting');
    } finally {
      setSaving(false);
    }
  }, [meetingId, buildJobsToSave, router]);

  const saveDraft = useCallback(
    async (silent = true) => {
      if (!meetingId || allMeetingJobs.length === 0) return;
      try {
        await api.post(`/meetings/meetings/${meetingId}/batch_save_jobs/`, {
          jobs: buildJobsToSave(),
          is_draft: true,
        });
      } catch (e) {
        if (!silent) {
          console.error('Draft save failed:', e);
        }
      }
    },
    [meetingId, allMeetingJobs.length, buildJobsToSave],
  );

  // auto-save draft every 30s
  useEffect(() => {
    const t = setInterval(async () => {
      await saveDraft();
    }, 30000);

    return () => clearInterval(t);
  }, [saveDraft]);

  // save draft when tab/window is hidden or page is unloading
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        void saveDraft(true);
      }
    };

    const handlePageHide = () => {
      void saveDraft(true);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [saveDraft]);

  // ---------------- Rendering helpers ----------------
  const renderScopes = (job: MeetingJob) => {
    const scopes = (job.projectScopes || []).filter((s) => scopeBelongsToProject(s, job.project_id));

    if (!scopes.length) {
      return <p className="text-sm text-gray-500">No scopes found for this project</p>;
    }

    // scope filter (within this project) using job.selected_scope
    const selected = (job.selected_scope || '').trim();
    const visibleScopes = selected
      ? scopes.filter((s) => {
          const code = scopeTypeCodeOf(s, scopeTypes);
          return code === selected;
        })
      : scopes;

    return (
      <div className="space-y-3">
        {visibleScopes.map((scope) => {
          const code = scopeTypeCodeOf(scope, scopeTypes);
          const name = scopeTypeNameOf(scope, scopeTypes);
          const description = scope.description || name;

          // previous meeting baseline installed
          const prevKey1 = `${job.project_id}_${code}`;
          const prevKey2 = `${job.project_id}_${name}`;
          const prev = previousMeetingData[prevKey1] || previousMeetingData[prevKey2];
          const backendPrevInstalled = scope.previous_meeting_installed;
          const baselineInstalledRaw =
            backendPrevInstalled !== undefined ? safeNumber(backendPrevInstalled, 0) : prev?.installed_quantity ?? 0;

          // find phase for this scope code
          const phase = (job.phases || []).find((p) => p.phase_code === code);

          // TOTAL quantity
          const totalQty = safeNumber(scope.qty_sq_ft, phase?.quantity ?? 0);
          const baselineInstalled = Math.min(totalQty, Math.max(0, baselineInstalledRaw));

          // CUMULATIVE installed total stored for this meeting
          const phaseInstalled = phase ? safeNumber(phase.installed_quantity, baselineInstalled) : baselineInstalled;
          const installedTotalRaw =
            phase && phaseInstalled < baselineInstalled ? baselineInstalled + phaseInstalled : phaseInstalled;
          const installedTotal = Math.min(totalQty, Math.max(0, installedTotalRaw));

          // delta this meeting (what user edits)
          const computedDelta = Math.max(0, installedTotal - baselineInstalled);

          // drafts so typing works
          const k = scopeKey(job.project_id, code);
          const draft = installedDraft[k] !== undefined ? installedDraft[k] : String(computedDelta);

          const parseDelta = (raw: string) => {
            if (raw.trim() === '') return null;
            if (/^\d+\.?$/.test(raw.trim())) return Number(raw);
            const n = Number(raw);
            return Number.isFinite(n) ? n : null;
          };

          const backendPrevBalance = scope.previous_balance;
          const prevBalance =
            backendPrevBalance !== undefined
              ? round2(safeNumber(backendPrevBalance, 0))
              : round2(Math.max(0, totalQty - baselineInstalled));
          const parsedDraft = parseDelta(draft);
          const deltaForBalance = parsedDraft === null ? computedDelta : Math.max(0, parsedDraft);
          const currBalance = round2(Math.max(0, prevBalance - deltaForBalance));
          const progressThisMeeting = round2(installedTotal - baselineInstalled);
          const pct = totalQty > 0 ? Math.min(100, Math.max(0, (installedTotal / totalQty) * 100)) : 0;

          return (
            <div key={scope.id} className="p-4 border rounded-lg bg-gray-50">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-3">
                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Scope Type</label>
                  <Input value={name} disabled className="text-sm bg-gray-100" />
                </div>
                <div className="lg:col-span-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                  <Input value={description} disabled className="text-sm bg-gray-100" />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Masons</label>
                  <Input
                    type="number"
                    min="0"
                    value={phase?.masons ?? safeNumber(scope.masons, 0)}
                    onChange={(e) => {
                      const v = safeNumber(e.target.value, 0);
                      ensurePhase(job.project_id, code, description, scope, { masons: v }, baselineInstalled);
                    }}
                    className="text-sm"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Operators</label>
                  <Input
                    type="number"
                    min="0"
                    value={phase?.operators ?? safeNumber(scope.operators, 0)}
                    onChange={(e) => {
                      const v = safeNumber(e.target.value, 0);
                      ensurePhase(job.project_id, code, description, scope, { operators: v }, baselineInstalled);
                    }}
                    className="text-sm"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tenders</label>
                  <Input
                    type="number"
                    min="0"
                    value={phase?.labors ?? safeNumber(scope.tenders, 0)}
                    onChange={(e) => {
                      const v = safeNumber(e.target.value, 0);
                      ensurePhase(job.project_id, code, description, scope, { labors: v }, baselineInstalled);
                    }}
                    className="text-sm"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-3">
                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Total Quantity</label>
                  <Input value={round2(totalQty)} disabled className="text-sm bg-gray-100" />
                </div>

                {/* Previous meeting values */}
                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Previous Installed</label>
                  <Input value={round2(baselineInstalled)} disabled className="text-sm bg-blue-50 border-blue-200" />
                  <p className="text-xs text-gray-500 mt-0.5">From last meeting</p>
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Previous Balance</label>
                  <Input value={round2(prevBalance)} disabled className="text-sm bg-blue-50 border-blue-200" />
                  <p className="text-xs text-gray-500 mt-0.5">Remaining after last meeting</p>
                </div>

                {/* This meeting input as DELTA */}
                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Installed (This Meeting)</label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={draft}
                    onChange={(e) => {
                      const raw = e.target.value;

                      // allow only digits + dot, and allow empty while typing
                      if (!/^\d*\.?\d*$/.test(raw)) return;

                      setInstalledDraft((prevD) => ({ ...prevD, [k]: raw }));

                      const parsed = parseDelta(raw);
                      if (parsed === null) return;

                      const delta = Math.max(0, parsed);
                      const newTotal = round2(Math.min(totalQty, baselineInstalled + delta));

                      ensurePhase(job.project_id, code, description, scope, { installed_quantity: newTotal, quantity: totalQty }, baselineInstalled);
                    }}
                    onBlur={() => {
                      const raw = installedDraft[k] ?? String(computedDelta);
                      const trimmed = raw.trim();
                      const parsed = parseDelta(raw);
                      const delta =
                        trimmed === '' ? 0 : Math.max(0, parsed ?? computedDelta);
                      const newTotal = round2(Math.min(totalQty, baselineInstalled + delta));

                      const clampedDelta = Math.max(0, newTotal - baselineInstalled);
                      setInstalledDraft((prevD) => ({ ...prevD, [k]: String(round2(clampedDelta)) }));
                      ensurePhase(job.project_id, code, description, scope, { installed_quantity: newTotal, quantity: totalQty }, baselineInstalled);
                    }}
                    className="text-sm"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Enter ONLY today’s progress</p>
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Current Balance</label>
                  <Input
                    value={round2(currBalance)}
                    disabled
                    className={`text-sm ${
                      currBalance < 0
                        ? 'bg-red-50 border-red-200'
                        : currBalance === 0
                          ? 'bg-green-50 border-green-200'
                          : 'bg-yellow-50 border-yellow-200'
                    }`}
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Remaining after this meeting</p>
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Progress This Meeting</label>
                  <Input
                    value={progressThisMeeting >= 0 ? `+${round2(progressThisMeeting)}` : String(round2(progressThisMeeting))}
                    disabled
                    className={`text-sm ${
                      progressThisMeeting > 0
                        ? 'bg-green-50 border-green-200'
                        : progressThisMeeting < 0
                          ? 'bg-red-50 border-red-200'
                          : 'bg-gray-50 border-gray-200'
                    }`}
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Change from last meeting</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Complete %</label>
                  <Input value={`${round2(pct)}%`} disabled className="text-sm bg-gray-100" title={`${installedTotal} / ${totalQty}`} />
                </div>

                <div className="lg:col-span-10">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Scope Notes</label>
                  <Input
                    value={phase?.notes || ''}
                    onChange={(e) => {
                      ensurePhase(job.project_id, code, description, scope, { notes: e.target.value }, baselineInstalled);
                    }}
                    className="text-sm"
                    placeholder="Scope-specific notes…"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ---------------- UI ----------------
  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']} showSpinner={false}>
        <div className="min-h-screen bg-gray-50">
          <div className="lg:pl-64">
            <main className="pt-16 md:pt-20 pb-8 px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
                <LoadingSpinner text={loadingMessage || 'Please wait'} />
              </div>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN']} showSpinner={false}>
      <div className="min-h-screen bg-gray-50">
        <div className="lg:pl-64">
          <main className="pt-16 md:pt-20 pb-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] pb-12">
              {/* Fixed Header */}
              <div className="flex-shrink-0 bg-gray-50 pb-2 mb-2 border-b border-gray-200 sticky top-16 md:top-20 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
                <div className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Button
                      variant="outline"
                      onClick={() => router.push('/meetings')}
                      className="flex items-center gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium"
                    >
                      <ArrowLeftIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Back</span>
                    </Button>
                    <div>
                      <h1 className="text-base sm:text-lg md:text-xl font-bold text-gray-900">
                        Review Meeting - {meeting ? new Date(meeting.meeting_date).toLocaleDateString() : ''}
                      </h1>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Fill in details for all active jobs
                        {meeting?.created_at && (
                          <span className="ml-1.5">
                            • Created:{' '}
                            {new Date(meeting.created_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={saveDraftAndExit}
                      disabled={saving}
                      className="w-full sm:w-auto px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium"
                    >
                      {saving ? 'Saving…' : 'Save Draft'}
                    </Button>
                    <Button
                      onClick={completeMeeting}
                      disabled={saving}
                      className="w-full sm:w-auto px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium"
                    >
                      {saving ? 'Saving…' : 'Complete Meeting'}
                    </Button>
                  </div>
                </div>

                {error && (
                  <div className="mb-2 p-2 text-xs bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-2">
                    <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>{error}</div>
                  </div>
                )}

                {/* Filters */}
                <Card className="p-2 sm:p-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 sm:gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
                      <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          type="text"
                          placeholder="Search by job number, name, or branch…"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-8 text-xs py-1.5"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Branch</label>
                      <select
                        value={filterBranch}
                        onChange={(e) => setFilterBranch(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-xs"
                      >
                        <option value="ALL">All Branches</option>
                        {branches.map((b) => (
                          <option key={b.id} value={String(b.id)}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Project Manager</label>
                      <select
                        value={filterProjectManager}
                        onChange={(e) => setFilterProjectManager(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-xs"
                      >
                        <option value="ALL">All Project Managers</option>
                        {projectManagers.map((pm) => (
                          <option key={pm.id} value={pm.id}>
                            {pm.full_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-end gap-1.5">
                      <div className="text-xs text-gray-600">
                        Showing {startIndex + 1}-{Math.min(endIndex, meetingJobs.length)} of {meetingJobs.length} jobs
                        {meetingJobs.length !== allMeetingJobs.length && ` (${allMeetingJobs.length} total)`}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-gray-600 whitespace-nowrap">Per page:</label>
                        <select
                          value={jobsPerPage}
                          onChange={(e) => {
                            setJobsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="px-1.5 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-xs"
                        >
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                          <option value={150}>150</option>
                          <option value={200}>200</option>
                          <option value={300}>300</option>
                          <option value={400}>400</option>
                          <option value={500}>500</option>
                          <option value={750}>750</option>
                          <option value={1000}>1000</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Scrollable Jobs List */}
              <div className="flex-1 overflow-y-auto -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
                {meetingJobs.length === 0 ? (
                  <Card>
                    <div className="text-center py-12">
                      <p className="text-gray-500">No active jobs found</p>
                    </div>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    {paginatedJobs.map((job) => {
                      const p = job.project;
                      const isExpanded = expandedJobs.has(job.project_id);

                      return (
                        <Card key={job.project_id} className="p-3 sm:p-4">
                          {/* Job Header */}
                          <div
                            className="mb-2 pb-2 border-b cursor-pointer hover:bg-gray-50 -m-3 sm:-m-4 p-3 sm:p-4 rounded-t-lg transition-colors"
                            onClick={() => toggleJobExpansion(job.project_id)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-1">
                                {isExpanded ? (
                                  <ChevronUpIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                ) : (
                                  <ChevronDownIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-semibold text-sm sm:text-base text-gray-900 truncate">
                                      {p.job_number}
                                      {p.job_description && (
                                        <span className="ml-2 text-xs font-normal text-gray-600">- {p.job_description}</span>
                                      )}
                                    </h4>
                                    {p.schedule_status && <StatusBar status={p.schedule_status.status || 'GREEN'} />}
                                  </div>
                                  {p.name && <p className="text-xs sm:text-sm text-gray-600 mt-0.5 truncate">{p.name}</p>}
                                  <div className="flex items-center gap-2 sm:gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
                                    <span className="truncate">Branch: {branchDisplay(p)}</span>
                                    <span>•</span>
                                    <span className="truncate">PM: {pmDisplay(p)}</span>
                                    <span>•</span>
                                    <span>Scopes: {job.projectScopes?.length || 0}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Content */}
                          {isExpanded && (
                            <div className="space-y-6">
                              {/* Job details row */}
                              <div className="pb-4 border-b">
                                <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                                    <p className="text-sm font-medium">
                                      {p.start_date
                                        ? new Date(p.start_date).toLocaleDateString('en-GB', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                          })
                                        : 'N/A'}
                                    </p>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                                    <p className="text-sm font-medium">
                                      {p.estimated_end_date
                                        ? new Date(p.estimated_end_date).toLocaleDateString('en-GB', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                          })
                                        : 'N/A'}
                                    </p>
                                  </div>

                                  {/* NEW: scope filter within project */}
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Scope Filter (This Project)</label>
                                    <select
                                      value={job.selected_scope || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setAllMeetingJobs((prev) =>
                                          prev.map((j) => (j.project_id === job.project_id ? { ...j, selected_scope: val } : j)),
                                        );
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="">All Scopes</option>
                                      {(job.projectScopes || [])
                                        .filter((s) => scopeBelongsToProject(s, job.project_id))
                                        .map((s) => {
                                          const code = scopeTypeCodeOf(s, scopeTypes);
                                          const name = scopeTypeNameOf(s, scopeTypes);
                                          if (!code) return null;
                                          return (
                                            <option key={s.id} value={code}>
                                              {name || code}
                                            </option>
                                          );
                                        })}
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">Filters the scope list below for this project only.</p>
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
                                    <p className="text-sm font-medium">{branchDisplay(p)}</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 mt-4">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Project Manager</label>
                                    <p className="text-sm font-medium">{pmDisplay(p)}</p>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Foreman</label>
                                    <p className="text-sm font-medium">
                                      {p.foreman_detail
                                        ? `${p.foreman_detail.first_name || ''} ${p.foreman_detail.last_name || ''}`.trim() || 'N/A'
                                        : p.foreman
                                          ? `${p.foreman.first_name || ''} ${p.foreman.last_name || ''}`.trim() || 'N/A'
                                          : 'N/A'}
                                    </p>
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Saturday</label>
                                    <select
                                      value={job.saturdays !== undefined ? (job.saturdays ? 'Yes' : 'No') : p.saturdays ? 'Yes' : 'No'}
                                      onChange={(e) => {
                                        const val = e.target.value === 'Yes';
                                        setAllMeetingJobs((prev) =>
                                          prev.map((j) => (j.project_id === job.project_id ? { ...j, saturdays: val } : j)),
                                        );
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="No">No</option>
                                      <option value="Yes">Yes</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Full Weekends</label>
                                    <select
                                      value={
                                        job.full_weekends !== undefined ? (job.full_weekends ? 'Yes' : 'No') : p.full_weekends ? 'Yes' : 'No'
                                      }
                                      onChange={(e) => {
                                        const val = e.target.value === 'Yes';
                                        setAllMeetingJobs((prev) =>
                                          prev.map((j) => (j.project_id === job.project_id ? { ...j, full_weekends: val } : j)),
                                        );
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="No">No</option>
                                      <option value="Yes">Yes</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Handoff from Estimator</label>
                                    <select
                                      value={job.handoff_from_estimator ? 'Yes' : 'No'}
                                      onChange={(e) => {
                                        const val = e.target.value === 'Yes';
                                        setAllMeetingJobs((prev) =>
                                          prev.map((j) => (j.project_id === job.project_id ? { ...j, handoff_from_estimator: val } : j)),
                                        );
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="No">No</option>
                                      <option value="Yes">Yes</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Handoff to Foreman</label>
                                    <select
                                      value={job.handoff_to_foreman ? 'Yes' : 'No'}
                                      onChange={(e) => {
                                        const val = e.target.value === 'Yes';
                                        setAllMeetingJobs((prev) =>
                                          prev.map((j) => (j.project_id === job.project_id ? { ...j, handoff_to_foreman: val } : j)),
                                        );
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="No">No</option>
                                      <option value="Yes">Yes</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 mt-4">
                                  <div className="lg:col-span-6">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Site Specific Safety Plan</label>
                                    <select
                                      value={job.site_specific_safety_plan ? 'Yes' : 'No'}
                                      onChange={(e) => {
                                        const val = e.target.value === 'Yes';
                                        setAllMeetingJobs((prev) =>
                                          prev.map((j) => (j.project_id === job.project_id ? { ...j, site_specific_safety_plan: val } : j)),
                                        );
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="No">No</option>
                                      <option value="Yes">Yes</option>
                                    </select>
                                  </div>
                                </div>
                              </div>

                              {/* Scopes */}
                              <div className="mb-4">
                                <h5 className="text-sm font-semibold text-gray-900 mb-3">Scopes</h5>
                                {renderScopes(job)}
                              </div>

                              {/* Job Notes */}
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Job Notes</label>
                                <textarea
                                  value={job.notes || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setAllMeetingJobs((prev) =>
                                      prev.map((j) => (j.project_id === job.project_id ? { ...j, notes: val } : j)),
                                    );
                                  }}
                                  rows={3}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                                  placeholder="Job-specific notes…"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pagination Footer */}
              {totalPages > 1 && (
                <div className="flex-shrink-0 sticky bottom-0 bg-gray-50 border-t border-gray-200 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 z-10">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                    <div className="text-xs text-gray-600">
                      Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="text-xs px-2 py-1"
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum: number;
                          if (totalPages <= 5) pageNum = i + 1;
                          else if (currentPage <= 3) pageNum = i + 1;
                          else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                          else pageNum = currentPage - 2 + i;

                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? 'primary' : 'outline'}
                              onClick={() => setCurrentPage(pageNum)}
                              className="text-xs px-2 py-1 min-w-[2rem]"
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="text-xs px-2 py-1"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
