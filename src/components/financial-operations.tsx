'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MonthResult } from '@/lib/finance';
import { summarizeFinancialActivity, type FinancialActualRow } from '@/lib/financial-operations';
import styles from './financial-operations.module.css';

type ForecastPreview = Pick<MonthResult, 'month' | 'revenue' | 'cogs' | 'payroll' | 'nonPayrollOpex' | 'netCashFlow' | 'closingCash'>;
type DecisionPreview = {
  id: string;
  title: string;
  detail: string;
  cashImpact: number | null;
  cashImpactLabel?: string;
  created: string;
};

const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return value.toLocaleString('en-GB', { maximumFractionDigits: 0 }) + ' ' + currency;
  }
};

const monthLabel = (value: string) => {
  const date = new Date(value + '-01T00:00:00Z');
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
};

const dateTimeLabel = (value: string | null) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const csvCell = (value: string | number) => '"' + String(value).replace(/"/g, '""') + '"';

export function FinancialOperations({
  organizationId,
  currency,
  forecastRows,
  decisions,
  insightCount,
  onOpenImport,
  onOpenBrief,
  onOpenDecisions,
}: {
  organizationId: string;
  currency: string;
  forecastRows: ForecastPreview[];
  decisions: DecisionPreview[];
  insightCount: number;
  onOpenImport: () => void;
  onOpenBrief: () => void;
  onOpenDecisions: () => void;
}) {
  const [actuals, setActuals] = useState<FinancialActualRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadActuals = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/actuals?organizationId=' + encodeURIComponent(organizationId), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load imported financial activity');
      setActuals((data.actuals ?? []) as FinancialActualRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load imported financial activity');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void loadActuals(); }, [loadActuals]);

  const summary = useMemo(() => summarizeFinancialActivity(actuals, currency), [actuals, currency]);
  const latest = summary.months[summary.months.length - 1] ?? null;
  const nextForecast = forecastRows[0] ?? null;
  const recentMonths = summary.months.slice(-6).reverse();
  const foreignCurrencies = summary.mismatchedCurrencies.join(', ');

  function downloadSnapshot() {
    const rows: (string | number)[][] = [
      ['Avenor financial snapshot', new Date().toISOString()],
      ['Workspace currency', currency],
      ['Basis', 'Imported bank/accounting movements are historical cash activity; forecast rows are operating-model projections. They are not automatically reconciled.'],
      [],
      ['HISTORICAL CASH ACTIVITY'],
      ['Month', 'Compatible transaction records', 'Inflows', 'Outflows', 'Net bank movement'],
      ...summary.months.map((row) => [row.month, row.records, row.inflows, row.outflows, row.netMovement]),
      [],
      ['FORWARD OPERATING FORECAST'],
      ['Forecast month', 'Revenue', 'Direct costs', 'Payroll', 'Other operating costs', 'Net operating cash flow', 'Closing cash'],
      ...forecastRows.map((row) => ['Month ' + row.month, row.revenue, row.cogs, row.payroll, row.nonPayrollOpex, row.netCashFlow, row.closingCash]),
      [],
      ['RECENT SAVED DECISIONS'],
      ['Decision', 'Impact label', 'Estimated cash impact'],
      ...decisions.map((decision) => [decision.title, decision.cashImpactLabel ?? 'Impact not available', decision.cashImpact ?? 'Not available']),
    ];
    const csv = rows.map((row) => row.map((cell) => csvCell(cell ?? '')).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'avenor-financial-snapshot.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  return (
    <section className={styles.panel} aria-labelledby="financial-operations-title">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>FINANCIAL OPERATIONS</div>
          <h2 id="financial-operations-title">Historical activity & operating plan</h2>
          <p>One place to review imported cash movements, data quality and the next decisions ahead.</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.secondaryButton} type="button" onClick={onOpenImport}>Import data</button>
          <button className={styles.primaryButton} type="button" onClick={downloadSnapshot} disabled={loading}>Export snapshot ↓</button>
        </div>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button className={styles.secondaryButton} type="button" onClick={() => void loadActuals()}>Retry</button>
        </div>
      ) : (
        <>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>Imported transactions</span>
              <b>{loading ? '—' : summary.transactionRecords.toLocaleString('en-GB')}</b>
              <small>CSV records stored in this workspace</small>
            </div>
            <div className={styles.metric}>
              <span>Historical coverage</span>
              <b>{loading ? '—' : summary.monthsCovered + (summary.monthsCovered === 1 ? ' month' : ' months')}</b>
              <small>{summary.firstMonth && summary.latestMonth ? monthLabel(summary.firstMonth) + ' – ' + monthLabel(summary.latestMonth) : 'No transaction periods yet'}</small>
            </div>
            <div className={styles.metric}>
              <span>Latest month · net bank movement</span>
              <b className={latest && latest.netMovement < 0 ? styles.negative : ''}>{loading || !latest ? 'Not available' : money(latest.netMovement, currency)}</b>
              <small>{latest ? monthLabel(latest.month) + ' · ' + latest.records + ' records' : 'Import transactions to establish a baseline'}</small>
            </div>
            <div className={styles.metric}>
              <span>Next model month · net cash flow</span>
              <b className={nextForecast && nextForecast.netCashFlow < 0 ? styles.negative : ''}>{nextForecast ? money(nextForecast.netCashFlow, currency) : 'Not available'}</b>
              <small>Operating-model projection, not a bank balance</small>
            </div>
          </div>

          <div className={styles.qualityRow}>
            <div>
              <span className={styles.statusDot} />
              <b>{loading ? 'Checking data health…' : summary.transactionRecords === 0 ? 'No transaction history imported' : 'CSV activity available'}</b>
              <small>Last import timestamp: {loading ? '—' : dateTimeLabel(summary.latestImportedAt)}</small>
            </div>
            <div className={styles.qualityStats}>
              <span>{loading ? '—' : summary.compatibleRecords.toLocaleString('en-GB') + ' in ' + currency}</span>
              <span>{loading || summary.classificationCoveragePct === null ? 'Category coverage unavailable' : Math.round(summary.classificationCoveragePct) + '% non-generic categories'}</span>
              {summary.mismatchedRecords > 0 && <span className={styles.warningText}>{summary.mismatchedRecords} excluded currency mismatches ({foreignCurrencies})</span>}
              {summary.uncategorisedRecords > 0 && <span className={styles.warningText}>{summary.uncategorisedRecords} uncategorised or generic records</span>}
            </div>
          </div>

          {summary.mismatchedRecords > 0 && (
            <div className={styles.notice} role="status">
              {summary.mismatchedRecords} record(s) in {foreignCurrencies} are excluded from totals because they do not match the workspace currency ({currency}).
            </div>
          )}

          <div className={styles.contentGrid}>
            <div className={styles.tableSection}>
              <div className={styles.sectionHeader}>
                <div><h3>Recent cash movements</h3><p>Actual imported bank/accounting activity, grouped by month.</p></div>
              </div>
              {recentMonths.length === 0 ? (
                <div className={styles.empty}>
                  <b>Your historical activity will appear here.</b>
                  <p>Import a bank or accounting CSV export to start building a consistent monthly history.</p>
                  <button className={styles.secondaryButton} type="button" onClick={onOpenImport}>Import your first CSV →</button>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table>
                    <thead><tr><th>Month</th><th>Inflows</th><th>Outflows</th><th>Net movement</th><th>Rows</th></tr></thead>
                    <tbody>{recentMonths.map((row) => (
                      <tr key={row.month}>
                        <td>{monthLabel(row.month)}</td>
                        <td>{money(row.inflows, currency)}</td>
                        <td>{money(row.outflows, currency)}</td>
                        <td className={row.netMovement < 0 ? styles.negative : styles.positive}>{money(row.netMovement, currency)}</td>
                        <td>{row.records}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <p className={styles.footnote}>Imported transactions are historical cash movements. Transfers, taxes, financing and payment timing may affect these totals.</p>
            </div>

            <aside className={styles.sideColumn}>
              <div className={styles.sideCard}>
                <div className={styles.sectionHeader}>
                  <div><h3>Data health</h3><p>How complete is the information behind your analysis?</p></div>
                </div>
                <div className={styles.healthLine}><span>Workspace currency</span><b>{currency}</b></div>
                <div className={styles.healthLine}><span>Records in currency</span><b>{loading ? '—' : summary.compatibleRecords.toLocaleString('en-GB')}</b></div>
                <div className={styles.healthLine}><span>Generic categories</span><b>{loading ? '—' : summary.uncategorisedRecords}</b></div>
                <div className={styles.healthLine}><span>Last import</span><b>{loading ? '—' : dateTimeLabel(summary.latestImportedAt)}</b></div>
                <div className={styles.healthNote}>Imported activity is historical cash movement. Bank connections and CSV imports are managed above.</div>
              </div>

              <div className={styles.sideCard}>
                <div className={styles.sectionHeader}>
                  <div><h3>Decisions in progress</h3><p>Keep the assumptions and outcomes together.</p></div>
                  <button className={styles.linkButton} type="button" onClick={onOpenDecisions}>View all →</button>
                </div>
                {decisions.length === 0 ? (
                  <div className={styles.emptyCompact}>No saved decisions yet. Use Copilot to model a hiring, pricing or spending choice.</div>
                ) : decisions.map((decision) => (
                  <div className={styles.decision} key={decision.id}>
                    <div><b>{decision.title}</b><small>{decision.cashImpactLabel ?? decision.detail}</small></div>
                    <strong className={decision.cashImpact !== null && decision.cashImpact < 0 ? styles.negative : ''}>{decision.cashImpact === null ? 'Not available' : money(decision.cashImpact, currency)}</strong>
                  </div>
                ))}
              </div>

              <div className={styles.signalCard}>
                <div><span className={styles.signalCount}>{insightCount}</span><b>{insightCount === 1 ? 'priority signal to review' : 'priority signals to review'}</b></div>
                <p>Open the CFO Brief for the underlying cash, runway and operating-risk explanations.</p>
                <button className={styles.linkButton} type="button" onClick={onOpenBrief}>Review CFO Brief →</button>
              </div>
            </aside>
          </div>

          <div className={styles.reconciliationNote}>
            <b>Why actuals and forecasts are shown separately</b>
            <span>Imported bank movements are not automatically reconciled to the operating model. A bank statement can include financing, tax, transfers and collection timing that a simplified operating forecast does not yet model. Avenor keeps these figures distinct rather than presenting a misleading variance.</span>
          </div>
        </>
      )}
    </section>
  );
}
