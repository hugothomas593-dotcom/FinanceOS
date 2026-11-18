'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './avenor-copilot.module.css';

type SaveableScenario = {
  name: string;
  scenarioType: string;
  assumptions: Record<string, unknown>;
  outputs: Record<string, unknown>;
};

type CopilotEvidence = {
  currency?: string;
  modelStatus?: string | null;
  aiUnavailable?: boolean;
  snapshot?: {
    modelAvailable?: boolean;
    operatingMetrics?: Record<string, number | null> | null;
    forecast?: Record<string, number | null> | null;
    actuals?: {
      records?: number;
      monthsCovered?: number;
      inflowTrendPct?: number | null;
      outflowTrendPct?: number | null;
    };
    businessMetrics?: {
      period?: string | null;
      unitEconomics?: Record<string, number | string | null | unknown>;
    };
    missingData?: string[];
  };
  calculations?: Array<{ title: string; summary: string; detail?: unknown }>;
  decisionComparison?: {
    currency: string;
    scenarios: Array<{ name: string; endingCash: number; endingCashDelta: number; minimumCash: number; firstNegativeCashMonth: number | null; firstBelowSixMonthsRunway: number | null }>;
    interpretationNote: string;
  } | null;
  combinedDecision?: {
    currency: string;
    actions: Array<{ name: string; startMonth: number; durationMonths: number; revenueChangePct?: number; monthlyOpexChange?: number; monthlyPayrollChange?: number; hiring?: { headcount: number; grossAnnualSalary: number; employerCostRate: number; benefitsMonthlyPerPerson?: number; recruitingCostPerPerson?: number; equipmentCostPerPerson?: number }; grossMarginChangePp?: number; monthlyOtherCashFlowChange?: number; oneTimeCashImpact?: number; oneTimeMonth: number }>;
    assumptions: { horizonMonths: number; targetRunwayMonths: number };
    base: { endingCash: number; minimumForecastCash: number; firstMonthCashNegative: number | null };
    scenario: { endingCash: number; minimumForecastCash: number; firstMonthCashNegative: number | null };
    impact: { endingCashDelta: number; minimumCashDelta: number; firstNegativeCashMonth: number | null; firstBelowTargetRunwayMonth: number | null };
    caveats: string[];
  } | null;
  saveableScenario?: SaveableScenario | null;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  evidence?: CopilotEvidence | null;
  created_at: string;
};

type Thread = {
  id: string;
  title: string | null;
  created_at: string;
};

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function renderSafeText(content: string) {
  return content.split(/\n{2,}/).map((block, index) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (heading) return <h4 key={index}>{heading[1]}</h4>;

    const lines = trimmed.split('\n');
    if (lines.every((line) => /^\s*[-*•]\s+/.test(line))) {
      return (
        <ul key={index}>
          {lines.map((line, lineIndex) => (
            <li key={lineIndex}>{line.replace(/^\s*[-*•]\s+/, '')}</li>
          ))}
        </ul>
      );
    }

    if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
      return (
        <ol key={index}>
          {lines.map((line, lineIndex) => (
            <li key={lineIndex}>{line.replace(/^\s*\d+[.)]\s+/, '')}</li>
          ))}
        </ol>
      );
    }

    return (
      <p key={index}>
        {lines.map((line, lineIndex) => (
          <span key={lineIndex}>
            {line}
            {lineIndex < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>
    );
  });
}

export function AvenorCopilot({
  organizationId,
  organizationName,
  currency = 'EUR',
  embedded = false,
  contextCompletion = 0,
  hasFinancialModel = false,
  hasImportedActuals = false,
  insightCount = 0,
}: {
  organizationId: string;
  organizationName: string;
  currency?: string;
  embedded?: boolean;
  contextCompletion?: number;
  hasFinancialModel?: boolean;
  hasImportedActuals?: boolean;
  insightCount?: number;
}) {
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [savedMessages, setSavedMessages] = useState<string[]>([]);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const openCompanion = (event: Event) => {
      const detail = (event as CustomEvent<string | { message?: string; newConversation?: boolean }>).detail;
      const message = typeof detail === 'string' ? detail : detail?.message;
      const newConversation = typeof detail === 'object' && detail !== null && detail.newConversation === true;

      setOpen(true);
      setHistoryOpen(false);
      setError('');

      if (newConversation) {
        setThreadId(null);
        setMessages([]);
        setSavedMessages([]);
      }
      if (message) setDraft(message);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    };
    window.addEventListener('avenor:open-copilot', openCompanion);
    return () => window.removeEventListener('avenor:open-copilot', openCompanion);
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    fetch(`/api/copilot/threads?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load chat history');
        if (active) setThreads(data.threads ?? []);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load chat history');
      });
    return () => { active = false; };
  }, [organizationId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy, open]);

  const suggestions = useMemo(() => [
    `Could we spend ${currencySymbol}30k on this and still cover the next 12 months?`,
    'Compare two growth plans: add €5,000 in monthly marketing spend for a 10% revenue uplift, versus a €20,000 one-off campaign for the same uplift. What are the cash and runway trade-offs?',
    'What happens if sales are 20% lower for the next six months?',
    'How much do we need to sell each month to cover our costs?',
    'Would a 10% price increase offset a 5% drop in customers?',
    'What if customers start paying us 30 days later?',
    'Are we spending too much to win new customers?',
    'Are we losing customers faster than we are replacing them?',
    'Can we combine three hires with an extra ' + currencySymbol + '5,000 in monthly marketing and still preserve 12 months of runway?',
    'How much should we raise, and what dilution would it imply?',
  ], [currencySymbol]);

  async function loadThread(id: string) {
    setLoadingThread(true);
    setError('');
    try {
      const response = await fetch(
        `/api/copilot/threads?organizationId=${encodeURIComponent(organizationId)}&threadId=${encodeURIComponent(id)}`,
        { cache: 'no-store' },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load conversation');
      setThreadId(id);
      setMessages(data.messages ?? []);
      setHistoryOpen(false);
      setOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load conversation');
    } finally {
      setLoadingThread(false);
    }
  }

  async function sendMessage(text = draft) {
    const message = text.trim();
    if (!message || busy || !organizationId) return;

    setDraft('');
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          threadId,
          message,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Avenor could not answer this question');

      setThreadId(data.thread.id);
      setMessages((current) => [...current, data.userMessage, data.assistantMessage]);
      setThreads((current) => [
        data.thread,
        ...current.filter((thread) => thread.id !== data.thread.id),
      ].slice(0, 30));
    } catch (reason) {
      setDraft(message);
      setError(reason instanceof Error ? reason.message : 'Avenor could not answer this question');
    } finally {
      setBusy(false);
    }
  }

  function startNewConversation() {
    setThreadId(null);
    setMessages([]);
    setDraft('');
    setError('');
    setHistoryOpen(false);
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function saveScenario(message: Message) {
    if (!organizationId || !message.evidence?.saveableScenario) return;
    setError('');
    const scenario = message.evidence.saveableScenario;
    try {
      const modelVersionId =
        typeof scenario.assumptions.modelVersionId === 'string'
          ? scenario.assumptions.modelVersionId
          : null;
      const response = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          modelVersionId,
          name: scenario.name,
          scenarioType: scenario.scenarioType,
          assumptions: scenario.assumptions,
          outputs: scenario.outputs,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save this analysis');
      setSavedMessages((items) => [...items, message.id]);
      window.dispatchEvent(new CustomEvent('avenor:decision-saved', { detail: data.scenario }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this analysis');
    }
  }

  return (
    <>
      {!embedded && (
        <button
          type="button"
          className={styles.launcher}
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? 'Close Avenor chat' : 'Open Avenor chat'}
          aria-expanded={open}
        >
          <span className={styles.launcherIcon}>A</span>
          <span className={styles.launcherLabel}>Open Copilot</span>
          <span className={styles.launcherDot} />
        </button>
  
        )}

      {(embedded || open) && (
        <>
          {!embedded && <button className={styles.backdrop} type="button" aria-label="Close assistant" onClick={() => setOpen(false)} />}
          <aside className={embedded ? styles.embedded : styles.panel} aria-label="Avenor financial copilot">
            <header className={styles.header}>
              <div className={styles.headerBrand}>
                <div className={styles.brandMark}>A</div>
                <div>
                  <strong>Avenor</strong>
                  <span>Financial decision support</span>
                </div>
              </div>
              <div className={styles.headerActions}>
                <button type="button" onClick={() => setHistoryOpen((value) => !value)} title="Conversation history" aria-label="Conversation history">◷</button>
                <button type="button" onClick={startNewConversation} title="New conversation" aria-label="New conversation">＋</button>
                {!embedded && <button type="button" onClick={() => setOpen(false)} title="Close" aria-label="Close">×</button>}
              </div>
            </header>

            <div className={styles.workspaceStrip}>
              <span className={styles.statusDot} />
              <span>{organizationName || 'Your workspace'}</span>
              <span className={styles.currency}>{currency}</span>
              <span className={styles.connected}>Workspace linked</span>
            </div>

            {historyOpen ? (
              <div className={styles.history}>
                <div className={styles.historyHeading}>
                  <strong>Your conversations</strong>
                  <button type="button" onClick={startNewConversation}>New chat</button>
                </div>
                {threads.length === 0 ? (
                  <div className={styles.historyEmpty}>Your saved conversations will appear here.</div>
                ) : threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className={`${styles.threadItem} ${thread.id === threadId ? styles.threadActive : ''}`}
                    onClick={() => void loadThread(thread.id)}
                  >
                    <span>{thread.title || 'Financial analysis'}</span>
                    <small>{new Date(thread.created_at).toLocaleDateString('en-GB')}</small>
                  </button>
                ))}
                {loadingThread && <div className={styles.loadingInline}>Loading conversation…</div>}
              </div>
            ) : (
              <>
                <div className={styles.messages}>
                  {messages.length === 0 ? (
                    <div className={styles.welcome}>
                      <div className={styles.welcomeIcon}>A</div>
                      <span className={styles.eyebrow}>FINANCIAL DECISION SUPPORT</span>
                      <h2>What decision are you working through?</h2>
                      <p>
                        Ask about your cash position, costs, revenue or a business decision. Avenor uses the information in
                        this workspace and shows the assumptions behind its analysis.
                      </p>
                      {embedded && (!hasFinancialModel || !hasImportedActuals || contextCompletion < 80) && (
                        <section className={styles.setupChecklist} aria-label="Workspace setup progress">
                          <div className={styles.setupTop}>
                            <div><b>Make Avenor useful from day one</b><span>Three quick steps improve the quality of every analysis.</span></div>
                            <strong>{[contextCompletion >= 80, hasFinancialModel, hasImportedActuals].filter(Boolean).length}/3</strong>
                          </div>
                          <div className={styles.setupRows}>
                            <div><span className={contextCompletion >= 80 ? styles.setupDone : styles.setupTodo}>{contextCompletion >= 80 ? '✓' : '1'}</span><section><b>Company context</b><small>{contextCompletion >= 80 ? 'Business profile saved' : 'Product, customers and goals'}</small></section><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-company-setup'))}>{contextCompletion >= 80 ? 'Edit' : 'Complete'} →</button></div>
                            <div><span className={hasFinancialModel ? styles.setupDone : styles.setupTodo}>{hasFinancialModel ? '✓' : '2'}</span><section><b>Financial model</b><small>{hasFinancialModel ? 'Starting numbers saved' : 'Cash, revenue and monthly costs'}</small></section><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-company-setup'))}>{hasFinancialModel ? 'Review' : 'Add'} →</button></div>
                            <div><span className={hasImportedActuals ? styles.setupDone : styles.setupTodo}>{hasImportedActuals ? '✓' : '3'}</span><section><b>Actual transactions</b><small>{hasImportedActuals ? 'History available' : 'Optional CSV for historical analysis'}</small></section><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-data-import'))}>{hasImportedActuals ? 'Review' : 'Import'} →</button></div>
                          </div>
                        </section>
                      )}
                      {embedded && insightCount > 0 && (
                        <button
                          type="button"
                          className={styles.proactiveNudge}
                          onClick={() => window.dispatchEvent(new CustomEvent('avenor:open-cfo-brief'))}
                        >
                          <span className={styles.proactiveIcon}>!</span>
                          <span><b>{insightCount} financial signal{insightCount > 1 ? 's' : ''} to review</b><small>Avenor found watchpoints in your latest saved data.</small></span>
                          <strong>Review →</strong>
                        </button>
                      )}
                      <div className={styles.suggestionHeading}>COMMON QUESTIONS</div>
                      <div className={styles.suggestions}>
                        {suggestions.map((suggestion) => (
                          <button key={suggestion} type="button" onClick={() => void sendMessage(suggestion)}>
                            <span>{suggestion}</span><b>↗</b>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : messages.map((message) => {
                    const evidence = message.role === 'assistant' && message.evidence && !Array.isArray(message.evidence)
                      ? message.evidence
                      : null;
                    const scenario = evidence?.saveableScenario ?? null;
                    const saved = savedMessages.includes(message.id);
                    return (
                      <article key={message.id} className={message.role === 'user' ? styles.userMessage : styles.assistantMessage}>
                        {message.role === 'assistant' && <div className={styles.messageAvatar}>A</div>}
                        <div className={styles.messageBody}>
                          <div className={styles.messageMeta}>
                            <strong>{message.role === 'user' ? 'You' : 'Avenor'}</strong>
                            <time>{new Date(message.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</time>
                            {evidence?.aiUnavailable && <span className={styles.fallbackTag} title="Calculated locally from saved workspace data; no external AI response was used">Local analysis</span>}
                          </div>
                          <div className={styles.messageText}>{renderSafeText(message.content)}</div>

                          {evidence && (
                            <>
                              {evidence.snapshot?.operatingMetrics && (
                                <div className={styles.metricEvidence}>
                                  {[
                                    ['Monthly revenue', evidence.snapshot.operatingMetrics.monthlyRevenue],
                                    ['Monthly burn', evidence.snapshot.operatingMetrics.monthlyBurn],
                                    ['Gross margin', evidence.snapshot.operatingMetrics.grossMarginPct, '%'],
                                  ].filter((item) => typeof item[1] === 'number').map(([label, value, suffix]) => (
                                    <div key={String(label)}>
                                      <span>{String(label)}</span>
                                      <strong>{suffix === '%' ? `${Number(value).toFixed(1)}%` : formatMoney(Number(value), evidence.currency || currency)}</strong>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {evidence.snapshot?.businessMetrics?.unitEconomics && (
                                <div className={styles.unitEconomics}>
                                  <div className={styles.unitHeading}>
                                    <strong>SaaS unit economics</strong>
                                    <span>{evidence.snapshot.businessMetrics.period || 'Latest supplied month'}</span>
                                  </div>
                                  <div className={styles.metricEvidence}>
                                    {[
                                      ['MRR', evidence.snapshot.businessMetrics.unitEconomics.mrr, 'money'],
                                      ['ARR', evidence.snapshot.businessMetrics.unitEconomics.arr, 'money'],
                                      ['ARPA', evidence.snapshot.businessMetrics.unitEconomics.arpa, 'money'],
                                      ['CAC', evidence.snapshot.businessMetrics.unitEconomics.cac, 'money'],
                                      ['LTV', evidence.snapshot.businessMetrics.unitEconomics.ltv, 'money'],
                                      ['CAC payback', evidence.snapshot.businessMetrics.unitEconomics.cacPaybackMonths, 'months'],
                                      ['Monthly churn', evidence.snapshot.businessMetrics.unitEconomics.monthlyLogoChurnPct, 'percent'],
                                      ['LTV / CAC', evidence.snapshot.businessMetrics.unitEconomics.ltvToCac, 'ratio'],
                                    ].filter((item) => typeof item[1] === 'number').map(([label, value, format]) => (
                                      <div key={String(label)}>
                                        <span>{String(label)}</span>
                                        <strong>
                                          {format === 'money'
                                            ? formatMoney(Number(value), evidence.currency || currency)
                                            : format === 'percent'
                                              ? `${Number(value).toFixed(1)}%`
                                              : format === 'months'
                                                ? `${Number(value).toFixed(1)} months`
                                                : `${Number(value).toFixed(2)}x`}
                                        </strong>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {evidence.combinedDecision && (
                                <section className={styles.decisionComparison} aria-label="Combined financial decision analysis">
                                  <div className={styles.comparisonHeading}>
                                    <strong>Combined plan impact</strong>
                                    <span>{evidence.combinedDecision.assumptions.horizonMonths}-month forecast</span>
                                  </div>
                                  <div className={styles.metricEvidence}>
                                    <div><span>Base-case ending cash</span><strong>{formatMoney(evidence.combinedDecision.base.endingCash, evidence.combinedDecision.currency)}</strong></div>
                                    <div><span>Combined-plan ending cash</span><strong>{formatMoney(evidence.combinedDecision.scenario.endingCash, evidence.combinedDecision.currency)}</strong></div>
                                    <div><span>Change vs base case</span><strong className={evidence.combinedDecision.impact.endingCashDelta < 0 ? styles.comparisonNegative : styles.comparisonPositive}>{evidence.combinedDecision.impact.endingCashDelta > 0 ? '+' : ''}{formatMoney(evidence.combinedDecision.impact.endingCashDelta, evidence.combinedDecision.currency)}</strong></div>
                                    <div><span>First breach of runway target</span><strong>{evidence.combinedDecision.impact.firstBelowTargetRunwayMonth === null ? 'Not within horizon' : 'Month ' + evidence.combinedDecision.impact.firstBelowTargetRunwayMonth}</strong></div>
                                  </div>
                                  <div className={styles.comparisonTableWrap}>
                                    <table className={styles.comparisonTable}>
                                      <thead><tr><th>Action</th><th>Starts</th><th>Duration</th><th>Recurring monthly change</th><th>One-off cash impact</th></tr></thead>
                                      <tbody>
                                        {evidence.combinedDecision.actions.map((action, index) => (
                                          <tr key={action.name + index}>
                                            <td>{action.name}</td>
                                            <td>Month {action.startMonth}</td>
                                            <td>{action.durationMonths} mo.</td>
                                            <td>{formatMoney((action.monthlyOpexChange ?? 0) + (action.monthlyPayrollChange ?? 0) + (action.monthlyOtherCashFlowChange ?? 0) + (action.hiring ? action.hiring.headcount * (action.hiring.grossAnnualSalary * (1 + action.hiring.employerCostRate) / 12 + (action.hiring.benefitsMonthlyPerPerson ?? 0)) : 0), evidence.combinedDecision!.currency)} / mo.</td>
                                            <td>{formatMoney((action.oneTimeCashImpact ?? 0) - (action.hiring ? action.hiring.headcount * ((action.hiring.recruitingCostPerPerson ?? 0) + (action.hiring.equipmentCostPerPerson ?? 0)) : 0), evidence.combinedDecision!.currency)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <p>Modeled against the same saved baseline. All assumptions are supplied by the founder; no productivity uplift is inferred. {evidence.combinedDecision.impact.firstNegativeCashMonth === null ? 'The scenario does not show negative closing cash within the forecast.' : 'Negative closing cash is first projected in month ' + evidence.combinedDecision.impact.firstNegativeCashMonth + '.'}</p>
                                </section>
                              )}
                              {evidence.decisionComparison && (
                                <section className={styles.decisionComparison} aria-label="Side-by-side financial scenario comparison">
                                  <div className={styles.comparisonHeading}>
                                    <strong>Scenario comparison</strong>
                                    <span>Ranked by projected ending cash</span>
                                  </div>
                                  <div className={styles.comparisonTableWrap}>
                                    <table className={styles.comparisonTable}>
                                      <thead><tr><th>Scenario</th><th>Ending cash</th><th>Change vs plan</th><th>Lowest cash</th><th>First negative month</th></tr></thead>
                                      <tbody>
                                        {evidence.decisionComparison.scenarios.map((item) => (
                                          <tr key={item.name}>
                                            <td>{item.name}</td>
                                            <td>{formatMoney(item.endingCash, evidence.decisionComparison!.currency)}</td>
                                            <td className={item.endingCashDelta < 0 ? styles.comparisonNegative : styles.comparisonPositive}>
                                              {item.endingCashDelta > 0 ? '+' : ''}{formatMoney(item.endingCashDelta, evidence.decisionComparison!.currency)}
                                            </td>
                                            <td>{formatMoney(item.minimumCash, evidence.decisionComparison!.currency)}</td>
                                            <td>{item.firstNegativeCashMonth === null ? 'Not within horizon' : 'Month ' + item.firstNegativeCashMonth}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <p>{evidence.decisionComparison.interpretationNote}</p>
                                </section>
                              )}
                              {evidence.calculations?.length ? (
                                <details className={styles.evidenceDetails}>
                                  <summary>Show calculations and evidence ({evidence.calculations.length})</summary>
                                  {evidence.calculations.map((calculation, index) => (
                                    <div key={`${calculation.title}-${index}`} className={styles.calculation}>
                                      <strong>{calculation.title}</strong>
                                      <p>{calculation.summary}</p>
                                      {calculation.detail !== undefined && (
                                        <pre>{JSON.stringify(calculation.detail, null, 2)}</pre>
                                      )}
                                    </div>
                                  ))}
                                </details>
                              ) : null}
                              {evidence.snapshot?.missingData?.length ? (
                                <details className={styles.missingDetails}>
                                  <summary>Data limitations ({evidence.snapshot.missingData.length})</summary>
                                  <ul>{evidence.snapshot.missingData.map((item) => <li key={item}>{item}</li>)}</ul>
                                </details>
                              ) : null}
                              {scenario && (
                                <button
                                  type="button"
                                  className={styles.saveButton}
                                  disabled={saved}
                                  onClick={() => void saveScenario(message)}
                                >
                                  {saved ? '✓ Saved to Decision Ledger' : '＋ Save analysis to Decision Ledger'}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  {busy && (
                    <div className={styles.thinking}>
                      <span className={styles.messageAvatar}>A</span>
                      <div><strong>Reviewing the numbers</strong><span>Reviewing assumptions, testing scenarios and checking the numbers…</span></div>
                    </div>
                  )}
                  <div ref={messageEndRef} />
                </div>

                {error && <div className={styles.error}>{error}</div>}
                <form
                  className={styles.composer}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendMessage();
                  }}
                >
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                    placeholder="Ask about your company's finances or a decision…"
                    rows={2}
                    maxLength={4_000}
                    disabled={busy || !organizationId}
                  />
                  <div className={styles.composerBottom}>
                    <span>Enter to send · Shift + Enter for a new line</span>
                    <button type="submit" disabled={busy || !draft.trim() || !organizationId} aria-label="Send message">
                      {busy ? '…' : '↑'}
                    </button>
                  </div>
                </form>
                <div className={styles.disclaimer}>
                  Calculations use the data and assumptions available in your workspace. Confirm tax, legal and
                  regulated matters with a qualified professional.
                </div>
              </>
            )}
          </aside>
        </>
      )}
    </>
  );
}
