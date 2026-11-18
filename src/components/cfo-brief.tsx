'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './cfo-brief.module.css';

type Alert = { id: string; severity: 'critical' | 'warning' | 'info'; title: string; description: string };
type Brief = {
  generatedAt: string;
  currency: string;
  modelStatus: 'approved' | 'draft' | 'none';
  forecast: {
    horizonMonths: number; openingCash: number; monthlyRevenue: number; monthlyOperatingCosts: number;
    endingCash: number; minimumCash: number; lowestCashMonth: number;
    firstMonthCashNegative: number | null; firstMonthBelowSixMonthsRunway: number | null; targetRunwayMonths: number; firstMonthBelowTargetRunway: number | null;
  } | null;
  historical: {
    records: number; monthsCovered: number; averageMonthlyInflows: number; averageMonthlyOutflows: number;
    netCashMovement: number; inflowTrendPct: number | null; outflowTrendPct: number | null;
    topSpendingCategories: Array<{ category: string; amount: number }>;
  };
  dataQuality: { currencyMismatchedRecords: number; notes: string[] };
  alerts: Alert[];
  priorities: string[];
  basis: string;
};

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

export function CfoBrief({ organizationId }: { organizationId: string }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadBrief = useCallback(async (quiet = false) => {
    if (!organizationId) return;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/brief?organizationId=' + encodeURIComponent(organizationId), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load the CFO brief');
      setBrief(data.brief as Brief);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the CFO brief');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => { void loadBrief(); }, [loadBrief]);

  const askCopilot = () => {
    window.dispatchEvent(new CustomEvent('avenor:open-copilot', {
      detail: {
        message: 'Review the latest CFO Brief. Explain the most important cash and operating signals, challenge the assumptions, and give me the three most useful actions. Do not invent missing data.',
        newConversation: true,
      },
    }));
  };

  const askAboutAlert = (alert: Alert) => {
    const prompts: Record<string, string> = {
      'model-missing': 'Guide me through creating the smallest useful financial model for my company. Ask for missing inputs one at a time and do not invent numbers.',
      'cash-negative': 'My CFO Brief flags that cash is projected to go below zero. Analyze the key drivers and help me compare realistic options such as delaying spend, reducing costs or raising funding. Ask for missing assumptions rather than guessing.',
      'runway-low': 'My CFO Brief flags runway below six months. Identify the main drivers and model practical options to extend runway using only supplied assumptions.',
      'runway-below-founder-target': 'My forecast falls below my chosen runway target. Help me understand when and why, then model options to preserve that target.',
      'inflows-declining': 'My CFO Brief flags declining historical cash inflows. Break down what the imported records actually show, distinguish revenue from collection timing, and suggest what I should validate next.',
      'outflows-rising': 'My CFO Brief flags rising historical outflows. Review the largest spend categories and help me identify which costs could be controlled without assuming savings that have not been supplied.',
      'churn-above-founder-threshold': 'My supplied monthly churn is above my watch threshold. Explain the unit-economics impact and what customer/cohort data I should inspect next.',
      'cac-payback-above-founder-threshold': 'My CAC payback is above my watch threshold. Explain the blended estimate, identify which inputs drive it, and model what would need to improve.',
      'draft-model': 'Review my draft financial model and tell me which assumptions need checking before I approve it.',
      'no-actuals': 'Help me import transaction history and explain which CSV columns and periods would improve the quality of my financial review.',
    };
    const prompt = prompts[alert.id] ?? `Review this CFO Brief signal: ${alert.title}. ${alert.description} Explain the implications and recommend practical next steps without inventing missing figures.`;
    window.dispatchEvent(new CustomEvent('avenor:open-copilot', {
      detail: { message: prompt, newConversation: true },
    }));
  };

  const updated = brief?.generatedAt
    ? new Date(brief.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  return (
    <section className={styles.panel} aria-labelledby="cfo-brief-title">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>MANAGEMENT REVIEW</div>
          <h2 id="cfo-brief-title">Your CFO Brief</h2>
          <p>A decision-ready review of cash, operating performance, emerging risks and recommended actions. Generated from your latest saved data when you open or refresh this page.</p>
        </div>
        <button className={styles.refresh} type="button" onClick={() => void loadBrief(true)} disabled={loading || refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className={styles.empty}>Preparing your financial check-in…</div>
      ) : error ? (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button className={styles.refresh} type="button" onClick={() => void loadBrief()}>Try again</button>
        </div>
      ) : brief ? (
        <>
          <div className={styles.meta}>
            <span className={styles.status}>{brief.modelStatus === 'approved' ? 'Approved plan' : brief.modelStatus === 'draft' ? 'Draft plan' : 'Plan not set up'}</span>
            <span>Updated {updated}</span>
            <span>{brief.historical.records.toLocaleString('en-GB')} transaction records</span>
            <span>Founder runway target: {brief.forecast?.targetRunwayMonths ?? 12} months</span>
          </div>

          {brief.forecast ? (
            <div className={styles.metrics}>
              <div><span>Cash after 18 months</span><b>{money(brief.forecast.endingCash, brief.currency)}</b></div>
              <div><span>Lowest forecast cash</span><b className={brief.forecast.minimumCash < 0 ? styles.negative : ''}>{money(brief.forecast.minimumCash, brief.currency)}</b></div>
              <div><span>Monthly operating cost</span><b>{money(brief.forecast.monthlyOperatingCosts, brief.currency)}</b></div>
              <div><span>Average monthly inflows</span><b>{brief.historical.records ? money(brief.historical.averageMonthlyInflows, brief.currency) : 'Not available'}</b></div>
            </div>
          ) : (
            <div className={styles.empty}>Add a company financial model to unlock cash forecasts and decision analysis.</div>
          )}

          <div className={styles.contentGrid}>
            <div className={styles.alerts}>
              <div className={styles.sectionTitle}>Signals to review</div>
              {brief.alerts.map((alert) => (
                <article className={styles.alert + ' ' + styles[alert.severity]} key={alert.id}>
                  <span className={styles.marker} aria-hidden="true" />
                  <div className={styles.alertContent}>
                    <b>{alert.title}</b>
                    <p>{alert.description}</p>
                    <button className={styles.alertAction} type="button" onClick={() => askAboutAlert(alert)}>Analyze with Copilot <span>→</span></button>
                  </div>
                </article>
              ))}
            </div>
            <aside className={styles.priorities}>
              <div className={styles.sectionTitle}>Recommended next actions</div>
              <ol>{brief.priorities.map((priority) => <li key={priority}>{priority}</li>)}</ol>
              <button className={styles.copilot} type="button" onClick={askCopilot}>Discuss with Copilot <span>→</span></button>
            </aside>
          </div>

          <div className={styles.footer}>
            <span>{brief.historical.monthsCovered} months of compatible transaction history</span>
            <span>{brief.dataQuality.currencyMismatchedRecords ? brief.dataQuality.currencyMismatchedRecords + ' foreign-currency records excluded' : 'No cross-currency totals mixed'}</span>
          </div>
          <p className={styles.disclaimer}>{brief.basis}</p>
        </>
      ) : null}
    </section>
  );
}
