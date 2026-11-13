
'use client';

import { useState, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!url || !key) {
        throw new Error('Supabase configuration is missing.');
      }

      const supabase = createBrowserClient(url, key);

      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        window.location.assign('/');
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      setMessage(
        data.session
          ? 'Account created successfully. Redirecting...'
          : 'Account created. Please check your email to confirm your address.'
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'An unexpected error occurred.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark">A</span>
          <span>
            avenor
          </span>
        </div>

        <h1>
          {mode === 'login' ? 'Welcome back' : 'Create your workspace'}
        </h1>

        <p>Financial clarity for your next decision.</p>

        <label>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </label>

        <button className="button-primary" disabled={busy}>
          {busy
            ? 'Please wait...'
            : mode === 'login'
              ? 'Sign in'
              : 'Create account'}
        </button>

        {message && <p role="status">{message}</p>}

        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setMessage('');
          }}
        >
          {mode === 'login'
            ? "Don't have an account? Create one"
            : 'Already have an account? Sign in'}
        </button>
      </form>
    </main>
  );
}
