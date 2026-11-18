'use client';

import { useState, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from '@/lib/supabase/config';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      const config = getSupabasePublicConfig();
      if (!config) throw new Error('Supabase configuration is missing.');

      const supabase = createBrowserClient(config.url, config.key);
      const redirectTo = new URL('/auth/callback?next=/reset-password', window.location.origin).toString();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;

      setMessage('If an account exists for this email, a password reset link has been sent.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the reset email.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand"><span className="brand-mark">A</span><span>avenor</span></div>
        <h1>Reset your password</h1>
        <p>Enter your account email and we will send you a secure reset link.</p>
        <label>
          Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </label>
        <button className="button-primary" disabled={busy}>{busy ? 'Sending...' : 'Send reset link'}</button>
        {message && <p role="status">{message}</p>}
        <a href="/login">Back to sign in</a>
      </form>
    </main>
  );
}
