'use client';

import { useCallback, useEffect, useState } from 'react';

type Workspace = {
  organization_id: string;
  role: string;
  organizations: {
    id: string;
    name: string;
    base_currency: string;
  } | null;
};

type BillingStatus = {
  hasAccess: boolean;
  billingConfigured: boolean;
  trialAvailable: boolean | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  trialDays: number | null;
  canStartCheckout: boolean;
  canManageBilling: boolean;
};

export default function SubscribePage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [polling, setPolling] = useState(false);

  const loadBilling = useCallback(async (organizationId: string) => {
    const response = await fetch(
      '/api/billing/status?organizationId=' + encodeURIComponent(organizationId),
      { cache: 'no-store' },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not verify subscription status');
    setBilling(data as BillingStatus);
    return data as BillingStatus;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch('/api/organizations', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load your workspace');
        const organizations = (data.organizations ?? []) as Workspace[];
        if (!organizations.length) {
          window.location.replace('/onboarding');
          return;
        }

        const rememberedId = window.localStorage.getItem('financeos.organizationId');
        const selected = organizations.find((item) => item.organization_id === rememberedId) ?? organizations[0];
        if (!selected.organizations) throw new Error('Could not load your company workspace');
        if (cancelled) return;
        setWorkspace(selected);
        window.localStorage.setItem('financeos.organizationId', selected.organization_id);

        const checkout = new URLSearchParams(window.location.search).get('checkout');
        if (checkout === 'cancelled') {
          setNotice('Checkout was cancelled. No subscription was started.');
        } else if (checkout === 'success') {
          setNotice('Your Checkout is complete. Confirming your 30-day trial with Stripe…');
          setPolling(true);
        }

        let status = await loadBilling(selected.organization_id);
        if (status.hasAccess) {
          window.location.replace('/app');
          return;
        }

        if (checkout === 'success') {
          for (let attempt = 0; attempt < 20 && !cancelled; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 1500));
            status = await loadBilling(selected.organization_id);
            if (status.hasAccess) {
              window.location.replace('/app');
              return;
            }
          }
          if (!cancelled) {
            setNotice('Stripe is still confirming the subscription. Refresh this page in a moment; your access will open once the signed webhook is processed.');
          }
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load billing');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setPolling(false);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [loadBilling]);

  async function startCheckout() {
    if (!workspace || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: workspace.organization_id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not open secure Checkout');
      if (typeof data.url !== 'string') throw new Error('Stripe did not return a Checkout URL');
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start Checkout');
      setBusy(false);
    }
  }

  async function manageBilling() {
    if (!workspace || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: workspace.organization_id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not open the billing portal');
      if (typeof data.url !== 'string') throw new Error('Stripe did not return a billing portal URL');
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open billing');
      setBusy(false);
    }
  }

  const isBillingAdmin = Boolean(workspace && ['owner', 'admin'].includes(workspace.role));
  const trialAvailable = billing?.trialAvailable === true;
  const paidCheckout = billing?.trialAvailable === false;

  return (
    <main className="login-shell subscribe-shell">
      <section className="login-card subscribe-card">
        <a className="auth-home-link" href="/">← Back to Avenor</a>
        <div className="brand"><span className="brand-mark">A</span><span>avenor</span></div>
        <div className="subscribe-eyebrow">AVENOR FOUNDER</div>
        <h1>{loading ? 'Preparing your workspace' : 'Put your financial decisions in context.'}</h1>
        <p>Use Avenor to model runway, evaluate hiring and pricing decisions, understand cash movements and prepare for your next milestone.</p>

        {workspace?.organizations && (
          <div className="subscribe-workspace">
            <span>WORKSPACE</span>
            <strong>{workspace.organizations.name}</strong>
          </div>
        )}

        <div className="subscribe-price">
          <div><strong>€59</strong><span>/ month</span></div>
          <p>One plan. All founder finance tools.</p>
        </div>

        {loading ? (
          <p className="subscribe-muted">Checking your subscription and workspace access…</p>
        ) : !billing?.billingConfigured ? (
          <div className="subscribe-message" role="status">
            <strong>Online billing is not connected yet.</strong>
            <p>Your workspace is protected. Checkout will be available once the Avenor Stripe price, webhook and server credentials have been configured and tested.</p>
          </div>
        ) : !isBillingAdmin ? (
          <div className="subscribe-message" role="status">
            <strong>Your workspace owner needs to activate the plan.</strong>
            <p>Ask an owner or admin of {workspace?.organizations?.name ?? 'this workspace'} to start the subscription. Your access will open automatically when the trial or paid subscription is active.</p>
          </div>
        ) : billing?.canManageBilling && billing.subscriptionStatus && !billing.canStartCheckout ? (
          <div className="subscribe-message" role="status">
            <strong>Subscription status: {billing.subscriptionStatus.replaceAll('_', ' ')}.</strong>
            <p>Manage your payment method or subscription securely through Stripe. If a payment failed, update the payment method there and allow Stripe to refresh the subscription status.</p>
            <button className="button-secondary subscribe-secondary" type="button" disabled={busy} onClick={() => void manageBilling()}>
              {busy ? 'Opening Stripe…' : 'Manage subscription'}
            </button>
          </div>
        ) : (
          <>
            {trialAvailable ? (
              <div className="subscribe-trial">
                <strong>30 days free. €0 charged today.</strong>
                <p>Add a payment card in secure Stripe Checkout. Your first €59 payment is scheduled after the 30-day trial, then every month. Cancel before the trial ends to avoid the first charge.</p>
              </div>
            ) : paidCheckout ? (
              <div className="subscribe-message">
                <strong>Your free trial has already been used.</strong>
                <p>Continuing will start the €59/month subscription immediately. Stripe will show the amount and billing date before you confirm.</p>
              </div>
            ) : (
              <div className="subscribe-message">
                <strong>Trial eligibility is being checked.</strong>
                <p>Checkout will show any amount due and the next billing date before you confirm.</p>
              </div>
            )}
            <button className="button-primary subscribe-primary" type="button" disabled={busy || !billing?.canStartCheckout} onClick={() => void startCheckout()}>
              {busy ? 'Opening secure Checkout…' : trialAvailable ? 'Start my 30-day free trial' : 'Continue to €59/month'}
            </button>
            {billing?.canManageBilling && (
              <button className="button-secondary subscribe-secondary" type="button" disabled={busy} onClick={() => void manageBilling()}>
                Manage existing payment details
              </button>
            )}
          </>
        )}

        {polling && <p className="subscribe-muted">Waiting for Stripe's signed confirmation…</p>}
        {notice && <p className="subscribe-notice" role="status">{notice}</p>}
        {error && <p className="subscribe-error" role="alert">{error}</p>}

        <div className="subscribe-inclusions">
          <span>Included in Avenor Founder</span>
          <ul>
            <li>AI finance Copilot and deterministic decision simulations</li>
            <li>18-month cash forecast and CFO Brief</li>
            <li>CSV history, growth metrics and unit economics</li>
            <li>Saved decisions and fundraising scenarios</li>
          </ul>
        </div>

        <p className="subscribe-legal">
          A card is required to start the trial. At the end of the trial, the subscription renews at €59/month until cancelled. You can cancel through the Stripe billing portal before the first payment. The exact first billing date and applicable terms are shown in Checkout. The €59 is the subscription price. VAT/tax treatment and registrations must be configured before public billing is enabled.
        </p>
      </section>
    </main>
  );
}
