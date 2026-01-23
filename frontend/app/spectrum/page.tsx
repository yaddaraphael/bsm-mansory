'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import DataTable from '@/components/ui/DataTable';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface SpectrumJob {
  id?: string;
  Company_Code?: string;
  Job_Number?: string;
  Job_Description?: string;
  Division?: string;
  Address_1?: string;
  Address_2?: string;
  City?: string;
  State?: string;
  Zip_Code?: string;
  Project_Manager?: string;
  Superintendent?: string;
  Estimator?: string;
  Certified_Flag?: string;
  Customer_Code?: string;
  Status_Code?: string;
  Work_State_Tax_Code?: string;
  Contract_Number?: string;
  Cost_Center?: string;
}

interface ImportedJob {
  id: number;
  company_code: string;
  job_number: string;
  job_description: string | null;
  division: string | null;
  address_1: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  project_manager: string | null;
  superintendent: string | null;
  estimator: string | null;
  certified_flag: string | null;
  customer_code: string | null;
  status_code: string | null;
  work_state_tax_code: string | null;
  contract_number: string | null;
  cost_center: string | null;
  phone: string | null;
  fax_phone: string | null;
  job_site_phone: string | null;
  customer_name: string | null;
  original_contract: number | null;
  owner_name: string | null;
  wo_site: string | null;
  comment: string | null;
  price_method_code: string | null;
  total_units: number | null;
  unit_of_measure: string | null;
  latitude: number | null;
  longitude: number | null;
  legal_desc: string | null;
  field_1: string | null;
  field_2: string | null;
  field_3: string | null;
  field_4: string | null;
  field_5: string | null;
  last_synced_at: string | null;
}

interface SpectrumJobMain {
  id?: string;
  Company_Code?: string;
  Job_Number?: string;
  Job_Description?: string;
  Division?: string;
  Address_1?: string;
  Address_2?: string;
  City?: string;
  State?: string;
  Zip_Code?: string;
  Phone?: string;
  Fax_Phone?: string;
  Job_Site_Phone?: string;
  Customer_Code?: string;
  Customer_Name?: string;
  Original_Contract?: number;
  Contract_Number?: string;
  Owner_Name?: string;
  WO_Site?: string;
  Comment?: string;
  Price_Method_Code?: string;
  Total_Units?: number;
  Unit_of_Measure?: string;
  Status_Code?: string;
  Latitude?: number;
  Longitude?: number;
  Legal_Desc?: string;
  Cost_Center?: string;
  Project_Manager?: string;
  Superintendent?: string;
  Estimator?: string;
  Field_1?: string;
  Field_2?: string;
  Field_3?: string;
  Field_4?: string;
  Field_5?: string;
}

interface SpectrumJobDates {
  Company_Code?: string;
  Job_Number?: string;
  Job_Description?: string;
  Est_Start_Date?: string;
  Est_Complete_Date?: string;
  Projected_Complete_Date?: string;
  Create_Date?: string;
  Start_Date?: string;
  Complete_Date?: string;
  Field_1?: string;
  Field_2?: string;
  Field_3?: string;
  Field_4?: string;
  Field_5?: string;
  Error_Code?: string;
  Error_Description?: string;
  Error_Column?: string;
}

interface SpectrumPhase {
  Company_Code?: string;
  Job_Number?: string;
  Phase_Code?: string;
  Cost_Type?: string;
  Description?: string;
  Status_Code?: string;
  Unit_of_Measure?: string;
  JTD_Quantity?: number;
  JTD_Hours?: number;
  JTD_Actual_Dollars?: number;
  Projected_Quantity?: number;
  Projected_Hours?: number;
  Projected_Dollars?: number;
  Estimated_Quantity?: number;
  Estimated_Hours?: number;
  Current_Estimated_Dollars?: number;
  Cost_Center?: string;
  Error_Code?: string;
  Error_Description?: string;
  Error_Column?: string;
}

interface SpectrumPhaseEnhanced extends SpectrumPhase {
  Price_Method_Code?: string;
  Complete_Date?: string;
  Start_Date?: string;
  End_Date?: string;
  Comment?: string;
}

interface SpectrumJobCostProjection {
  id?: string;
  Company_Code?: string;
  Job_Number?: string;
  Phase_Code?: string;
  Cost_Type?: string;
  Transaction_Date?: string;
  Amount?: number;
  Projected_Hours?: number;
  Projected_Quantity?: number;
  Note?: string;
  Operator?: string;
  Error_Code?: string;
  Error_Description?: string;
  Error_Column?: string;
}

interface SpectrumJobUDF {
  id?: string;
  Company_Code?: string;
  Job_Number?: string;
  Division?: string;
  UDF1?: string;
  UDF2?: string;
  UDF3?: string;
  UDF4?: string;
  UDF5?: string;
  UDF6?: string;
  UDF7?: string;
  UDF8?: string;
  UDF9?: string;
  UDF10?: string;
  UDF11?: string;
  UDF12?: string;
  UDF13?: string;
  UDF14?: string;
  UDF15?: string;
  UDF16?: string;
  UDF17?: string;
  UDF18?: string;
  UDF19?: string;
  UDF20?: string;
  Error_Code?: string;
  Error_Description?: string;
  Error_Column?: string;
}

interface SpectrumJobContact {
  id?: string;
  Company_Code?: string;
  Job_Number?: string;
  Job_Description?: string;
  Status_Code?: string;
  Project_Manager?: string;
  Superintendent?: string;
  Estimator?: string;
  Cost_Center?: string;
  Contact_ID?: number;
  First_Name?: string;
  Last_Name?: string;
  Title?: string;
  Addr_1?: string;
  Addr_2?: string;
  Addr_City?: string;
  Addr_State?: string;
  Addr_Zip?: string;
  Addr_Country?: string;
  Phone_Number?: string;
  Email1?: string;
  Email2?: string;
  Email3?: string;
  Remarks?: string;
  Status?: string;
  OType?: string;
  OName?: string;
  OCity?: string;
  OState?: string;
  OStatus?: string;
}

interface ApiError {
  response?: {
    data?: {
      detail?: string;
      error?: string;
    };
  };
  message?: string;
}

interface FilterParams {
  company_code?: string;
  division?: string;
  status_code?: string;
  project_manager?: string;
  superintendent?: string;
  estimator?: string;
  customer_code?: string;
  cost_center?: string;
  sort_by?: string;
  job_number?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  title?: string;
}

export default function SpectrumPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'getjob' | 'getjobmain' | 'getjobcontact' | 'getjobdates' | 'getphase' | 'getphaseenhanced' | 'costprojections' | 'getjobudf' | 'imported'>('getjob');
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<SpectrumJob[]>([]);
  const [jobMain, setJobMain] = useState<SpectrumJobMain[]>([]);
  const [jobContacts, setJobContacts] = useState<SpectrumJobContact[]>([]);
  const [jobDates, setJobDates] = useState<SpectrumJobDates[]>([]);
  const [phases, setPhases] = useState<SpectrumPhase[]>([]);
  const [phasesEnhanced, setPhasesEnhanced] = useState<SpectrumPhaseEnhanced[]>([]);
  const [costProjections, setCostProjections] = useState<SpectrumJobCostProjection[]>([]);
  const [jobUDFs, setJobUDFs] = useState<SpectrumJobUDF[]>([]);
  const [importedJobs, setImportedJobs] = useState<ImportedJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [currentPageMain, setCurrentPageMain] = useState(1);
  const [pageSizeMain, setPageSizeMain] = useState(100);
  const [currentPageContacts, setCurrentPageContacts] = useState(1);
  const [pageSizeContacts, setPageSizeContacts] = useState(100);
  const [currentPageImported, setCurrentPageImported] = useState(1);
  const [pageSizeImported, setPageSizeImported] = useState(100);
  const [currentPageDates, setCurrentPageDates] = useState(1);
  const [pageSizeDates, setPageSizeDates] = useState(50);
  const [currentPagePhases, setCurrentPagePhases] = useState(1);
  const [pageSizePhases, setPageSizePhases] = useState(50);
  const [currentPagePhasesEnhanced, setCurrentPagePhasesEnhanced] = useState(1);
  const [pageSizePhasesEnhanced, setPageSizePhasesEnhanced] = useState(50);
  const [currentPageCostProjections, setCurrentPageCostProjections] = useState(1);
  const [pageSizeCostProjections, setPageSizeCostProjections] = useState(50);
  const [currentPageUDFs, setCurrentPageUDFs] = useState(1);
  const [pageSizeUDFs, setPageSizeUDFs] = useState(50);
  
  // Group phases by job number for display
  const [expandedJobNumbers, setExpandedJobNumbers] = useState<Set<string>>(new Set());
  
  // Modal state for job details - using comprehensive data
  const [selectedJob, setSelectedJob] = useState<{company_code: string; job_number: string} | null>(null);
  const [comprehensiveJobDetails, setComprehensiveJobDetails] = useState<{
    job: any;
    project: any;
    dates: any;
    phases: any[];
    udf: any;
    cost_projections: any[];
    contacts: any[];
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  // Filter parameters
  const [filters, setFilters] = useState({
    company_code: 'BSM',
    division: '',
    status_code: '',
    project_manager: '',
    superintendent: '',
    estimator: '',
    customer_code: '',
    cost_center: '',
    sort_by: '',
  });
  
  // GetJobContact specific filters
  const [contactFilters, setContactFilters] = useState({
    company_code: 'BSM',
    job_number: '',
    status_code: '',
    project_manager: '',
    superintendent: '',
    estimator: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    title: '',
    cost_center: '',
    sort_by: '',
  });
  
  // Page size options
  const pageSizeOptions = [50, 100, 250, 500, 1000, 2000, 2500];

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'ROOT_SUPERADMIN')) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const params: FilterParams = {};
      if (filters.company_code) params.company_code = filters.company_code;
      if (filters.division) params.division = filters.division;
      if (filters.status_code) params.status_code = filters.status_code;
      if (filters.project_manager) params.project_manager = filters.project_manager;
      if (filters.superintendent) params.superintendent = filters.superintendent;
      if (filters.estimator) params.estimator = filters.estimator;
      if (filters.customer_code) params.customer_code = filters.customer_code;
      if (filters.cost_center) params.cost_center = filters.cost_center;
      if (filters.sort_by) params.sort_by = filters.sort_by;
      
      const response = await api.get('/spectrum/jobs/fetch/', { params });
      const fetchedJobs = response.data.results || [];
      // Limit to max 2500 for initial display and add IDs for proper keying
      const limitedJobs = fetchedJobs.slice(0, 2500).map((job: SpectrumJob, index: number) => ({
        ...job,
        id: `${job.Company_Code || ''}-${job.Job_Number || ''}-${index}`,
      }));
      setJobs(limitedJobs);
      setCurrentPage(1); // Reset to first page when fetching new data
      setSuccess(`Successfully fetched ${response.data.count || 0} jobs from Spectrum${fetchedJobs.length > 2500 ? ` (showing first 2500)` : ''}`);
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to fetch jobs from Spectrum';
      setError(errorMsg);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const importJobs = async () => {
    setImporting(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await api.post('/spectrum/jobs/import/', filters);
      setSuccess(response.data.detail || 'Jobs imported successfully');
      // Refresh imported jobs list
      if (activeTab === 'imported') {
        loadImportedJobs();
      }
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to import jobs';
      setError(errorMsg);
    } finally {
      setImporting(false);
    }
  };

  const loadImportedJobs = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.get('/spectrum/jobs/list/');
      const jobs = response.data.results || [];
      // Add IDs for proper keying
      const jobsWithIds = jobs.map((job: ImportedJob, index: number) => ({
        ...job,
        id: job.id || `${job.company_code}-${job.job_number}-${index}`,
      }));
      setImportedJobs(jobsWithIds);
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to load imported jobs';
      setError(errorMsg);
      setImportedJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const manualSync = async () => {
    setSyncing(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await api.post('/spectrum/jobs/sync/', {
        company_code: filters.company_code || undefined,
        division: filters.division || undefined,
        status_code: filters.status_code || undefined,
      });
      setSuccess(response.data.detail || 'Jobs synced successfully');
      // Refresh imported jobs list
      if (activeTab === 'imported') {
        loadImportedJobs();
      }
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to sync jobs';
      setError(errorMsg);
    } finally {
      setSyncing(false);
    }
  };

  const fetchJobMain = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const params: FilterParams = {};
      if (filters.company_code) params.company_code = filters.company_code;
      if (filters.division) params.division = filters.division;
      if (filters.status_code) params.status_code = filters.status_code;
      if (filters.project_manager) params.project_manager = filters.project_manager;
      if (filters.superintendent) params.superintendent = filters.superintendent;
      if (filters.estimator) params.estimator = filters.estimator;
      if (filters.customer_code) params.customer_code = filters.customer_code;
      if (filters.cost_center) params.cost_center = filters.cost_center;
      if (filters.sort_by) params.sort_by = filters.sort_by;
      
      const response = await api.get('/spectrum/jobs/main/fetch/', { params });
      const fetchedJobs = response.data.results || [];
      const limitedJobs = fetchedJobs.slice(0, 2500).map((job: SpectrumJobMain, index: number) => ({
        ...job,
        id: `${job.Company_Code || ''}-${job.Job_Number || ''}-${index}`,
      }));
      setJobMain(limitedJobs);
      setCurrentPageMain(1);
      setSuccess(`Successfully fetched ${response.data.count || 0} job main records from Spectrum${fetchedJobs.length > 2500 ? ` (showing first 2500)` : ''}`);
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to fetch job main from Spectrum';
      setError(errorMsg);
      setJobMain([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobContacts = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const params: FilterParams = {};
      if (contactFilters.company_code) params.company_code = contactFilters.company_code;
      if (contactFilters.status_code) params.status_code = contactFilters.status_code;
      if (contactFilters.sort_by) params.sort_by = contactFilters.sort_by;
      
      // GetJobContact requires at least one filter: job_number, last_name, project_manager, first_name, or phone_number
      if (contactFilters.job_number) params.job_number = contactFilters.job_number;
      if (contactFilters.project_manager) params.project_manager = contactFilters.project_manager;
      if (contactFilters.superintendent) params.superintendent = contactFilters.superintendent;
      if (contactFilters.estimator) params.estimator = contactFilters.estimator;
      if (contactFilters.last_name) params.last_name = contactFilters.last_name;
      if (contactFilters.first_name) params.first_name = contactFilters.first_name;
      if (contactFilters.phone_number) params.phone_number = contactFilters.phone_number;
      if (contactFilters.title) params.title = contactFilters.title;
      if (contactFilters.cost_center) params.cost_center = contactFilters.cost_center;
      
      // Check if we have at least one required filter
      if (!params.job_number && !params.last_name && !params.project_manager && !params.first_name && !params.phone_number) {
        setError('GetJobContact requires at least one filter. Please provide Job Number, Last Name, Project Manager, First Name, or Phone Number.');
        setLoading(false);
        return;
      }
      
      const response = await api.get('/spectrum/jobs/contacts/fetch/', { params });
      const fetchedContacts = response.data.results || [];
      const limitedContacts = fetchedContacts.slice(0, 2500).map((contact: SpectrumJobContact, index: number) => ({
        ...contact,
        id: `${contact.Company_Code || ''}-${contact.Job_Number || ''}-${contact.Contact_ID || index}`,
      }));
      setJobContacts(limitedContacts);
      setCurrentPageContacts(1);
      setSuccess(`Successfully fetched ${response.data.count || 0} job contacts from Spectrum${fetchedContacts.length > 2500 ? ` (showing first 2500)` : ''}`);
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to fetch job contacts from Spectrum';
      setError(errorMsg);
      setJobContacts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobDates = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const params: FilterParams = {
        company_code: filters.company_code || undefined,
        division: filters.division || undefined,
        status_code: filters.status_code || undefined,
        project_manager: filters.project_manager || undefined,
        superintendent: filters.superintendent || undefined,
        estimator: filters.estimator || undefined,
        customer_code: filters.customer_code || undefined,
        cost_center: filters.cost_center || undefined,
        sort_by: filters.sort_by || undefined,
      };
      
      const response = await api.get('/spectrum/jobs/dates/fetch/', { params });
      const fetchedDates = response.data.results || [];
      const allDates = fetchedDates.map((date: SpectrumJobDates, index: number) => ({
        ...date,
        id: `${date.Company_Code || ''}-${date.Job_Number || ''}-${index}`,
      }));
      setJobDates(allDates);
      setCurrentPageDates(1);
      setSuccess(`Successfully fetched ${response.data.count || 0} job dates from Spectrum`);
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to fetch job dates from Spectrum';
      setError(errorMsg);
      setJobDates([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPhases = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const params: any = {
        company_code: filters.company_code || undefined,
        status_code: filters.status_code || undefined,
        cost_center: filters.cost_center || undefined,
      };
      
      const response = await api.get('/spectrum/jobs/phases/fetch/', { params });
      const fetchedPhases = response.data.results || [];
      const allPhases = fetchedPhases.map((phase: SpectrumPhase, index: number) => ({
        ...phase,
        id: `${phase.Company_Code || ''}-${phase.Job_Number || ''}-${phase.Phase_Code || ''}-${phase.Cost_Type || ''}-${index}`,
      }));
      setPhases(allPhases);
      setCurrentPagePhases(1);
      setSuccess(`Successfully fetched ${response.data.count || 0} phases from Spectrum`);
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to fetch phases from Spectrum';
      setError(errorMsg);
      setPhases([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPhasesEnhanced = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const params: any = {
        company_code: filters.company_code || undefined,
        status_code: filters.status_code || undefined,
        cost_center: filters.cost_center || undefined,
      };
      
      const response = await api.get('/spectrum/jobs/phases/enhanced/fetch/', { params });
      const fetchedPhases = response.data.results || [];
      const allPhases = fetchedPhases.map((phase: SpectrumPhaseEnhanced, index: number) => ({
        ...phase,
        id: `${phase.Company_Code || ''}-${phase.Job_Number || ''}-${phase.Phase_Code || ''}-${phase.Cost_Type || ''}-${index}`,
      }));
      setPhasesEnhanced(allPhases);
      setCurrentPagePhasesEnhanced(1);
      setSuccess(`Successfully fetched ${response.data.count || 0} enhanced phases from Spectrum`);
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to fetch enhanced phases from Spectrum';
      setError(errorMsg);
      setPhasesEnhanced([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobUDFs = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const params: FilterParams = {
        company_code: filters.company_code || undefined,
        division: filters.division || undefined,
        status_code: filters.status_code || undefined,
        project_manager: filters.project_manager || undefined,
        superintendent: filters.superintendent || undefined,
        estimator: filters.estimator || undefined,
        customer_code: filters.customer_code || undefined,
        cost_center: filters.cost_center || undefined,
      };
      
      const response = await api.get('/spectrum/jobs/udf/fetch/', { params });
      const fetchedUDFs = response.data.results || [];
      const allUDFs = fetchedUDFs.map((udf: SpectrumJobUDF, index: number) => ({
        ...udf,
        id: `${udf.Company_Code || ''}-${udf.Job_Number || ''}-${index}`,
      }));
      setJobUDFs(allUDFs);
      setCurrentPageUDFs(1);
      setSuccess(`Successfully fetched ${response.data.count || 0} job UDFs from Spectrum`);
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to fetch job UDFs from Spectrum';
      setError(errorMsg);
      setJobUDFs([]);
    } finally {
      setLoading(false);
    }
  };

  const postCostProjection = async (projectionData: SpectrumJobCostProjection) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await api.post('/spectrum/jobs/cost-projections/post/', projectionData);
      if (response.data.success) {
        setSuccess('Job cost projection posted successfully to Spectrum');
        // Optionally refresh projections list if we have one
      } else {
        setError(response.data.error_description || 'Failed to post job cost projection');
      }
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to post job cost projection to Spectrum';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const importJobDatesToDatabase = async () => {
    if (jobDates.length === 0) {
      setError('No job dates data to import. Please fetch data first.');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await api.post('/spectrum/jobs/dates/import/', { results: jobDates });
      setSuccess(response.data.detail || `Successfully imported ${response.data.imported || 0} new job dates and updated ${response.data.updated || 0} existing job dates.`);
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to import job dates to database';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const importPhasesToDatabase = async (phasesToImport?: any[], label?: string) => {
    // Use phasesEnhanced if available (from GetPhaseEnhanced tab), otherwise use phases (from GetPhase tab)
    const phasesData = phasesToImport || (activeTab === 'getphaseenhanced' ? phasesEnhanced : phases);
    const isEnhanced = activeTab === 'getphaseenhanced' || (phasesToImport === phasesEnhanced);
    const displayLabel = label || (isEnhanced ? 'enhanced phases' : 'phases');
    
    if (phasesData.length === 0) {
      setError('No phases data to import. Please fetch data first.');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await api.post('/spectrum/jobs/phases/import/', { 
        results: phasesData,
        is_enhanced: isEnhanced
      });
      setSuccess(response.data.detail || `Successfully imported ${response.data.imported || 0} new ${displayLabel} and updated ${response.data.updated || 0} existing ${displayLabel}.`);
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to import phases to database';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const importJobUDFsToDatabase = async () => {
    if (jobUDFs.length === 0) {
      setError('No job UDFs data to import. Please fetch data first.');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await api.post('/spectrum/jobs/udf/import/', { results: jobUDFs });
      setSuccess(response.data.detail || `Successfully imported ${response.data.imported || 0} new job UDFs and updated ${response.data.updated || 0} existing job UDFs.`);
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to import job UDFs to database';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'imported') {
      loadImportedJobs();
    }
  }, [activeTab]);

  if (authLoading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="flex-1 p-6 bg-gray-50">
              <LoadingSpinner />
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!user || user.role !== 'ROOT_SUPERADMIN') {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="flex-1 p-6 bg-gray-50">
              <div className="text-center py-8 text-gray-500">
                Access denied. Root Super Admin access required.
              </div>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const fetchJobDetails = async (companyCode: string, jobNumber: string) => {
    setLoadingDetails(true);
    setError(null);
    
    try {
      // Use comprehensive endpoint to get all data
      const encodedJobNumber = encodeURIComponent(jobNumber);
      const response = await api.get(`/spectrum/projects/${encodedJobNumber}/comprehensive/`);
      setComprehensiveJobDetails(response.data);
      setShowDetailsModal(true);
    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message || 'Failed to fetch job details';
      setError(errorMsg);
      // Still show modal even if comprehensive data fails
      setShowDetailsModal(true);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleJobNumberClick = (companyCode: string | undefined, jobNumber: string | undefined) => {
    if (companyCode && jobNumber) {
      setSelectedJob({ company_code: companyCode, job_number: jobNumber });
      fetchJobDetails(companyCode, jobNumber);
    }
  };

  const jobColumns = [
    { header: 'Company', accessor: (row: SpectrumJob) => row.Company_Code || '-' },
    { 
      header: 'Job Number', 
      accessor: (row: SpectrumJob) => (
        <button
          onClick={() => handleJobNumberClick(row.Company_Code, row.Job_Number)}
          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
        >
          {row.Job_Number || '-'}
        </button>
      )
    },
    { header: 'Description', accessor: (row: SpectrumJob) => row.Job_Description || '-' },
    { header: 'Division', accessor: (row: SpectrumJob) => row.Division || '-' },
    { header: 'Status', accessor: (row: SpectrumJob) => row.Status_Code || '-' },
    { header: 'PM', accessor: (row: SpectrumJob) => row.Project_Manager || '-' },
    { header: 'Superintendent', accessor: (row: SpectrumJob) => row.Superintendent || '-' },
    { header: 'City', accessor: (row: SpectrumJob) => row.City || '-' },
    { header: 'State', accessor: (row: SpectrumJob) => row.State || '-' },
  ];

  const importedJobColumns = [
    { header: 'Company', accessor: (row: ImportedJob) => row.company_code },
    { 
      header: 'Job Number', 
      accessor: (row: ImportedJob) => (
        <button
          onClick={() => handleJobNumberClick(row.company_code, row.job_number)}
          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
        >
          {row.job_number}
        </button>
      )
    },
    { header: 'Description', accessor: (row: ImportedJob) => row.job_description || '-' },
    { header: 'Division', accessor: (row: ImportedJob) => row.division || '-' },
    { header: 'Status', accessor: (row: ImportedJob) => row.status_code || '-' },
    { header: 'PM', accessor: (row: ImportedJob) => row.project_manager || '-' },
    { header: 'Superintendent', accessor: (row: ImportedJob) => row.superintendent || '-' },
    { header: 'Estimator', accessor: (row: ImportedJob) => row.estimator || '-' },
    { header: 'City', accessor: (row: ImportedJob) => row.city || '-' },
    { header: 'State', accessor: (row: ImportedJob) => row.state || '-' },
    { header: 'Customer', accessor: (row: ImportedJob) => row.customer_name || row.customer_code || '-' },
    { header: 'Owner', accessor: (row: ImportedJob) => row.owner_name || '-' },
    { header: 'Phone', accessor: (row: ImportedJob) => row.phone || '-' },
    { header: 'Contract #', accessor: (row: ImportedJob) => row.contract_number || '-' },
    { header: 'Last Synced', accessor: (row: ImportedJob) => row.last_synced_at ? new Date(row.last_synced_at).toLocaleString() : '-' },
  ];

  const jobMainColumns = [
    { header: 'Company', accessor: (row: SpectrumJobMain) => row.Company_Code || '-' },
    { 
      header: 'Job Number', 
      accessor: (row: SpectrumJobMain) => (
        <button
          onClick={() => handleJobNumberClick(row.Company_Code, row.Job_Number)}
          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
        >
          {row.Job_Number || '-'}
        </button>
      )
    },
    { header: 'Description', accessor: (row: SpectrumJobMain) => row.Job_Description || '-' },
    { header: 'Division', accessor: (row: SpectrumJobMain) => row.Division || '-' },
    { header: 'Status', accessor: (row: SpectrumJobMain) => row.Status_Code || '-' },
    { header: 'PM', accessor: (row: SpectrumJobMain) => row.Project_Manager || '-' },
    { header: 'Superintendent', accessor: (row: SpectrumJobMain) => row.Superintendent || '-' },
    { header: 'Customer', accessor: (row: SpectrumJobMain) => row.Customer_Name || row.Customer_Code || '-' },
    { header: 'Owner', accessor: (row: SpectrumJobMain) => row.Owner_Name || '-' },
    { header: 'Phone', accessor: (row: SpectrumJobMain) => row.Phone || '-' },
    { header: 'City', accessor: (row: SpectrumJobMain) => row.City || '-' },
    { header: 'State', accessor: (row: SpectrumJobMain) => row.State || '-' },
  ];

  const jobContactColumns = [
    { header: 'Company', accessor: (row: SpectrumJobContact) => row.Company_Code || '-' },
    { 
      header: 'Job Number', 
      accessor: (row: SpectrumJobContact) => (
        <button
          onClick={() => handleJobNumberClick(row.Company_Code, row.Job_Number)}
          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
        >
          {row.Job_Number || '-'}
        </button>
      )
    },
    { header: 'Job Description', accessor: (row: SpectrumJobContact) => row.Job_Description || '-' },
    { header: 'Contact ID', accessor: (row: SpectrumJobContact) => row.Contact_ID || '-' },
    { header: 'First Name', accessor: (row: SpectrumJobContact) => row.First_Name || '-' },
    { header: 'Last Name', accessor: (row: SpectrumJobContact) => row.Last_Name || '-' },
    { header: 'Title', accessor: (row: SpectrumJobContact) => row.Title || '-' },
    { header: 'Phone', accessor: (row: SpectrumJobContact) => row.Phone_Number || '-' },
    { header: 'Email', accessor: (row: SpectrumJobContact) => row.Email1 || '-' },
    { header: 'Organization', accessor: (row: SpectrumJobContact) => row.OName || '-' },
    { header: 'Org Type', accessor: (row: SpectrumJobContact) => row.OType || '-' },
  ];

  const jobDatesColumns = [
    { header: 'Company', accessor: (row: SpectrumJobDates) => row.Company_Code || '-' },
    { 
      header: 'Job Number', 
      accessor: (row: SpectrumJobDates) => (
        <button
          onClick={() => handleJobNumberClick(row.Company_Code, row.Job_Number)}
          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
        >
          {row.Job_Number || '-'}
        </button>
      )
    },
    { header: 'Description', accessor: (row: SpectrumJobDates) => row.Job_Description || '-' },
    { header: 'Division', accessor: (row: SpectrumJobDates) => (row as any).Division || '-' },
    { header: 'Est Start Date', accessor: (row: SpectrumJobDates) => row.Est_Start_Date || '-' },
    { header: 'Est Complete Date', accessor: (row: SpectrumJobDates) => row.Est_Complete_Date || '-' },
    { header: 'Projected Complete', accessor: (row: SpectrumJobDates) => row.Projected_Complete_Date || '-' },
    { header: 'Create Date', accessor: (row: SpectrumJobDates) => row.Create_Date || '-' },
    { header: 'Start Date', accessor: (row: SpectrumJobDates) => row.Start_Date || '-' },
    { header: 'Complete Date', accessor: (row: SpectrumJobDates) => row.Complete_Date || '-' },
  ];

  const toggleJobPhases = (jobKey: string) => {
    const newExpanded = new Set(expandedJobNumbers);
    if (newExpanded.has(jobKey)) {
      newExpanded.delete(jobKey);
    } else {
      newExpanded.add(jobKey);
    }
    setExpandedJobNumbers(newExpanded);
  };

  // Group phases by job number
  const groupPhasesByJob = (phases: SpectrumPhase[] | SpectrumPhaseEnhanced[]) => {
    const grouped: Record<string, typeof phases> = {};
    phases.forEach((phase) => {
      const jobKey = `${phase.Company_Code || ''}-${phase.Job_Number || ''}`;
      if (!grouped[jobKey]) {
        grouped[jobKey] = [];
      }
      grouped[jobKey].push(phase);
    });
    return grouped;
  };

  const phaseColumns = [
    { header: 'Company', accessor: (row: SpectrumPhase) => row.Company_Code || '-' },
    { 
      header: 'Job Number', 
      accessor: (row: SpectrumPhase) => (
        <button
          onClick={() => handleJobNumberClick(row.Company_Code, row.Job_Number)}
          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
        >
          {row.Job_Number || '-'}
        </button>
      )
    },
    { header: 'Division', accessor: (row: SpectrumPhase) => (row as any).Division || '-' },
    { header: 'Phase Code', accessor: (row: SpectrumPhase) => row.Phase_Code || '-' },
    { header: 'Cost Type', accessor: (row: SpectrumPhase) => row.Cost_Type || '-' },
    { header: 'Description', accessor: (row: SpectrumPhase) => row.Description || '-' },
    { header: 'Status', accessor: (row: SpectrumPhase) => row.Status_Code || '-' },
    { header: 'JTD Quantity', accessor: (row: SpectrumPhase) => row.JTD_Quantity || '-' },
    { header: 'JTD Hours', accessor: (row: SpectrumPhase) => row.JTD_Hours || '-' },
    { header: 'JTD Cost', accessor: (row: SpectrumPhase) => row.JTD_Actual_Dollars ? `$${row.JTD_Actual_Dollars.toLocaleString()}` : '-' },
    { header: 'Projected Cost', accessor: (row: SpectrumPhase) => row.Projected_Dollars ? `$${row.Projected_Dollars.toLocaleString()}` : '-' },
    { header: 'Estimated Cost', accessor: (row: SpectrumPhase) => row.Current_Estimated_Dollars ? `$${row.Current_Estimated_Dollars.toLocaleString()}` : '-' },
  ];

  const phaseEnhancedColumns = [
    { header: 'Company', accessor: (row: SpectrumPhaseEnhanced) => row.Company_Code || '-' },
    { 
      header: 'Job Number', 
      accessor: (row: SpectrumPhaseEnhanced) => (
        <button
          onClick={() => handleJobNumberClick(row.Company_Code, row.Job_Number)}
          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
        >
          {row.Job_Number || '-'}
        </button>
      )
    },
    { header: 'Division', accessor: (row: SpectrumPhaseEnhanced) => (row as any).Division || '-' },
    { header: 'Phase Code', accessor: (row: SpectrumPhaseEnhanced) => row.Phase_Code || '-' },
    { header: 'Cost Type', accessor: (row: SpectrumPhaseEnhanced) => row.Cost_Type || '-' },
    { header: 'Description', accessor: (row: SpectrumPhaseEnhanced) => row.Description || '-' },
    { header: 'Status', accessor: (row: SpectrumPhaseEnhanced) => row.Status_Code || '-' },
    { header: 'Start Date', accessor: (row: SpectrumPhaseEnhanced) => row.Start_Date || '-' },
    { header: 'End Date', accessor: (row: SpectrumPhaseEnhanced) => row.End_Date || '-' },
    { header: 'Complete Date', accessor: (row: SpectrumPhaseEnhanced) => row.Complete_Date || '-' },
    { header: 'JTD Cost', accessor: (row: SpectrumPhaseEnhanced) => row.JTD_Actual_Dollars ? `$${row.JTD_Actual_Dollars.toLocaleString()}` : '-' },
    { header: 'Projected Cost', accessor: (row: SpectrumPhaseEnhanced) => row.Projected_Dollars ? `$${row.Projected_Dollars.toLocaleString()}` : '-' },
    { header: 'Estimated Cost', accessor: (row: SpectrumPhaseEnhanced) => row.Current_Estimated_Dollars ? `$${row.Current_Estimated_Dollars.toLocaleString()}` : '-' },
    { header: 'Price Method', accessor: (row: SpectrumPhaseEnhanced) => row.Price_Method_Code || '-' },
  ];

  // Search filter function
  const filterData = <T extends Record<string, unknown>>(data: T[], searchTerm: string): T[] => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((item) => {
      return Object.values(item as Record<string, unknown>).some((value) => {
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(term);
      });
    });
  };

  // Pagination calculations
  const getPaginatedData = <T,>(data: T[], page: number, size: number) => {
    const startIndex = (page - 1) * size;
    const endIndex = startIndex + size;
    return data.slice(startIndex, endIndex);
  };

  const getTotalPages = (dataLength: number, size: number) => {
    return Math.ceil(dataLength / size);
  };

  // Filtered data based on search
  const filteredJobs = filterData(jobs as unknown as Array<Record<string, unknown>>, searchTerm) as SpectrumJob[];
  const filteredJobMain = filterData(jobMain as unknown as Array<Record<string, unknown>>, searchTerm) as SpectrumJobMain[];
  const filteredJobContacts = filterData(jobContacts as unknown as Array<Record<string, unknown>>, searchTerm) as SpectrumJobContact[];
  const filteredJobDates = filterData(jobDates as unknown as Array<Record<string, unknown>>, searchTerm) as SpectrumJobDates[];
  const filteredPhases = filterData(phases as unknown as Array<Record<string, unknown>>, searchTerm) as SpectrumPhase[];
  const filteredPhasesEnhanced = filterData(phasesEnhanced as unknown as Array<Record<string, unknown>>, searchTerm) as SpectrumPhaseEnhanced[];
  const filteredImportedJobs = filterData(importedJobs as unknown as Array<Record<string, unknown>>, searchTerm) as unknown as ImportedJob[];

  // Paginated data
  const paginatedJobs = getPaginatedData(filteredJobs, currentPage, pageSize) as SpectrumJob[];
  const paginatedJobMain = getPaginatedData(filteredJobMain, currentPageMain, pageSizeMain) as SpectrumJobMain[];
  const paginatedJobContacts = getPaginatedData(filteredJobContacts, currentPageContacts, pageSizeContacts) as SpectrumJobContact[];
  const paginatedJobDates = getPaginatedData(filteredJobDates, currentPageDates, pageSizeDates) as SpectrumJobDates[];
  const paginatedPhases = getPaginatedData(filteredPhases, currentPagePhases, pageSizePhases) as SpectrumPhase[];
  const paginatedPhasesEnhanced = getPaginatedData(filteredPhasesEnhanced, currentPagePhasesEnhanced, pageSizePhasesEnhanced) as SpectrumPhaseEnhanced[];
  const paginatedImportedJobs = getPaginatedData(filteredImportedJobs, currentPageImported, pageSizeImported) as ImportedJob[];
  
  const totalPages = getTotalPages(filteredJobs.length, pageSize);
  const totalPagesMain = getTotalPages(filteredJobMain.length, pageSizeMain);
  const totalPagesContacts = getTotalPages(filteredJobContacts.length, pageSizeContacts);
  const totalPagesDates = getTotalPages(filteredJobDates.length, pageSizeDates);
  const totalPagesPhases = getTotalPages(filteredPhases.length, pageSizePhases);
  const totalPagesPhasesEnhanced = getTotalPages(filteredPhasesEnhanced.length, pageSizePhasesEnhanced);
  const totalPagesImported = getTotalPages(filteredImportedJobs.length, pageSizeImported);

  // Pagination component
  const PaginationControls = ({
    currentPage: page,
    totalPages: total,
    pageSize: size,
    onPageChange,
    onPageSizeChange,
    totalItems,
  }: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    totalItems: number;
  }) => {
    const startItem = (page - 1) * size + 1;
    const endItem = Math.min(page * size, totalItems);

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 mt-4 px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <label className="text-xs sm:text-sm text-gray-700 flex items-center gap-2">
            Show:
            <select
              value={size}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1); // Reset to first page when changing page size
              }}
              className="ml-2 px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <span className="text-sm text-gray-700">
            Showing {startItem} to {endItem} of {totalItems} results
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, total) }, (_, i) => {
              let pageNum: number;
              if (total <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= total - 2) {
                pageNum = total - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`px-3 py-1 text-sm border rounded-md ${
                    page === pageNum
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page === total}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 p-3 sm:p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-7xl mx-auto">
              <div className="bg-white shadow rounded-lg">
          <div className="px-3 sm:px-4 md:px-6 py-3 md:py-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="flex-1">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Spectrum Job Import</h1>
                <p className="mt-1 text-xs sm:text-sm text-gray-600">
                  Fetch and import jobs from Spectrum Data Exchange. Jobs auto-sync every hour.
                </p>
              </div>
              <button
                onClick={manualSync}
                disabled={syncing}
                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                {syncing ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Syncing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Manual Sync
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-4 sm:space-x-6 md:space-x-8 px-3 sm:px-4 md:px-6 overflow-x-auto scrollbar-hide" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('getjob')}
                className={`${
                  activeTab === 'getjob'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm`}
              >
                GetJob ({jobs.length})
              </button>
              <button
                onClick={() => setActiveTab('getjobmain')}
                className={`${
                  activeTab === 'getjobmain'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm`}
              >
                GetJobMain ({jobMain.length})
              </button>
              <button
                onClick={() => setActiveTab('getjobcontact')}
                className={`${
                  activeTab === 'getjobcontact'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm`}
              >
                GetJobContact ({jobContacts.length})
              </button>
              <button
                onClick={() => setActiveTab('getjobdates')}
                className={`${
                  activeTab === 'getjobdates'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm`}
              >
                GetJobDates ({jobDates.length})
              </button>
              <button
                onClick={() => setActiveTab('getphase')}
                className={`${
                  activeTab === 'getphase'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm`}
              >
                GetPhase ({phases.length})
              </button>
              <button
                onClick={() => setActiveTab('getphaseenhanced')}
                className={`${
                  activeTab === 'getphaseenhanced'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm`}
              >
                GetPhaseEnhanced ({phasesEnhanced.length})
              </button>
              <button
                onClick={() => setActiveTab('costprojections')}
                className={`${
                  activeTab === 'costprojections'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm`}
              >
                Cost Projections
              </button>
              <button
                onClick={() => setActiveTab('getjobudf')}
                className={`${
                  activeTab === 'getjobudf'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm`}
              >
                GetJobUDF ({jobUDFs.length})
              </button>
              <button
                onClick={() => setActiveTab('imported')}
                className={`${
                  activeTab === 'imported'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm`}
              >
                Imported Jobs ({importedJobs.length})
              </button>
            </nav>
          </div>

          <div className="p-3 sm:p-4 md:p-6">
            {/* Search Bar */}
            {(activeTab === 'getjob' || activeTab === 'getjobmain' || activeTab === 'getjobcontact' || activeTab === 'imported') && (
              <div className="mb-3 sm:mb-4">
                <input
                  type="text"
                  placeholder="Search jobs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Filters and Actions */}
            {(activeTab === 'getjob' || activeTab === 'getjobmain') && (
              <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Code
                    </label>
                    <input
                      type="text"
                      value={filters.company_code}
                      onChange={(e) => setFilters({ ...filters, company_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="BSM"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Division
                    </label>
                    <input
                      type="text"
                      value={filters.division}
                      onChange={(e) => setFilters({ ...filters, division: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status Code
                    </label>
                    <select
                      value={filters.status_code}
                      onChange={(e) => setFilters({ ...filters, status_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All (Active & Inactive)</option>
                      <option value="A">Active</option>
                      <option value="I">Inactive</option>
                      <option value="C">Complete</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project Manager
                    </label>
                    <input
                      type="text"
                      value={filters.project_manager}
                      onChange={(e) => setFilters({ ...filters, project_manager: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Superintendent
                    </label>
                    <input
                      type="text"
                      value={filters.superintendent}
                      onChange={(e) => setFilters({ ...filters, superintendent: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sort By
                    </label>
                    <select
                      value={filters.sort_by}
                      onChange={(e) => setFilters({ ...filters, sort_by: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Job Number</option>
                      <option value="D">Division</option>
                      <option value="P">Project Manager</option>
                      <option value="S">Superintendent</option>
                      <option value="E">Estimator</option>
                      <option value="C">Customer Code</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  {activeTab === 'getjob' && (
                    <>
                      <button
                        onClick={fetchJobs}
                        disabled={loading}
                        className="w-full sm:w-auto px-4 py-2 text-sm sm:text-base bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {loading ? 'Fetching...' : 'Fetch Jobs from Spectrum'}
                      </button>
                      <button
                        onClick={importJobs}
                        disabled={importing || jobs.length === 0}
                        className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {importing ? 'Importing...' : `Import ${jobs.length} Jobs to Database`}
                      </button>
                    </>
                  )}
                  {activeTab === 'getjobmain' && (
                    <button
                      onClick={fetchJobMain}
                      disabled={loading}
                        className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Fetching...' : 'Fetch Job Main from Spectrum'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'getjobdates' && (
              <div className="mb-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Code
                    </label>
                    <input
                      type="text"
                      value={filters.company_code}
                      onChange={(e) => setFilters({ ...filters, company_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="BSM"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Division
                    </label>
                    <input
                      type="text"
                      value={filters.division}
                      onChange={(e) => setFilters({ ...filters, division: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status Code
                    </label>
                    <select
                      value={filters.status_code}
                      onChange={(e) => setFilters({ ...filters, status_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All (Active & Inactive)</option>
                      <option value="A">Active</option>
                      <option value="I">Inactive</option>
                      <option value="C">Complete</option>
                    </select>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={fetchJobDates}
                    disabled={loading}
                        className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Fetching...' : 'Fetch Job Dates from Spectrum'}
                  </button>
                  <button
                    onClick={importJobDatesToDatabase}
                    disabled={loading || jobDates.length === 0}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Importing...' : `Import ${jobDates.length} Job Dates to Database`}
                  </button>
                </div>
              </div>
            )}

            {(activeTab === 'getphase' || activeTab === 'getphaseenhanced') && (
              <div className="mb-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Code
                    </label>
                    <input
                      type="text"
                      value={filters.company_code}
                      onChange={(e) => setFilters({ ...filters, company_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="BSM"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status Code
                    </label>
                    <select
                      value={filters.status_code}
                      onChange={(e) => setFilters({ ...filters, status_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All (Active & Inactive)</option>
                      <option value="A">Active</option>
                      <option value="I">Inactive</option>
                      <option value="C">Complete</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cost Center
                    </label>
                    <input
                      type="text"
                      value={filters.cost_center}
                      onChange={(e) => setFilters({ ...filters, cost_center: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="flex space-x-3">
                  {activeTab === 'getphase' && (
                    <button
                      onClick={fetchPhases}
                      disabled={loading}
                        className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Fetching...' : 'Fetch Phases from Spectrum'}
                    </button>
                  )}
                  {activeTab === 'getphaseenhanced' && (
                    <button
                      onClick={fetchPhasesEnhanced}
                      disabled={loading}
                        className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Fetching...' : 'Fetch Enhanced Phases from Spectrum'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'getjobcontact' && (
              <div className="mb-6 space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> GetJobContact requires at least one filter: Job Number, Last Name, Project Manager, First Name, or Phone Number.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Code
                    </label>
                    <input
                      type="text"
                      value={contactFilters.company_code}
                      onChange={(e) => setContactFilters({ ...contactFilters, company_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="BSM"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Job Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={contactFilters.job_number}
                      onChange={(e) => setContactFilters({ ...contactFilters, job_number: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Required (or use other filters)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={contactFilters.last_name}
                      onChange={(e) => setContactFilters({ ...contactFilters, last_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Required (or use other filters)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={contactFilters.first_name}
                      onChange={(e) => setContactFilters({ ...contactFilters, first_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={contactFilters.phone_number}
                      onChange={(e) => setContactFilters({ ...contactFilters, phone_number: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project Manager <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={contactFilters.project_manager}
                      onChange={(e) => setContactFilters({ ...contactFilters, project_manager: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Required (or use other filters)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      value={contactFilters.title}
                      onChange={(e) => setContactFilters({ ...contactFilters, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status Code
                    </label>
                    <select
                      value={contactFilters.status_code}
                      onChange={(e) => setContactFilters({ ...contactFilters, status_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All (Active & Inactive)</option>
                      <option value="A">Active</option>
                      <option value="I">Inactive</option>
                      <option value="C">Complete</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sort By
                    </label>
                    <select
                      value={contactFilters.sort_by}
                      onChange={(e) => setContactFilters({ ...contactFilters, sort_by: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Company Code</option>
                      <option value="C">Contact ID</option>
                      <option value="P">Project Manager</option>
                      <option value="S">Superintendent</option>
                      <option value="E">Estimator</option>
                      <option value="L">Last Name</option>
                    </select>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={fetchJobContacts}
                    disabled={loading}
                        className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Fetching...' : 'Fetch Job Contacts from Spectrum'}
                  </button>
                </div>
              </div>
            )}

            {/* Messages */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            {success && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800">{success}</p>
              </div>
            )}

            {/* Data Tables */}
            {activeTab === 'getjob' && (
              <div>
                {jobs.length > 0 ? (
                  <>
                    <DataTable data={paginatedJobs} columns={jobColumns} />
                    <PaginationControls
                      currentPage={currentPage}
                      totalPages={totalPages}
                      pageSize={pageSize}
                      onPageChange={setCurrentPage}
                      onPageSizeChange={setPageSize}
                      totalItems={filteredJobs.length}
                    />
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {loading ? 'Fetching jobs...' : 'No jobs fetched yet. Click &quot;Fetch Jobs from Spectrum&quot; to load data.'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'getjobmain' && (
              <div>
                {jobMain.length > 0 ? (
                  <>
                    <DataTable data={paginatedJobMain} columns={jobMainColumns} />
                    <PaginationControls
                      currentPage={currentPageMain}
                      totalPages={totalPagesMain}
                      pageSize={pageSizeMain}
                      onPageChange={setCurrentPageMain}
                      onPageSizeChange={setPageSizeMain}
                      totalItems={filteredJobMain.length}
                    />
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {loading ? 'Fetching job main...' : 'No job main data fetched yet. Click &quot;Fetch Job Main from Spectrum&quot; to load data.'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'getjobcontact' && (
              <div>
                {jobContacts.length > 0 ? (
                  <>
                    <DataTable data={paginatedJobContacts} columns={jobContactColumns} />
                    <PaginationControls
                      currentPage={currentPageContacts}
                      totalPages={totalPagesContacts}
                      pageSize={pageSizeContacts}
                      onPageChange={setCurrentPageContacts}
                      onPageSizeChange={setPageSizeContacts}
                      totalItems={filteredJobContacts.length}
                    />
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {loading ? 'Fetching job contacts...' : 'No job contacts fetched yet. Click &quot;Fetch Job Contacts from Spectrum&quot; to load data.'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'getjobdates' && (
              <div>
                {jobDates.length > 0 ? (
                  <>
                    <div className="mb-4">
                      <button
                        onClick={importJobDatesToDatabase}
                        disabled={loading}
                        className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {loading ? 'Importing...' : 'Import to Database'}
                      </button>
                    </div>
                    <DataTable data={paginatedJobDates} columns={jobDatesColumns} />
                    <PaginationControls
                      currentPage={currentPageDates}
                      totalPages={totalPagesDates}
                      pageSize={pageSizeDates}
                      onPageChange={setCurrentPageDates}
                      onPageSizeChange={setPageSizeDates}
                      totalItems={filteredJobDates.length}
                    />
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {loading ? 'Fetching job dates...' : 'No job dates fetched yet. Click &quot;Fetch Job Dates from Spectrum&quot; to load data.'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'getphase' && (
              <div>
                {phases.length > 0 ? (
                  <>
                    <div className="mb-4">
                      <button
                        onClick={() => importPhasesToDatabase(phases, 'phases')}
                        disabled={loading || phases.length === 0}
                        className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {loading ? 'Importing...' : `Import ${phases.length} Phases to Database`}
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job Number</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Division</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phases</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {(() => {
                            const grouped = groupPhasesByJob(filteredPhases);
                            const jobKeys = Object.keys(grouped);
                            const startIndex = (currentPagePhases - 1) * pageSizePhases;
                            const endIndex = startIndex + pageSizePhases;
                            const paginatedJobKeys = jobKeys.slice(startIndex, endIndex);
                            
                            return paginatedJobKeys.map((jobKey) => {
                              const jobPhases = grouped[jobKey];
                              const firstPhase = jobPhases[0];
                              const isExpanded = expandedJobNumbers.has(jobKey);
                              return (
                                <React.Fragment key={jobKey}>
                                  <tr className="hover:bg-gray-50">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <button
                                        onClick={() => handleJobNumberClick(firstPhase.Company_Code, firstPhase.Job_Number)}
                                        className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium"
                                      >
                                        {firstPhase.Job_Number || '-'}
                                      </button>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                      {(firstPhase as any).Division || '-'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <button
                                        onClick={() => toggleJobPhases(jobKey)}
                                        className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-2"
                                      >
                                        {isExpanded ? '▼' : '▶'} {jobPhases.length} phase{jobPhases.length !== 1 ? 's' : ''}
                                      </button>
                                    </td>
                                  </tr>
                                  {isExpanded && (
                                    <tr>
                                      <td colSpan={3} className="px-4 py-3 bg-gray-50">
                                        <div className="overflow-x-auto">
                                          <DataTable data={jobPhases} columns={phaseColumns.slice(2)} />
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                    <PaginationControls
                      currentPage={currentPagePhases}
                      totalPages={Math.ceil(Object.keys(groupPhasesByJob(filteredPhases)).length / pageSizePhases)}
                      pageSize={pageSizePhases}
                      onPageChange={setCurrentPagePhases}
                      onPageSizeChange={setPageSizePhases}
                      totalItems={Object.keys(groupPhasesByJob(filteredPhases)).length}
                    />
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {loading ? 'Fetching phases...' : 'No phases fetched yet. Click &quot;Fetch Phases from Spectrum&quot; to load data.'}
                  </div>
                )}
              </div>
            )}

                {activeTab === 'getphaseenhanced' && (
                  <div>
                    {phasesEnhanced.length > 0 ? (
                      <>
                        <div className="mb-4">
                          <button
                            onClick={() => importPhasesToDatabase(phasesEnhanced, 'enhanced phases')}
                            disabled={loading || phasesEnhanced.length === 0}
                            className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            {loading ? 'Importing...' : `Import ${phasesEnhanced.length} Enhanced Phases to Database`}
                          </button>
                        </div>
                        <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job Number</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Division</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phases</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {(() => {
                            const grouped = groupPhasesByJob(filteredPhasesEnhanced);
                            const jobKeys = Object.keys(grouped);
                            const startIndex = (currentPagePhasesEnhanced - 1) * pageSizePhasesEnhanced;
                            const endIndex = startIndex + pageSizePhasesEnhanced;
                            const paginatedJobKeys = jobKeys.slice(startIndex, endIndex);
                            
                            return paginatedJobKeys.map((jobKey) => {
                              const jobPhases = grouped[jobKey];
                              const firstPhase = jobPhases[0];
                              const isExpanded = expandedJobNumbers.has(jobKey);
                              return (
                                <React.Fragment key={jobKey}>
                                  <tr className="hover:bg-gray-50">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <button
                                        onClick={() => handleJobNumberClick(firstPhase.Company_Code, firstPhase.Job_Number)}
                                        className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium"
                                      >
                                        {firstPhase.Job_Number || '-'}
                                      </button>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                      {(firstPhase as any).Division || '-'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <button
                                        onClick={() => toggleJobPhases(jobKey)}
                                        className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-2"
                                      >
                                        {isExpanded ? '▼' : '▶'} {jobPhases.length} phase{jobPhases.length !== 1 ? 's' : ''}
                                      </button>
                                    </td>
                                  </tr>
                                  {isExpanded && (
                                    <tr>
                                      <td colSpan={3} className="px-4 py-3 bg-gray-50">
                                        <div className="overflow-x-auto">
                                          <DataTable data={jobPhases} columns={phaseEnhancedColumns.slice(2)} />
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                    <PaginationControls
                      currentPage={currentPagePhasesEnhanced}
                      totalPages={Math.ceil(Object.keys(groupPhasesByJob(filteredPhasesEnhanced)).length / pageSizePhasesEnhanced)}
                      pageSize={pageSizePhasesEnhanced}
                      onPageChange={setCurrentPagePhasesEnhanced}
                      onPageSizeChange={setPageSizePhasesEnhanced}
                      totalItems={Object.keys(groupPhasesByJob(filteredPhasesEnhanced)).length}
                    />
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {loading ? 'Fetching enhanced phases...' : 'No enhanced phases fetched yet. Click &quot;Fetch Enhanced Phases from Spectrum&quot; to load data.'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'costprojections' && (
              <div>
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
                  <h3 className="font-semibold text-blue-900 mb-2">Post Job Cost Projection</h3>
                  <p className="text-sm text-blue-800 mb-4">
                    Use this form to post job cost projections to Spectrum. At least one of Amount, Projected Hours, or Projected Quantity is required.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      const projectionData: SpectrumJobCostProjection = {
                        company_code: formData.get('company_code') as string || 'BSM',
                        job_number: formData.get('job_number') as string,
                        phase_code: formData.get('phase_code') as string,
                        cost_type: formData.get('cost_type') as string,
                        transaction_date: formData.get('transaction_date') as string,
                        amount: formData.get('amount') ? parseFloat(formData.get('amount') as string) : undefined,
                        projected_hours: formData.get('projected_hours') ? parseFloat(formData.get('projected_hours') as string) : undefined,
                        projected_quantity: formData.get('projected_quantity') ? parseFloat(formData.get('projected_quantity') as string) : undefined,
                        note: formData.get('note') as string || undefined,
                        operator: formData.get('operator') as string || undefined,
                      };
                      postCostProjection(projectionData);
                    }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  >
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company Code</label>
                      <input type="text" name="company_code" defaultValue="BSM" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Job Number *</label>
                      <input type="text" name="job_number" required className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phase Code *</label>
                      <input type="text" name="phase_code" required className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cost Type *</label>
                      <input type="text" name="cost_type" required className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Date * (MM/DD/YYYY)</label>
                      <input type="text" name="transaction_date" required placeholder="MM/DD/YYYY" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                      <input type="number" step="0.01" name="amount" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Projected Hours</label>
                      <input type="number" step="0.01" name="projected_hours" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Projected Quantity</label>
                      <input type="number" step="0.01" name="projected_quantity" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Note (max 80 chars)</label>
                      <input type="text" maxLength={80} name="note" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Operator (max 3 chars)</label>
                      <input type="text" maxLength={3} name="operator" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                    </div>
                    <div className="md:col-span-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-[#772025] text-white rounded-md hover:bg-[#5a181c] disabled:bg-gray-400"
                      >
                        {loading ? 'Posting...' : 'Post Cost Projection'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'getjobudf' && (
              <div>
                {jobUDFs.length > 0 ? (
                  <>
                    <div className="mb-4 flex space-x-3">
                      <button
                        onClick={fetchJobUDFs}
                        disabled={loading}
                        className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-[#772025] text-white rounded-md hover:bg-[#5a181c] disabled:bg-gray-400"
                      >
                        {loading ? 'Fetching...' : 'Fetch Job UDFs from Spectrum'}
                      </button>
                      <button
                        onClick={importJobUDFsToDatabase}
                        disabled={loading}
                        className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {loading ? 'Importing...' : 'Import to Database'}
                      </button>
                    </div>
                    <DataTable 
                      data={jobUDFs.slice((currentPageUDFs - 1) * pageSizeUDFs, currentPageUDFs * pageSizeUDFs)} 
                      columns={[
                        { header: 'Company', accessor: (row: SpectrumJobUDF) => row.Company_Code || '-' },
                        { 
                          header: 'Job Number', 
                          accessor: (row: SpectrumJobUDF) => (
                            <button
                              onClick={() => handleJobNumberClick(row.Company_Code, row.Job_Number)}
                              className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                            >
                              {row.Job_Number || '-'}
                            </button>
                          )
                        },
                        { header: 'Division', accessor: (row: SpectrumJobUDF) => row.Division || '-' },
                        { header: 'UDF1', accessor: (row: SpectrumJobUDF) => row.UDF1 || '-' },
                        { header: 'UDF2', accessor: (row: SpectrumJobUDF) => row.UDF2 || '-' },
                        { header: 'UDF3', accessor: (row: SpectrumJobUDF) => row.UDF3 || '-' },
                        { header: 'UDF4', accessor: (row: SpectrumJobUDF) => row.UDF4 || '-' },
                        { header: 'UDF5', accessor: (row: SpectrumJobUDF) => row.UDF5 || '-' },
                        { header: 'UDF6', accessor: (row: SpectrumJobUDF) => row.UDF6 || '-' },
                        { header: 'UDF7', accessor: (row: SpectrumJobUDF) => row.UDF7 || '-' },
                        { header: 'UDF8', accessor: (row: SpectrumJobUDF) => row.UDF8 || '-' },
                        { header: 'UDF9', accessor: (row: SpectrumJobUDF) => row.UDF9 || '-' },
                        { header: 'UDF10', accessor: (row: SpectrumJobUDF) => row.UDF10 || '-' },
                      ]} 
                    />
                    <PaginationControls
                      currentPage={currentPageUDFs}
                      totalPages={Math.ceil(jobUDFs.length / pageSizeUDFs)}
                      pageSize={pageSizeUDFs}
                      onPageChange={setCurrentPageUDFs}
                      onPageSizeChange={setPageSizeUDFs}
                      totalItems={jobUDFs.length}
                    />
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {loading ? 'Fetching job UDFs...' : 'No job UDFs fetched yet. Click &quot;Fetch Job UDFs from Spectrum&quot; to load data.'}
                    <div className="mt-4">
                      <button
                        onClick={fetchJobUDFs}
                        disabled={loading}
                        className="w-full sm:w-auto px-3 sm:px-4 py-2 text-sm sm:text-base bg-[#772025] text-white rounded-md hover:bg-[#5a181c] disabled:bg-gray-400"
                      >
                        {loading ? 'Fetching...' : 'Fetch Job UDFs from Spectrum'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'imported' && (
              <div>
                {loading ? (
                  <div className="text-center py-8 text-gray-500">Loading imported jobs...</div>
                ) : importedJobs.length > 0 ? (
                  <>
                    <DataTable data={paginatedImportedJobs} columns={importedJobColumns} />
                    <PaginationControls
                      currentPage={currentPageImported}
                      totalPages={totalPagesImported}
                      pageSize={pageSizeImported}
                      onPageChange={setCurrentPageImported}
                      onPageSizeChange={setPageSizeImported}
                      totalItems={filteredImportedJobs.length}
                    />
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No jobs imported yet. Use the &quot;Fetch from Spectrum&quot; tab to import jobs.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
            </div>
          </main>
        </div>
      </div>

      {/* Job Details Modal */}
      {showDetailsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-3 sm:px-4 md:px-6 py-3 md:py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 break-words">
                Job Details: {selectedJob?.company_code}-{selectedJob?.job_number}
              </h2>
              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  setComprehensiveJobDetails(null);
                  setSelectedJob(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-3 sm:p-4 md:p-6">
              {loadingDetails ? (
                <div className="text-center py-6 sm:py-8">
                  <LoadingSpinner />
                  <p className="mt-4 text-sm sm:text-base text-gray-600">Loading comprehensive job details...</p>
                </div>
              ) : comprehensiveJobDetails ? (
                <div className="space-y-4 sm:space-y-6">
                  {/* Spectrum Job Information */}
                  {comprehensiveJobDetails.job && (
                    <div>
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 border-b pb-2">Spectrum Job Information</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {comprehensiveJobDetails.job.division && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Division</label>
                            <p className="text-base text-gray-900">{comprehensiveJobDetails.job.division}</p>
                          </div>
                        )}
                        {comprehensiveJobDetails.job.customer_name && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Customer</label>
                            <p className="text-base text-gray-900">{comprehensiveJobDetails.job.customer_name}</p>
                          </div>
                        )}
                        {comprehensiveJobDetails.job.project_manager && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Project Manager</label>
                            <p className="text-base text-gray-900">{comprehensiveJobDetails.job.project_manager}</p>
                          </div>
                        )}
                        {comprehensiveJobDetails.job.superintendent && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Superintendent</label>
                            <p className="text-base text-gray-900">{comprehensiveJobDetails.job.superintendent}</p>
                          </div>
                        )}
                        {comprehensiveJobDetails.job.original_contract && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Original Contract</label>
                            <p className="text-base text-gray-900">${comprehensiveJobDetails.job.original_contract.toLocaleString()}</p>
                          </div>
                        )}
                        {comprehensiveJobDetails.job.status_code && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Status</label>
                            <p className="text-base text-gray-900">
                              {comprehensiveJobDetails.job.status_code === 'A' ? 'Active' 
                               : comprehensiveJobDetails.job.status_code === 'I' ? 'Inactive'
                               : comprehensiveJobDetails.job.status_code === 'C' ? 'Complete'
                               : comprehensiveJobDetails.job.status_code}
                            </p>
                          </div>
                        )}
                        {comprehensiveJobDetails.job.job_description && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Job Description</label>
                            <p className="text-base text-gray-900">{comprehensiveJobDetails.job.job_description}</p>
                          </div>
                        )}
                        {comprehensiveJobDetails.job.customer_code && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Customer Code</label>
                            <p className="text-base text-gray-900">{comprehensiveJobDetails.job.customer_code}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Job Dates */}
                  {comprehensiveJobDetails.dates && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Job Dates</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {comprehensiveJobDetails.dates.est_start_date && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Est. Start Date</label>
                            <p className="text-base text-gray-900">{new Date(comprehensiveJobDetails.dates.est_start_date).toLocaleDateString()}</p>
                          </div>
                        )}
                        {comprehensiveJobDetails.dates.est_complete_date && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Est. Complete Date</label>
                            <p className="text-base text-gray-900">{new Date(comprehensiveJobDetails.dates.est_complete_date).toLocaleDateString()}</p>
                          </div>
                        )}
                        {comprehensiveJobDetails.dates.projected_complete_date && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Projected Complete Date</label>
                            <p className="text-base text-gray-900">{new Date(comprehensiveJobDetails.dates.projected_complete_date).toLocaleDateString()}</p>
                          </div>
                        )}
                        {comprehensiveJobDetails.dates.start_date && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Actual Start Date</label>
                            <p className="text-base text-gray-900">{new Date(comprehensiveJobDetails.dates.start_date).toLocaleDateString()}</p>
                          </div>
                        )}
                        {comprehensiveJobDetails.dates.complete_date && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 block mb-1">Actual Complete Date</label>
                            <p className="text-base text-gray-900">{new Date(comprehensiveJobDetails.dates.complete_date).toLocaleDateString()}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Phases */}
                  {comprehensiveJobDetails.phases && comprehensiveJobDetails.phases.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Phases ({comprehensiveJobDetails.phases.length})</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phase Code</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost Type</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">JTD Cost</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Projected Cost</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estimated Cost</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {comprehensiveJobDetails.phases.map((phase: any, idx: number) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">{phase.phase_code}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">{phase.cost_type || '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">{phase.description || '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {phase.jtd_actual_dollars ? `$${phase.jtd_actual_dollars.toLocaleString()}` : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {phase.projected_dollars ? `$${phase.projected_dollars.toLocaleString()}` : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {phase.current_estimated_dollars ? `$${phase.current_estimated_dollars.toLocaleString()}` : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {phase.status_code === 'A' ? 'Active' 
                                   : phase.status_code === 'I' ? 'Inactive'
                                   : phase.status_code === 'C' ? 'Complete'
                                   : phase.status_code || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Cost Projections */}
                  {comprehensiveJobDetails.cost_projections && comprehensiveJobDetails.cost_projections.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Cost Projections ({comprehensiveJobDetails.cost_projections.length})</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phase</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost Type</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transaction Date</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Projected Hours</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Projected Quantity</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {comprehensiveJobDetails.cost_projections.map((proj: any, idx: number) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">{proj.phase_code}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">{proj.cost_type}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {proj.transaction_date ? new Date(proj.transaction_date).toLocaleDateString() : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {proj.amount ? `$${proj.amount.toLocaleString()}` : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900">{proj.projected_hours || '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">{proj.projected_quantity || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* UDFs */}
                  {comprehensiveJobDetails.udf && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">User Defined Fields</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => {
                          const udfValue = comprehensiveJobDetails.udf?.[`udf${num}` as keyof typeof comprehensiveJobDetails.udf] as string;
                          if (!udfValue) return null;
                          return (
                            <div key={num}>
                              <label className="text-sm font-medium text-gray-500 block mb-1">UDF{num}</label>
                              <p className="text-base text-gray-900">{udfValue}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Contacts */}
                  {comprehensiveJobDetails.contacts && comprehensiveJobDetails.contacts.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">Contacts ({comprehensiveJobDetails.contacts.length})</h3>
                      <div className="space-y-4">
                        {comprehensiveJobDetails.contacts.map((contact: any) => (
                          <div key={contact.contact_id} className="border border-gray-200 rounded-lg p-4">
                            <h4 className="font-semibold text-gray-900 mb-2">
                              {contact.first_name} {contact.last_name}
                              {contact.title && <span className="text-sm font-normal text-gray-500 ml-2">- {contact.title}</span>}
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                              {contact.phone_number && (
                                <div>
                                  <span className="font-medium">Phone:</span> {contact.phone_number}
                                </div>
                              )}
                              {contact.email1 && (
                                <div>
                                  <span className="font-medium">Email:</span> {contact.email1}
                                </div>
                              )}
                              {contact.addr_1 && (
                                <div>
                                  <span className="font-medium">Address:</span> {contact.addr_1}
                                  {contact.addr_city && `, ${contact.addr_city}`}
                                  {contact.addr_state && ` ${contact.addr_state}`}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!comprehensiveJobDetails.job && !comprehensiveJobDetails.dates && 
                   (!comprehensiveJobDetails.phases || comprehensiveJobDetails.phases.length === 0) &&
                   (!comprehensiveJobDetails.contacts || comprehensiveJobDetails.contacts.length === 0) && (
                    <div className="text-center py-8 text-gray-500">
                      No comprehensive job details found. Please ensure all Spectrum APIs have been imported.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No job details available. Please ensure the job has been imported from Spectrum.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
