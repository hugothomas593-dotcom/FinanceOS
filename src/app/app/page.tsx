'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { forecast, summarize, type ModelInputs, type MonthResult } from '@/lib/finance';
import { AvenorCopilot } from '@/components/avenor-copilot';
import { CfoBrief } from '@/components/cfo-brief';
import { FinancialOperations } from '@/components/financial-operations';
import { FinancialOperationsHub } from '@/components/financial-operations-hub';
import { FounderPulse } from '@/components/founder-pulse';
import { EMPTY_COMPANY_CONTEXT, companyContextCompletion, type CompanyContext } from '@/lib/company-context';

type FounderBriefData = {
  generatedAt?: string;
  alerts?: Array<{ id: string; severity: 'critical' | 'warning' | 'info'; title: string; description: string }>;
  forecast?: { endingCash: number; monthlyBurn?: number; firstMonthCashNegative: number | null; firstMonthBelowTargetRunway: number | null; targetRunwayMonths: number } | null;
  historical?: { records: number; monthsCovered: number; inflowTrendPct: number | null; outflowTrendPct: number | null };
};

type View = 'Overview' | 'CFO Brief' | 'Financial overview' | 'Decision ledger' | 'Company assumptions' | 'Business metrics' | 'Data import' | 'Fundraising planner' | 'Investor reporting' | 'Plan & billing';
const viewTitles: Record<View, string> = {
  Overview: 'Avenor Intelligence',
  'CFO Brief': 'CFO Brief',
  'Financial overview': 'Financial overview',
  'Decision ledger': 'Saved decisions',
  'Company assumptions': 'Company setup',
  'Business metrics': 'Growth metrics',
  'Data import': 'Import transactions',
  'Fundraising planner': 'Fundraising planner',
  'Investor reporting': 'Investor update',
  'Plan & billing': 'Plan & billing',
};
const money = (v: number, currency = 'EUR') => new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
const compactMoney = (v: number, currency = 'EUR') => new Intl.NumberFormat('en-GB', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v);
const compact = (v: number) => new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
const initial: ModelInputs = { openingCash: 0, monthlyRevenue: 0, monthlyRevenueGrowth: 0, monthlyOpexExPayroll: 0, monthlyOpexGrowth: 0, cogsRatio: 0, existingMonthlyPayroll: 0, existingOtherNetCashAdjustments: 0 };
const months = 18;

type SavedDecision = { id: string; title: string; detail: string; cashImpact: number | null; cashImpactLabel?: string; created: string; owner: string; reviewDate: string; status: 'planned' | 'in_progress' | 'reviewed' | 'completed' | 'paused'; actualEndingCash: number | null; actualOutcomeNote: string; forecastEndingCash: number | null };
type WorkspaceMembership = {
  organization_id: string;
  role: string;
  organizations: { id: string; name: string; country_code: string; base_currency: string } | null;
};
type ModelRow = {
  id: string;
  name: string;
  status: 'draft' | 'approved' | 'archived';
  assumptions: Record<string, unknown>;
  created_at: string;
};
type ScenarioRow = {
  id: string;
  name: string;
  scenario_type: string;
  model_version_id: string | null;
  assumptions: Record<string, unknown>;
  outputs: Record<string, unknown>;
  created_at: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function scenarioCashImpact(outputs: Record<string, unknown>) {
  const directImpact = asRecord(outputs.impact);
  const nestedScenario = asRecord(outputs.scenario);
  const nestedImpact = asRecord(nestedScenario?.impact);
  const legacyCashImpact = typeof outputs.cashImpact === 'number' && Number.isFinite(outputs.cashImpact)
    ? -Math.abs(outputs.cashImpact)
    : undefined;
  if (Array.isArray(outputs.scenarios)) {
    return { value: null, label: `${outputs.scenarios.length} options compared` };
  }
  const candidates: Array<{ value: unknown; label: string }> = [
    { value: directImpact?.endingCash, label: '18-month closing-cash difference' },
    { value: directImpact?.endingCashDelta, label: '18-month closing-cash difference' },
    { value: nestedImpact?.endingCash, label: '18-month closing-cash difference' },
    { value: outputs.cashDelta, label: '18-month closing-cash difference' },
    { value: legacyCashImpact, label: '18-month closing-cash difference' },
    { value: outputs.totalEstimatedCashImpact, label: 'Estimated one-off cash impact' },
  ];

  for (const candidate of candidates) {
    if (typeof candidate.value === 'number' && Number.isFinite(candidate.value)) {
      return { value: candidate.value, label: candidate.label };
    }
  }
  return { value: null, label: 'Cash impact unavailable' };
}

function toSavedDecision(scenario: ScenarioRow): SavedDecision {
  const impact = scenarioCashImpact(scenario.outputs);
  const tracking = asRecord(asRecord(scenario.assumptions)?.decisionTracking);
  const forecast = asRecord(scenario.outputs.scenario);
  const forecastEndingCash = typeof forecast?.endingCash === 'number' && Number.isFinite(forecast.endingCash)
    ? forecast.endingCash
    : null;
  const status = ['planned', 'in_progress', 'reviewed', 'completed', 'paused'].includes(String(tracking?.status))
    ? tracking!.status as SavedDecision['status']
    : 'planned';
  return {
    id: scenario.id,
    title: scenario.name,
    detail: `${scenario.scenario_type} scenario · saved to this workspace`,
    cashImpact: impact.value,
    cashImpactLabel: impact.label,
    created: new Date(scenario.created_at).toLocaleDateString('en-GB'),
    owner: typeof tracking?.owner === 'string' ? tracking.owner : '',
    reviewDate: typeof tracking?.reviewDate === 'string' ? tracking.reviewDate : '',
    status,
    actualEndingCash: typeof tracking?.actualEndingCash === 'number' && Number.isFinite(tracking.actualEndingCash) ? tracking.actualEndingCash : null,
    actualOutcomeNote: typeof tracking?.actualOutcomeNote === 'string' ? tracking.actualOutcomeNote : '',
    forecastEndingCash,
  };
}

export default function Home() {
  const [view, setView] = useState<View>('Financial overview');
  const [organizationId, setOrganizationId] = useState('');
  const [workspaceMemberships, setWorkspaceMemberships] = useState<WorkspaceMembership[]>([]);
  const [organizationName, setOrganizationName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [companyContext, setCompanyContext] = useState<CompanyContext>(EMPTY_COMPANY_CONTEXT);
  const [contextBusy, setContextBusy] = useState(false);
  const [contextError, setContextError] = useState('');
  const [contextUpdatedAt, setContextUpdatedAt] = useState('');
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€';
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState('');
  const [hasModel, setHasModel] = useState(false);
  const [modelStatus, setModelStatus] = useState<'draft' | 'approved' | 'none'>('none');
  const [modelVersionId, setModelVersionId] = useState('');
  const [modelName, setModelName] = useState('Base financial plan');
  const [modelBusy, setModelBusy] = useState(false);
  const [modelUpdatedAt, setModelUpdatedAt] = useState('');
  const [actualsCount, setActualsCount] = useState(0);
  const [insightCount, setInsightCount] = useState(0);
  const [financialDataVersion, setFinancialDataVersion] = useState(0);
  const [cfoBrief, setCfoBrief] = useState<FounderBriefData | null>(null);
  const [cash, setCash] = useState(initial.openingCash);
  const [revenue, setRevenue] = useState(initial.monthlyRevenue);
  const [payroll, setPayroll] = useState(initial.existingMonthlyPayroll);
  const [opex, setOpex] = useState(initial.monthlyOpexExPayroll);
  const [growth, setGrowth] = useState(initial.monthlyRevenueGrowth * 100);
  const [cogs, setCogs] = useState(initial.cogsRatio * 100);
  const [saved, setSaved] = useState<SavedDecision[]>([]);
  const [toast, setToast] = useState('');
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [deleteWorkspaceBusy, setDeleteWorkspaceBusy] = useState(false);
  const [deleteWorkspaceError, setDeleteWorkspaceError] = useState('');

  useEffect(() => {
    const handleDecisionSaved = (event: Event) => {
      const scenario = (event as CustomEvent<ScenarioRow>).detail;
      if (!scenario?.id || !scenario.outputs) return;
      const item = toSavedDecision(scenario);
      setSaved((current) => [item, ...current.filter((existing) => existing.id !== item.id)].slice(0, 100));
    };

    window.addEventListener('avenor:decision-saved', handleDecisionSaved);
    return () => window.removeEventListener('avenor:decision-saved', handleDecisionSaved);
  }, []);
  const [importRows, setImportRows] = useState<{period:string;category:string;description:string;amount:number;direction:'inflow'|'outflow';source:string;currency?:string}[]>([]);
  const [importError, setImportError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(1500000);

  const [preMoney, setPreMoney] = useState(6000000);
  const [kpiPeriod, setKpiPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [businessKpis, setBusinessKpis] = useState({
    mrr: '',
    activeCustomers: '',
    newCustomers: '',
    churnedCustomers: '',
    marketingSpend: '',
    salesSpend: '',
    grossMarginPct: '',
  });
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiBusy, setKpiBusy] = useState(false);
  const [kpiHasData, setKpiHasData] = useState(false);
  const [kpiError, setKpiError] = useState('');
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [billingStatus, setBillingStatus] = useState<{
    billingConfigured: boolean;
    subscriptionStatus: string | null;
    currentPeriodEnd: string | null;
    canStartCheckout: boolean;
    canManageBilling: boolean;
    trialDays?: number | null;
  } | null>(null);

  useEffect(() => {
    const refreshFinancialData = () => {
      setFinancialDataVersion((version) => version + 1);
      if (!organizationId) return;
      fetch(`/api/actuals?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) return;
          const data = await response.json();
          setActualsCount(((data.actuals ?? []) as unknown[]).length);
        })
        .catch(() => undefined);
    };
    window.addEventListener('avenor:financial-data-updated', refreshFinancialData);
    return () => window.removeEventListener('avenor:financial-data-updated', refreshFinancialData);
  }, [organizationId]);

  useEffect(() => {
    const navigateToCopilot = () => setView('Overview');
    const openCompanySetup = () => setView('Company assumptions');
    const openDataImport = () => setView('Data import');
    const openFinancialOverview = () => setView('Financial overview');
    const openCfoBrief = () => setView('CFO Brief');
    window.addEventListener('avenor:open-copilot', navigateToCopilot);
    window.addEventListener('avenor:open-company-setup', openCompanySetup);
    window.addEventListener('avenor:open-data-import', openDataImport);
    window.addEventListener('avenor:open-financial-overview', openFinancialOverview);
    window.addEventListener('avenor:open-cfo-brief', openCfoBrief);
    return () => {
      window.removeEventListener('avenor:open-copilot', navigateToCopilot);
      window.removeEventListener('avenor:open-company-setup', openCompanySetup);
      window.removeEventListener('avenor:open-data-import', openDataImport);
      window.removeEventListener('avenor:open-financial-overview', openFinancialOverview);
      window.removeEventListener('avenor:open-cfo-brief', openCfoBrief);
    };
  }, []);

  useEffect(() => {
    const billingReturn = new URLSearchParams(window.location.search).get('billing');
    if (!billingReturn) return;
    setView('Plan & billing');
    if (billingReturn === 'success') setToast('Checkout completed. Confirming your subscription…');
    if (billingReturn === 'cancelled') setToast('Checkout cancelled. No payment was taken.');
    window.history.replaceState({}, '', window.location.pathname);
    window.setTimeout(() => setToast(''), 4200);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const organizationsResponse = await fetch('/api/organizations', { cache: 'no-store' });
        const organizationsData = await organizationsResponse.json();
        if (!organizationsResponse.ok) throw new Error(organizationsData.error || 'Could not load your workspace');

        const memberships = (organizationsData.organizations ?? []) as WorkspaceMembership[];
        if (cancelled) return;
        setWorkspaceMemberships(memberships);
        const rememberedId = localStorage.getItem('financeos.organizationId');
        const selected = memberships.find((item) => item.organization_id === rememberedId) ?? memberships[0];

        if (!selected) {
          window.location.assign('/onboarding');
          return;
        }

        const selectedOrganizationId = selected.organization_id;
        const organization = selected.organizations;
        localStorage.setItem('financeos.organizationId', selectedOrganizationId);
        document.cookie = `avenor_organization_id=${encodeURIComponent(selectedOrganizationId)}; Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;

        if (cancelled) return;
        setOrganizationId(selectedOrganizationId);
        setOrganizationName(organization?.name ?? 'Your company');
        setCurrency((organization?.base_currency ?? 'EUR').trim());

        const [modelsResponse, scenariosResponse, actualsResponse, contextResponse] = await Promise.all([
          fetch(`/api/models?organizationId=${encodeURIComponent(selectedOrganizationId)}`, { cache: 'no-store' }),
          fetch(`/api/scenarios?organizationId=${encodeURIComponent(selectedOrganizationId)}`, { cache: 'no-store' }),
          fetch(`/api/actuals?organizationId=${encodeURIComponent(selectedOrganizationId)}`, { cache: 'no-store' }),
          fetch(`/api/context?organizationId=${encodeURIComponent(selectedOrganizationId)}`, { cache: 'no-store' }),
        ]);

        const [modelsData, scenariosData, actualsData, contextData] = await Promise.all([
          modelsResponse.json(), scenariosResponse.json(), actualsResponse.json(), contextResponse.json(),
        ]);

        if (cancelled) return;
        if (!modelsResponse.ok) throw new Error(modelsData.error || 'Could not load financial models');

        const models = (modelsData.models ?? []) as ModelRow[];
        const latestModel = models[0];
        if (latestModel) {
          const assumptions = latestModel.assumptions as unknown as ModelInputs;
          setCash(Number(assumptions.openingCash ?? 0));
          setRevenue(Number(assumptions.monthlyRevenue ?? 0));
          setPayroll(Number(assumptions.existingMonthlyPayroll ?? 0));
          setOpex(Number(assumptions.monthlyOpexExPayroll ?? 0));
          setGrowth(Number(assumptions.monthlyRevenueGrowth ?? 0) * 100);
          setCogs(Number(assumptions.cogsRatio ?? 0) * 100);
          setHasModel(true);
          setModelStatus(latestModel.status === 'approved' ? 'approved' : 'draft');
          setModelVersionId(latestModel.id);
          setModelName(latestModel.name);
          setModelUpdatedAt(new Date(latestModel.created_at).toLocaleString('en-GB'));
        }

        if (scenariosResponse.ok) {
          const scenarios = (scenariosData.scenarios ?? []) as ScenarioRow[];
          setSaved(scenarios.map(toSavedDecision));
        }

        if (actualsResponse.ok) {
          setActualsCount(((actualsData.actuals ?? []) as unknown[]).length);
        }

        if (contextResponse.ok) {
          setCompanyContext(contextData.context ?? EMPTY_COMPANY_CONTEXT);
          setContextUpdatedAt(contextData.updatedAt ?? '');
        } else {
          setContextError(contextData.error || 'Company context could not be loaded');
        }
      } catch (error) {
        if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : 'Could not load your workspace');
      } finally {
        if (!cancelled) setWorkspaceLoading(false);
      }
    }

    void loadWorkspace();
    return () => { cancelled = true; };
  }, []);



  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    setCfoBrief(null);
    setInsightCount(0);
    fetch(`/api/brief?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load proactive insights');
        if (!active) return;
        const brief = (data.brief ?? null) as FounderBriefData | null;
        setCfoBrief(brief);
        const alerts = brief?.alerts ?? [];
        setInsightCount(alerts.filter((alert) => alert.severity === 'critical' || alert.severity === 'warning').length);
      })
      .catch(() => { if (active) setInsightCount(0); });
    return () => { active = false; };
  }, [organizationId, financialDataVersion]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setKpiLoading(true);
    setKpiError('');

    async function loadBusinessMetrics() {
      try {
        const response = await fetch(
          `/api/kpis?organizationId=${encodeURIComponent(organizationId)}&period=${encodeURIComponent(kpiPeriod)}`,
          { cache: 'no-store' },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load business metrics');

        if (cancelled) return;
        const values = data.kpis ?? {};
        setBusinessKpis({
          mrr: values.mrr === undefined ? '' : String(values.mrr),
          activeCustomers: values.activeCustomers === undefined ? '' : String(values.activeCustomers),
          newCustomers: values.newCustomers === undefined ? '' : String(values.newCustomers),
          churnedCustomers: values.churnedCustomers === undefined ? '' : String(values.churnedCustomers),
          marketingSpend: values.marketingSpend === undefined ? '' : String(values.marketingSpend),
          salesSpend: values.salesSpend === undefined ? '' : String(values.salesSpend),
          grossMarginPct: values.grossMarginPct === undefined ? '' : String(values.grossMarginPct),
        });
        setKpiHasData(Boolean(data.hasData));
      } catch (error) {
        if (!cancelled) setKpiError(error instanceof Error ? error.message : 'Could not load business metrics');
      } finally {
        if (!cancelled) setKpiLoading(false);
      }
    }

    void loadBusinessMetrics();
    return () => { cancelled = true; };
  }, [organizationId, kpiPeriod]);

  useEffect(() => {
    if (!organizationId || view !== 'Plan & billing') return;
    let cancelled = false;
    setBillingLoading(true);
    setBillingError('');
    fetch(`/api/billing/status?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load billing status');
        if (!cancelled) setBillingStatus(data);
      })
      .catch((error) => {
        if (!cancelled) setBillingError(error instanceof Error ? error.message : 'Could not load billing status');
      })
      .finally(() => { if (!cancelled) setBillingLoading(false); });
    return () => { cancelled = true; };
  }, [organizationId, view]);

  const inputs: ModelInputs = { ...initial, openingCash: cash, monthlyRevenue: revenue, existingMonthlyPayroll: payroll, monthlyOpexExPayroll: opex, monthlyRevenueGrowth: growth / 100, cogsRatio: cogs / 100 };
  const base = useMemo(() => forecast(inputs, [], months), [cash, revenue, payroll, opex, growth, cogs]);
  const baseSummary = summarize(base);
  const baseRunway = runway(base[0]);
  const chart = makeChart(base);
  const monthlyOperatingCosts = base[0].cogs + base[0].payroll + base[0].nonPayrollOpex;
  const flowMaximum = Math.max(base[0].revenue, monthlyOperatingCosts, 1);
  const importTotalsByCurrency = useMemo(() => {
    const totals = new Map<string, { inflows: number; outflows: number }>();
    for (const row of importRows) {
      const rowCurrency = (row.currency || currency).trim().toUpperCase();
      const current = totals.get(rowCurrency) ?? { inflows: 0, outflows: 0 };
      if (row.direction === 'inflow') current.inflows += row.amount;
      else current.outflows += row.amount;
      totals.set(rowCurrency, current);
    }
    return [...totals.entries()].map(([rowCurrency, amounts]) => ({ currency: rowCurrency, ...amounts }));
  }, [importRows, currency]);

  async function saveCompanyContext() {
    if (!organizationId) return;
    setContextBusy(true);
    setContextError('');
    try {
      const response = await fetch('/api/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, context: companyContext }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save company context');
      setCompanyContext(data.context ?? companyContext);
      setContextUpdatedAt(data.updatedAt ?? new Date().toISOString());
      setToast('Company context saved. Copilot will use it in future analyses.');
      window.setTimeout(() => setToast(''), 3200);
    } catch (cause) {
      setContextError(cause instanceof Error ? cause.message : 'Could not save company context');
    } finally {
      setContextBusy(false);
    }
  }

  async function saveModel(status: 'draft' | 'approved') {
    if (!organizationId) return;
    setModelBusy(true);
    setWorkspaceError('');
    try {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          name: modelName.trim() || 'Base financial plan',
          status,
          assumptions: inputs,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the financial model');

      setHasModel(true);
      setModelStatus(status);
      setModelVersionId(data.model.id);
      setModelName(data.model.name);
      setModelUpdatedAt(new Date(data.model.created_at).toLocaleString('en-GB'));
      setToast(status === 'approved' ? 'Financial model approved and saved' : 'Draft model saved to your workspace');
      window.dispatchEvent(new CustomEvent('avenor:financial-data-updated'));
      window.setTimeout(() => setToast(''), 2600);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'Could not save the financial model');
    } finally {
      setModelBusy(false);
    }
  }


  async function saveBusinessMetrics() {
    if (!organizationId) return;
    const kpis = Object.fromEntries(
      Object.entries(businessKpis)
        .filter(([, value]) => value.trim() !== '')
        .map(([key, value]) => [key, Number(value)]),
    );
    if (Object.keys(kpis).length === 0) {
      setKpiError('Enter at least one metric before saving.');
      return;
    }

    setKpiBusy(true);
    setKpiError('');
    try {
      const response = await fetch('/api/kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, period: kpiPeriod, kpis }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save business metrics');
      setKpiHasData(true);
      window.dispatchEvent(new CustomEvent('avenor:financial-data-updated'));
      setToast(`Business metrics saved for ${kpiPeriod}`);
      window.setTimeout(() => setToast(''), 2600);
    } catch (error) {
      setKpiError(error instanceof Error ? error.message : 'Could not save business metrics');
    } finally {
      setKpiBusy(false);
    }
  }

  async function signOut() {
    setSignOutBusy(true);
    setSignOutError('');
    try {
      const config = getSupabasePublicConfig();
      if (!config) throw new Error('Authentication is not configured.');

      const supabase = createBrowserClient(config.url, config.key);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      window.localStorage.removeItem('financeos.organizationId');
      document.cookie = 'avenor_organization_id=; Path=/; Max-Age=0; SameSite=Lax';
      window.location.replace('/login');
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Could not sign out. Please try again.');
      setSignOutBusy(false);
    }
  }

  async function exportWorkspaceData() {
    if (!organizationId || exportBusy) return;
    setExportBusy(true);
    setExportError('');
    try {
      const response = await fetch(`/api/privacy/export?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Could not export workspace data');
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `avenor-workspace-${organizationId}-export.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not export workspace data');
    } finally {
      setExportBusy(false);
    }
  }

  async function deleteWorkspaceData() {
    if (!organizationId || deleteWorkspaceBusy) return;
    const membership = workspaceMemberships.find((item) => item.organization_id === organizationId);
    if (membership?.role !== 'owner') {
      setDeleteWorkspaceError('Only the workspace owner can delete this workspace.');
      return;
    }
    const exactName = membership.organizations?.name ?? organizationName;
    if (!exactName || !window.confirm(`Delete ${exactName} and permanently remove its active workspace data? All workspace members will lose access. Export the data first if you need a copy.`)) return;
    const typedName = window.prompt(`Type the exact workspace name to continue:\n${exactName}`);
    if (typedName !== exactName) {
      setDeleteWorkspaceError('Workspace name did not match. Nothing was deleted.');
      return;
    }
    const typedPhrase = window.prompt('Final confirmation: type DELETE WORKSPACE');
    if (typedPhrase !== 'DELETE WORKSPACE') {
      setDeleteWorkspaceError('Confirmation phrase did not match. Nothing was deleted.');
      return;
    }

    setDeleteWorkspaceBusy(true);
    setDeleteWorkspaceError('');
    try {
      const response = await fetch('/api/privacy/delete-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, confirmationName: exactName, confirmationPhrase: typedPhrase }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Workspace deletion failed');
      window.localStorage.removeItem('financeos.organizationId');
      document.cookie = 'avenor_organization_id=; Path=/; Max-Age=0; SameSite=Lax';
      window.location.replace('/onboarding');
    } catch (error) {
      setDeleteWorkspaceError(error instanceof Error ? error.message : 'Workspace deletion failed');
      setDeleteWorkspaceBusy(false);
    }
  }

  async function openBillingAction(endpoint: '/api/billing/checkout' | '/api/billing/portal') {
    if (!organizationId) return;
    setBillingBusy(true);
    setBillingError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Billing request failed');
      if (typeof data.url !== 'string') throw new Error('The billing provider did not return a secure link');
      window.location.assign(data.url);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Billing request failed');
    } finally {
      setBillingBusy(false);
    }
  }

  const navGroups: { title: string; items: { label: View; title: string; icon: string }[] }[] = [
    { title: 'WORKSPACE', items: [
      { label: 'Overview', title: 'Avenor Intelligence', icon: '✳' },
      { label: 'CFO Brief', title: 'CFO Brief', icon: '◷' },
      { label: 'Financial overview', title: 'Financial overview', icon: '▦' },
    ] },
    { title: 'OPERATIONS', items: [
      { label: 'Business metrics', title: 'Growth metrics', icon: '↗' },
      { label: 'Data import', title: 'Import transactions', icon: '⇧' },
      { label: 'Fundraising planner', title: 'Fundraising planner', icon: '◇' },
      { label: 'Investor reporting', title: 'Investor update', icon: '▧' },
    ] },
    { title: 'RECORDS & SETTINGS', items: [
      { label: 'Decision ledger', title: 'Saved decisions', icon: '▤' },
      { label: 'Company assumptions', title: 'Company setup', icon: '⚙' },
      { label: 'Plan & billing', title: 'Plan & billing', icon: '€' },
    ] },
  ];

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">A</span><span>avenor</span></div>
      <label className={`workspace-switch workspace-switch-control ${workspaceMemberships.length > 1 ? 'is-switchable' : ''}`}>
        <div className="workspace-avatar">{organizationName.slice(0,1).toUpperCase() || 'A'}</div>
        <div><b>{organizationName || 'Your company'}</b><small>{workspaceMemberships.length > 1 ? 'Switch workspace' : 'Financial workspace'}</small></div>
        {workspaceMemberships.length > 1 && <span className="chevron" aria-hidden="true">⌄</span>}
        <select
          aria-label="Switch workspace"
          value={organizationId}
          disabled={workspaceMemberships.length < 2}
          onChange={(event) => {
            const nextOrganizationId = event.target.value;
            if (!nextOrganizationId || nextOrganizationId === organizationId) return;
            localStorage.setItem('financeos.organizationId', nextOrganizationId);
            document.cookie = `avenor_organization_id=${encodeURIComponent(nextOrganizationId)}; Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
            window.location.assign('/app');
          }}
        >
          {workspaceMemberships.map((membership) => (
            <option key={membership.organization_id} value={membership.organization_id}>
              {membership.organizations?.name ?? 'Your company'}
            </option>
          ))}
        </select>
      </label>
      <nav className="nav-groups">{navGroups.map(group => <div className="nav-group" key={group.title}><div className="nav-group-label">{group.title}</div><div className="nav-group-items">{group.items.map(item => <button key={item.label} className={`nav-item ${view === item.label ? 'selected' : ''}`} onClick={() => setView(item.label)}><span className="nav-icon">{item.icon}</span>{item.title}{item.label === 'Decision ledger' && saved.length > 0 && <span className="nav-count">{saved.length}</span>}{item.label === 'CFO Brief' && insightCount > 0 && <span className="nav-count">{insightCount}</span>}</button>)}</div></div>)}</nav>
      <div className="sidebar-bottom">
        <div className="profile">
          <div className="profile-avatar">A</div>
          <div><b>Workspace account</b><small>Signed-in user</small></div>
        </div>
        {['owner', 'admin'].includes(workspaceMemberships.find((item) => item.organization_id === organizationId)?.role ?? '') && <button className="signout-button" type="button" onClick={() => void exportWorkspaceData()} disabled={exportBusy || workspaceLoading}>
          {exportBusy ? 'Preparing export…' : 'Export workspace data'}
        </button>}
        {exportError && <p className="signout-error" role="alert">{exportError}</p>}
        <button className="signout-button" type="button" onClick={() => void signOut()} disabled={signOutBusy}>
          {signOutBusy ? 'Signing out…' : 'Sign out'}
        </button>
        {signOutError && <p className="signout-error" role="alert">{signOutError}</p>}
      </div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div className="breadcrumb">{organizationName || 'Your company'} <span>/</span> {viewTitles[view]}</div><div className="top-actions"><span className="sync-status"><i/> {workspaceLoading ? 'Loading workspace' : hasModel ? (modelStatus === 'approved' ? 'Plan approved' : 'Plan needs review') : 'Company setup needed'}</span><div className="top-avatar">{organizationName.slice(0,1).toUpperCase() || 'A'}</div></div></header>
      <div className={`page-content ${view === 'Overview' ? 'copilot-page' : ''}`}>
        {view !== 'Overview' && <div className="page-heading"><div><div className="overline">FINANCIAL WORKSPACE <span className="live-dot"/></div><h1>{viewTitles[view]}</h1><p>{view === 'CFO Brief' ? 'A clear management review of cash, performance, risks and recommended actions.' : view === 'Financial overview' ? 'Explore your cash position, operating forecast and the main signals in your financial plan.' : view === 'Decision ledger' ? 'Review scenarios you have saved and the assumptions behind them.' : view === 'Business metrics' ? 'Track the customer and revenue metrics behind your unit economics.' : view === 'Data import' ? 'Bring transactions into your workspace for historical analysis.' : view === 'Fundraising planner' ? 'Explore dilution and the cash impact of a potential round.' : view === 'Investor reporting' ? 'Review and export a snapshot of your current financial model.' : view === 'Plan & billing' ? 'Manage your subscription and payment details securely.' : 'Maintain the assumptions used in your company forecast.'}</p></div><div className="heading-actions"><span className="period-select">Last model update <b>{modelUpdatedAt || 'Not set'}</b></span><button className="button-secondary" onClick={() => setView('Company assumptions')}>Edit company setup <span>↗</span></button></div></div>}

        <div className={`copilot-host ${view === 'Overview' ? 'active' : 'inactive'}`}>
          <AvenorCopilot
            organizationId={organizationId}
            organizationName={organizationName}
            currency={currency}
            embedded
            contextCompletion={companyContextCompletion(companyContext)}
            hasFinancialModel={hasModel}
            hasImportedActuals={actualsCount > 0}
            insightCount={insightCount}
          />
        </div>

        {view === 'CFO Brief' && organizationId && <CfoBrief organizationId={organizationId} />}
        
        {view === 'Financial overview' && <>
          {workspaceLoading ? <section className="surface empty-state large-empty"><b>Loading your financial workspace…</b></section>
            : workspaceError ? <section className="surface empty-state large-empty"><b>Workspace could not be loaded</b><p>{workspaceError}</p><button className="button-secondary" onClick={() => window.location.reload()}>Retry</button></section>
            : !hasModel ? <section className="surface empty-state large-empty"><div className="empty-icon">◈</div><b>Add your company's starting numbers</b><p>Your workspace is ready. Add your starting cash, monthly revenue, team costs and other expenses. Avenor will use these figures to show how long your cash may last and help you compare decisions.</p><button className="button-primary" onClick={() => setView('Company assumptions')}>Set up company assumptions →</button></section>
            : <>
          <div className="notice"><span className="notice-icon">ⓘ</span><div><b>{modelStatus === 'approved' ? 'Your company plan is approved.' : 'Your company plan is a draft — review it before relying on the forecast.'}</b><span>{actualsCount > 0 ? `${actualsCount} actual records are stored in this workspace; they are not yet reconciled into the forecast.` : 'Forecasts are calculated from the saved assumptions shown in Company assumptions.'}</span></div><button onClick={() => setView('Company assumptions')}>Review assumptions <span>→</span></button></div>
          <div className="metric-grid">
             <Metric label="Starting cash" value={money(cash, currency)} sub="Cash entered in your company setup" trend="neutral" icon="◈" />
             <Metric label="Monthly revenue" value={money(base[0].revenue, currency)} sub={`${growth.toFixed(1)}% assumed monthly growth`} trend="positive" icon="↗" />
             <Metric label="Monthly spending" value={money(monthlyOperatingCosts, currency)} sub="Direct costs, team and other running costs" trend="neutral" icon="⌁" />
             <Metric label="How long cash may last" value={baseRunway === null ? 'Cash-flow positive' : `${baseRunway.toFixed(1)} months`} sub={baseRunway === null ? 'The current plan is not using cash each month' : 'Estimated at the current monthly cash burn'} trend={baseRunway !== null && baseRunway < 6 ? 'warning' : 'positive'} icon="◷" />
           </div>
          <FounderPulse organizationId={organizationId} currency={currency} brief={cfoBrief} refreshKey={financialDataVersion} />
          <section className="decision-intro">
            <div className="decision-intro-copy">
              <div className="section-kicker">THE AVENOR DIFFERENCE</div>
              <h2>Know what a decision will cost before you commit.</h2>
              <p>Avenor connects your company numbers to the choices in front of you — how much you can spend, how hiring changes your runway, and what to do next.</p>
            </div>
            <div className="decision-intro-actions">
              <button onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: 'What can we afford to spend while keeping at least 12 months of runway?' }))}>What can we afford?</button>
              <button onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: 'Can we afford another hire, and what happens to our runway?' }))}>Can we afford to hire?</button>
              <button onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: 'What happens if revenue is 20% lower than forecast for the next six months?' }))}>What if revenue slows?</button>
            </div>
          </section>
          <div className="dashboard-grid">
            <section className="surface chart-panel"><div className="surface-heading"><div><div className="section-kicker">YOUR CASH FORECAST</div><h2>How your cash may change</h2><p>One clear view of your expected cash balance over the next 18 months</p></div><span className="beta-pill">CURRENT PLAN</span></div><div className="chart-summary"><b>{money(baseSummary.endingCash, currency)}</b><span>Estimated cash after 18 months</span><span className="delta"><small>Based on your saved company plan</small></span></div><div className="chart-wrap">
              <svg viewBox="0 0 820 250" role="img" aria-label={`18-month cash forecast. Expected cash after 18 months: ${money(baseSummary.endingCash, currency)}.`}>
                <defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6a9b88" stopOpacity=".2"/><stop offset="100%" stopColor="#6a9b88" stopOpacity="0"/></linearGradient></defs>
                {chart.yTicks.map((tick, index) => <g key={index}><line x1="82" x2="796" y1={tick.y} y2={tick.y} className={Math.abs(tick.value) < 0.000001 ? 'zero-line' : 'grid-line'}/><text x="70" y={tick.y + 4} className="axis-label y-axis-label" textAnchor="end">{compactMoney(tick.value, currency)}</text></g>)}
                {chart.monthTicks.map(tick => <text key={tick.label} x={tick.x} y="230" className="axis-label" textAnchor="middle">{tick.label}</text>)}
                <path d={chart.baseArea} fill="url(#areaFill)"/><path d={chart.basePath} className="base-line"/>
                <circle cx={chart.baseX} cy={chart.baseY} r="5" className="base-point"/>
              </svg>
              <div className="chart-foot"><span>Forecast based on your saved assumptions</span><span>Not a live bank balance</span></div>
            </div></section><section className="surface signal-panel">
              <div className="surface-heading">
                <div><div className="section-kicker">MODEL SIGNALS</div><h2>What your forecast is flagging</h2><p>Simple checks from the current saved model.</p></div>
                <span className="beta-pill">18 MONTHS</span>
              </div>
              <div className="signal-list">
                <div className={baseSummary.firstMonthCashNegative ? 'signal-row critical' : 'signal-row'}>
                  <i />
                  <div><b>{baseSummary.firstMonthCashNegative ? 'Cash falls below zero' : 'Cash stays above zero'}</b><p>{baseSummary.firstMonthCashNegative ? 'The current forecast first goes negative in month ' + baseSummary.firstMonthCashNegative + '.' : 'No negative closing-cash month is identified in this 18-month forecast.'}</p></div>
                </div>
                <div className={baseSummary.firstMonthBelowSixMonthsRunway ? 'signal-row warning' : 'signal-row'}>
                  <i />
                  <div><b>{baseSummary.firstMonthBelowSixMonthsRunway ? 'Runway drops below six months' : 'No short-runway point flagged'}</b><p>{baseSummary.firstMonthBelowSixMonthsRunway ? 'The current forecast first falls below six months of runway in month ' + baseSummary.firstMonthBelowSixMonthsRunway + '.' : 'The current forecast does not identify a month below six months of runway.'}</p></div>
                </div>
                <div className="signal-row">
                  <i />
                  <div><b>{actualsCount.toLocaleString('en-GB')} imported transaction records</b><p>{actualsCount > 0 ? 'Historical actuals are available for analysis, but are not yet reconciled into the forecast.' : 'Import a CSV to give Avenor more historical context.'}</p></div>
                </div>
              </div>
              <button className="text-button" onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: { message: 'Review the main risks and assumptions in my current forecast. What should I look at first?', newConversation: true } }))}>Ask Avenor to review these signals →</button>
            </section>
          </div>
          <div className="lower-grid">
            <section className="surface flow-panel">
              <div className="surface-heading"><div><div className="section-kicker">MONTHLY MONEY FLOW</div><h2>Is the business earning more than it spends?</h2><p>Compare the money coming in with your regular operating costs</p></div></div>
              <div className="flow-bars">
                <div className="flow-item"><div className="flow-label"><span>Money coming in · revenue</span><b>{money(base[0].revenue, currency)}</b></div><div className="flow-track"><i className="flow-income" style={{width: `${Math.max(0, Math.min(100, base[0].revenue / flowMaximum * 100))}%`}}/></div></div>
                <div className="flow-item"><div className="flow-label"><span>Money going out · total costs</span><b>{money(monthlyOperatingCosts, currency)}</b></div><div className="flow-track"><i className="flow-costs" style={{width: `${Math.max(0, Math.min(100, monthlyOperatingCosts / flowMaximum * 100))}%`}}/></div><small>Direct costs + team + other running costs</small></div>
              </div>
              <div className="flow-result"><span>Estimated cash change this month</span><b className={base[0].netCashFlow >= 0 ? 'positive-text' : 'negative-text'}>{base[0].netCashFlow > 0 ? '+' : ''}{money(base[0].netCashFlow, currency)}</b></div>
            </section>
            <section className="surface decision-card"><div className="surface-heading"><div><div className="section-kicker">YOUR NEXT MOVES</div><h2>Decisions you have explored</h2></div><button className="text-button" onClick={() => setView('Decision ledger')}>View all →</button></div>{saved.length === 0 ? <div className="empty-state"><div className="empty-icon">⌁</div><b>No saved decisions yet</b><p>Try a hiring or growth decision. Save it here to compare options later.</p><button className="button-secondary" onClick={() => setView('Overview')}>Plan your first decision</button></div> : saved.slice(0,2).map(item => <DecisionRow key={item.id} item={item} currency={currency}/>)}</section>
          </div>
          <section className="surface table-panel cash-table-panel"><div className="surface-heading"><div><div className="section-kicker">THE NEXT SIX MONTHS</div><h2>How your cash could move month by month</h2><p>Use this breakdown to see the steps behind the forecast</p></div><button className="text-button" onClick={() => setView('Overview')}>Try a decision →</button></div><div className="table-scroll"><table><thead><tr><th>MONTH</th><th>REVENUE</th><th>NET CASH CHANGE</th><th>CASH LEFT</th><th>RUNWAY</th></tr></thead><tbody>{base.slice(0,6).map(row => <tr key={row.month}><td>Month {row.month}</td><td>{money(row.revenue, currency)}</td><td className={row.netCashFlow >= 0 ? 'positive-text' : 'negative-text'}>{row.netCashFlow > 0 ? '+' : ''}{money(row.netCashFlow, currency)}</td><td className="strong-cell">{money(row.closingCash, currency)}</td><td>{row.runwayMonths === null ? 'Cash-flow positive' : `${row.runwayMonths.toFixed(1)} mo.`}</td></tr>)}</tbody></table></div></section>
          <FinancialOperations
            organizationId={organizationId}
            currency={currency}
            forecastRows={base.slice(0, 6)}
            decisions={saved.slice(0, 3)}
            insightCount={insightCount}
            onOpenImport={() => setView('Data import')}
            onOpenBrief={() => setView('CFO Brief')}
            onOpenDecisions={() => setView('Decision ledger')}
          />
          <FinancialOperationsHub
            organizationId={organizationId}
            currency={currency}
          />
          </>}
        </>}

        {view === 'Decision ledger' && <section className="surface ledger-surface"><div className="surface-heading"><div><div className="section-kicker">DECISION HISTORY</div><h2>Your decision ledger</h2><p>Scenarios saved for review. Saving a scenario never changes the approved base plan.</p></div><button className="button-primary" onClick={() => setView('Overview')}>＋ New scenario</button></div>{saved.length === 0 ? <div className="empty-state large-empty"><div className="empty-icon">▤</div><b>Your ledger is ready</b><p>Once you save a scenario, it will appear here with its assumptions and projected cash impact.</p><button className="button-primary" onClick={() => setView('Overview')}>Build your first scenario →</button></div> : <div className="ledger-list">{saved.map(item => <DecisionRow key={item.id} item={item} detailed currency={currency} organizationId={organizationId}/>)}</div>}</section>}

        {view === 'Company assumptions' && <>
          <section className="surface assumptions-surface company-context-surface">
            <div className="section-kicker">PERSISTENT COMPANY MEMORY</div>
            <h2>Help Avenor understand your business</h2>
            <p className="form-intro">These founder-provided details stay in your workspace and are included in future Copilot conversations. They are business context, not verified accounting data.</p>
            <div className="form-section-title">WHAT YOU DO</div>
            <div className="form-grid">
              <label className="number-field"><span>Industry</span><input maxLength={100} value={companyContext.industry} onChange={e=>setCompanyContext(current=>({...current,industry:e.target.value}))} placeholder="e.g. B2B software"/></label>
              <label className="number-field"><span>Business model</span><select value={companyContext.businessModel} onChange={e=>setCompanyContext(current=>({...current,businessModel:e.target.value as CompanyContext['businessModel']}))}><option value="saas">SaaS / subscription</option><option value="marketplace">Marketplace</option><option value="services">Services</option><option value="ecommerce">E-commerce</option><option value="hardware">Hardware</option><option value="other">Other</option></select></label>
              <label className="number-field"><span>Company stage</span><select value={companyContext.stage} onChange={e=>setCompanyContext(current=>({...current,stage:e.target.value as CompanyContext['stage']}))}><option value="idea">Idea / validation</option><option value="pre-seed">Pre-seed</option><option value="seed">Seed</option><option value="series-a">Series A</option><option value="series-b">Series B+</option><option value="profitable">Profitable / bootstrapped</option><option value="other">Other</option></select></label>
              <label className="number-field"><span>Geography</span><input maxLength={160} value={companyContext.geography} onChange={e=>setCompanyContext(current=>({...current,geography:e.target.value}))} placeholder="e.g. France and Benelux"/></label>
              <label className="number-field"><span>Pricing model</span><input maxLength={160} value={companyContext.pricingModel} onChange={e=>setCompanyContext(current=>({...current,pricingModel:e.target.value}))} placeholder="e.g. €99 per seat / month"/></label>
              <label className="number-field"><span>Target customer</span><input maxLength={300} value={companyContext.targetCustomer} onChange={e=>setCompanyContext(current=>({...current,targetCustomer:e.target.value}))} placeholder="e.g. Finance teams at SaaS startups"/></label>
            </div>
            <label className="number-field"><span>Product or service description</span><textarea rows={3} maxLength={600} value={companyContext.productDescription} onChange={e=>setCompanyContext(current=>({...current,productDescription:e.target.value}))} placeholder="What do customers buy, and what problem do you solve?"/></label>
            <div className="form-section-title">GOALS & WATCH THRESHOLDS</div>
            <div className="form-grid">
              <label className="number-field"><span>Main company goal</span><input maxLength={240} value={companyContext.mainGoal} onChange={e=>setCompanyContext(current=>({...current,mainGoal:e.target.value}))} placeholder="e.g. Reach €50k MRR"/></label>
              <label className="number-field"><span>Next milestone</span><input maxLength={240} value={companyContext.nextMilestone} onChange={e=>setCompanyContext(current=>({...current,nextMilestone:e.target.value}))} placeholder="e.g. Prepare the next round"/></label>
              <NumberField label="Target runway" value={companyContext.targetRunwayMonths} set={n=>setCompanyContext(current=>({...current,targetRunwayMonths:n}))} min={3} max={36} step={1} suffix="months"/>
              <KpiField label="Monthly churn watch threshold (%)" value={companyContext.churnWatchThresholdPct===null?'':String(companyContext.churnWatchThresholdPct)} set={value=>setCompanyContext(current=>({...current,churnWatchThresholdPct:value.trim()===''?null:Number(value)}))} min="0" max="100" step="0.5"/>
              <KpiField label="CAC payback watch threshold (months)" value={companyContext.cacPaybackWatchMonths===null?'':String(companyContext.cacPaybackWatchMonths)} set={value=>setCompanyContext(current=>({...current,cacPaybackWatchMonths:value.trim()===''?null:Number(value)}))} min="0.1" max="60" step="0.5"/>
            </div>
            <label className="number-field"><span>Other context Avenor should remember</span><textarea rows={3} maxLength={1000} value={companyContext.founderNotes} onChange={e=>setCompanyContext(current=>({...current,founderNotes:e.target.value}))} placeholder="Constraints, planned launches, hiring plans or important assumptions."/></label>
            <div className="assumption-actions">
              <button className="button-primary" disabled={contextBusy || workspaceLoading} onClick={() => void saveCompanyContext()}>{contextBusy?'Saving…':'Save company context'}</button>
              <span>{companyContextCompletion(companyContext)}% complete · {contextUpdatedAt ? 'Updated '+new Date(contextUpdatedAt).toLocaleDateString('en-GB') : 'Not saved yet'} · Thresholds are your own planning preferences.</span>
            </div>
            {contextError && <p className="warning-text" role="alert">{contextError}</p>}
          </section>
          <section className="surface assumptions-surface"><div className="section-kicker">FINANCIAL MODEL INPUTS</div><h2>Company assumptions</h2><label className="number-field"><span>Model name</span><input type="text" maxLength={100} value={modelName} onChange={e=>setModelName(e.target.value)}/></label><p className="form-intro">Enter your company's starting position and recurring monthly economics. Save a draft for review or approve a model version to use as your planning baseline.</p><div className="form-section-title">CASH & REVENUE</div><div className="form-grid"><NumberField label="Opening cash balance" value={cash} set={setCash} min={0} max={100000000} step={10000} prefix={currencySymbol}/><NumberField label="Monthly revenue" value={revenue} set={setRevenue} min={0} max={10000000} step={5000} prefix={currencySymbol}/><NumberField label="Monthly revenue growth" value={growth} set={setGrowth} min={-99} max={100} step={.5} suffix="%"/><NumberField label="Direct costs as % of sales" value={cogs} set={setCogs} min={0} max={100} step={1} suffix="%"/></div><div className="form-section-title">OPERATING COSTS</div><div className="form-grid"><NumberField label="Current monthly team costs" value={payroll} set={setPayroll} min={0} max={10000000} step={5000} prefix={currencySymbol}/><NumberField label="Other monthly running costs" value={opex} set={setOpex} min={0} max={10000000} step={5000} prefix={currencySymbol}/></div><div className="assumption-actions"><button className="button-secondary" disabled={modelBusy || workspaceLoading} onClick={() => saveModel('draft')}>{modelBusy ? 'Saving…' : 'Save as draft'}</button><button className="button-primary" disabled={modelBusy || workspaceLoading} onClick={() => saveModel('approved')}>{modelBusy ? 'Saving…' : 'Approve & save model'}</button><span>Model status: {modelStatus === 'none' ? 'Not saved' : modelStatus}. Approval creates a new version; previous approved versions are archived.</span></div>{workspaceError && <p className="warning-text">{workspaceError}</p>}</section>
        </>}


        {view === 'Business metrics' && <section className="surface assumptions-surface">
          <div className="section-kicker">OPERATING PERFORMANCE & UNIT ECONOMICS</div>
          <h2>Monthly business metrics</h2>
          <p className="form-intro">Add the operating data Avenor needs to analyze acquisition efficiency, customer economics and retention. Blank fields remain unknown — Avenor will never treat missing values as zero.</p>
          <label className="number-field">
            <span>Reporting month</span>
            <input type="month" value={kpiPeriod} onChange={e => setKpiPeriod(e.target.value)} />
          </label>
          {kpiLoading ? <p className="form-intro">Loading metrics for this month…</p> : <p className="form-intro">{kpiHasData ? 'Saved metrics found for this month. Update any value and save again.' : 'No business metrics have been entered for this month yet.'}</p>}
          <div className="form-section-title">SALES & CUSTOMER BASE</div>
          <div className="form-grid">
            <KpiField label={`Monthly recurring revenue (${currency})`} value={businessKpis.mrr} set={value=>setBusinessKpis(current=>({...current,mrr:value}))} min="0" step="100"/>
            <KpiField label="Active customers (end of month)" value={businessKpis.activeCustomers} set={value=>setBusinessKpis(current=>({...current,activeCustomers:value}))} min="0" step="1"/>
            <KpiField label="New customers this month" value={businessKpis.newCustomers} set={value=>setBusinessKpis(current=>({...current,newCustomers:value}))} min="0" step="1"/>
            <KpiField label="Churned customers this month" value={businessKpis.churnedCustomers} set={value=>setBusinessKpis(current=>({...current,churnedCustomers:value}))} min="0" step="1"/>
          </div>
          <div className="form-section-title">CUSTOMER GROWTH COSTS</div>
          <div className="form-grid">
            <KpiField label={`Marketing spend (${currency})`} value={businessKpis.marketingSpend} set={value=>setBusinessKpis(current=>({...current,marketingSpend:value}))} min="0" step="100"/>
            <KpiField label={`Sales spend (${currency})`} value={businessKpis.salesSpend} set={value=>setBusinessKpis(current=>({...current,salesSpend:value}))} min="0" step="100"/>
            <KpiField label="Revenue left after direct costs (%)" value={businessKpis.grossMarginPct} set={value=>setBusinessKpis(current=>({...current,grossMarginPct:value}))} min="0" max="100" step="0.1"/>
          </div>
          <div className="assumption-warning">
            <span>ⓘ</span>
            <p><b>Use consistent definitions.</b> Active, new and churned customers must refer to the same customer population and month. Marketing and sales spend should use the same acquisition-cost scope. Avenor uses the saved figure as supplied and labels CAC/LTV as estimates.</p>
          </div>
          {kpiError && <p className="warning-text">{kpiError}</p>}
          <div className="assumption-actions">
            <button className="button-primary" disabled={kpiBusy || kpiLoading || workspaceLoading} onClick={() => void saveBusinessMetrics()}>{kpiBusy ? 'Saving…' : 'Save monthly business metrics'}</button>
            <span>{kpiHasData ? 'Existing values will be updated for this reporting month.' : 'Only non-empty fields will be saved.'}</span>
          </div>
        </section>}

        {view === 'Data import' && <section className="surface assumptions-surface"><div className="section-kicker">FINANCIAL DATA INGESTION</div><h2>Import your transactions</h2><p className="form-intro">{actualsCount} records are currently stored in this workspace. Imported actuals are kept separately and are not yet included in the forecast.</p><p className="form-intro">Upload a bank or accounting CSV export. Supported formats: comma, semicolon or tab separated; dates in YYYY-MM-DD or DD/MM/YYYY format; either Amount or separate Debit/Credit columns. Optional: Description, Category and Currency/Devise. If no currency is supplied, the workspace currency is used.</p><label className="number-field"><span>CSV file</span><input type="file" accept=".csv,text/csv" onChange={async e=>{setImportError('');setImportRows([]);const f=e.target.files?.[0];if(!f)return;try{if(f.size>2_000_000)throw new Error('Maximum file size is 2 MB');const {normalizeActuals}=await import('@/lib/csv');setImportRows(normalizeActuals(await f.text(),f.name));}catch(err){setImportError(err instanceof Error?err.message:'Could not parse CSV');}}}/></label>{importError&&<p className="warning-text">{importError}</p>}{importRows.length>0&&<><p><b>{importRows.length}</b> records ready for import · {importTotalsByCurrency.map((total) => `${money(total.inflows, total.currency)} inflows · ${money(total.outflows, total.currency)} outflows`).join(' · ')}</p><div className="ledger-list">{importRows.slice(0,5).map((r,i)=><div className="decision-row" key={`${r.period}-${i}`}><div className="decision-icon">{r.direction==='inflow'?'↗':'↘'}</div><div className="decision-copy"><b>{r.description||r.category}</b><span>{r.period} · {r.category}</span></div><div className="decision-impact"><b>{money(r.amount, r.currency ?? currency)}</b><small>{r.direction} · {r.currency ?? currency}</small></div></div>)}</div><button className="button-primary" disabled={importBusy} onClick={async()=>{setImportBusy(true);try{const organizationId=localStorage.getItem('financeos.organizationId');if(!organizationId)throw new Error('Create or select an authenticated workspace first.');const csvText=await new Promise<string>((resolve,reject)=>{const f=(document.querySelector('input[type=file]') as HTMLInputElement)?.files?.[0];if(!f){reject(new Error('Select a CSV file'));return;}f.text().then(resolve,reject);});const res=await fetch('/api/actuals/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId,csv:csvText})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Import failed');setToast(`${data.imported} records imported · ${data.skipped} duplicates skipped`);const actualsResponse=await fetch(`/api/actuals?organizationId=${encodeURIComponent(organizationId)}`,{cache:'no-store'});if(actualsResponse.ok){const actualsData=await actualsResponse.json();setActualsCount((actualsData.actuals??[]).length);}window.dispatchEvent(new CustomEvent('avenor:financial-data-updated'));setImportRows([]);}catch(err){setImportError(err instanceof Error?err.message:'Import failed');}finally{setImportBusy(false);}}}>{importBusy?'Importing…':'Import records to workspace →'}</button></>}</section>}

        {view === 'Fundraising planner' && <section className="surface assumptions-surface"><div className="section-kicker">FUNDRAISING INTELLIGENCE</div><h2>Model your next round</h2><p className="form-intro">Estimate dilution and cash runway after a hypothetical equity raise. This is a simplified planning calculator, not a valuation opinion.</p><div className="form-grid"><NumberField label="Amount to raise" value={raiseAmount} set={setRaiseAmount} min={0} max={100000000} step={50000} prefix={currencySymbol}/><NumberField label="Company value before investment" value={preMoney} set={setPreMoney} min={1} max={1000000000} step={250000} prefix={currencySymbol}/></div><div className="metric-grid"><Metric label="Estimated company value after investment" value={money(preMoney+raiseAmount, currency)} sub="Value before investment + new capital" trend="neutral" icon="◇"/><Metric label="Share owned by new investors" value={`${(raiseAmount/(preMoney+raiseAmount)*100).toFixed(1)}%`} sub="Before option-pool adjustments" trend="neutral" icon="%"/><Metric label="Cash after funding" value={money(cash+raiseAmount, currency)} sub="Excludes fees and other financing" trend="positive" icon="↗"/><Metric label="How long cash could last" value={base[0].netCashFlow<0?`${((cash+raiseAmount)/Math.abs(base[0].netCashFlow)).toFixed(1)} months`:'Cash positive'} sub="Flat current monthly net burn assumption" trend="neutral" icon="◷"/></div><p className="form-intro">This calculation assumes a simple priced equity round, no convertibles, no option-pool increase, no fees and no other dilution. Validate with legal and finance advisers.</p></section>}

        {view === 'Investor reporting' && <section className="surface ledger-surface"><div className="section-kicker">INVESTOR REPORTING</div><h2>Monthly financial snapshot</h2><p className="form-intro">A simple export from the current model assumptions. Do not share as actual company reporting until connected to verified company data.</p><div className="metric-grid"><Metric label="Monthly revenue" value={money(revenue, currency)} sub="Model assumption" trend="neutral" icon="↗"/><Metric label="Gross margin" value={`${((1-cogs/100)*100).toFixed(1)}%`} sub="Sales less direct costs" trend="neutral" icon="%"/><Metric label="Monthly net cash flow" value={money(base[0].netCashFlow, currency)} sub="Current model month" trend="neutral" icon="⌁"/><Metric label="Month 18 cash" value={money(baseSummary.endingCash, currency)} sub="Base case forecast" trend="neutral" icon="◈"/></div><button className="button-primary" onClick={()=>{const rows=['Month,Revenue,COGS,Payroll,Operating expenses,Net cash flow,Closing cash',...base.map(r=>[r.month,r.revenue,r.cogs,r.payroll,r.nonPayrollOpex,r.netCashFlow,r.closingCash].join(','))];const blob=new Blob([rows.join('\n')],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='financeos-18-month-forecast.csv';a.click();URL.revokeObjectURL(url);}}>Export 18-month forecast CSV ↓</button></section>}

        {view === 'Plan & billing' && <section className="surface billing-surface">
          <div className="section-kicker">ACCOUNT & SUBSCRIPTION</div>
          <h2>Plan and billing</h2>
          <p className="form-intro">One founder membership. Every Avenor feature is included in the same plan—there are no feature tiers.</p>
          <div className="billing-single-plan">
            <div><span className="plan-eyebrow">ONE SUBSCRIPTION</span><h3>Avenor Founder</h3><p>AI financial decision support, cash forecasting, scenario analysis, operating metrics and your saved decision history. First-time customers receive one 30-day trial; the subscription then renews at €59/month.</p></div>
            <div className="billing-single-price"><strong>€59</strong><span> / month · 30-day trial for new customers</span></div>
          </div>
          <ul className="billing-included">
            <li>Copilot with persistent conversation history</li>
            <li>18-month cash forecast and runway analysis</li>
            <li>Hiring, spending, pricing and fundraising scenarios</li>
            <li>CSV actuals and cash-movement analysis</li>
            <li>Business metrics and SaaS unit economics</li>
            <li>Decision Ledger and financial snapshots</li>
          </ul>
          {billingLoading ? <p className="form-intro">Checking your subscription…</p> : <>
            <div className="billing-grid">
              <div><span>Subscription status</span><b>{billingStatus?.subscriptionStatus === 'trialing' ? 'Free trial' : billingStatus?.subscriptionStatus ? billingStatus.subscriptionStatus.replaceAll('_', ' ') : 'No subscription linked'}</b></div>
              <div><span>{billingStatus?.subscriptionStatus === 'trialing' ? 'First payment date' : 'Next renewal'}</span><b>{billingStatus?.currentPeriodEnd ? new Date(billingStatus.currentPeriodEnd).toLocaleDateString('en-GB') : 'Not available'}</b></div>
              <div><span>Payment setup</span><b>{billingStatus?.billingConfigured ? 'Connected' : 'Not configured'}</b></div>
            </div>
            <div className="billing-actions">
              {billingStatus?.canManageBilling && <button className="button-secondary" disabled={billingBusy} onClick={() => void openBillingAction('/api/billing/portal')}>{billingBusy ? 'Opening…' : 'Manage subscription'}</button>}
              {billingStatus?.canStartCheckout && <button className="button-primary" disabled={billingBusy} onClick={() => void openBillingAction('/api/billing/checkout')}>{billingBusy ? 'Opening secure checkout…' : 'Restart — €59/month'}</button>}
              {!billingStatus?.billingConfigured && <p className="billing-note">Checkout is not connected yet. Configure the EUR 59/month price, 30-day trial and signed webhook in Stripe before accepting subscriptions.</p>}
            </div>
          </>}
          {billingError && <p className="warning-text" role="alert">{billingError}</p>}
          <p className="billing-footnote">No payment is taken from this screen. You will be redirected to Stripe to review and confirm any payment.</p>
          {workspaceMemberships.find((item) => item.organization_id === organizationId)?.role === 'owner' && <section className="surface danger-zone">
            <div className="section-kicker">DATA CONTROL</div>
            <h3>Export or delete this workspace</h3>
            <p className="form-intro">Export a JSON copy before deletion. Deleting a workspace cancels any linked Stripe subscription and removes the workspace's active records, models, scenarios, Copilot history and team memberships. Provider backups and legally required billing records may remain until their separate retention periods expire.</p>
            <div className="billing-actions">
              <button className="button-secondary" disabled={exportBusy || deleteWorkspaceBusy} onClick={() => void exportWorkspaceData()}>{exportBusy ? 'Preparing export…' : 'Export workspace data'}</button>
              <button className="button-secondary" disabled={deleteWorkspaceBusy || workspaceLoading} onClick={() => void deleteWorkspaceData()}>{deleteWorkspaceBusy ? 'Deleting workspace…' : 'Delete workspace and data'}</button>
            </div>
            {deleteWorkspaceError && <p className="warning-text" role="alert">{deleteWorkspaceError}</p>}
          </section>}
        </section>}

        {view !== 'Overview' && <footer className="app-footer"><span>Avenor <b>·</b> Private beta</span><span>{hasModel ? (modelStatus === 'approved' ? 'Approved financial model' : 'Draft financial model') : 'Financial model not configured'} · Not accounting or tax advice</span></footer>}
      </div>
    </section>
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </main>;
}

function runway(row: MonthResult): number | null { return row.runwayMonths; }
function Metric({label,value,sub,trend,icon}:{label:string;value:string;sub:string;trend:string;icon:string}) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><i>{icon}</i></div><b className="metric-value">{value}</b><small className={trend === 'warning' ? 'warning-text' : ''}>{sub}</small></div>; }
function KpiField({label,value,set,min,max,step}:{label:string;value:string;set:(v:string)=>void;min?:string;max?:string;step?:string}) { return <label className="number-field"><span>{label}</span><div className="number-input"><input type="number" min={min} max={max} step={step} value={value} placeholder="Not provided" onChange={e=>set(e.target.value)}/></div></label>; }
function NumberField({label,value,set,min,max,step=1,prefix,suffix}:{label:string;value:number;set:(n:number)=>void;min:number;max:number;step?:number;prefix?:string;suffix?:string}) { return <label className="number-field"><span>{label}</span><div className="number-input">{prefix && <i>{prefix}</i>}<input type="number" min={min} max={max} step={step} value={value} onChange={e=>set(Math.max(min,Math.min(max,Number(e.target.value))))}/>{suffix && <i>{suffix}</i>}</div></label>; }
function CompareBar({label,value,max,currency="EUR"}:{label:string;value:number;max:number;currency?:string}) { return <div className="compare-row"><div><span>{label}</span><b>{money(value,currency)}</b></div><div className="bar-track"><i style={{width:`${Math.max(0,Math.min(100,value/max*100))}%`}}/></div></div>; }
function DecisionRow({item,detailed=false,currency="EUR",organizationId=""}:{item:SavedDecision;detailed?:boolean;currency?:string;organizationId?:string}) {
  const amount = item.cashImpact;
  const [owner,setOwner] = useState(item.owner);
  const [reviewDate,setReviewDate] = useState(item.reviewDate);
  const [status,setStatus] = useState<SavedDecision['status']>(item.status);
  const [actualEndingCash,setActualEndingCash] = useState(item.actualEndingCash === null ? '' : String(item.actualEndingCash));
  const [actualOutcomeNote,setActualOutcomeNote] = useState(item.actualOutcomeNote);
  const [trackingBusy,setTrackingBusy] = useState(false);
  const [trackingError,setTrackingError] = useState('');
  const [trackingSaved,setTrackingSaved] = useState(false);
  async function saveTracking() {
    if (!organizationId) return;
    setTrackingBusy(true); setTrackingError(''); setTrackingSaved(false);
    try {
      const response = await fetch('/api/scenarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          scenarioId: item.id,
          owner,
          reviewDate: reviewDate || null,
          status,
          actualEndingCash: actualEndingCash.trim() === '' ? null : Number(actualEndingCash),
          actualOutcomeNote,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update this decision');
      setTrackingSaved(true);
    } catch (error) {
      setTrackingError(error instanceof Error ? error.message : 'Could not update this decision');
    } finally { setTrackingBusy(false); }
  }
  const actualDelta = actualEndingCash.trim() !== '' && item.forecastEndingCash !== null
    ? Number(actualEndingCash) - item.forecastEndingCash
    : null;
  return <div className="decision-row">
    <div className="decision-icon">⌁</div>
    <div className="decision-copy">
      <b>{item.title}</b><span>{item.detail}</span>
      {detailed && <>
        <small>Saved {item.created} · Scenario preserved independently of base plan</small>
        <div className="form-grid" style={{marginTop:12,gridTemplateColumns:'repeat(2,minmax(0,1fr))'}}>
          <label className="number-field"><span>Owner</span><input maxLength={120} value={owner} onChange={event=>setOwner(event.target.value)} placeholder="Assign a responsible person"/></label>
          <label className="number-field"><span>Review date</span><input type="date" value={reviewDate} onChange={event=>setReviewDate(event.target.value)}/></label>
          <label className="number-field"><span>Decision status</span><select value={status} onChange={event=>setStatus(event.target.value as SavedDecision['status'])}><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="reviewed">Reviewed</option><option value="completed">Completed</option><option value="paused">Paused</option></select></label>
          <label className="number-field"><span>Actual ending cash ({currency})</span><input type="number" value={actualEndingCash} onChange={event=>setActualEndingCash(event.target.value)} placeholder="Add when known"/></label>
        </div>
        {actualDelta !== null && Number.isFinite(actualDelta) && <small className={actualDelta < 0 ? 'negative-text' : 'positive-text'}>Actual vs scenario forecast: {actualDelta > 0 ? '+' : ''}{money(actualDelta,currency)}</small>}
        <label className="number-field" style={{display:'block',marginTop:8}}><span>Outcome / review notes</span><textarea rows={2} maxLength={1000} value={actualOutcomeNote} onChange={event=>setActualOutcomeNote(event.target.value)} placeholder="What happened compared with the original assumptions?"/></label>
        <div className="assumption-actions" style={{marginTop:8}}>
          <button className="button-secondary" type="button" disabled={trackingBusy} onClick={()=>void saveTracking()}>{trackingBusy?'Saving…':'Save review details'}</button>
          {trackingSaved && <span>Review details saved</span>}
        </div>
        {trackingError && <small className="warning-text" role="alert">{trackingError}</small>}
      </>}
    </div>
    <div className="decision-impact">
      {amount === null ? (
        <><b>—</b><small>{item.cashImpactLabel ?? '18-month closing-cash difference'}</small></>
      ) : (
        <><b className={amount < 0 ? 'negative-text' : amount > 0 ? 'positive-text' : ''}>{amount > 0 ? '+' : amount < 0 ? '−' : ''}{money(Math.abs(amount), currency)}</b><small>{item.cashImpactLabel}</small></>
      )}
    </div>
  </div>;
}
function makeChart(base: MonthResult[]) {
  const all = base.map(row => row.closingCash);
  const min = Math.min(0, ...all);
  const max = Math.max(...all, 1);
  const width = 820, left = 82, right = 24, top = 26, plotHeight = 174;
  const x = (index: number) => left + index * ((width - left - right) / Math.max(1, base.length - 1));
  const y = (value: number) => top + ((max - value) / (max - min || 1)) * plotHeight;
  const path = base.map((row, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(row.closingCash).toFixed(1)}`).join(' ');
  const zeroY = y(0);
  const last = base[base.length - 1];
  const monthIndices = [...new Set([0, Math.round((base.length - 1) / 3), Math.round((base.length - 1) * 2 / 3), base.length - 1])];
  const tickValues = [...new Set([max, max - ((max - min) / 3), max - (2 * (max - min) / 3), min, 0])].filter(value => value >= min && value <= max).sort((a, b) => b - a);
  return {
    basePath: path,
    baseArea: `${path} L ${x(base.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${x(0).toFixed(1)} ${zeroY.toFixed(1)} Z`,
    baseX: x(base.length - 1),
    baseY: y(last.closingCash),
    yTicks: tickValues.map(value => ({ value, y: y(value) })),
    monthTicks: monthIndices.map(index => ({ x: x(index), label: `Month ${base[index].month}` })),
  };
}
