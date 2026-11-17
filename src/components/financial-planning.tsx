'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ModelInputs } from '@/lib/finance';
import { calculateUnitEconomics, type CompanyKpis } from '@/lib/finance-intelligence';
import {
  buildForecastTrajectories, DEFAULT_FORECAST_SCENARIOS, deriveForecastAlerts,
  type ForecastScenarioAdjustment,
} from '@/lib/financial-planning';

type Props = { organizationId: string; organizationName: string; currency: string; inputs: ModelInputs; modelStatus: 'approved' | 'draft' | 'none' };
type BriefAlert = { id: string; severity: 'critical' | 'warning' | 'info'; title: string; description: string };
type KpiResponse = { kpis?: CompanyKpis; hasData?: boolean };

const money = (value: number | null | undefined, currency: string) => value === null || value === undefined || !Number.isFinite(value)
  ? '—'
  : new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
const pct = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`;
const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const previousMonth = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
};

export function FinancialPlanning({ organizationId, organizationName, currency, inputs, modelStatus }: Props) {
  const [adjustments, setAdjustments] = useState<ForecastScenarioAdjustment[]>(DEFAULT_FORECAST_SCENARIOS);
  const [period, setPeriod] = useState(monthKey(new Date()));
  const [kpis, setKpis] = useState<CompanyKpis>({});
  const [previousKpis, setPreviousKpis] = useState<CompanyKpis>({});
  const [hasCurrentKpis, setHasCurrentKpis] = useState(false);
  const [briefAlerts, setBriefAlerts] = useState<BriefAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportReady, setReportReady] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      fetch(`/api/kpis?organizationId=${encodeURIComponent(organizationId)}&period=${encodeURIComponent(period)}`, { cache: 'no-store' }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load current metrics'); return d as KpiResponse; }),
      fetch(`/api/kpis?organizationId=${encodeURIComponent(organizationId)}&period=${encodeURIComponent(previousMonth(period))}`, { cache: 'no-store' }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load previous metrics'); return d as KpiResponse; }),
      fetch(`/api/brief?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load CFO alerts'); return d; }),
    ]).then(([current, previous, brief]) => {
      if (!active) return;
      setKpis(current.kpis ?? {});
      setPreviousKpis(previous.kpis ?? {});
      setHasCurrentKpis(Boolean(current.hasData));
      setBriefAlerts((brief.brief?.alerts ?? []) as BriefAlert[]);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load financial intelligence'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, period]);

  const trajectories = useMemo(() => {
    try { return buildForecastTrajectories(inputs, adjustments, 18); }
    catch { return []; }
  }, [inputs, adjustments]);
  const central = trajectories.find(item => item.id === 'central');
  const prudent = trajectories.find(item => item.id === 'prudent');
  const optimistic = trajectories.find(item => item.id === 'optimistic');
  const fallbackMargin = (1 - inputs.cogsRatio) * 100;
  const unit = useMemo(() => calculateUnitEconomics(kpis, fallbackMargin), [kpis, fallbackMargin]);
  const monthlyBurn = central?.rows[0]?.burn ?? null;
  const mrrGrowth = kpis.mrr !== undefined && previousKpis.mrr !== undefined && previousKpis.mrr > 0
    ? ((kpis.mrr - previousKpis.mrr) / previousKpis.mrr) * 100 : null;
  const netNewArr = kpis.mrr !== undefined && previousKpis.mrr !== undefined
    ? (kpis.mrr - previousKpis.mrr) * 12 : null;
  const burnMultiple = monthlyBurn !== null && netNewArr !== null && netNewArr > 0 ? monthlyBurn / netNewArr : null;
  const forecastAlerts = deriveForecastAlerts(trajectories);
  const allAlerts = [...forecastAlerts, ...briefAlerts.filter(item => item.severity !== 'info')];
  const chartData = useMemo(() => (central?.rows ?? []).map((row, index) => ({
    month: `M${row.month}`,
    Prudent: prudent?.rows[index]?.closingCash ?? null,
    Central: row.closingCash,
    Optimistic: optimistic?.rows[index]?.closingCash ?? null,
  })), [central, prudent, optimistic]);

  function updateAdjustment(id: ForecastScenarioAdjustment['id'], field: 'revenueGrowthDeltaPp' | 'opexGrowthDeltaPp', value: number) {
    if (!Number.isFinite(value)) return;
    setAdjustments(current => current.map(item => item.id === id ? { ...item, [field]: Math.max(-50, Math.min(50, value)) } : item));
  }

  function downloadReport() {
    if (!central || !prudent || !optimistic) return;
    const lines = [
      `# Investor financial update — ${organizationName}`,
      `Generated: ${new Date().toLocaleString('en-GB')}`,
      '',
      '> Confidential management information. Forecasts are scenarios, not guarantees. Actual cash and performance must be verified against company records.',
      '',
      '## Current financial position',
      `- Opening cash in saved model: ${money(inputs.openingCash, currency)}`,
      `- Monthly revenue assumption: ${money(inputs.monthlyRevenue, currency)}`,
      `- Current monthly net burn in central forecast: ${money(monthlyBurn, currency)}`,
      `- Model status: ${modelStatus}`,
      `- Reporting period for operating metrics: ${period}`,
      '',
      '## Unit economics',
      `- MRR: ${money(unit.mrr, currency)}`,
      `- ARR: ${money(unit.arr, currency)}`,
      `- Revenue growth vs prior month: ${pct(mrrGrowth)}`,
      `- Gross margin: ${pct(unit.grossMarginPct)}`,
      `- Blended CAC: ${money(unit.cac, currency)}`,
      `- Gross-profit LTV: ${money(unit.ltv, currency)}`,
      `- LTV / CAC: ${unit.ltvToCac === null ? 'Not available' : unit.ltvToCac.toFixed(2) + 'x'}`,
      `- CAC payback: ${unit.cacPaybackMonths === null ? 'Not available' : unit.cacPaybackMonths.toFixed(1) + ' months'}`,
      `- Burn multiple: ${burnMultiple === null ? 'Not available (positive net new ARR for the same period is required)' : burnMultiple.toFixed(2) + 'x'}`,
      '',
      '## 18-month scenario outlook',
      '| Month | Prudent cash | Prudent runway | Central cash | Central runway | Optimistic cash | Optimistic runway |',
      '|---:|---:|---:|---:|---:|---:|---:|',
      ...central.rows.map((row, index) => {
        const p = prudent.rows[index]; const o = optimistic.rows[index];
        return `| ${row.month} | ${money(p.closingCash, currency)} | ${p.runwayMonths === null ? '—' : p.runwayMonths.toFixed(1) + ' mo'} | ${money(row.closingCash, currency)} | ${row.runwayMonths === null ? '—' : row.runwayMonths.toFixed(1) + ' mo'} | ${money(o.closingCash, currency)} | ${o.runwayMonths === null ? '—' : o.runwayMonths.toFixed(1) + ' mo'} |`;
      }),
      '',
      '## Key risks and alerts',
      ...(allAlerts.length ? allAlerts.map(alert => `- **${alert.severity.toUpperCase()} — ${alert.title}:** ${alert.description}`) : ['- No threshold alert was triggered by the currently available forecast and CFO brief data.']),
      '',
      '## Data limitations',
      ...unit.caveats.map(item => `- ${item}`),
      ...unit.missingData.map(item => `- Missing data: ${item}`),
      '- Forecasts are based on saved model assumptions; imported actuals are not automatically reconciled into the forecast.',
      '- The simplified operating cash forecast excludes taxes, VAT timing, debt schedules, working capital, deferred revenue, capex depreciation and FX unless explicitly supplied.',
      '',
      '## Scenario assumptions',
      ...adjustments.map(item => `- ${item.label}: revenue growth adjustment ${item.revenueGrowthDeltaPp >= 0 ? '+' : ''}${item.revenueGrowthDeltaPp} percentage points; operating-cost growth adjustment ${item.opexGrowthDeltaPp >= 0 ? '+' : ''}${item.opexGrowthDeltaPp} percentage points.`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `avenor-investor-report-${period}.md`;
    link.click();
    URL.revokeObjectURL(url);
    setReportReady(true);
  }

  const scenarioSummary = (scenario: typeof central) => scenario ? scenario.summary : null;
  const pSummary = scenarioSummary(prudent), cSummary = scenarioSummary(central), oSummary = scenarioSummary(optimistic);

  return <div className="avenor-planning">
    <section className="surface planning-intro">
      <div className="section-kicker">FINANCIAL PLANNING & INTELLIGENCE</div>
      <div className="planning-intro-row"><div><h2>See the three possible futures.</h2><p className="form-intro">Compare cash, runway and operating assumptions over 18 months. Every trajectory starts from the same saved financial model.</p></div><span className="beta-pill">{modelStatus === 'approved' ? 'APPROVED MODEL' : modelStatus === 'draft' ? 'DRAFT MODEL' : 'NO MODEL'}</span></div>
      {loading && <p className="form-intro">Loading your saved KPIs and CFO alerts…</p>}
      {error && <p className="warning-text" role="alert">{error}</p>}
      {!loading && !hasCurrentKpis && <p className="planning-note">No business metrics are saved for {period}. Unit economics will use only the gross margin from your financial model; enter monthly metrics in Growth metrics to complete CAC, LTV and burn multiple.</p>}
      <div className="planning-controls">
        <label className="number-field"><span>Reporting period</span><input type="month" value={period} onChange={event => setPeriod(event.target.value)} /></label>
        <button className="button-secondary" onClick={() => setAdjustments(DEFAULT_FORECAST_SCENARIOS)}>Reset scenario assumptions</button>
        <button className="button-primary" disabled={!central} onClick={downloadReport}>Download investor report ↓</button>
      </div>
      {reportReady && <small className="positive-text">Investor report generated from the current saved model and selected reporting period.</small>}
    </section>

    <section className="planning-section">
      <div className="surface-heading"><div><div className="section-kicker">01 / CASH & RUNWAY</div><h2>Three forecast trajectories</h2><p>Monthly closing cash and month-end runway, based on the same opening cash.</p></div><span className="beta-pill">18 MONTHS</span></div>
      <div className="planning-scenario-grid">
        {adjustments.map(item => {
          const summary = scenarioSummary(trajectories.find(row => row.id === item.id));
          return <div className="surface planning-scenario-card" key={item.id}>
            <div className="planning-scenario-heading"><b>{item.label}</b><span>{money(summary?.endingCash, currency)} at month 18</span></div>
            <div className="form-grid">
              <label className="number-field"><span>Revenue growth adjustment (pp)</span><input type="number" step="0.5" value={item.revenueGrowthDeltaPp} onChange={event => updateAdjustment(item.id, 'revenueGrowthDeltaPp', Number(event.target.value))}/></label>
              <label className="number-field"><span>OPEX growth adjustment (pp)</span><input type="number" step="0.5" value={item.opexGrowthDeltaPp} onChange={event => updateAdjustment(item.id, 'opexGrowthDeltaPp', Number(event.target.value))}/></label>
            </div>
            <small>Revenue growth: {pct((inputs.monthlyRevenueGrowth + item.revenueGrowthDeltaPp / 100) * 100)} · OPEX growth: {pct((inputs.monthlyOpexGrowth + item.opexGrowthDeltaPp / 100) * 100)}</small>
          </div>;
        })}
      </div>
      {trajectories.length === 3 && <div className="surface planning-chart">
        <div className="surface-heading"><div><h2>Cash balance over time</h2><p>All three scenarios shown together; edit the assumptions above to stress-test your plan.</p></div></div>
        <div className="planning-chart-canvas"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(value: number) => new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} tickLine={false} axisLine={false} width={58}/>
          <Tooltip formatter={(value) => money(Number(value), currency)} />
          <Legend />
          <Line type="monotone" dataKey="Prudent" stroke="#b77954" strokeWidth={2.2} dot={false} />
          <Line type="monotone" dataKey="Central" stroke="#315f4d" strokeWidth={2.8} dot={false} />
          <Line type="monotone" dataKey="Optimistic" stroke="#6b91a6" strokeWidth={2.2} dot={false} />
        </LineChart></ResponsiveContainer></div>
      </div>}
      <div className="surface planning-table">
        <div className="surface-heading"><div><h2>Month-by-month cash and runway</h2><p>Runway is calculated from each month's projected net burn; it is blank when cash flow is positive.</p></div></div>
        <div className="table-scroll"><table><thead><tr><th>Month</th><th>Prudent cash</th><th>Prudent runway</th><th>Central cash</th><th>Central runway</th><th>Optimistic cash</th><th>Optimistic runway</th></tr></thead>
          <tbody>{(central?.rows ?? []).map((row, index) => {
            const p = prudent!.rows[index], o = optimistic!.rows[index];
            return <tr key={row.month}><td className="strong-cell">{row.month}</td><td>{money(p.closingCash,currency)}</td><td>{p.runwayMonths === null ? '—' : `${p.runwayMonths.toFixed(1)} mo`}</td><td className="strong-cell">{money(row.closingCash,currency)}</td><td>{row.runwayMonths === null ? '—' : `${row.runwayMonths.toFixed(1)} mo`}</td><td>{money(o.closingCash,currency)}</td><td>{o.runwayMonths === null ? '—' : `${o.runwayMonths.toFixed(1)} mo`}</td></tr>;
          })}</tbody></table></div>
      </div>
      <div className="metric-grid planning-metric-grid">
        <div className="metric-card"><div className="metric-top">Prudent · month 18</div><b className="metric-value">{money(pSummary?.endingCash,currency)}</b><small>{pSummary?.firstMonthCashNegative ? `Negative cash from month ${pSummary.firstMonthCashNegative}` : 'No negative cash month in horizon'}</small></div>
        <div className="metric-card"><div className="metric-top">Central · month 18</div><b className="metric-value">{money(cSummary?.endingCash,currency)}</b><small>{cSummary?.firstMonthBelowSixMonthsRunway ? `Below 6 months runway in month ${cSummary.firstMonthBelowSixMonthsRunway}` : 'No sub-6-month runway point'}</small></div>
        <div className="metric-card"><div className="metric-top">Optimistic · month 18</div><b className="metric-value">{money(oSummary?.endingCash,currency)}</b><small>{oSummary?.firstMonthCashNegative ? `Negative cash from month ${oSummary.firstMonthCashNegative}` : 'No negative cash month in horizon'}</small></div>
      </div>
    </section>

    <section className="planning-section">
      <div className="surface-heading"><div><div className="section-kicker">02 / UNIT ECONOMICS</div><h2>Is growth becoming more efficient?</h2><p>Calculated from the selected month's saved business metrics and your financial model.</p></div></div>
      <div className="metric-grid planning-kpi-grid">
        <div className="metric-card"><div className="metric-top">Monthly recurring revenue</div><b className="metric-value">{money(unit.mrr,currency)}</b><small>ARR: {money(unit.arr,currency)}</small></div>
        <div className="metric-card"><div className="metric-top">Revenue growth</div><b className="metric-value">{pct(mrrGrowth)}</b><small>MRR change vs prior month</small></div>
        <div className="metric-card"><div className="metric-top">Gross margin</div><b className="metric-value">{pct(unit.grossMarginPct)}</b><small>Saved KPI or model-derived margin</small></div>
        <div className="metric-card"><div className="metric-top">Blended CAC</div><b className="metric-value">{money(unit.cac,currency)}</b><small>Marketing + sales spend / new customers</small></div>
        <div className="metric-card"><div className="metric-top">Gross-profit LTV</div><b className="metric-value">{money(unit.ltv,currency)}</b><small>Simple steady-state estimate</small></div>
        <div className="metric-card"><div className="metric-top">LTV / CAC</div><b className="metric-value">{unit.ltvToCac === null ? '—' : `${unit.ltvToCac.toFixed(2)}x`}</b><small>Cohort-based retention is not available</small></div>
        <div className="metric-card"><div className="metric-top">CAC payback</div><b className="metric-value">{unit.cacPaybackMonths === null ? '—' : `${unit.cacPaybackMonths.toFixed(1)} mo`}</b><small>Gross-profit payback estimate</small></div>
        <div className="metric-card"><div className="metric-top">Burn multiple</div><b className="metric-value">{burnMultiple === null ? '—' : `${burnMultiple.toFixed(2)}x`}</b><small>Forecast net burn / positive net new ARR</small></div>
      </div>
      <div className="surface planning-note"><b>Methodology and data gaps</b><ul>{unit.missingData.map(item => <li key={item}>{item}</li>)}{unit.caveats.map(item => <li key={item}>{item}</li>)}{!unit.missingData.length && <li>All required inputs for the displayed unit-economics calculations are present for this reporting period.</li>}</ul><small>Blended one-period estimates, not cohort-attributed CAC or LTV. Burn multiple is calculated only when current and previous month MRR are both available and MRR increased.</small></div>
    </section>

    <section className="planning-section">
      <div className="surface-heading"><div><div className="section-kicker">03 / PROACTIVE CFO</div><h2>Financial alerts worth acting on</h2><p>Forecast-based alerts are separated from alerts based on imported transaction history.</p></div></div>
      {allAlerts.length ? <div className="planning-alert-list">{allAlerts.map(alert => <div className={`planning-alert ${alert.severity}`} key={alert.id}><span>{alert.severity === 'critical' ? '!' : '•'}</span><div><b>{alert.title}</b><p>{alert.description}</p><small>{alert.id.includes('prudent') || alert.id.includes('central-low-runway') ? '18-month forecast scenario' : 'CFO Brief · saved model and imported records'}</small></div></div>)}</div> : <div className="surface planning-note">No forecast threshold or CFO warning is currently triggered by the available data. Missing data can still limit the analysis.</div>}
    </section>
  </div>;
}
