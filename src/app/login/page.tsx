'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { meetsMinimumPasswordPolicy } from '@/lib/password-policy';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const requestedMode = new URLSearchParams(window.location.search).get('mode');
    if (requestedMode === 'signup') setMode('signup');
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode === 'signup' && !meetsMinimumPasswordPolicy(password)) {
      setMessage('Use at least 12 characters with lowercase and uppercase letters, a number and a symbol.');
      return;
    }
    setBusy(true);
    setMessage('');

    try {
      const config = getSupabasePublicConfig();
      if (!config) throw new Error('Supabase configuration is missing.');

      const supabase = createBrowserClient(config.url, config.key);

      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.assign('/app');
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: new URL('/auth/callback', window.location.origin).toString(),
        },
      });

      if (error) throw error;

      if (data.session) {
        window.location.assign('/onboarding');
        return;
      }

      setMessage('Account created. Please check your email to confirm your address.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'An unexpected error occurred.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <a className="auth-home-link" href="/" aria-label="Back to Avenor home">← Back to Avenor</a>
        <div className="brand">
          <span className="brand-mark">A</span>
          <span>avenor</span>
        </div>

        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
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
            minLength={mode === 'login' ? 8 : 12}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'login' ? 'Your password' : '12+ characters, upper/lowercase, number and symbol'}
          />
        </label>
        {mode === 'signup' && <p className="auth-help">Use 12+ characters, including uppercase and lowercase letters, a number and a symbol.</p>}

        <button className="button-primary" disabled={busy}>
          {busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        {message && <p role="status">{message}</p>}

        {mode === 'login' && (
          <p className="auth-help">
            <a href="/forgot-password">Forgot your password?</a>
          </p>
        )}

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
