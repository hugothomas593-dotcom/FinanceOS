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
}: {
  organizationId: string;
  organizationName: string;
  currency?: string;
}) {
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
      const detail = (event as CustomEvent<string>).detail;
      setOpen(true);
      setHistoryOpen(false);
      if (detail) setDraft(detail);
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
    'Could we spend €30k on this and still cover the next 12 months?',
    'Why are we spending more than we bring in, and what could we reduce?',
    'What happens if sales are 20% lower for the next six months?',
    'How much do we need to sell each month to cover our costs?',
    'Would a 10% price increase offset a 5% drop in customers?',
    'What if customers start paying us 30 days later?',
    'Are we spending too much to win new customers?',
    'Are we losing customers faster than we are replacing them?',
  ], []);

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
      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close Avenor chat' : 'Open Avenor chat'}
        aria-expanded={open}
      >
        <span className={styles.launcherIcon}>A</span>
        <span className={styles.launcherLabel}>Ask Avenor</span>
        <span className={styles.launcherDot} />
      </button>

      {open && (
        <>
          <button className={styles.backdrop} type="button" aria-label="Close assistant" onClick={() => setOpen(false)} />
          <aside className={styles.panel} aria-label="Avenor financial companion">
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
                <button type="button" onClick={() => setOpen(false)} title="Close" aria-label="Close">×</button>
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
                            {evidence?.aiUnavailable && <span className={styles.fallbackTag}>Limited mode</span>}
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
