'use client';

import { useState, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { meetsMinimumPasswordPolicy } from '@/lib/password-policy';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    if (!meetsMinimumPasswordPolicy(password)) {
      setMessage('Use at least 12 characters with lowercase and uppercase letters, a number and a symbol.');
      return;
    }
    if (password !== confirmation) {
      setMessage('The passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const config = getSupabasePublicConfig();
      if (!config) throw new Error('Supabase configuration is missing.');

      const supabase = createBrowserClient(config.url, config.key);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMessage('Your password has been updated. You can now sign in.');
      window.setTimeout(() => window.location.assign('/login'), 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update your password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand"><span className="brand-mark">A</span><span>avenor</span></div>
        <h1>Choose a new password</h1>
        <p>Use 12+ characters, including uppercase and lowercase letters, a number and a symbol.</p>
        <label>
          New password
          <input type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Confirm new password
          <input type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </label>
        <button className="button-primary" disabled={busy}>{busy ? 'Updating...' : 'Update password'}</button>
        {message && <p role="status">{message}</p>}
      </form>
    </main>
  );
}
