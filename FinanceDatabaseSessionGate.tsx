import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AlertCircle, CheckCircle2, Loader2, LockKeyhole, Mail } from 'lucide-react';
import { financeSupabase, isFinanceSupabaseConfigured } from './financeSupabaseClient';
import type { Profile } from './types';

interface FinanceDatabaseProfile {
  id: string; auth_user_id: string; email: string; first_name: string; last_name: string;
  branch_id: string | null; portal_access_status: string; record_status: string;
}
interface Props {
  mockProfile: Profile | null;
  children: (databaseProfile: FinanceDatabaseProfile) => React.ReactNode;
}

export const FinanceDatabaseSessionGate: React.FC<Props> = ({ mockProfile, children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [databaseProfile, setDatabaseProfile] = useState<FinanceDatabaseProfile | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isFinanceSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isFinanceSupabaseConfigured) { setLoading(false); return; }
    let active = true;
    const resolveSession = async (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession); setDatabaseProfile(null); setError(null);
      if (!nextSession) { setLoading(false); return; }
      const { data, error: profileError } = await financeSupabase.from('profiles')
        .select('id,auth_user_id,email,first_name,last_name,branch_id,portal_access_status,record_status')
        .eq('auth_user_id', nextSession.user.id).maybeSingle();
      if (!active) return;
      if (profileError) setError(profileError.message);
      else if (!data) setError('This Supabase Auth account is not explicitly linked to a church profile. Ask an administrator to provision the account; matching email addresses alone do not grant access.');
      else if (data.portal_access_status !== 'active' || data.record_status !== 'active') setError('The linked church profile is not active for portal access. Contact a church administrator.');
      else setDatabaseProfile(data as FinanceDatabaseProfile);
      setLoading(false);
    };
    const { data: authListener } = financeSupabase.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => { void resolveSession(nextSession); }, 0);
    });
    void financeSupabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      void resolveSession(data.session);
    });
    return () => { active = false; authListener.subscription.unsubscribe(); };
  }, []);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      if (password.trim()) {
        const { error: signInError } = await financeSupabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
      } else {
        const { error: otpError } = await financeSupabase.auth.signInWithOtp({
          email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: window.location.href }
        });
        if (otpError) throw otpError;
        setNotice('A secure sign-in link has been sent if this email belongs to a provisioned account. Open it in this browser to continue.');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Supabase sign-in failed.'); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    setBusy(true); const { error: signOutError } = await financeSupabase.auth.signOut();
    if (signOutError) setError(signOutError.message); setBusy(false);
  };

  if (!isFinanceSupabaseConfigured) return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950">
      <h2 className="font-black">Finance database connection is not configured</h2>
      <p className="mt-2">Set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and VITE_SUPABASE_INTEGRATION=finance in the local or deployment environment, then restart/redeploy SCMS. Never use a service-role or secret key in the browser.</p>
    </section>
  );
  if (loading) return <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600"><Loader2 className="animate-spin" size={17} /> Checking secure Finance session…</div>;
  if (!session || !databaseProfile) return (
    <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-lg font-black text-slate-900"><LockKeyhole size={20} /> Secure Finance sign-in</div>
      <p className="mt-2 text-sm text-slate-600">Your development login remains available for switching mock users. Finance database operations require a separate verified Supabase Auth session linked to an active church profile.</p>
      {error && <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={17} />{error}</div>}
      {notice && <div role="status" className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={17} />{notice}</div>}
      <form onSubmit={signIn} className="mt-4 space-y-3">
        <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Provisioned account email</label>
        <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
        <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Password (leave blank to send a sign-in link)</label>
        <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password or leave blank for email link" />
        <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Mail size={16} />{busy ? 'Connecting…' : password ? 'Sign in to Finance' : 'Email secure sign-in link'}</button>
      </form>
      <p className="mt-3 text-xs text-slate-500">No public sign-up is offered here. Only previously provisioned Auth users explicitly linked to church profiles can enter Finance.</p>
    </section>
  );
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-950">
      <div><strong>Database identity:</strong> {[databaseProfile.first_name, databaseProfile.last_name].filter(Boolean).join(' ')} · {databaseProfile.email}<br /><span className="text-emerald-800">The selected development profile is for UI testing only; database authorization uses this signed-in identity and its database role assignments.</span></div>
      <button type="button" disabled={busy} onClick={() => void signOut()} className="rounded-lg border border-emerald-300 px-3 py-2 font-bold disabled:opacity-50">Sign out of database</button>
    </div>
    {mockProfile?.email && mockProfile.email.toLowerCase() !== databaseProfile.email.toLowerCase() && <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">Development profile selected: {mockProfile.email}. Real Finance data remains scoped to {databaseProfile.email}; changing the mock user does not change database privileges.</div>}
    {children(databaseProfile)}
  </div>;
};
