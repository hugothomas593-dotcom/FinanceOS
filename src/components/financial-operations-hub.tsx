'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import styles from './financial-operations-hub.module.css';

type Connection = {
  id: string; institution_name: string; status: string; account_count: number;
  last_synced_at: string | null; last_sync_error: string | null;
};
type Invoice = {
  id: string; direction: 'receivable' | 'payable'; category: string; counterparty: string;
  due_date: string; expected_cash_date: string | null; amount: number | string;
  currency: string; included_in_model: boolean; status: 'open' | 'paid' | 'void';
};
type CashPosition = { balance: number | string; as_of_date: string; currency: string; source: string; updated_at: string };
type Week = { week: number; startDate: string; endDate: string; inflows: number; outflows: number; netMovement: number; closingCash: number; overdueInvoiceCount: number };
type CashData = {
  forecast: null | { openingCash: number; endingCash: number; minimumClosingCash: number; firstNegativeWeek: number | null; overdueInvoiceCount: number; excludedCurrencyInvoices: number; weeks: Week[] };
  cashPosition: CashPosition | null; missing: string[]; basis: string;
};
type ReconMonth = { month: string; forecastNetCashFlow: number; actualNetCashFlow: number; variance: number; records: number };
type Unmapped = { metric_key: string; amount: number; records: number };
type ReconData = { months: ReconMonth[]; unmappedCategories: Unmapped[]; mismatchedCurrencies: string[]; note: string };
type MappingCategory = 'revenue' | 'cogs' | 'payroll' | 'opex' | 'other' | 'exclude';

const money = (value: number | string, currency: string) => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return '—';
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return Math.round(amount).toLocaleString('en-GB') + ' ' + currency; }
};
const dateLabel = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value.length === 10 ? value + 'T00:00:00Z' : value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed);
};
const currentDate = () => new Date().toISOString().slice(0, 10);

export function FinancialOperationsHub({ organizationId, currency, onOpenImport }: {
  organizationId: string; currency: string; onOpenImport: () => void;
}) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [bankConfigured, setBankConfigured] = useState(false);
  const [scheduledSyncConfigured, setScheduledSyncConfigured] = useState(false);
  const [bankLoading, setBankLoading] = useState(true);
  const [bankBusy, setBankBusy] = useState(false);
  const [syncing, setSyncing] = useState('');
  const [reconnecting, setReconnecting] = useState('');
  const [disconnecting, setDisconnecting] = useState('');
  const [bankMessage, setBankMessage] = useState('');
  const [bankError, setBankError] = useState('');

  const [cash, setCash] = useState('');
  const [cashDate, setCashDate] = useState(currentDate());
  const [cashSource, setCashSource] = useState('');
  const [cashBusy, setCashBusy] = useState(false);
  const [cashError, setCashError] = useState('');
  const [cashData, setCashData] = useState<CashData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceDirection, setInvoiceDirection] = useState<'receivable' | 'payable'>('receivable');
  const [invoiceCategory, setInvoiceCategory] = useState('revenue');
  const [counterparty, setCounterparty] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceDue, setInvoiceDue] = useState(currentDate());
  const [invoiceExpected, setInvoiceExpected] = useState(currentDate());
  const [invoiceIncluded, setInvoiceIncluded] = useState(true);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');

  const [reconciliation, setReconciliation] = useState<ReconData | null>(null);
  const [mappingValues, setMappingValues] = useState<Record<string, MappingCategory>>({});
  const [reconError, setReconError] = useState('');
  const [reconBusy, setReconBusy] = useState('');

  const [recipient, setRecipient] = useState('');
  const [reportEnabled, setReportEnabled] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [reportError, setReportError] = useState('');

  const loadBank = useCallback(async () => {
    setBankLoading(true); setBankError('');
    try {
      const response = await fetch('/api/connections?organizationId=' + encodeURIComponent(organizationId), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load bank connections');
      setConnections(data.connections ?? []);
      setBankConfigured(Boolean(data.configured));
      setScheduledSyncConfigured(Boolean(data.scheduledSyncConfigured));
    } catch (error) {
      setBankError(error instanceof Error ? error.message : 'Could not load bank connections');
    } finally { setBankLoading(false); }
  }, [organizationId]);

  const loadCash = useCallback(async () => {
    setCashError('');
    try {
      const [cashResponse, invoiceResponse, forecastResponse] = await Promise.all([
        fetch('/api/cash-position?organizationId=' + encodeURIComponent(organizationId), { cache: 'no-store' }),
        fetch('/api/invoices?organizationId=' + encodeURIComponent(organizationId), { cache: 'no-store' }),
        fetch('/api/cash-flow?organizationId=' + encodeURIComponent(organizationId), { cache: 'no-store' }),
      ]);
      const [cashJson, invoiceJson, forecastJson] = await Promise.all([cashResponse.json(), invoiceResponse.json(), forecastResponse.json()]);
      if (!cashResponse.ok) throw new Error(cashJson.error || 'Could not load cash position');
      if (!invoiceResponse.ok) throw new Error(invoiceJson.error || 'Could not load invoices');
      if (!forecastResponse.ok) throw new Error(forecastJson.error || 'Could not load cash forecast');
      const position = cashJson.cashPosition as CashPosition | null;
      setCash(position ? String(position.balance) : '');
      setCashDate(position?.as_of_date || currentDate());
      setCashSource(position?.source || '');
      setInvoices(invoiceJson.invoices ?? []);
      setCashData(forecastJson as CashData);
    } catch (error) {
      setCashError(error instanceof Error ? error.message : 'Could not load the cash forecast');
    }
  }, [organizationId]);

  const loadReconciliation = useCallback(async () => {
    setReconError('');
    try {
      const response = await fetch('/api/reconciliation?organizationId=' + encodeURIComponent(organizationId), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load reconciliation');
      setReconciliation(data.reconciliation as ReconData);
      const values: Record<string, MappingCategory> = {};
      for (const item of (data.mappings ?? []) as Array<{ metric_key: string; forecast_category: MappingCategory }>) values[item.metric_key] = item.forecast_category;
      setMappingValues(values);
    } catch (error) {
      setReconError(error instanceof Error ? error.message : 'Could not load reconciliation');
    }
  }, [organizationId]);

  const loadReport = useCallback(async () => {
    setReportError('');
    try {
      const response = await fetch('/api/reports/preferences?organizationId=' + encodeURIComponent(organizationId), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load report preferences');
      setRecipient(String(data.preference?.recipient_email || data.accountEmail || ''));
      setReportEnabled(Boolean(data.preference?.enabled));
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Could not load weekly report preferences');
    }
  }, [organizationId]);

  useEffect(() => {
    void loadBank();
    void loadCash();
    void loadReconciliation();
    void loadReport();
  }, [loadBank, loadCash, loadReconciliation, loadReport]);

  async function connectBank() {
    setBankBusy(true); setBankError(''); setBankMessage('');
    try {
      const response = await fetch('/api/connections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.url !== 'string') throw new Error(data.error || 'Bank provider did not return a connection URL');
      window.location.assign(data.url);
    } catch (error) {
      setBankError(error instanceof Error ? error.message : 'Could not start bank connection');
      setBankBusy(false);
    }
  }

  async function syncBank(id: string) {
    setSyncing(id); setBankError(''); setBankMessage('');
    try {
      const response = await fetch('/api/connections/' + encodeURIComponent(id) + '/sync', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Bank synchronization failed');
      const syncNotes = [String(data.importedTransactions || 0) + ' transactions synchronized.'];
      if (data.truncated) syncNotes.push('The provider response reached the pagination limit; older transactions may still need a later sync.');
      if (!data.bankBalanceUpdated) syncNotes.push('The consolidated bank balance was not updated because a single base-currency balance was unavailable.');
      setBankMessage(syncNotes.join(' '));
      await Promise.all([loadBank(), loadCash(), loadReconciliation()]);
      window.dispatchEvent(new CustomEvent('avenor:financial-data-updated'));
    } catch (error) {
      setBankError(error instanceof Error ? error.message : 'Bank synchronization failed');
      await loadBank();
    } finally { setSyncing(''); }
  }

  async function reconnectBank(id: string) {
    setReconnecting(id); setBankError(''); setBankMessage('');
    try {
      const response = await fetch('/api/connections/' + encodeURIComponent(id) + '/reconnect', { method: 'POST' });
      const data = await response.json();
      if (!response.ok || typeof data.url !== 'string') throw new Error(data.error || 'Could not start bank reconnection');
      window.location.assign(data.url);
    } catch (error) {
      setBankError(error instanceof Error ? error.message : 'Could not start bank reconnection');
      setReconnecting('');
    }
  }

  async function disconnectBank(id: string) {
    const confirmed = window.confirm('Disconnect this bank account? The connection and its provider-side account history will be removed from Powens. Transactions already imported into Avenor will remain in your workspace.');
    if (!confirmed) return;
    setDisconnecting(id); setBankError(''); setBankMessage('');
    try {
      const response = await fetch('/api/connections/' + encodeURIComponent(id), { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not disconnect bank');
      setBankMessage('Bank disconnected. Historical transactions already imported into Avenor have been retained.');
      await Promise.all([loadBank(), loadCash(), loadReconciliation()]);
    } catch (error) {
      setBankError(error instanceof Error ? error.message : 'Could not disconnect bank');
    } finally { setDisconnecting(''); }
  }

  async function saveCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCashBusy(true); setCashError('');
    try {
      const response = await fetch('/api/cash-position', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, balance: Number(cash), asOfDate: cashDate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save cash position');
      await loadCash();
    } catch (error) { setCashError(error instanceof Error ? error.message : 'Could not save cash position'); }
    finally { setCashBusy(false); }
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setInvoiceBusy(true); setInvoiceError('');
    try {
      const response = await fetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId, direction: invoiceDirection, category: invoiceCategory, counterparty,
          amount: Number(invoiceAmount), dueDate: invoiceDue, expectedCashDate: invoiceExpected || invoiceDue,
          currency, includedInModel: invoiceIncluded,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save invoice');
      setInvoiceOpen(false); setCounterparty(''); setInvoiceAmount('');
      await loadCash();
    } catch (error) { setInvoiceError(error instanceof Error ? error.message : 'Could not save invoice'); }
    finally { setInvoiceBusy(false); }
  }

  async function markPaid(invoiceId: string) {
    setInvoiceError('');
    try {
      const response = await fetch('/api/invoices/' + encodeURIComponent(invoiceId), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update invoice');
      await loadCash();
    } catch (error) { setInvoiceError(error instanceof Error ? error.message : 'Could not update invoice'); }
  }

  async function saveMapping(metricKey: string) {
    const forecastCategory = mappingValues[metricKey] || 'exclude';
    setReconBusy(metricKey); setReconError('');
    try {
      const response = await fetch('/api/reconciliation', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, metricKey, forecastCategory }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save category mapping');
      await loadReconciliation();
      window.dispatchEvent(new CustomEvent('avenor:financial-data-updated'));
    } catch (error) { setReconError(error instanceof Error ? error.message : 'Could not save mapping'); }
    finally { setReconBusy(''); }
  }

  async function saveReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setReportBusy(true); setReportError(''); setReportMessage('');
    try {
      const response = await fetch('/api/reports/preferences', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, enabled: reportEnabled, recipientEmail: recipient, timezone: 'Europe/Paris' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save report preference');
      setReportMessage(reportEnabled ? 'Weekly report enabled.' : 'Weekly report disabled.');
    } catch (error) { setReportError(error instanceof Error ? error.message : 'Could not save report preference'); }
    finally { setReportBusy(false); }
  }

  const openInvoices = invoices.filter((invoice) => invoice.status === 'open');
  const forecast = cashData?.forecast ?? null;
  const reconMonths = (reconciliation?.months ?? []).slice(0, 6);
  const unmapped = reconciliation?.unmappedCategories ?? [];
  const missing = cashData?.missing ?? [];

  return (
    <section className={styles.hub} aria-labelledby="financial-operations-hub-title">
      <header className={styles.hubHeader}>
        <div className={styles.eyebrow}>FINANCIAL CONTROL</div>
        <h2 id="financial-operations-hub-title">Plan cash, understand performance.</h2>
        <p>Connected data, monthly performance reviews and a clear view of upcoming cash commitments.</p>
      </header>

      <section className={styles.card} aria-labelledby="avenor-data-connect-title">
        <div className={styles.eyebrow}>GET STARTED · FINANCIAL DATA</div>
        <h3 className={styles.connectTitle} id="avenor-data-connect-title">Connect your financial data</h3>
        <p className={styles.connectIntro}>One simple starting point for your company finances. Choose the method that works best for you.</p>
        <div className={styles.sourceChoices}>
          <button className={styles.sourceChoice} type="button" onClick={() => void connectBank()} disabled={!bankConfigured || bankBusy}>
            <span className={styles.sourceIcon} aria-hidden="true">⌂</span>
            <span className={styles.sourceCopy}><b>Connect your bank</b><small>Securely retrieve your accounts, transactions and cash position automatically.</small><span className={styles.sourceMeta}>{bankBusy ? 'Opening secure connection…' : 'Recommended · Secure bank connection'}</span></span>
            <span className={styles.sourceArrow} aria-hidden="true">→</span>
          </button>
          <button className={styles.sourceChoice} type="button" onClick={onOpenImport}>
            <span className={styles.sourceIcon} aria-hidden="true">↥</span>
            <span className={styles.sourceCopy}><b>Import a CSV</b><small>Upload a bank statement or accounting export in a few steps.</small><span className={styles.sourceMeta}>Works with your existing bank or accounting export</span></span>
            <span className={styles.sourceArrow} aria-hidden="true">→</span>
          </button>
        </div>
        {!bankConfigured && <p className={styles.notice}>Bank connection is being configured for this environment. You can still import a CSV to get started.</p>}
        {bankError && <p className={styles.error} role="alert">{bankError}</p>}
        {bankMessage && <p className={styles.success} role="status">{bankMessage}</p>}
        {connections.length > 0 && <div className={styles.connectedAccounts}>
          <div className={styles.connectedHeading}><b>Your connected banks</b><small>{scheduledSyncConfigured ? 'Automatic daily sync configured' : 'Manual sync available'}</small></div>
          {connections.map((item) => (
            <div className={styles.connection} key={item.id}>
              <div><b>{item.institution_name}</b><small>{item.account_count} account(s) · {item.last_synced_at ? 'Last sync ' + dateLabel(item.last_synced_at) : 'Not synchronized'}</small>{item.last_sync_error && <small className={styles.error}>{item.last_sync_error}</small>}</div>
              <div className={styles.connectionRight}>
                <span className={item.status === 'connected' ? styles.good : styles.warning}>{item.status.replaceAll('_', ' ')}</span>
                {['action_required','error'].includes(item.status) && <button className={styles.link} type="button" onClick={() => void reconnectBank(item.id)} disabled={reconnecting === item.id}>{reconnecting === item.id ? 'Opening bank…' : 'Reconnect'}</button>}
                {item.status !== 'disconnected' && <button className={styles.link} type="button" onClick={() => void syncBank(item.id)} disabled={syncing === item.id || reconnecting === item.id}>{syncing === item.id ? 'Syncing…' : 'Sync now'}</button>}
                {item.status !== 'disconnected' && <button className={styles.disconnect} type="button" onClick={() => void disconnectBank(item.id)} disabled={disconnecting === item.id}>{disconnecting === item.id ? 'Disconnecting…' : 'Disconnect'}</button>}
              </div>
            </div>
          ))}
        </div>}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeading}>
          <div><span>02 · 13-WEEK CASH FORECAST</span><h3>Upcoming cash commitments</h3><p>Use a dated cash balance and open invoices to model the next 13 weeks.</p></div>
          <span className={styles.tag}>13 WEEKS</span>
        </div>
        <form className={styles.cashForm} onSubmit={(event) => void saveCash(event)}>
          <label><span>Current cash ({currency})</span><input type="number" step="0.01" value={cash} onChange={(event) => setCash(event.target.value)} placeholder="e.g. 245000" required /></label>
          <label><span>Balance date</span><input type="date" value={cashDate} onChange={(event) => setCashDate(event.target.value)} required /></label>
          <button className={styles.secondary} type="submit" disabled={cashBusy}>{cashBusy ? 'Saving…' : 'Save cash balance'}</button>
        </form>
        {cashSource && <small className={styles.muted}>Balance source: {cashSource === 'powens' ? 'connected bank accounts' : 'manual entry'}.</small>}
        {cashError && <p className={styles.error}>{cashError}</p>}
        {!forecast ? <div className={styles.empty}><b>Forecast requirements</b><ul>{missing.map((line) => <li key={line}>{line}</li>)}</ul></div> : <>
          <div className={styles.metrics}>
            <div><span>Cash at start</span><b>{money(forecast.openingCash, currency)}</b></div>
            <div><span>Cash after 13 weeks</span><b className={forecast.endingCash < 0 ? styles.negative : ''}>{money(forecast.endingCash, currency)}</b></div>
            <div><span>Lowest projected cash</span><b className={forecast.minimumClosingCash < 0 ? styles.negative : ''}>{money(forecast.minimumClosingCash, currency)}</b></div>
            <div><span>Open invoices</span><b>{openInvoices.length}</b><small>{forecast.overdueInvoiceCount} overdue</small></div>
          </div>
          {forecast.firstNegativeWeek && <p className={styles.notice}>The current model projects negative closing cash in week {forecast.firstNegativeWeek}. Review the payment dates and operating assumptions.</p>}
          <div className={styles.tableWrap}><table><thead><tr><th>WEEK</th><th>INFLOWS</th><th>OUTFLOWS</th><th>NET MOVEMENT</th><th>CLOSING CASH</th></tr></thead><tbody>
            {forecast.weeks.map((week) => <tr key={week.week}><td>Week {week.week}<small>{dateLabel(week.startDate)} – {dateLabel(week.endDate)}</small></td><td>{money(week.inflows, currency)}</td><td>{money(week.outflows, currency)}</td><td className={week.netMovement < 0 ? styles.negative : styles.positive}>{money(week.netMovement, currency)}</td><td className={week.closingCash < 0 ? styles.negative : ''}><b>{money(week.closingCash, currency)}</b></td></tr>)}
          </tbody></table></div>
          <p className={styles.footnote}>{cashData?.basis} This is a planning estimate, not an intraday bank balance.</p>
        </>}

        <div className={styles.invoiceHeading}><div><b>Invoices and commitments</b><small>{openInvoices.length} open item(s)</small></div><button className={styles.secondary} type="button" onClick={() => setInvoiceOpen((value) => !value)}>{invoiceOpen ? 'Close' : '＋ Add invoice'}</button></div>
        {invoiceOpen && <form className={styles.invoiceForm} onSubmit={(event) => void createInvoice(event)}>
          <div className={styles.formGrid}>
            <label><span>Direction</span><select value={invoiceDirection} onChange={(event) => { const direction = event.target.value as 'receivable' | 'payable'; setInvoiceDirection(direction); setInvoiceCategory(direction === 'receivable' ? 'revenue' : 'opex'); }}><option value="receivable">To collect</option><option value="payable">To pay</option></select></label>
            <label><span>Category</span><select value={invoiceCategory} onChange={(event) => setInvoiceCategory(event.target.value)}><option value="revenue" disabled={invoiceDirection === "payable"}>Revenue</option><option value="cogs" disabled={invoiceDirection === "receivable"}>Direct costs</option><option value="payroll" disabled={invoiceDirection === "receivable"}>Payroll</option><option value="opex" disabled={invoiceDirection === "receivable"}>Operating costs</option><option value="other">Other / incremental</option></select></label>
            <label><span>Customer or supplier</span><input value={counterparty} onChange={(event) => setCounterparty(event.target.value)} required maxLength={160} /></label>
            <label><span>Amount ({currency})</span><input type="number" min="0.01" step="0.01" value={invoiceAmount} onChange={(event) => setInvoiceAmount(event.target.value)} required /></label>
            <label><span>Due date</span><input type="date" value={invoiceDue} onChange={(event) => setInvoiceDue(event.target.value)} required /></label>
            <label><span>Expected cash date</span><input type="date" value={invoiceExpected} onChange={(event) => setInvoiceExpected(event.target.value)} /></label>
          </div>
          <label className={styles.checkbox}><input type="checkbox" checked={invoiceIncluded && invoiceCategory !== 'other'} onChange={(event) => setInvoiceIncluded(event.target.checked)} disabled={invoiceCategory === 'other'} /><span>Already included in the monthly model (shift timing to avoid double counting).</span></label>
          {invoiceError && <p className={styles.error}>{invoiceError}</p>}
          <button className={styles.primary} type="submit" disabled={invoiceBusy}>{invoiceBusy ? 'Saving…' : 'Save invoice'}</button>
        </form>}
        {openInvoices.slice(0, 8).map((invoice) => <div className={styles.invoiceRow} key={invoice.id}>
          <div><b>{invoice.counterparty}</b><small>{invoice.direction === 'receivable' ? 'To collect' : 'To pay'} · {invoice.category} · {dateLabel(invoice.expected_cash_date || invoice.due_date)}</small></div>
          <strong className={invoice.direction === 'payable' ? styles.negative : styles.positive}>{money(invoice.amount, invoice.currency)}</strong>
          <button className={styles.link} type="button" onClick={() => void markPaid(invoice.id)}>Mark paid</button>
        </div>)}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeading}><div><span>03 · ACTUAL VS FORECAST</span><h3>Compare plan with performance</h3><p>Completed months are compared with the approved forecast snapshot saved before each month began.</p></div></div>
        {reconError && <p className={styles.error}>{reconError}</p>}
        {!reconciliation ? <p className={styles.muted}>Loading monthly reconciliation…</p> : reconMonths.length === 0 ? <p className={styles.empty}>No completed month has both a prior approved forecast and imported actuals yet. Avenor will start comparing once both are available.</p> : <div className={styles.tableWrap}><table><thead><tr><th>MONTH</th><th>FORECAST</th><th>ACTUAL</th><th>VARIANCE</th><th>ROWS</th></tr></thead><tbody>
          {reconMonths.map((month) => <tr key={month.month}><td>{month.month}</td><td>{money(month.forecastNetCashFlow, currency)}</td><td>{money(month.actualNetCashFlow, currency)}</td><td className={month.variance < 0 ? styles.negative : styles.positive}>{month.variance > 0 ? '+' : ''}{money(month.variance, currency)}</td><td>{month.records}</td></tr>)}
        </tbody></table></div>}
        {unmapped.length > 0 && <div className={styles.mappingPanel}><b>Classify imported categories</b><p>Unclassified transactions are excluded until assigned. Financing, tax and transfers should normally remain excluded.</p>
          {unmapped.slice(0, 8).map((item) => <div className={styles.mappingRow} key={item.metric_key}>
            <div><b>{item.metric_key}</b><small>{item.records} record(s) · {money(item.amount, currency)}</small></div>
            <select value={mappingValues[item.metric_key] || 'exclude'} onChange={(event) => setMappingValues((current) => ({ ...current, [item.metric_key]: event.target.value as MappingCategory }))}><option value="exclude">Exclude</option><option value="revenue">Revenue</option><option value="cogs">Direct costs</option><option value="payroll">Payroll</option><option value="opex">Operating costs</option><option value="other">Other cash flow</option></select>
            <button className={styles.link} type="button" disabled={reconBusy === item.metric_key} onClick={() => void saveMapping(item.metric_key)}>{reconBusy === item.metric_key ? 'Saving…' : 'Save'}</button>
          </div>)}
        </div>}
        <p className={styles.footnote}>{reconciliation?.note} {reconciliation?.mismatchedCurrencies.length ? 'Excluded currencies: ' + reconciliation.mismatchedCurrencies.join(', ') : ''}</p>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeading}><div><span>04 · WEEKLY CFO REPORT</span><h3>Your finance check-in, every Monday</h3><p>Cash position, runway risks, operating signals and upcoming invoice dates, sent only when you opt in.</p></div><span className={reportEnabled ? styles.good : styles.tag}>{reportEnabled ? 'ENABLED' : 'OFF'}</span></div>
        <form className={styles.reportForm} onSubmit={(event) => void saveReport(event)}>
          <label><span>Recipient email</span><input type="email" required maxLength={254} value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="you@company.com" /></label>
          <label className={styles.checkbox}><input type="checkbox" checked={reportEnabled} onChange={(event) => setReportEnabled(event.target.checked)} /><span>Enable my weekly Avenor report</span></label>
          <div><button className={styles.secondary} type="submit" disabled={reportBusy}>{reportBusy ? 'Saving…' : 'Save report settings'}</button><small>Scheduled Monday at 07:00 UTC.</small></div>
        </form>
        {reportMessage && <p className={styles.success}>{reportMessage}</p>}
        {reportError && <p className={styles.error}>{reportError}</p>}
        <p className={styles.footnote}>Delivery requires a verified email sender and server-side Resend credentials. Preferences can be switched off here at any time.</p>
      </section>
    </section>
  );
}
