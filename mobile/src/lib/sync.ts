import type { User } from '@supabase/supabase-js';
import { AppState as RNAppState } from 'react-native';

import { session } from '@/state/session';
import { acct, blank, clearLocal, getS, replaceS, save, setAfterSave } from '@/state/store';
import type { AppState } from '@/state/types';

import { WEB_URL } from './config';
import { histFlush, pendingWorkouts } from './history';
import { supabase } from './supabase';

/* Accounts and sync, ported from the web app (signin.js). The phone keeps its own copy of the data and
   works offline; changes are uploaded to `user_state` shortly after they happen (newest save wins). */

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushBusy = false;
let dirty = false;

const validState = (o: unknown): o is AppState => {
  const s = o as AppState | null;
  return !!s && s.v === 1 && !!s.cur && !!s.last;
};

/** Friendly text for the common sign-in problems. */
export function authMessage(e: unknown): string {
  const m = (e as { message?: string; error_description?: string } | null)?.message ?? (e as { error_description?: string } | null)?.error_description ?? 'Something went wrong. Try again.';
  if (/invalid login/i.test(m)) return 'Email or password is wrong.';
  if (/already registered|already exists/i.test(m)) return 'There’s already an account with that email. Sign in instead.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link.';
  if (/password should be at least|weak password/i.test(m)) return 'Use a password of at least 6 characters.';
  if (/email rate limit/i.test(m)) return 'We can’t send sign-up emails right now because too many went out in the last hour. Please try again a bit later.';
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute and try again.';
  if (/fetch|network/i.test(m)) return 'Can’t reach the server. Check your connection.';
  return m;
}

/** Check for a saved session when the app starts. */
export async function initAuth(): Promise<void> {
    try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const user = data.session?.user ?? null;
    session.set({ user, ready: true });
    if (user) void syncDown(user);
  } catch {
    /* can't reach the server to refresh the session: if this phone was signed in, keep working offline */
    const A = acct();
    if (A.signedIn && A.id) {
      session.set({ user: { id: A.id, email: A.email } as User, ready: true, offline: true });
    } else session.set({ ready: true, offline: true });
  }
}

async function syncDown(user: User, fresh = false): Promise<void> {
  session.set({ syncing: true });
  let S = getS();
  if (acct().id && acct().id !== user.id) {
    /* someone else used this phone before */
    const nm = fresh ? S.names[0] : '';
    const b = blank();
    if (nm) b.names[0] = nm;
    replaceS(b);
  }
  const A = acct();
  A.id = user.id;
  A.email = user.email ?? A.email;
  A.signedIn = true;
  A.authMode = 'supabase';
  try {
    const { data: row, error } = await supabase.from('user_state').select('data,client_ts').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    S = getS();
    const remote = row?.data as AppState | undefined;
    if (validState(remote) && (!S.onboarded || (Number(row?.client_ts) || 0) > (S.ts || 0))) {
      const keep = pendingWorkouts().slice(); /* workouts finished on this phone but not uploaded yet */
      const next = remote;
      next.who = 0;
      const wo = (next.wout = Array.isArray(next.wout) ? next.wout : []);
      keep.forEach((w) => {
        if (!wo.some((x) => x.id === w.id)) wo.push(w);
      });
      next.account = { ...(next.account ?? { id: '', email: '', signedIn: true }), id: user.id, email: user.email ?? '', signedIn: true, authMode: 'supabase' };
      replaceS(next);
      session.set({ ok: true });
    } else {
      save();
      await pushNow(true);
    }
    const { data: p } = await supabase.from('profiles').select('display_name,tier,is_admin').eq('id', user.id).maybeSingle();
    if (p) {
      const cur = getS();
      if (p.display_name && (!cur.names[0] || cur.names[0] === 'You')) cur.names[0] = p.display_name;
      acct().serverTier = p.tier;
      session.set({ admin: !!p.is_admin, serverTier: p.tier });
    }
    session.set({ offline: false });
  } catch {
    session.set({ offline: true });
  } finally {
    session.set({ syncing: false });
  }
  void histFlush();
}

/* ---- upload ---- */
export function queuePush() {
  if (!session.get().user) return;
  dirty = true;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void pushNow(), 800);
}
setAfterSave(queuePush);

export async function pushNow(force = false): Promise<void> {
  const user = session.get().user;
  if (!user) return;
  if (force) dirty = true;
  if (pushBusy || !dirty) return;
  pushBusy = true;
  dirty = false;
  const snap = JSON.parse(JSON.stringify(getS())) as AppState;
  try {
    const { error } = await supabase.from('user_state').upsert({ user_id: user.id, data: snap, client_ts: snap.ts || Date.now() }, { onConflict: 'user_id' });
    if (error) throw error;
    session.set({ ok: true, offline: false });
  } catch {
    dirty = true;
    session.set({ ok: false });
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void pushNow(), 15000); /* try again later */
  } finally {
    pushBusy = false;
  }
  if (dirty && !pushTimer) pushTimer = setTimeout(() => void pushNow(), 400);
}
RNAppState.addEventListener('change', (s) => {
  if (s !== 'active' && dirty) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = null;
    void pushNow();
  } else if (s === 'active' && session.get().user) {
    void histFlush();
  }
});

/* ---- sign in / up / out ---- */
export async function signIn(email: string, password: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return authMessage(error);
    session.set({ user: data.user, ready: true, offline: false });
    void syncDown(data.user);
    return null;
  } catch (e) {
    return authMessage(e);
  }
}

export async function signUp(name: string, email: string, password: string): Promise<{ error?: string; needsConfirm?: boolean }> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name }, emailRedirectTo: WEB_URL },
    });
    if (error) return { error: authMessage(error) };
    if (name) getS().names[0] = name.slice(0, 40);
    if (data.session && data.user) {
      session.set({ user: data.user, ready: true, offline: false });
      void syncDown(data.user, true);
      return {};
    }
    return { needsConfirm: true };
  } catch (e) {
    return { error: authMessage(e) };
  }
}

export async function sendReset(email: string): Promise<string | null> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: WEB_URL });
    return error ? authMessage(error) : null;
  } catch (e) {
    return authMessage(e);
  }
}

/** Sign out and clear this phone. Anything not uploaded yet is lost, so the caller should check pendingWorkouts() first. */
export async function signOut(): Promise<void> {
  await histFlush();
  if (dirty) await pushNow(true);
  try {
    await supabase.auth.signOut();
  } catch {
    /* sign out locally even if the server can't be reached */
  }
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  dirty = false;
  clearLocal();
  session.set({ user: null, ok: false, admin: false, serverTier: '' });
}
