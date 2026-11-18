'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { EMPTY_COMPANY_CONTEXT, type CompanyContext } from '@/lib/company-context';
import styles from './onboarding.module.css';

type FinancialDraft = {
  openingCash: string;
  monthlyRevenue: string;
  existingMonthlyPayroll: string;
  monthlyOpexExPayroll: string;
  cogsPct: string;
};

const emptyFinancials: FinancialDraft = {
  openingCash: '',
  monthlyRevenue: '',
  existingMonthlyPayroll: '',
  monthlyOpexExPayroll: '',
  cogsPct: '',
};

export default function OnboardingPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('FR');
  const [currency, setCurrency] = useState('EUR');
  const [context, setContext] = useState<CompanyContext>(EMPTY_COMPANY_CONTEXT);
  const [financials, setFinancials] = useState<FinancialDraft>(emptyFinancials);
  const [addFinancialSnapshot, setAddFinancialSnapshot] = useState(false);
  const [createdOrganizationId, setCreatedOrganizationId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/organizations')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !data?.organizations?.length) return;
        const organization = data.organizations[0];
        localStorage.setItem('financeos.organizationId', organization.organization_id);
        document.cookie = `avenor_organization_id=${encodeURIComponent(organization.organization_id)}; Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
        window.location.replace('/app');
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  function updateContext<K extends keyof CompanyContext>(key: K, value: CompanyContext[K]) {
    setContext((current) => ({ ...current, [key]: value }));
  }

  function updateFinancial<K extends keyof FinancialDraft>(key: K, value: FinancialDraft[K]) {
    setFinancials((current) => ({ ...current, [key]: value }));
  }

  function continueFromBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setStep(2);
  }

  function continueFromContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context.productDescription.trim() || !context.targetCustomer.trim() || !context.mainGoal.trim()) {
      setError('Add a short product description, your target customer and your main goal. These help Avenor give relevant advice.');
      return;
    }
    setError('');
    setStep(3);
  }

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    let openingCash = 0;
    let monthlyRevenue = 0;
    let existingMonthlyPayroll = 0;
    let monthlyOpexExPayroll = 0;
    let cogsRatio = 0;

    if (addFinancialSnapshot) {
      const values = Object.values(financials).map((value) => value.trim());
      if (values.some((value) => value === '')) {
        setError('Complete all five financial fields, or choose “I will add financials later”.');
        setBusy(false);
        return;
      }
      [openingCash, monthlyRevenue, existingMonthlyPayroll, monthlyOpexExPayroll] = values.slice(0, 4).map(Number);
      cogsRatio = Number(values[4]) / 100;
      if (
        ![openingCash, monthlyRevenue, existingMonthlyPayroll, monthlyOpexExPayroll, cogsRatio].every(Number.isFinite) ||
        openingCash < 0 || monthlyRevenue < 0 || existingMonthlyPayroll < 0 ||
        monthlyOpexExPayroll < 0 || cogsRatio < 0 || cogsRatio > 1
      ) {
        setError('Check the financial values. Amounts must be non-negative and direct costs must be between 0% and 100%.');
        setBusy(false);
        return;
      }
    }

    try {
      let organizationId = createdOrganizationId;
      if (!organizationId) {
        const organizationResponse = await fetch('/api/organizations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, countryCode: country, currency }),
        });
        const organizationData = await organizationResponse.json();
        if (!organizationResponse.ok) throw new Error(organizationData.error || 'Could not create workspace');
        organizationId = organizationData.organizationId as string;
        setCreatedOrganizationId(organizationId);
        localStorage.setItem('financeos.organizationId', organizationId);
        document.cookie = `avenor_organization_id=${encodeURIComponent(organizationId)}; Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
      }

      const contextResponse = await fetch('/api/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, context }),
      });
      const contextData = await contextResponse.json();
      if (!contextResponse.ok) throw new Error(contextData.error || 'Workspace created, but company context could not be saved. Retry to finish setup.');

      if (addFinancialSnapshot) {
        const modelResponse = await fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            name: 'Initial company plan',
            status: 'draft',
            assumptions: {
              openingCash,
              monthlyRevenue,
              monthlyRevenueGrowth: 0,
              monthlyOpexExPayroll,
              monthlyOpexGrowth: 0,
              cogsRatio,
              existingMonthlyPayroll,
              existingOtherNetCashAdjustments: 0,
            },
          }),
        });
        const modelData = await modelResponse.json();
        if (!modelResponse.ok) throw new Error(modelData.error || 'Company profile saved, but the initial financial model could not be saved. Retry to finish setup.');
      }

      window.location.assign('/app?welcome=1');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unexpected error');
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <a className={styles.back} href="/">← Back to Avenor</a>
        <div className={styles.brand}><span className={styles.mark}>a</span><span>avenor</span></div>
        <div className={styles.progressBlock}>
          <div className={styles.progressTop}><span>YOUR WORKSPACE SETUP</span><b>STEP {step} OF 3</b></div>
          <div className={styles.progressTrack}><i style={{ width: `${(step / 3) * 100}%` }} /></div>
          <div className={styles.stepLabels}><span className={step >= 1 ? styles.activeStep : ''}>Company</span><span className={step >= 2 ? styles.activeStep : ''}>Business</span><span className={step >= 3 ? styles.activeStep : ''}>Financials</span></div>
        </div>

        {step === 1 && (
          <form onSubmit={continueFromBusiness}>
            <div className={styles.kicker}>01 · THE BASICS</div>
            <h1>First, tell us about your company.</h1>
            <p className={styles.lede}>This gives Avenor the right context before it starts helping with financial decisions.</p>
            <label className={styles.field}>Company name<input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Northstar Labs" /></label>
            <div className={styles.grid}>
              <label className={styles.field}>Country<select value={country} onChange={(event) => setCountry(event.target.value)}><option value="FR">France</option><option value="DE">Germany</option><option value="ES">Spain</option><option value="NL">Netherlands</option><option value="GB">United Kingdom</option><option value="IE">Ireland</option></select></label>
              <label className={styles.field}>Base currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="EUR">EUR — Euro</option><option value="GBP">GBP — Pound sterling</option><option value="USD">USD — US dollar</option></select></label>
            </div>
            <div className={styles.grid}>
              <label className={styles.field}>Industry<input value={context.industry} onChange={(event) => updateContext('industry', event.target.value)} placeholder="e.g. B2B software" /></label>
              <label className={styles.field}>Business model<select value={context.businessModel} onChange={(event) => updateContext('businessModel', event.target.value as CompanyContext['businessModel'])}><option value="saas">SaaS / subscription</option><option value="marketplace">Marketplace</option><option value="services">Services</option><option value="ecommerce">E-commerce</option><option value="hardware">Hardware</option><option value="other">Other</option></select></label>
            </div>
            <label className={styles.field}>Company stage<select value={context.stage} onChange={(event) => updateContext('stage', event.target.value as CompanyContext['stage'])}><option value="idea">Idea / validation</option><option value="pre-seed">Pre-seed</option><option value="seed">Seed</option><option value="series-a">Series A</option><option value="series-b">Series B+</option><option value="profitable">Profitable / bootstrapped</option><option value="other">Other</option></select></label>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button className={styles.primary} type="submit">Continue <span>→</span></button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={continueFromContext}>
            <div className={styles.kicker}>02 · BUSINESS CONTEXT</div>
            <h1>Help Avenor understand how you make money.</h1>
            <p className={styles.lede}>These details become persistent company context. You can update them at any time.</p>
            <label className={styles.field}>What does your product or service do?<textarea required rows={3} maxLength={600} value={context.productDescription} onChange={(event) => updateContext('productDescription', event.target.value)} placeholder="Explain the problem you solve and what customers buy." /></label>
            <label className={styles.field}>Who is your target customer?<input required maxLength={300} value={context.targetCustomer} onChange={(event) => updateContext('targetCustomer', event.target.value)} placeholder="e.g. Finance teams at European SaaS companies" /></label>
            <div className={styles.grid}>
              <label className={styles.field}>Where do you operate?<input maxLength={160} value={context.geography} onChange={(event) => updateContext('geography', event.target.value)} placeholder="e.g. France and Benelux" /></label>
              <label className={styles.field}>How do you charge?<input maxLength={160} value={context.pricingModel} onChange={(event) => updateContext('pricingModel', event.target.value)} placeholder="e.g. €99 per seat / month" /></label>
            </div>
            <label className={styles.field}>Your main goal for the next 6–12 months<input required maxLength={240} value={context.mainGoal} onChange={(event) => updateContext('mainGoal', event.target.value)} placeholder="e.g. Reach €50k MRR while preserving 18 months of runway" /></label>
            <label className={styles.field}>Next important milestone <span className={styles.optional}>OPTIONAL</span><input maxLength={240} value={context.nextMilestone} onChange={(event) => updateContext('nextMilestone', event.target.value)} placeholder="e.g. Launch in Germany or prepare a Seed round" /></label>
            <div className={styles.actions}><button className={styles.secondary} type="button" onClick={() => setStep(1)}>Back</button><button className={styles.primary} type="submit">Continue <span>→</span></button></div>
            {error && <p className={styles.error} role="alert">{error}</p>}
          </form>
        )}

        {step === 3 && (
          <form onSubmit={finish}>
            <div className={styles.kicker}>03 · FINANCIAL STARTING POINT</div>
            <h1>Give Avenor a starting point.</h1>
            <p className={styles.lede}>A few numbers unlock cash forecasts and decision simulations. You can skip this and add verified figures later.</p>
            <label className={styles.switchRow}>
              <input type="checkbox" checked={addFinancialSnapshot} onChange={(event) => setAddFinancialSnapshot(event.target.checked)} />
              <span><b>Set up my first financial model now</b><small>Save the figures below as a draft, not an approved forecast.</small></span>
            </label>
            {addFinancialSnapshot && (
              <>
                <div className={styles.grid}>
                  <label className={styles.field}>Current cash balance ({currency})<input required type="number" min="0" step="100" value={financials.openingCash} onChange={(event) => updateFinancial('openingCash', event.target.value)} placeholder="e.g. 250000" /></label>
                  <label className={styles.field}>Monthly revenue ({currency})<input required type="number" min="0" step="100" value={financials.monthlyRevenue} onChange={(event) => updateFinancial('monthlyRevenue', event.target.value)} placeholder="e.g. 30000" /></label>
                  <label className={styles.field}>Monthly team costs ({currency})<input required type="number" min="0" step="100" value={financials.existingMonthlyPayroll} onChange={(event) => updateFinancial('existingMonthlyPayroll', event.target.value)} placeholder="e.g. 18000" /></label>
                  <label className={styles.field}>Other monthly costs ({currency})<input required type="number" min="0" step="100" value={financials.monthlyOpexExPayroll} onChange={(event) => updateFinancial('monthlyOpexExPayroll', event.target.value)} placeholder="e.g. 7000" /></label>
                </div>
                <label className={styles.field}>Direct costs as a share of revenue (%)<input required type="number" min="0" max="100" step="0.1" value={financials.cogsPct} onChange={(event) => updateFinancial('cogsPct', event.target.value)} placeholder="e.g. 15" /></label>
                <p className={styles.note}>Avenor will label this model as a draft until you review and approve the assumptions inside Company setup.</p>
              </>
            )}
            {!addFinancialSnapshot && <div className={styles.skipNote}>No problem. Avenor can still remember your company profile. Add financial figures when you have them.</div>}
            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.actions}><button className={styles.secondary} type="button" onClick={() => setStep(2)}>Back</button><button className={styles.primary} disabled={busy}>{busy ? 'Creating your workspace…' : createdOrganizationId ? 'Retry setup' : 'Create my workspace'} <span>→</span></button></div>
          </form>
        )}
        <p className={styles.privacy}>Your company context and financial data are stored in your private workspace. Avenor will distinguish your own assumptions from imported actuals.</p>
      </div>
    </main>
  );
}
