'use client';

import { useEffect, useMemo, useState } from 'react';
import { forecast, summarize, type ModelInputs, type HireInput, type MonthResult } from '@/lib/finance';
import { AvenorCopilot } from '@/components/avenor-copilot';

type View = 'Overview' | 'Decision simulator' | 'Decision ledger' | 'Company assumptions' | 'Business metrics' | 'Data import' | 'Fundraising planner' | 'Investor reporting';
const money = (v: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const compact = (v: number) => new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
const initial: ModelInputs = { openingCash: 0, monthlyRevenue: 0, monthlyRevenueGrowth: 0, monthlyOpexExPayroll: 0, monthlyOpexGrowth: 0, cogsRatio: 0, existingMonthlyPayroll: 0, existingOtherNetCashAdjustments: 0 };
const months = 18;

type SavedDecision = { id: string; title: string; detail: string; cashImpact: number; runwayImpact: number; created: string };
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

export default function Home() {
  const [view, setView] = useState<View>('Overview');
  const [organizationId, setOrganizationId] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [currency, setCurrency] = useState('EUR');
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
          setSaved(scenarios.map((scenario) => ({
            id: scenario.id,
            title: scenario.name,
            detail: `${scenario.scenario_type} scenario · saved to this workspace`,
            cashImpact: Number(scenario.outputs.cashImpact ?? 0),
            runwayImpact: Number(scenario.outputs.runwayImpact ?? 0),
            created: new Date(scenario.created_at).toLocaleDateString('en-GB'),
          })));
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
  const chart = makeChart(base, scenario);

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
      const cashImpact = impact;
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
            runwayImpact,
            baseEndingCash: baseSummary.endingCash,
            scenarioEndingCash: scenarioSummary.endingCash,
            forecastMonths: months,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the scenario');

      const decision: SavedDecision = {
        id: data.scenario.id,
        title: name,
        detail: `Start month ${startMonth} · ${money(salary)} gross annual salary · ${employerRate}% employer-cost assumption`,
        cashImpact,
        runwayImpact,
        created: new Date(data.scenario.created_at).toLocaleDateString('en-GB'),
      };
      setSaved((items) => [decision, ...items]);
      setToast('Scenario saved to your Decision Ledger');
      window.setTimeout(() => setToast(''), 2600);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'Could not save the scenario');
    }
  }

  const nav: { label: View; icon: string }[] = [
    { label: 'Overview', icon: '◫' }, { label: 'Decision simulator', icon: '⌁' }, { label: 'Decision ledger', icon: '▤' }, { label: 'Business metrics', icon: '↗' }, { label: 'Data import', icon: '⇧' }, { label: 'Fundraising planner', icon: '◇' }, { label: 'Investor reporting', icon: '▧' }, { label: 'Company assumptions', icon: '⚙' },
  ];

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">A</span><span>avenor</span></div>
      <div className="workspace-switch"><div className="workspace-avatar">{organizationName.slice(0,1).toUpperCase() || 'A'}</div><div><b>{organizationName || 'Your company'}</b><small>Financial workspace</small></div><span className="chevron">⌄</span></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav>{nav.map(item => <button key={item.label} className={`nav-item ${view === item.label ? 'selected' : ''}`} onClick={() => setView(item.label)}><span className="nav-icon">{item.icon}</span>{item.label}{item.label === 'Decision ledger' && saved.length > 0 && <span className="nav-count">{saved.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon">✳</div><b>Make better decisions.</b><p>Model the impact before you commit.</p><button onClick={() => setView('Decision simulator')}>Explore simulator <span>→</span></button></div><div className="profile"><div className="profile-avatar">A</div><div><b>Workspace account</b><small>Signed-in user</small></div><span className="more">···</span></div></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div className="breadcrumb">{organizationName || 'Your company'} <span>/</span> {view}</div><div className="top-actions"><span className="sync-status"><i/> {workspaceLoading ? 'Loading workspace' : hasModel ? (modelStatus === 'approved' ? 'Approved model' : 'Draft model · review required') : 'Setup required'}</span><button className="icon-button" aria-label="Notifications">♧</button><div className="top-avatar">HT</div></div></header>
      <div className="page-content">
        <div className="page-heading"><div><div className="overline">FINANCIAL INTELLIGENCE <span className="live-dot"/></div><h1>{view === 'Overview' ? 'Your business at a glance' : view}</h1><p>{view === 'Overview' ? 'The few numbers that matter most, in one clear view.' : view === 'Decision simulator' ? 'Explore the financial impact of a decision before you make it.' : view === 'Decision ledger' ? 'A clear record of the decisions you have modelled.' : 'Control the assumptions behind your financial model.'}</p></div><div className="heading-actions"><span className="period-select">Last model update <b>{modelUpdatedAt || 'Not set'}</b></span><button className="button-secondary" onClick={() => setView('Company assumptions')}>Edit assumptions <span>↗</span></button></div></div>

        {view === 'Overview' && <>
          {workspaceLoading ? <section className="surface empty-state large-empty"><b>Loading your financial workspace…</b></section>
            : workspaceError ? <section className="surface empty-state large-empty"><b>Workspace could not be loaded</b><p>{workspaceError}</p><button className="button-secondary" onClick={() => window.location.reload()}>Retry</button></section>
            : !hasModel ? <section className="surface empty-state large-empty"><div className="empty-icon">◈</div><b>Set up your company's first financial model</b><p>Your workspace is connected. Add your opening cash, monthly revenue, payroll and operating expenses before using forecasts or decision scenarios. Avenor will save these assumptions to your private workspace.</p><button className="button-primary" onClick={() => setView('Company assumptions')}>Set up company assumptions →</button></section>
            : <>
          <div className="notice"><span className="notice-icon">ⓘ</span><div><b>{modelStatus === 'approved' ? 'Approved company financial model.' : 'Draft financial model — review before relying on projections.'}</b><span>{actualsCount > 0 ? `${actualsCount} actual records are stored in this workspace; they are not yet reconciled into the forecast.` : 'Forecasts are calculated from the saved assumptions shown in Company assumptions.'}</span></div><button onClick={() => setView('Company assumptions')}>Review assumptions <span>→</span></button></div>
          <div className="metric-grid">
            <Metric label="Cash available" value={money(cash)} sub="Starting cash in this example" trend="neutral" icon="◈" />
            <Metric label="Revenue this month" value={money(revenue)} sub={`${growth.toFixed(1)}% assumed monthly growth`} trend="positive" icon="↗" />
            <Metric label="Cash used this month" value={money(Math.max(0, -base[0].netCashFlow))} sub="After money coming in" trend="neutral" icon="⌁" />
            <Metric label="Time until cash runs out" value={baseRunway === null ? 'Cash positive' : `${baseRunway.toFixed(1)} months`} sub="Estimated at the current pace" trend={baseRunway !== null && baseRunway < 9 ? 'warning' : 'positive'} icon="◷" />
          </div>
          <div className="dashboard-grid">
            <section className="surface chart-panel"><div className="surface-heading"><div><div className="section-kicker">LOOKING AHEAD</div><h2>Will we have enough cash?</h2><p>Estimated cash balance over the next 18 months</p></div><div className="legend"><span><i className="legend-base"/>Base case</span><span><i className="legend-scenario"/>Hiring scenario</span></div></div><div className="chart-summary"><b>{money(baseSummary.endingCash)}</b><span>Projected cash at month 18</span><span className={`delta ${impact >= 0 ? 'negative' : 'positive'}`}>{impact >= 0 ? '−' : '+'}{money(Math.abs(impact))} <small>hiring impact</small></span></div><div className="chart-wrap"><svg viewBox="0 0 760 230" role="img" aria-label="18 month cash forecast chart"><defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6a9b88" stopOpacity=".18"/><stop offset="100%" stopColor="#6a9b88" stopOpacity="0"/></linearGradient></defs>{[35,85,135,185].map(y=><line key={y} x1="42" x2="744" y1={y} y2={y} className="grid-line"/>)}{chart.labels.map((m,i)=><text key={m} x={42+i*(702/17)} y="218" className="axis-label" textAnchor="middle">{i % 3 === 0 ? m : ''}</text>)}<path d={chart.baseArea} fill="url(#areaFill)"/><path d={chart.basePath} className="base-line"/><path d={chart.scenarioPath} className="scenario-line"/><circle cx="744" cy={chart.baseY} r="4" className="base-point"/><circle cx="744" cy={chart.scenarioY} r="4" className="scenario-point"/></svg><div className="chart-foot"><span>Forecast starts today</span><span>Workspace base currency · {currency}</span></div></div></section>
            <section className="surface copilot-panel"><div className="copilot-top"><div className="copilot-symbol">✳</div><span className="beta-pill">AI FINANCE TEAMMATE</span></div><div className="section-kicker">AVENOR INTELLIGENCE</div><h2>What would you like to understand?</h2><p className="copilot-description">Ask a question about your company. Explore the financial impact before making a decision.</p><div className="prompt-chips"><button onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: 'Can we afford to hire three engineers in January?' }))}>Can we afford to hire?</button><button onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: 'Explain our current runway and the main cash risks.' }))}>Explain our runway</button></div><div className="copilot-input"><textarea value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => {if (e.key === 'Enter' && !e.shiftKey) {e.preventDefault();setView('Decision simulator');analyze();}}} placeholder="Ask Avenor anything..."/><button aria-label="Analyse question" onClick={() => {setView('Decision simulator');analyze();}}>↑</button></div><small className="copilot-footnote">Ask across cash, revenue, costs, pricing, hiring, investment, fundraising and working capital.</small><button className="button-primary full-button" onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot'))}>Open Avenor companion <span>→</span></button></section>
          </div>
          <div className="lower-grid"><section className="surface table-panel"><div className="surface-heading"><div><div className="section-kicker">MONTH BY MONTH</div><h2>How your cash could change</h2></div><button className="text-button" onClick={() => setView('Decision simulator')}>Open simulator →</button></div><div className="table-scroll"><table><thead><tr><th>MONTH</th><th>MONEY IN</th><th>NET CHANGE</th><th>CASH LEFT</th><th>RUNWAY</th></tr></thead><tbody>{base.slice(0,6).map(row => <tr key={row.month}><td>Month {row.month}</td><td>{money(row.revenue)}</td><td className={row.netCashFlow >= 0 ? 'positive-text' : 'negative-text'}>{money(row.netCashFlow)}</td><td className="strong-cell">{money(row.closingCash)}</td><td>{row.runwayMonths === null ? '—' : `${row.runwayMonths.toFixed(1)} mo.`}</td></tr>)}</tbody></table></div></section><section className="surface decision-card"><div className="surface-heading"><div><div className="section-kicker">YOUR PLANS</div><h2>Decisions you have explored</h2></div><button className="text-button" onClick={() => setView('Decision ledger')}>View all →</button></div>{saved.length === 0 ? <div className="empty-state"><div className="empty-icon">⌁</div><b>No saved decisions yet</b><p>Try a hiring or growth scenario. Save it here to compare options later.</p><button className="button-secondary" onClick={() => setView('Decision simulator')}>Create first scenario</button></div> : saved.slice(0,2).map(item => <DecisionRow key={item.id} item={item}/>)}</section></div>
          </>}
        </>}

        {view === 'Decision simulator' && <div className="simulator-layout"><section className="surface simulator-form"><div className="section-kicker">SCENARIO BUILDER</div><h2>Model a hiring decision</h2><p className="form-intro">Change the assumptions below. Avenor recalculates the cash impact instantly without changing your base plan.</p><div className="form-section-title">HIRING PLAN</div><div className="form-grid"><NumberField label="Number of hires" value={headcount} set={setHeadcount} min={1} max={50} step={1}/><NumberField label="Start month" value={startMonth} set={setStartMonth} min={1} max={18} step={1} suffix="month"/><NumberField label="Gross annual salary / person" value={salary} set={setSalary} min={0} max={500000} step={1000} prefix="€"/><NumberField label="Employer cost assumption" value={employerRate} set={setEmployerRate} min={0} max={100} step={1} suffix="%"/><NumberField label="Benefits / person / month" value={benefits} set={setBenefits} min={0} max={10000} step={50} prefix="€"/><NumberField label="Recruitment / person" value={recruiting} set={setRecruiting} min={0} max={50000} step={100} prefix="€"/><NumberField label="Equipment / person" value={equipment} set={setEquipment} min={0} max={20000} step={100} prefix="€"/></div><div className="assumption-warning"><span>ⓘ</span><p><b>Employer-cost rate is an assumption.</b> The {employerRate}% rate is illustrative, not a verified French payroll calculation. Confirm the loaded cost with a qualified payroll provider.</p></div><button className="button-secondary full-button" onClick={() => {setHeadcount(3);setSalary(55000);setStartMonth(2);setEmployerRate(42);setBenefits(150);setRecruiting(2500);setEquipment(1500);}}>Reset to example scenario</button></section>
          <div className="simulator-results"><section className="surface result-hero"><div className="result-header"><div><div className="section-kicker">SCENARIO RESULT</div><h2>Hiring impact analysis</h2></div><span className="scenario-badge">Unsaved scenario</span></div><div className="result-metrics"><div><small>Recurring monthly cost</small><b>{money(monthlyHireCost)}</b><span>{headcount} hires · fully loaded estimate</span></div><div><small>One-off costs</small><b>{money(headcount * (recruiting + equipment))}</b><span>Recruitment + equipment</span></div><div><small>18-month cash impact</small><b className="negative-text">−{money(impact)}</b><span>Compared with base case</span></div></div><div className="result-explanation"><div className="explain-icon">✳</div><div><b>What this means</b><p>Under the current assumptions, this hiring plan reduces projected month-18 cash by <strong>{money(impact)}</strong>. No additional revenue or productivity benefit from these hires is assumed.</p></div></div><button className="button-primary" disabled={!hasModel} onClick={saveDecision}>Save to Decision Ledger <span>→</span></button></section>
            <section className="surface"><div className="surface-heading"><div><div className="section-kicker">BASE CASE VS. SCENARIO</div><h2>Cash position comparison</h2></div></div><div className="comparison-bars"><CompareBar label="Base case · month 18" value={baseSummary.endingCash} max={Math.max(baseSummary.endingCash,scenarioSummary.endingCash,1)}/><CompareBar label="Hiring scenario · month 18" value={scenarioSummary.endingCash} max={Math.max(baseSummary.endingCash,scenarioSummary.endingCash,1)}/></div><div className="runway-comparison"><div><small>Base case first-month runway</small><b>{baseRunway === null ? 'Cash positive' : `${baseRunway.toFixed(1)} months`}</b></div><div><small>Scenario first-month runway</small><b>{scenarioRunway === null ? 'Cash positive' : `${scenarioRunway.toFixed(1)} months`}</b></div></div></section>
            <section className="surface"><div className="surface-heading"><div><div className="section-kicker">AVENOR INTELLIGENCE</div><h2>Explore more than the hiring impact</h2></div><span className="beta-pill">FULL FINANCE ANALYSIS</span></div><p className="form-intro">Ask Avenor to combine this scenario with revenue changes, cost reductions, pricing, marketing investment, fundraising or working-capital decisions.</p><button className="button-primary full-button" onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot', { detail: question }))}>Continue this analysis with Avenor <span>→</span></button></section></div></div>}

        {view === 'Decision ledger' && <section className="surface ledger-surface"><div className="surface-heading"><div><div className="section-kicker">DECISION HISTORY</div><h2>Your decision ledger</h2><p>Scenarios saved for review. Saving a scenario never changes the approved base plan.</p></div><button className="button-primary" onClick={() => setView('Decision simulator')}>＋ New scenario</button></div>{saved.length === 0 ? <div className="empty-state large-empty"><div className="empty-icon">▤</div><b>Your ledger is ready</b><p>Once you save a scenario, it will appear here with its assumptions and projected cash impact.</p><button className="button-primary" onClick={() => setView('Decision simulator')}>Build your first scenario →</button></div> : <div className="ledger-list">{saved.map(item => <DecisionRow key={item.id} item={item} detailed/>)}</div>}</section>}

        {view === 'Company assumptions' && <section className="surface assumptions-surface"><div className="section-kicker">FINANCIAL MODEL INPUTS</div><h2>Company assumptions</h2><label className="number-field"><span>Model name</span><input type="text" maxLength={100} value={modelName} onChange={e=>setModelName(e.target.value)}/></label><p className="form-intro">Enter your company's starting position and recurring monthly economics. Save a draft for review or approve a model version to use as your planning baseline.</p><div className="form-section-title">CASH & REVENUE</div><div className="form-grid"><NumberField label="Opening cash balance" value={cash} set={setCash} min={0} max={100000000} step={10000} prefix="€"/><NumberField label="Monthly revenue" value={revenue} set={setRevenue} min={0} max={10000000} step={5000} prefix="€"/><NumberField label="Monthly revenue growth" value={growth} set={setGrowth} min={-99} max={100} step={.5} suffix="%"/><NumberField label="Cost of goods sold" value={cogs} set={setCogs} min={0} max={100} step={1} suffix="%"/></div><div className="form-section-title">OPERATING COSTS</div><div className="form-grid"><NumberField label="Existing monthly payroll" value={payroll} set={setPayroll} min={0} max={10000000} step={5000} prefix="€"/><NumberField label="Other monthly operating expenses" value={opex} set={setOpex} min={0} max={10000000} step={5000} prefix="€"/></div><div className="assumption-actions"><button className="button-secondary" disabled={modelBusy || workspaceLoading} onClick={() => saveModel('draft')}>{modelBusy ? 'Saving…' : 'Save as draft'}</button><button className="button-primary" disabled={modelBusy || workspaceLoading} onClick={() => saveModel('approved')}>{modelBusy ? 'Saving…' : 'Approve & save model'}</button><span>Model status: {modelStatus === 'none' ? 'Not saved' : modelStatus}. Approval creates a new version; previous approved versions are archived.</span></div>{workspaceError && <p className="warning-text">{workspaceError}</p>}</section>}


        {view === 'Business metrics' && <section className="surface assumptions-surface">
          <div className="section-kicker">OPERATING PERFORMANCE & UNIT ECONOMICS</div>
          <h2>Monthly business metrics</h2>
          <p className="form-intro">Add the operating data Avenor needs to analyze acquisition efficiency, customer economics and retention. Blank fields remain unknown — Avenor will never treat missing values as zero.</p>
          <label className="number-field">
            <span>Reporting month</span>
            <input type="month" value={kpiPeriod} onChange={e => setKpiPeriod(e.target.value)} />
          </label>
          {kpiLoading ? <p className="form-intro">Loading metrics for this month…</p> : <p className="form-intro">{kpiHasData ? 'Saved metrics found for this month. Update any value and save again.' : 'No business metrics have been entered for this month yet.'}</p>}
          <div className="form-section-title">RECURRING REVENUE & CUSTOMER BASE</div>
          <div className="form-grid">
            <KpiField label={`Monthly recurring revenue (${currency})`} value={businessKpis.mrr} set={value=>setBusinessKpis(current=>({...current,mrr:value}))} min="0" step="100"/>
            <KpiField label="Active customers (end of month)" value={businessKpis.activeCustomers} set={value=>setBusinessKpis(current=>({...current,activeCustomers:value}))} min="0" step="1"/>
            <KpiField label="New customers this month" value={businessKpis.newCustomers} set={value=>setBusinessKpis(current=>({...current,newCustomers:value}))} min="0" step="1"/>
            <KpiField label="Churned customers this month" value={businessKpis.churnedCustomers} set={value=>setBusinessKpis(current=>({...current,churnedCustomers:value}))} min="0" step="1"/>
          </div>
          <div className="form-section-title">ACQUISITION SPEND & MARGIN</div>
          <div className="form-grid">
            <KpiField label={`Marketing spend (${currency})`} value={businessKpis.marketingSpend} set={value=>setBusinessKpis(current=>({...current,marketingSpend:value}))} min="0" step="100"/>
            <KpiField label={`Sales spend (${currency})`} value={businessKpis.salesSpend} set={value=>setBusinessKpis(current=>({...current,salesSpend:value}))} min="0" step="100"/>
            <KpiField label="Gross margin (%) — period" value={businessKpis.grossMarginPct} set={value=>setBusinessKpis(current=>({...current,grossMarginPct:value}))} min="0" max="100" step="0.1"/>
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

        {view === 'Data import' && <section className="surface assumptions-surface"><div className="section-kicker">FINANCIAL DATA INGESTION</div><h2>Import your financial actuals</h2><p className="form-intro">{actualsCount} records are currently stored in this workspace. Imported actuals are kept separately and are not yet included in the forecast.</p><p className="form-intro">Upload a CSV export. Required columns: Date, Amount. Optional: Description, Category. Positive amounts are inflows; negative amounts are outflows. Use ISO dates (YYYY-MM-DD).</p><label className="number-field"><span>CSV file</span><input type="file" accept=".csv,text/csv" onChange={async e=>{setImportError('');setImportRows([]);const f=e.target.files?.[0];if(!f)return;try{if(f.size>2_000_000)throw new Error('Maximum file size is 2 MB');const {normalizeActuals}=await import('@/lib/csv');setImportRows(normalizeActuals(await f.text(),f.name));}catch(err){setImportError(err instanceof Error?err.message:'Could not parse CSV');}}}/></label>{importError&&<p className="warning-text">{importError}</p>}{importRows.length>0&&<><p><b>{importRows.length}</b> records ready for import · {money(importRows.filter(x=>x.direction==='inflow').reduce((a,x)=>a+x.amount,0))} inflows · {money(importRows.filter(x=>x.direction==='outflow').reduce((a,x)=>a+x.amount,0))} outflows</p><div className="ledger-list">{importRows.slice(0,5).map((r,i)=><div className="decision-row" key={`${r.period}-${i}`}><div className="decision-icon">{r.direction==='inflow'?'↗':'↘'}</div><div className="decision-copy"><b>{r.description||r.category}</b><span>{r.period} · {r.category}</span></div><div className="decision-impact"><b>{money(r.amount)}</b><small>{r.direction}</small></div></div>)}</div><button className="button-primary" disabled={importBusy} onClick={async()=>{setImportBusy(true);try{const organizationId=localStorage.getItem('financeos.organizationId');if(!organizationId)throw new Error('Create or select an authenticated workspace first.');const csvText=await new Promise<string>((resolve,reject)=>{const f=(document.querySelector('input[type=file]') as HTMLInputElement)?.files?.[0];if(!f){reject(new Error('Select a CSV file'));return;}f.text().then(resolve,reject);});const res=await fetch('/api/actuals/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId,csv:csvText})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Import failed');setToast(`${data.imported} records imported · ${data.skipped} duplicates skipped`);const actualsResponse=await fetch(`/api/actuals?organizationId=${encodeURIComponent(organizationId)}`,{cache:'no-store'});if(actualsResponse.ok){const actualsData=await actualsResponse.json();setActualsCount((actualsData.actuals??[]).length);}setImportRows([]);}catch(err){setImportError(err instanceof Error?err.message:'Import failed');}finally{setImportBusy(false);}}}>{importBusy?'Importing…':'Import records to workspace →'}</button></>}</section>}

        {view === 'Fundraising planner' && <section className="surface assumptions-surface"><div className="section-kicker">FUNDRAISING INTELLIGENCE</div><h2>Model your next round</h2><p className="form-intro">Estimate dilution and cash runway after a hypothetical equity raise. This is a simplified planning calculator, not a valuation opinion.</p><div className="form-grid"><NumberField label="Target raise" value={raiseAmount} set={setRaiseAmount} min={0} max={100000000} step={50000} prefix="€"/><NumberField label="Pre-money valuation" value={preMoney} set={setPreMoney} min={1} max={1000000000} step={250000} prefix="€"/></div><div className="metric-grid"><Metric label="Post-money valuation" value={money(preMoney+raiseAmount)} sub="Pre-money + new capital" trend="neutral" icon="◇"/><Metric label="New investor ownership" value={`${(raiseAmount/(preMoney+raiseAmount)*100).toFixed(1)}%`} sub="Before option-pool adjustments" trend="neutral" icon="%"/><Metric label="Cash after raise" value={money(cash+raiseAmount)} sub="Excludes fees and other financing" trend="positive" icon="↗"/><Metric label="Estimated runway" value={base[0].netCashFlow<0?`${((cash+raiseAmount)/Math.abs(base[0].netCashFlow)).toFixed(1)} months`:'Cash positive'} sub="Flat current monthly net burn assumption" trend="neutral" icon="◷"/></div><p className="form-intro">This calculation assumes a simple priced equity round, no convertibles, no option-pool increase, no fees and no other dilution. Validate with legal and finance advisers.</p></section>}

        {view === 'Investor reporting' && <section className="surface ledger-surface"><div className="section-kicker">INVESTOR REPORTING</div><h2>Monthly financial snapshot</h2><p className="form-intro">A simple export from the current model assumptions. Do not share as actual company reporting until connected to verified company data.</p><div className="metric-grid"><Metric label="Monthly revenue" value={money(revenue)} sub="Model assumption" trend="neutral" icon="↗"/><Metric label="Gross margin" value={`${((1-cogs/100)*100).toFixed(1)}%`} sub="Revenue less COGS" trend="neutral" icon="%"/><Metric label="Monthly net cash flow" value={money(base[0].netCashFlow)} sub="Current model month" trend="neutral" icon="⌁"/><Metric label="Month 18 cash" value={money(baseSummary.endingCash)} sub="Base case forecast" trend="neutral" icon="◈"/></div><button className="button-primary" onClick={()=>{const rows=['Month,Revenue,COGS,Payroll,Operating expenses,Net cash flow,Closing cash',...base.map(r=>[r.month,r.revenue,r.cogs,r.payroll,r.nonPayrollOpex,r.netCashFlow,r.closingCash].join(','))];const blob=new Blob([rows.join('\n')],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='financeos-18-month-forecast.csv';a.click();URL.revokeObjectURL(url);}}>Export 18-month forecast CSV ↓</button></section>}

        <footer className="app-footer"><span>Avenor <b>·</b> Private beta</span><span>{hasModel ? (modelStatus === 'approved' ? 'Approved financial model' : 'Draft financial model') : 'Financial model not configured'} · Not accounting or tax advice</span></footer>
      </div>
    </section>
    <AvenorCopilot organizationId={organizationId} organizationName={organizationName} currency={currency} />
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </main>;
}

function runway(row: MonthResult): number | null { return row.runwayMonths; }
function Metric({label,value,sub,trend,icon}:{label:string;value:string;sub:string;trend:string;icon:string}) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><i>{icon}</i></div><b className="metric-value">{value}</b><small className={trend === 'warning' ? 'warning-text' : ''}>{sub}</small></div>; }
function KpiField({label,value,set,min,max,step}:{label:string;value:string;set:(v:string)=>void;min?:string;max?:string;step?:string}) { return <label className="number-field"><span>{label}</span><div className="number-input"><input type="number" min={min} max={max} step={step} value={value} placeholder="Not provided" onChange={e=>set(e.target.value)}/></div></label>; }\nfunction NumberField({label,value,set,min,max,step=1,prefix,suffix}:{label:string;value:number;set:(n:number)=>void;min:number;max:number;step?:number;prefix?:string;suffix?:string}) { return <label className="number-field"><span>{label}</span><div className="number-input">{prefix && <i>{prefix}</i>}<input type="number" min={min} max={max} step={step} value={value} onChange={e=>set(Math.max(min,Math.min(max,Number(e.target.value))))}/>{suffix && <i>{suffix}</i>}</div></label>; }
function CompareBar({label,value,max}:{label:string;value:number;max:number}) { return <div className="compare-row"><div><span>{label}</span><b>{money(value)}</b></div><div className="bar-track"><i style={{width:`${Math.max(0,Math.min(100,value/max*100))}%`}}/></div></div>; }
function DecisionRow({item,detailed=false}:{item:SavedDecision;detailed?:boolean}) { return <div className="decision-row"><div className="decision-icon">⌁</div><div className="decision-copy"><b>{item.title}</b><span>{item.detail}</span>{detailed && <small>Saved {item.created} · Scenario preserved independently of base plan</small>}</div><div className="decision-impact"><b className="negative-text">−{money(item.cashImpact)}</b><small>18-month cash impact</small></div></div>; }
function makeChart(base:MonthResult[],scenario:MonthResult[]) { const all=[...base.map(x=>x.closingCash),...scenario.map(x=>x.closingCash)]; const min=Math.min(0,...all); const max=Math.max(...all,1); const x=(i:number)=>42+i*(702/17); const y=(v:number)=>185-(v-min)/(max-min)*150; const path=(arr:MonthResult[])=>arr.map((r,i)=>`${i===0?'M':'L'} ${x(i).toFixed(1)} ${y(r.closingCash).toFixed(1)}`).join(' '); const bp=path(base); const sp=path(scenario); return {labels:base.map((_,i)=>`M${i+1}`),basePath:bp,scenarioPath:sp,baseArea:`${bp} L 744 185 L 42 185 Z`,baseY:y(base[17].closingCash),scenarioY:y(scenario[17].closingCash)}; }
