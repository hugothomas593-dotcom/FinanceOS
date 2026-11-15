'use client';

import { useEffect, useState, type FormEvent } from 'react';

export default function OnboardingPage() {
  const [name, setName] = useState('');
  const [country, setCountry] = useState('FR');
  const [currency, setCurrency] = useState('EUR');
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
        window.location.replace('/app');
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, countryCode: country, currency }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create workspace');
      localStorage.setItem('financeos.organizationId', data.organizationId);
      window.location.assign('/app');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unexpected error');
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={create}>
        <a className="auth-home-link" href="/">← Back to Avenor</a>
        <div className="brand"><span className="brand-mark">A</span><span>avenor</span></div>
        <h1>Set up your company</h1>
        <p>We’ll use these details to configure your financial workspace.</p>
        <label>Company name<input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Northstar Labs" /></label>
        <label>Country<select value={country} onChange={(event) => setCountry(event.target.value)}><option value="FR">France</option><option value="DE">Germany</option><option value="ES">Spain</option><option value="NL">Netherlands</option><option value="GB">United Kingdom</option><option value="IE">Ireland</option></select></label>
        <label>Base currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="EUR">EUR — Euro</option><option value="GBP">GBP — Pound sterling</option><option value="USD">USD — US dollar</option></select></label>
        {error && <p role="alert">{error}</p>}
        <button className="button-primary" disabled={busy}>{busy ? 'Creating workspace…' : 'Create workspace'}</button>
      </form>
    </main>
  );
}
