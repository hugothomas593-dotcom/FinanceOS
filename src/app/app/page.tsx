'use client';

import { useEffect, useMemo, useState } from 'react';
import { forecast, summarize, type ModelInputs, type HireInput, type MonthResult } from '@/lib/finance';
import { AvenorCopilot } from '@/components/avenor-copilot';

type View = 'Overview' | 'Decision simulator' | 'Decision ledger' | 'Company assumptions' | 'Business metrics' | 'Data import' | 'Fundraising planner' | 'Investor reporting' | 'Plan & billing';
const viewTitles: Record<View, string> = {
  Overview: 'Your finance copilot',
  'Decision simulator': 'Plan a decision',
  'Decision ledger': 'Saved decisions',
  'Company assumptions': 'Company setup',
  'Business metrics': 'Growth metrics',
  'Data import': 'Import data',
  'Fundraising planner': 'Fundraising',
  'Investor reporting': 'Investor update',
  'Plan & billing': 'Billing',
};
const money = (v: number, currency = 'EUR') => new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
const compactMoney = (v: number, currency = 'EUR') => new Intl.NumberFormat('en-GB', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v);
const compact = (v: number) => new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
const initial: ModelInputs = { openingCash: 0, monthlyRevenue: 0, monthlyRevenueGrowth: 0, monthlyOpexExPayroll: 0, monthlyOpexGrowth: 0, cogsRatio: 0, existingMonthlyPayroll: 0, existingOtherNetCashAdjustments: 0 };
const months = 18;

type SavedDecision = { id: string; title: string; detail: string; cashImpact: number | null; cashImpactLabel?: string; created: string };
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
  return {
    id: scenario.id,
    title: scenario.name,
    detail: `${scenario.scenario_type} scenario · saved to this workspace`,
    cashImpact: impact.value,
    cashImpactLabel: impact.label,
    created: new Date(scenario.created_at).toLocaleDateString('en-GB'),
  };
}

export default function Home() {
  const [view, setView] = useState<View>('Overview');
  const [organizationId, setOrganizationId] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [currency, setCurrency] = useState('EUR');
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
  const [cash, setCash] = useState(initial.openingCash);
  const [revenue, setRevenue] = useState(initial.monthlyRevenue);
  const [payroll, setPayroll] = useState(initial.existingMonthlyPayroll);
  const [opex, setOpex] = useState(initial.monthlyOpexExPayroll);
  const [growth, setGrowth] = useState(initial.monthlyRevenueGrowth * 100);
  const [cogs, setCogs] = useState(initial.cogsRatio * 100);
  const [salary, setSalary] = useState(55_000);
  const [headcount, setHeadcount] = useState(3);
  const [startMonth, setStartMonth] = useState(2);
  const [employerRate, setEmployerRate] = useState(42);
  const [recruiting, setRecruiting] = useState(2_500);
  const [equipment, setEquipment] = useState(1_500);
  const [benefits, setBenefits] = useState(150);
  const [question, setQuestion] = useState('Can we hire three engineers in January?');
  const [saved, setSaved] = useState<SavedDecision[]>([]);
  const [toast, setToast] = useState('');

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
  const [importRows, setImportRows] = useState<{period:string;category:string;description:string;amount:number;direction:'inflow'|'outflow';source:string}[]>([]);
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
  } | null>(null);

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
        const rememberedId = localStorage.getItem('financeos.organizationId');
        const selected = memberships.find((item) => item.organization_id === rememberedId) ?? memberships[0];

        if (!selected) {
          window.location.assign('/onboarding');
          return;
        }

        const selectedOrganizationId = selected.organization_id;
        const organization = selected.organizations;
        localStorage.setItem('financeos.organizationId', selectedOrganizationId);

        if (cancelled) return;
        setOrganizationId(selectedOrganizationId);
        setOrganizationName(organization?.name ?? 'Your company');
        setCurrency((organization?.base_currency ?? 'EUR').trim());

        const [modelsResponse, scenariosResponse, actualsResponse] = await Promise.all([
          fetch(`/api/models?organizationId=${encodeURIComponent(selectedOrganizationId)}`, { cache: 'no-store' }),
          fetch(`/api/scenarios?organizationId=${encodeURIComponent(selectedOrganizationId)}`, { cache: 'no-store' }),
          fetch(`/api/actuals?organizationId=${encodeURIComponent(selectedOrganizationId)}`, { cache: 'no-store' }),
        ]);

        const [modelsData, scenariosData, actualsData] = await Promise.all([
          modelsResponse.json(), scenariosResponse.json(), actualsResponse.json(),
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
  const hire: HireInput = { headcount, startMonth: startMonth - 1, grossAnnualSalary: salary, employerCostRate: employerRate / 100, benefitsMonthlyPerPerson: benefits, recruitingCostPerPerson: recruiting, equipmentCostPerPerson: equipment, productivityRampMonths: 6 };
  const base = useMemo(() => forecast(inputs, [], months), [cash, revenue, payroll, opex, growth, cogs]);
  const scenario = useMemo(() => forecast(inputs, [hire], months), [cash, revenue, payroll, opex, growth, cogs, salary, headcount, startMonth, employerRate, recruiting, equipment, benefits]);
  const baseSummary = summarize(base);
  const scenarioSummary = summarize(scenario);
  const impact = baseSummary.endingCash - scenarioSummary.endingCash;
  const monthlyHireCost = headcount * (salary * (1 + employerRate / 100) / 12 + benefits);
  const baseRunway = runway(base[0]);
  const scenarioRunway = runway(scenario[0]);
  const chart = makeChart(base);
  const monthlyOperatingCosts = base[0].cogs + base[0].payroll + base[0].nonPayrollOpex;
  const flowMaximum = Math.max(base[0].revenue, monthlyOperatingCosts, 1);

  function analyze() {
    window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: question }));
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
      setToast(`Business metrics saved for ${kpiPeriod}`);
      window.setTimeout(() => setToast(''), 2600);
    } catch (error) {
      setKpiError(error instanceof Error ? error.message : 'Could not save business metrics');
    } finally {
      setKpiBusy(false);
    }
  }

  async function saveDecision() {
    if (!organizationId || !hasModel) {
      setToast('Save your company assumptions before creating a scenario');
      window.setTimeout(() => setToast(''), 2600);
      return;
    }

    try {
      const name = `${headcount} engineer hire scenario`;
      const cashDelta = scenarioSummary.endingCash - baseSummary.endingCash;
      const cashImpact = Math.max(0, -cashDelta);
      const runwayImpact = (baseRunway ?? 0) - (scenarioRunway ?? 0);
      const response = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          modelVersionId: modelVersionId || null,
          name,
          scenarioType: 'hiring',
          assumptions: { modelInputs: inputs, hire },
          outputs: {
            cashImpact,
            cashDelta,
            runwayImpact,
            baseEndingCash: baseSummary.endingCash,
            scenarioEndingCash: scenarioSummary.endingCash,
            forecastMonths: months,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the scenario');

      const decision = toSavedDecision(data.scenario as ScenarioRow);
      setSaved((items) => [decision, ...items.filter((item) => item.id !== decision.id)]);
      setToast('Scenario saved to your Decision Ledger');
      window.setTimeout(() => setToast(''), 2600);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'Could not save the scenario');
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

  const nav: { label: View; title: string; icon: string }[] = [
    { label: 'Overview', title: 'Copilot', icon: '✳' },
    { label: 'Decision simulator', title: 'Plan a decision', icon: '⌁' },
    { label: 'Decision ledger', title: 'Saved decisions', icon: '▤' },
    { label: 'Business metrics', title: 'Growth metrics', icon: '↗' },
    { label: 'Data import', title: 'Import data', icon: '⇧' },
    { label: 'Fundraising planner', title: 'Fundraising', icon: '◇' },
    { label: 'Investor reporting', title: 'Investor update', icon: '▧' },
    { label: 'Company assumptions', title: 'Company setup', icon: '⚙' },
    { label: 'Plan & billing', title: 'Billing', icon: '€' },
  ];

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">A</span><span>avenor</span></div>
      <div className="workspace-switch"><div className="workspace-avatar">{organizationName.slice(0,1).toUpperCase() || 'A'}</div><div><b>{organizationName || 'Your company'}</b><small>Financial workspace</small></div><span className="chevron">⌄</span></div>
      <div className="nav-caption">YOUR FINANCE WORKSPACE</div>
      <nav>{nav.map(item => <button key={item.label} className={`nav-item ${view === item.label ? 'selected' : ''}`} onClick={() => setView(item.label)}><span className="nav-icon">{item.icon}</span>{item.title}{item.label === 'Decision ledger' && saved.length > 0 && <span className="nav-count">{saved.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon">?</div><b>Work through a decision</b><p>Ask Avenor what the numbers mean before you commit.</p><button onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot'))}>Ask Avenor <span>→</span></button></div><div className="profile"><div className="profile-avatar">A</div><div><b>Workspace account</b><small>Signed-in user</small></div><span className="more">···</span></div></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div className="breadcrumb">{organizationName || 'Your company'} <span>/</span> {viewTitles[view]}</div><div className="top-actions"><span className="sync-status"><i/> {workspaceLoading ? 'Loading workspace' : hasModel ? (modelStatus === 'approved' ? 'Plan approved' : 'Plan needs review') : 'Add company numbers'}</span><button className="button-secondary" onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot'))}>Open Copilot</button><div className="top-avatar">{organizationName.slice(0,1).toUpperCase() || 'A'}</div></div></header>
      <div className="page-content">
        <div className="page-heading"><div><div className="overline">{view === 'Overview' ? 'AVENOR INTELLIGENCE' : 'FINANCIAL WORKSPACE'} <span className="live-dot"/></div><h1>{viewTitles[view]}</h1><p>{view === 'Overview' ? 'Start with a question. Avenor brings your company numbers into the conversation and helps you test the next decision.' : view === 'Decision simulator' ? 'Compare the financial impact of a decision before you make it.' : view === 'Decision ledger' ? 'Review scenarios you have saved and the assumptions behind them.' : view === 'Business metrics' ? 'Track the customer and revenue metrics behind your unit economics.' : view === 'Data import' ? 'Bring transactions into your workspace for historical analysis.' : view === 'Fundraising planner' ? 'Explore dilution and the cash impact of a potential round.' : view === 'Investor reporting' ? 'Review and export a snapshot of your current financial model.' : view === 'Plan & billing' ? 'Manage your subscription and payment details securely.' : 'Maintain the assumptions used in your company forecast.'}</p></div><div className="heading-actions"><span className="period-select">Last model update <b>{modelUpdatedAt || 'Not set'}</b></span><button className="button-secondary" onClick={() => setView('Company assumptions')}>Edit company setup <span>↗</span></button></div></div>

        {view === 'Overview' && <section className="copilot-home">
          <div className="copilot-home-main">
            <div className="copilot-home-label"><span>a</span> YOUR AI FINANCE PARTNER</div>
            <h2>What decision are you working through?</h2>
            <p className="copilot-home-description">Ask in plain language. Avenor uses your saved financial plan, actuals and operating metrics to model the options and explain the trade-offs.</p>
            <div className="copilot-home-compose">
              <textarea
                aria-label="Ask Avenor about a financial decision"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: { message: question, newConversation: true } }));
                  }
                }}
                placeholder="For example: can we afford two new hires and still keep 12 months of runway?"
                rows={2}
                maxLength={4000}
              />
              <button
                disabled={!organizationId || !question.trim()}
                onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: { message: question, newConversation: true } }))}
              >Ask Avenor <span>↑</span></button>
            </div>
            <div className="copilot-home-suggestions">
              <button onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: { message: 'Can we afford to hire another person and keep at least 12 months of runway?', newConversation: true } }))}>Can we afford another hire?</button>
              <button onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: { message: 'What happens to our cash if revenue is 20% lower for the next six months?', newConversation: true } }))}>What if revenue slows?</button>
              <button onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: { message: 'How much could we invest while keeping 12 months of runway?', newConversation: true } }))}>What can we afford to invest?</button>
            </div>
          </div>
          <aside className="copilot-home-side">
            <span>HOW AVENOR HELPS</span>
            <div className="copilot-home-value"><i>↗</i><div><b>Model the decision</b><p>Hiring, spending, pricing and funding scenarios.</p></div></div>
            <div className="copilot-home-value"><i>◷</i><div><b>See the cash impact</b><p>Runway, break-even and an 18-month outlook.</p></div></div>
            <div className="copilot-home-value"><i>✓</i><div><b>Keep the reasoning</b><p>Review assumptions and save decisions to your ledger.</p></div></div>
          </aside>
        </section>}
        
        {view === 'Overview' && <>
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
           </div><section className="decision-intro">
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
            <section className="surface decision-card"><div className="surface-heading"><div><div className="section-kicker">YOUR NEXT MOVES</div><h2>Decisions you have explored</h2></div><button className="text-button" onClick={() => setView('Decision ledger')}>View all →</button></div>{saved.length === 0 ? <div className="empty-state"><div className="empty-icon">⌁</div><b>No saved decisions yet</b><p>Try a hiring or growth decision. Save it here to compare options later.</p><button className="button-secondary" onClick={() => setView('Decision simulator')}>Plan your first decision</button></div> : saved.slice(0,2).map(item => <DecisionRow key={item.id} item={item} currency={currency}/>)}</section>
          </div>
          <section className="surface table-panel cash-table-panel"><div className="surface-heading"><div><div className="section-kicker">THE NEXT SIX MONTHS</div><h2>How your cash could move month by month</h2><p>Use this breakdown to see the steps behind the forecast</p></div><button className="text-button" onClick={() => setView('Decision simulator')}>Try a decision →</button></div><div className="table-scroll"><table><thead><tr><th>MONTH</th><th>REVENUE</th><th>NET CASH CHANGE</th><th>CASH LEFT</th><th>RUNWAY</th></tr></thead><tbody>{base.slice(0,6).map(row => <tr key={row.month}><td>Month {row.month}</td><td>{money(row.revenue, currency)}</td><td className={row.netCashFlow >= 0 ? 'positive-text' : 'negative-text'}>{row.netCashFlow > 0 ? '+' : ''}{money(row.netCashFlow, currency)}</td><td className="strong-cell">{money(row.closingCash, currency)}</td><td>{row.runwayMonths === null ? 'Cash-flow positive' : `${row.runwayMonths.toFixed(1)} mo.`}</td></tr>)}</tbody></table></div></section>
          </>}
        </>}

        {view === 'Decision simulator' && <div className="simulator-layout"><section className="surface simulator-form"><div className="section-kicker">SCENARIO BUILDER</div><h2>Model a hiring decision</h2><p className="form-intro">Change the assumptions below. Avenor recalculates the cash impact instantly without changing your base plan.</p><div className="form-section-title">HIRING PLAN</div><div className="form-grid"><NumberField label="Number of hires" value={headcount} set={setHeadcount} min={1} max={50} step={1}/><NumberField label="Start month" value={startMonth} set={setStartMonth} min={1} max={18} step={1} suffix="month"/><NumberField label="Gross yearly salary per hire" value={salary} set={setSalary} min={0} max={500000} step={1000} prefix={currencySymbol}/><NumberField label="Employer charges on salary" value={employerRate} set={setEmployerRate} min={0} max={100} step={1} suffix="%"/><NumberField label="Benefits / person / month" value={benefits} set={setBenefits} min={0} max={10000} step={50} prefix={currencySymbol}/><NumberField label="Recruitment / person" value={recruiting} set={setRecruiting} min={0} max={50000} step={100} prefix={currencySymbol}/><NumberField label="Equipment / person" value={equipment} set={setEquipment} min={0} max={20000} step={100} prefix={currencySymbol}/></div><div className="assumption-warning"><span>ⓘ</span><p><b>Employer-cost rate is an assumption.</b> The {employerRate}% rate is illustrative, not a verified French payroll calculation. Confirm the loaded cost with a qualified payroll provider.</p></div><button className="button-secondary full-button" onClick={() => {setHeadcount(3);setSalary(55000);setStartMonth(2);setEmployerRate(42);setBenefits(150);setRecruiting(2500);setEquipment(1500);}}>Reset to example scenario</button></section>
          <div className="simulator-results"><section className="surface result-hero"><div className="result-header"><div><div className="section-kicker">SCENARIO RESULT</div><h2>Hiring impact analysis</h2></div><span className="scenario-badge">Unsaved scenario</span></div><div className="result-metrics"><div><small>Recurring monthly cost</small><b>{money(monthlyHireCost, currency)}</b><span>{headcount} hires · fully loaded estimate</span></div><div><small>One-off costs</small><b>{money(headcount * (recruiting + equipment), currency)}</b><span>Recruitment + equipment</span></div><div><small>18-month cash impact</small><b className="negative-text">−{money(impact, currency)}</b><span>Compared with base case</span></div></div><div className="result-explanation"><div className="explain-icon">i</div><div><b>What this means</b><p>Under the current assumptions, this hiring plan reduces projected month-18 cash by <strong>{money(impact, currency)}</strong>. No additional revenue or productivity benefit from these hires is assumed.</p></div></div><button className="button-primary" disabled={!hasModel} onClick={saveDecision}>Save to Decision Ledger <span>→</span></button></section>
            <section className="surface"><div className="surface-heading"><div><div className="section-kicker">BASE CASE VS. SCENARIO</div><h2>Cash position comparison</h2></div></div><div className="comparison-bars"><CompareBar label="Base case · month 18" value={baseSummary.endingCash} max={Math.max(baseSummary.endingCash,scenarioSummary.endingCash,1)} currency={currency}/><CompareBar label="Hiring scenario · month 18" value={scenarioSummary.endingCash} max={Math.max(baseSummary.endingCash,scenarioSummary.endingCash,1)} currency={currency}/></div><div className="runway-comparison"><div><small>Base case first-month runway</small><b>{baseRunway === null ? 'Cash positive' : `${baseRunway.toFixed(1)} months`}</b></div><div><small>Scenario first-month runway</small><b>{scenarioRunway === null ? 'Cash positive' : `${scenarioRunway.toFixed(1)} months`}</b></div></div></section>
            <section className="surface"><div className="surface-heading"><div><div className="section-kicker">DECISION SUPPORT</div><h2>Explore the wider business impact</h2></div><span className="beta-pill">FULL FINANCE ANALYSIS</span></div><p className="form-intro">Ask Avenor to combine this scenario with revenue changes, cost reductions, pricing, marketing investment, fundraising or working-capital decisions.</p><button className="button-primary full-button" onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: question }))}>Continue this analysis with Avenor <span>→</span></button></section></div></div>}

        {view === 'Decision ledger' && <section className="surface ledger-surface"><div className="surface-heading"><div><div className="section-kicker">DECISION HISTORY</div><h2>Your decision ledger</h2><p>Scenarios saved for review. Saving a scenario never changes the approved base plan.</p></div><button className="button-primary" onClick={() => setView('Decision simulator')}>＋ New scenario</button></div>{saved.length === 0 ? <div className="empty-state large-empty"><div className="empty-icon">▤</div><b>Your ledger is ready</b><p>Once you save a scenario, it will appear here with its assumptions and projected cash impact.</p><button className="button-primary" onClick={() => setView('Decision simulator')}>Build your first scenario →</button></div> : <div className="ledger-list">{saved.map(item => <DecisionRow key={item.id} item={item} detailed currency={currency}/>)}</div>}</section>}

        {view === 'Company assumptions' && <section className="surface assumptions-surface"><div className="section-kicker">FINANCIAL MODEL INPUTS</div><h2>Company assumptions</h2><label className="number-field"><span>Model name</span><input type="text" maxLength={100} value={modelName} onChange={e=>setModelName(e.target.value)}/></label><p className="form-intro">Enter your company's starting position and recurring monthly economics. Save a draft for review or approve a model version to use as your planning baseline.</p><div className="form-section-title">CASH & REVENUE</div><div className="form-grid"><NumberField label="Opening cash balance" value={cash} set={setCash} min={0} max={100000000} step={10000} prefix={currencySymbol}/><NumberField label="Monthly revenue" value={revenue} set={setRevenue} min={0} max={10000000} step={5000} prefix={currencySymbol}/><NumberField label="Monthly revenue growth" value={growth} set={setGrowth} min={-99} max={100} step={.5} suffix="%"/><NumberField label="Direct costs as % of sales" value={cogs} set={setCogs} min={0} max={100} step={1} suffix="%"/></div><div className="form-section-title">OPERATING COSTS</div><div className="form-grid"><NumberField label="Current monthly team costs" value={payroll} set={setPayroll} min={0} max={10000000} step={5000} prefix={currencySymbol}/><NumberField label="Other monthly running costs" value={opex} set={setOpex} min={0} max={10000000} step={5000} prefix={currencySymbol}/></div><div className="assumption-actions"><button className="button-secondary" disabled={modelBusy || workspaceLoading} onClick={() => saveModel('draft')}>{modelBusy ? 'Saving…' : 'Save as draft'}</button><button className="button-primary" disabled={modelBusy || workspaceLoading} onClick={() => saveModel('approved')}>{modelBusy ? 'Saving…' : 'Approve & save model'}</button><span>Model status: {modelStatus === 'none' ? 'Not saved' : modelStatus}. Approval creates a new version; previous approved versions are archived.</span></div>{workspaceError && <p className="warning-text">{workspaceError}</p>}</section>}


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

        {view === 'Data import' && <section className="surface assumptions-surface"><div className="section-kicker">FINANCIAL DATA INGESTION</div><h2>Import your transactions</h2><p className="form-intro">{actualsCount} records are currently stored in this workspace. Imported actuals are kept separately and are not yet included in the forecast.</p><p className="form-intro">Upload a bank or accounting CSV export. Required columns: Date, Amount. Optional: Description, Category. Positive amounts are money received; negative amounts are money spent. Use ISO dates (YYYY-MM-DD).</p><label className="number-field"><span>CSV file</span><input type="file" accept=".csv,text/csv" onChange={async e=>{setImportError('');setImportRows([]);const f=e.target.files?.[0];if(!f)return;try{if(f.size>2_000_000)throw new Error('Maximum file size is 2 MB');const {normalizeActuals}=await import('@/lib/csv');setImportRows(normalizeActuals(await f.text(),f.name));}catch(err){setImportError(err instanceof Error?err.message:'Could not parse CSV');}}}/></label>{importError&&<p className="warning-text">{importError}</p>}{importRows.length>0&&<><p><b>{importRows.length}</b> records ready for import · {money(importRows.filter(x=>x.direction==='inflow').reduce((a,x)=>a+x.amount,0), currency)} inflows · {money(importRows.filter(x=>x.direction==='outflow').reduce((a,x)=>a+x.amount,0), currency)} outflows</p><div className="ledger-list">{importRows.slice(0,5).map((r,i)=><div className="decision-row" key={`${r.period}-${i}`}><div className="decision-icon">{r.direction==='inflow'?'↗':'↘'}</div><div className="decision-copy"><b>{r.description||r.category}</b><span>{r.period} · {r.category}</span></div><div className="decision-impact"><b>{money(r.amount, currency)}</b><small>{r.direction}</small></div></div>)}</div><button className="button-primary" disabled={importBusy} onClick={async()=>{setImportBusy(true);try{const organizationId=localStorage.getItem('financeos.organizationId');if(!organizationId)throw new Error('Create or select an authenticated workspace first.');const csvText=await new Promise<string>((resolve,reject)=>{const f=(document.querySelector('input[type=file]') as HTMLInputElement)?.files?.[0];if(!f){reject(new Error('Select a CSV file'));return;}f.text().then(resolve,reject);});const res=await fetch('/api/actuals/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId,csv:csvText})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Import failed');setToast(`${data.imported} records imported · ${data.skipped} duplicates skipped`);const actualsResponse=await fetch(`/api/actuals?organizationId=${encodeURIComponent(organizationId)}`,{cache:'no-store'});if(actualsResponse.ok){const actualsData=await actualsResponse.json();setActualsCount((actualsData.actuals??[]).length);}setImportRows([]);}catch(err){setImportError(err instanceof Error?err.message:'Import failed');}finally{setImportBusy(false);}}}>{importBusy?'Importing…':'Import records to workspace →'}</button></>}</section>}

        {view === 'Fundraising planner' && <section className="surface assumptions-surface"><div className="section-kicker">FUNDRAISING INTELLIGENCE</div><h2>Model your next round</h2><p className="form-intro">Estimate dilution and cash runway after a hypothetical equity raise. This is a simplified planning calculator, not a valuation opinion.</p><div className="form-grid"><NumberField label="Amount to raise" value={raiseAmount} set={setRaiseAmount} min={0} max={100000000} step={50000} prefix={currencySymbol}/><NumberField label="Company value before investment" value={preMoney} set={setPreMoney} min={1} max={1000000000} step={250000} prefix={currencySymbol}/></div><div className="metric-grid"><Metric label="Estimated company value after investment" value={money(preMoney+raiseAmount, currency)} sub="Value before investment + new capital" trend="neutral" icon="◇"/><Metric label="Share owned by new investors" value={`${(raiseAmount/(preMoney+raiseAmount)*100).toFixed(1)}%`} sub="Before option-pool adjustments" trend="neutral" icon="%"/><Metric label="Cash after funding" value={money(cash+raiseAmount, currency)} sub="Excludes fees and other financing" trend="positive" icon="↗"/><Metric label="How long cash could last" value={base[0].netCashFlow<0?`${((cash+raiseAmount)/Math.abs(base[0].netCashFlow)).toFixed(1)} months`:'Cash positive'} sub="Flat current monthly net burn assumption" trend="neutral" icon="◷"/></div><p className="form-intro">This calculation assumes a simple priced equity round, no convertibles, no option-pool increase, no fees and no other dilution. Validate with legal and finance advisers.</p></section>}

        {view === 'Investor reporting' && <section className="surface ledger-surface"><div className="section-kicker">INVESTOR REPORTING</div><h2>Monthly financial snapshot</h2><p className="form-intro">A simple export from the current model assumptions. Do not share as actual company reporting until connected to verified company data.</p><div className="metric-grid"><Metric label="Monthly revenue" value={money(revenue, currency)} sub="Model assumption" trend="neutral" icon="↗"/><Metric label="Gross margin" value={`${((1-cogs/100)*100).toFixed(1)}%`} sub="Sales less direct costs" trend="neutral" icon="%"/><Metric label="Monthly net cash flow" value={money(base[0].netCashFlow, currency)} sub="Current model month" trend="neutral" icon="⌁"/><Metric label="Month 18 cash" value={money(baseSummary.endingCash, currency)} sub="Base case forecast" trend="neutral" icon="◈"/></div><button className="button-primary" onClick={()=>{const rows=['Month,Revenue,COGS,Payroll,Operating expenses,Net cash flow,Closing cash',...base.map(r=>[r.month,r.revenue,r.cogs,r.payroll,r.nonPayrollOpex,r.netCashFlow,r.closingCash].join(','))];const blob=new Blob([rows.join('\n')],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='financeos-18-month-forecast.csv';a.click();URL.revokeObjectURL(url);}}>Export 18-month forecast CSV ↓</button></section>}

        {view === 'Plan & billing' && <section className="surface billing-surface">
          <div className="section-kicker">ACCOUNT & SUBSCRIPTION</div>
          <h2>Plan and billing</h2>
          <p className="form-intro">One founder membership. Every Avenor feature is included in the same plan—there are no feature tiers.</p>
          <div className="billing-single-plan">
            <div><span className="plan-eyebrow">ONE SUBSCRIPTION</span><h3>Avenor Founder</h3><p>AI financial decision support, cash forecasting, scenario analysis, operating metrics and your saved decision history.</p></div>
            <div className="billing-single-price"><strong>€59</strong><span> / month</span></div>
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
              <div><span>Subscription status</span><b>{billingStatus?.subscriptionStatus ? billingStatus.subscriptionStatus.replaceAll('_', ' ') : 'No subscription linked'}</b></div>
              <div><span>Next renewal</span><b>{billingStatus?.currentPeriodEnd ? new Date(billingStatus.currentPeriodEnd).toLocaleDateString('en-GB') : 'Not available'}</b></div>
              <div><span>Payment setup</span><b>{billingStatus?.billingConfigured ? 'Connected' : 'Not configured'}</b></div>
            </div>
            <div className="billing-actions">
              {billingStatus?.canManageBilling && <button className="button-secondary" disabled={billingBusy} onClick={() => void openBillingAction('/api/billing/portal')}>{billingBusy ? 'Opening…' : 'Manage subscription'}</button>}
              {!billingStatus?.subscriptionStatus && billingStatus?.canStartCheckout && <button className="button-primary" disabled={billingBusy} onClick={() => void openBillingAction('/api/billing/checkout')}>{billingBusy ? 'Opening secure checkout…' : 'Subscribe — €59/month'}</button>}
              {!billingStatus?.billingConfigured && <p className="billing-note">Online checkout is not connected yet. A Stripe test-mode price and secure server credentials must be configured before payments can be tested.</p>}
            </div>
          </>}
          {billingError && <p className="warning-text" role="alert">{billingError}</p>}
          <p className="billing-footnote">No payment is taken from this screen. You will be redirected to Stripe to review and confirm any payment.</p>
        </section>}

        <footer className="app-footer"><span>Avenor <b>·</b> Private beta</span><span>{hasModel ? (modelStatus === 'approved' ? 'Approved financial model' : 'Draft financial model') : 'Financial model not configured'} · Not accounting or tax advice</span></footer>
      </div>
    </section>
    <AvenorCopilot organizationId={organizationId} organizationName={organizationName} currency={currency} />
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </main>;
}

function runway(row: MonthResult): number | null { return row.runwayMonths; }
function Metric({label,value,sub,trend,icon}:{label:string;value:string;sub:string;trend:string;icon:string}) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><i>{icon}</i></div><b className="metric-value">{value}</b><small className={trend === 'warning' ? 'warning-text' : ''}>{sub}</small></div>; }
function KpiField({label,value,set,min,max,step}:{label:string;value:string;set:(v:string)=>void;min?:string;max?:string;step?:string}) { return <label className="number-field"><span>{label}</span><div className="number-input"><input type="number" min={min} max={max} step={step} value={value} placeholder="Not provided" onChange={e=>set(e.target.value)}/></div></label>; }
function NumberField({label,value,set,min,max,step=1,prefix,suffix}:{label:string;value:number;set:(n:number)=>void;min:number;max:number;step?:number;prefix?:string;suffix?:string}) { return <label className="number-field"><span>{label}</span><div className="number-input">{prefix && <i>{prefix}</i>}<input type="number" min={min} max={max} step={step} value={value} onChange={e=>set(Math.max(min,Math.min(max,Number(e.target.value))))}/>{suffix && <i>{suffix}</i>}</div></label>; }
function CompareBar({label,value,max,currency="EUR"}:{label:string;value:number;max:number;currency?:string}) { return <div className="compare-row"><div><span>{label}</span><b>{money(value,currency)}</b></div><div className="bar-track"><i style={{width:`${Math.max(0,Math.min(100,value/max*100))}%`}}/></div></div>; }
function DecisionRow({item,detailed=false,currency="EUR"}:{item:SavedDecision;detailed?:boolean;currency?:string}) {
  const amount = item.cashImpact;
  return <div className="decision-row">
    <div className="decision-icon">⌁</div>
    <div className="decision-copy">
      <b>{item.title}</b><span>{item.detail}</span>
      {detailed && <small>Saved {item.created} · Scenario preserved independently of base plan</small>}
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
