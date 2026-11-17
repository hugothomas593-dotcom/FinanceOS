'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './founder-pulse.module.css';

type FounderBrief = {
  generatedAt?: string;
  alerts?: Array<{ id: string; severity: 'critical' | 'warning' | 'info'; title: string; description: string }>;
  forecast?: {
    endingCash: number;
    firstMonthCashNegative: number | null;
    firstMonthBelowTargetRunway: number | null;
    targetRunwayMonths: number;
  } | null;
  historical?: {
    records: number;
    monthsCovered: number;
    inflowTrendPct: number | null;
    outflowTrendPct: number | null;
  };
};

type Reconciliation = {
  months?: Array<{
    month: string;
    forecastNetCashFlow: number;
    actualNetCashFlow: number;
    variance: number;
    records: number;
  }>;
  note?: string;
};

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return Math.round(value).toLocaleString('en-GB') + ' ' + currency;
  }
}

function formatMonth(value: string) {
  const date = new Date(value.slice(0, 7) + '-01T00:00:00Z');
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function FounderPulse({
  organizationId,
  currency,
  brief,
}: {
  organizationId: string;
  currency: string;
  brief: FounderBrief | null;
}) {
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(true);
  const [reconciliationError, setReconciliationError] = useState('');

  useEffect(() => {
    let active = true;
    setReconciliationLoading(true);
    setReconciliationError('');

    fetch('/api/reconciliation?organizationId=' + encodeURIComponent(organizationId), { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load forecast comparison');
        if (active) setReconciliation(data.reconciliation ?? null);
      })
      .catch((error) => {
        if (active) setReconciliationError(error instanceof Error ? error.message : 'Could not load forecast comparison');
      })
      .finally(() => {
        if (active) setReconciliationLoading(false);
      });

    return () => { active = false; };
  }, [organizationId]);

  const alerts = brief?.alerts ?? [];
  const priorityAlerts = useMemo(
    () => alerts.filter((alert) => alert.severity !== 'info').slice(0, 3),
    [alerts],
  );
  const latestMonth = reconciliation?.months?.[0] ?? null;
  const forecast = brief?.forecast ?? null;
  const history = brief?.historical;

  return (
    <section className={styles.panel} aria-labelledby="founder-pulse-title">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>FOUNDER PULSE</span>
          <h2 id="founder-pulse-title">What needs your attention</h2>
          <p>Signals from your saved financial plan and imported company data.</p>
        </div>
        <span className={priorityAlerts.length > 0 ? styles.attention : styles.neutral}>
          {!brief ? 'Loading signals' : priorityAlerts.length > 0 ? priorityAlerts.length + ' priorities' : 'No priority warnings'}
        </span>
      </div>

      <div className={styles.summaryGrid}>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>RUNWAY WATCH</span>
          {!brief ? (
            <><strong className={styles.loading}>Loading signals…</strong><p>Your latest company analysis is being prepared.</p></>
          ) : forecast ? (
            <>
              <strong>{forecast.firstMonthBelowTargetRunway === null ? 'On track' : 'Review the plan'}</strong>
              <p>
                {forecast.firstMonthBelowTargetRunway === null
                  ? 'No breach of your ' + forecast.targetRunwayMonths + '-month target is flagged in the current 18-month model.'
                  : 'The model falls below your ' + forecast.targetRunwayMonths + '-month target in month ' + forecast.firstMonthBelowTargetRunway + '.'}
              </p>
            </>
          ) : (
            <>
              <strong>Plan needed</strong>
              <p>Save your starting cash, revenue and operating costs to activate runway monitoring.</p>
            </>
          )}
        </article>

        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>ACTUAL VS FORECAST</span>
          {reconciliationLoading ? (
            <strong className={styles.loading}>Loading comparison…</strong>
          ) : latestMonth ? (
            <>
              <strong className={latestMonth.variance < 0 ? styles.negative : styles.positive}>
                {latestMonth.variance > 0 ? '+' : ''}{formatMoney(latestMonth.variance, currency)}
              </strong>
              <p>{formatMonth(latestMonth.month)} net cash-flow variance · {latestMonth.records} classified transaction(s)</p>
            </>
          ) : (
            <>
              <strong>Baseline building</strong>
              <p>No completed month has both a prior approved forecast and classified actuals yet.</p>
            </>
          )}
          {reconciliationError && <small className={styles.error}>{reconciliationError}</small>}
        </article>

        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>DATA COVERAGE</span>
          <strong>{brief ? (history?.records ?? 0) + ' transactions' : 'Loading…'}</strong>
          <p>{brief ? (history?.monthsCovered ?? 0) + ' month(s) of compatible history available for analysis.' : 'Checking imported company data.'}</p>
        </article>
      </div>

      <div className={styles.alertSection}>
        <div className={styles.alertHeading}>
          <b>Priority signals</b>
          <span>{brief?.generatedAt ? 'Updated ' + new Date(brief.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Awaiting financial data'}</span>
        </div>
        {priorityAlerts.length > 0 ? (
          <div className={styles.alertList}>
            {priorityAlerts.map((alert) => (
              <article className={styles.alertRow} key={alert.id}>
                <span className={alert.severity === 'critical' ? styles.criticalDot : styles.warningDot} />
                <div>
                  <b>{alert.title}</b>
                  <p>{alert.description}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            {!brief ? 'Loading your latest financial signals…' : alerts.find((alert) => alert.severity === 'info')?.description
              ?? 'No priority warning is identified in the latest saved data. Keep your assumptions and actuals up to date.'}
          </p>
        )}
      </div>

      <div className={styles.footer}>
        <span>Planning signals only · verify source data before acting.</span>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-copilot', {
            detail: { message: 'Review my latest financial signals and actual-versus-forecast performance. Explain the three most important actions I should consider, using only the data available in this workspace.', newConversation: true },
          }))}
        >
          Ask Avenor to review →
        </button>
      </div>
    </section>
  );
}
