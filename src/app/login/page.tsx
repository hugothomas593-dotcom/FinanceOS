'use client';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function LoginPage() {
  const [mode,setMode] = useState<'login'|'signup'>('signup'); const [email,setEmail] = useState(''); const [password,setPassword] = useState(''); const [message,setMessage] = useState(''); const [busy,setBusy] = useState(false);
  async function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); setMessage('');
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!key){setMessage('Authentication is not configured yet. Add your Supabase project URL and anon key.');setBusy(false);return;}
    const supabase=createBrowserClient(url,key);
    const result=mode==='signup'?await supabase.auth.signUp({email,password,options:{emailRedirectTo:`${window.location.origin}/auth/callback`}}):await supabase.auth.signInWithPassword({email,password});
    if (!result.error && mode==='login') { window.location.assign('/'); return; } setMessage(result.error?.message ?? 'Check your email to confirm your account.'); setBusy(false);
  }
  return <main className="login-shell"><form className="login-card" onSubmit={submit}><div className="brand"><span className="brand-mark">f</span><span>finance<span className="brand-light">os</span></span></div><h1>{mode==='signup'?'Create your workspace':'Welcome back'}</h1><p>Financial clarity for your next decision.</p><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="button-primary" disabled={busy}>{busy?'Please wait…':mode==='signup'?'Create account':'Sign in'}</button>{message&&<p role="status">{message}</p>}<button type="button" className="button-secondary" onClick={()=>setMode(mode==='signup'?'login':'signup')}>{mode==='signup'?'Already have an account? Sign in':'New to FinanceOS? Create an account'}</button></form></main>
}
