import 'expo-sqlite/localStorage/install';

import { useSyncExternalStore } from 'react';
import { AppState as RNAppState } from 'react-native';

import type { Account, AppState, Profile } from './types';

/* The whole app state lives in one object, saved to the phone on every change and synced to
   Supabase (`user_state`) by sync.ts. Same shape and same storage key as the web app. */
export const KEY = 'split5-v1';

export function blank(): AppState {
  return { v: 1, names: ['You', 'Partner'], who: 0, cur: [{}, {}], last: [{}, {}] };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as AppState;
      if (o && o.v === 1 && o.cur && o.last) {
        o.who = 0;
        return o;
      }
    }
  } catch {
    /* fall through to a blank state */
  }
  return blank();
}

let S: AppState = load();
let version = 0;
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let afterSave: (() => void) | null = null;

function emit() {
  version++;
  listeners.forEach((l) => l());
}
function persistNow() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {
    /* storage full or unavailable: keep running from memory */
  }
}

/** The live state object. Mutate it, then call save(). */
export function getS(): AppState {
  return S;
}
/** Re-render when the state changes, and get the state back. */
export function useS(): AppState {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => version,
  );
  return S;
}
/** Stamp, save (debounced), re-render and queue a cloud sync. */
export function save() {
  S.ts = Date.now();
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 250);
  emit();
  afterSave?.();
}
/** Swap in a whole new state (e.g. downloaded from the account). */
export function replaceS(next: AppState, opts: { sync?: boolean } = {}) {
  S = next;
  S.who = 0;
  persistNow();
  emit();
  if (opts.sync) afterSave?.();
}
export function setAfterSave(fn: () => void) {
  afterSave = fn;
}
export function flushSave() {
  if (persistTimer) persistNow();
}
/** Wipe this phone's copy (sign out). */
export function clearLocal() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  S = blank();
  emit();
}

/* Don't lose the last 250 ms of typing if the app is closed right after a change. */
RNAppState.addEventListener('change', (st) => {
  if (st !== 'active') flushSave();
});

/* ---- small accessors, same names as the web app ---- */
export function acct(): Account {
  if (!S.account || typeof S.account !== 'object') {
    S.account = {
      v: 1,
      id: '',
      provider: 'email',
      email: '',
      emailVerified: false,
      signedIn: false,
      tier: 'tester',
      tierSource: 'placeholder',
      createdAt: new Date().toISOString(),
    };
  }
  return S.account;
}
export function prof(): Profile {
  if (!S.profile) S.profile = { vals: {}, hist: [] };
  if (!S.profile.hist) S.profile.hist = [];
  if (!S.profile.vals) S.profile.vals = {};
  return S.profile;
}
export function profileRest(): number {
  const r = Number(S.profile?.rest);
  return r >= 5 && r <= 600 ? r : 90;
}
