import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';

import { LIB } from '@/data';
import { session } from '@/state/session';
import { getS, save } from '@/state/store';
import type { Day, DayEx, HistSet, Measure, WorkoutRec } from '@/state/types';

import { APP_VERSION } from './config';
import { createStore } from './createStore';
import { setsRead } from './day';
import { activePlan, dayLoc } from './plans';
import { supabase } from './supabase';

/* Workout history. Every completed workout is a record {id, performed_at, ... sets:[...]} matching the
   Supabase tables `workouts` + `workout_sets`. Records wait in S.wout (an outbox that is synced along with
   the rest of the app data) until save_workout() confirms them. Ids are made on the phone, so a retry
   after a dropped connection never duplicates a workout. */

const LIMITS = { plan_id: 80, plan_name: 80, day_id: 20, day_title: 80, location_id: 80, location_name: 80 } as const;

const clip = (s: string | null | undefined, n: number) => (s == null ? null : String(s).slice(0, n));
function numOrNull(v: string | undefined, lo: number, hi: number): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  if (!isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, Math.round(n * 100) / 100));
}

function outbox(): WorkoutRec[] {
  const S = getS();
  if (!Array.isArray(S.wout)) S.wout = [];
  return S.wout;
}
/** Workouts finished on this phone that haven't reached the database yet. */
export function pendingWorkouts(): WorkoutRec[] {
  const w = getS().wout;
  return Array.isArray(w) ? w : [];
}

/** Turn today's logged sets for a plan day into a history record. null when nothing was logged. */
export function buildWorkout(d: Day): WorkoutRec | null {
  const P = activePlan();
  const { loc } = dayLoc(P.id, d.id);
  const sets: HistSet[] = [];
  let first = 0;
  const now = Date.now();
  d.ex.forEach((ex: DayEx, k) => {
    setsRead(ex)
      .slice(0, ex.sets)
      .forEach((s, i) => {
        if (!(s.w || s.r)) return;
        if (s.at && (!first || s.at < first)) first = s.at;
        sets.push({
          exercise_id: clip(ex.id, 80) as string,
          exercise_name: clip(ex.n, 120) as string,
          muscle_group: clip(ex.mg || LIB[ex.id]?.mg || '', 40) || null,
          exercise_order: Math.min(k, 199),
          set_no: Math.min(i + 1, 50),
          measure: (ex.lab || 'w') as Measure,
          weight: numOrNull(s.w, -1000, 5000),
          reps: numOrNull(s.r, 0, 100000),
          done: !!s.d,
          group_tag: /^[abc]$/.test(ex.ss ?? '') ? (ex.ss as 'a' | 'b' | 'c') : null,
        });
      });
  });
  if (!sets.length) return null;
  let dur: number | null = first && now > first ? Math.round((now - first) / 1000) : null;
  if (dur !== null && dur > 86400) {
    dur = null;
    first = 0;
  }
  return {
    id: randomUUID(),
    performed_at: new Date(now).toISOString(),
    started_at: first ? new Date(first).toISOString() : null,
    duration_sec: dur,
    plan_id: clip(P.id, LIMITS.plan_id),
    plan_name: clip(P.name, LIMITS.plan_name),
    day_id: clip(d.id, LIMITS.day_id),
    day_title: clip(d.title, LIMITS.day_title),
    location_id: clip(loc?.id, LIMITS.location_id),
    location_name: clip(loc?.name, LIMITS.location_name),
    source: 'app',
    app_version: APP_VERSION,
    who: getS().who || 0,
    sets,
  };
}

export function histVolume(w: { sets: HistSet[] }): number {
  let v = 0;
  w.sets.forEach((s) => {
    if (s.measure === 'w' && s.weight != null && s.reps != null) v += s.weight * s.reps;
  });
  return Math.round(v * 100) / 100;
}

export function recordWorkout(w: WorkoutRec) {
  outbox().push(w);
  save();
  void histFlush();
}

/* ---- upload queue ---- */
let busy = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** Send waiting workouts to the database, oldest first. Safe to call any time. */
export async function histFlush(): Promise<void> {
  const user = session.get().user;
  if (!user || busy || !pendingWorkouts().length) return;
  busy = true;
  let failed = false;
  try {
    for (;;) {
      const w = pendingWorkouts()[0];
      if (!w) break;
      const body = JSON.parse(JSON.stringify(w)) as Partial<WorkoutRec>;
      delete body.who;
      delete body.err;
      const { error } = await supabase.rpc('save_workout', { w: body });
      if (error) {
        w.err = (w.err ?? 0) + 1;
        /* a rejected record (not a connection problem) would block the queue: move it to the back */
        if (/^(22|23)/.test(error.code ?? '') && pendingWorkouts().length > 1) outbox().push(outbox().shift() as WorkoutRec);
        failed = true;
        break;
      }
      outbox().shift();
      histCache[w.id] = w.sets;
      save();
    }
  } catch {
    failed = true;
  } finally {
    busy = false;
  }
  histStore.set({ version: histStore.get().version + 1 });
  if (failed && pendingWorkouts().length && !retryTimer) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void histFlush();
    }, 30000);
  }
}
AppState.addEventListener('change', (s) => {
  if (s === 'active') void histFlush();
});

/** Sets of workouts that were just uploaded, so they open instantly. */
const histCache: Record<string, HistSet[]> = {};
/** `version` is bumped after an upload attempt, so open history screens know to reload. */
export const histStore = createStore({ version: 0 });

/* ---- reading history ---- */
export const HIST_PAGE = 20;
export type HistRow = {
  id: string;
  performed_at: string;
  started_at: string | null;
  duration_sec: number | null;
  plan_id: string | null;
  plan_name: string | null;
  day_id: string | null;
  day_title: string | null;
  location_name: string | null;
  set_count: number;
  volume_kg: number;
  source: 'app' | 'import';
  pending?: boolean;
};

/** Newest first. `rows` come from the database; waiting workouts are added by the screen. */
export async function histFetch(offset: number): Promise<{ rows: HistRow[]; more: boolean }> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id,performed_at,started_at,duration_sec,plan_id,plan_name,day_id,day_title,location_name,set_count,volume_kg,source')
    .order('performed_at', { ascending: false })
    .range(offset, offset + HIST_PAGE);
  if (error) throw error;
  const rows = (data ?? []) as HistRow[];
  return { rows: rows.slice(0, HIST_PAGE), more: rows.length > HIST_PAGE };
}

export async function histSets(id: string): Promise<HistSet[]> {
  const waiting = pendingWorkouts().find((w) => w.id === id);
  if (waiting) return waiting.sets;
  if (histCache[id]) return histCache[id];
  const { data, error } = await supabase
    .from('workout_sets')
    .select('workout_id,exercise_id,exercise_name,muscle_group,exercise_order,set_no,measure,weight,reps,done,group_tag')
    .eq('workout_id', id);
  if (error) throw error;
  const sets = ((data ?? []) as HistSet[]).sort((a, b) => a.exercise_order - b.exercise_order || a.set_no - b.set_no);
  histCache[id] = sets;
  return sets;
}

export type ExSetRow = {
  workout_id: string;
  performed_at: string;
  set_no: number;
  measure: Measure;
  weight: number | null;
  reps: number | null;
  pending?: boolean;
};
const byNewest = (a: ExSetRow, b: ExSetRow) =>
  a.performed_at < b.performed_at ? 1 : a.performed_at > b.performed_at ? -1 : (a.set_no || 0) - (b.set_no || 0);

/** Every logged set of one exercise, newest first (including workouts still waiting to upload). */
export async function histExercise(exId: string): Promise<ExSetRow[]> {
  const pend: ExSetRow[] = [];
  pendingWorkouts().forEach((w) =>
    w.sets.forEach((s) => {
      if (s.exercise_id === exId)
        pend.push({ workout_id: w.id, performed_at: w.performed_at, set_no: s.set_no, measure: s.measure, weight: s.weight, reps: s.reps, pending: true });
    }),
  );
  if (!session.get().user) return pend.sort(byNewest);
  const { data, error } = await supabase
    .from('workout_sets')
    .select('workout_id,performed_at,set_no,measure,weight,reps')
    .eq('exercise_id', exId)
    .order('performed_at', { ascending: false })
    .limit(600);
  if (error) throw error;
  return pend.concat((data ?? []) as ExSetRow[]).sort(byNewest);
}

export async function histDelete(id: string): Promise<void> {
  if (pendingWorkouts().some((w) => w.id === id)) {
    getS().wout = pendingWorkouts().filter((w) => w.id !== id);
    save();
    return;
  }
  const { error } = await supabase.from('workouts').delete().eq('id', id);
  if (error) throw error;
  delete histCache[id];
}

/* ---- formatting ---- */
export function fmtNum(n: number | null | undefined): string {
  if (n == null) return '';
  return String(Math.round(n * 100) / 100);
}
export function fmtSet(s: { measure?: Measure; weight: number | null; reps: number | null }): string {
  const m = s.measure ?? 'w';
  const w = s.weight;
  const r = s.reps;
  if (m === 'w') return (w != null ? `${fmtNum(w)} kg` : '') + (w != null && r != null ? ' × ' : '') + (r != null ? fmtNum(r) + (w == null ? ' reps' : '') : '');
  if (m === 'bw') return (w ? `${w > 0 ? '+' : ''}${fmtNum(w)} kg × ` : '') + (r != null ? `${fmtNum(r)} reps` : '');
  if (m === 'cardio') return [w != null ? `${fmtNum(w)} km` : '', r != null ? `${fmtNum(r)} min` : ''].filter(Boolean).join(' · ');
  if (m === 'time') return r != null ? `${fmtNum(r)} min` : '';
  if (m === 'hold') return r != null ? `${fmtNum(r)} sec` : '';
  return r != null ? `${fmtNum(r)} reps` : '';
}
export function fmtKg(v: number): string {
  const n = Math.round(+v || 0);
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} kg`;
}
export function fmtDur(s: number | null | undefined): string {
  if (!s) return '';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
export function hDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, opts ?? { weekday: 'short', day: 'numeric', month: 'short' });
}
/** What the progress chart tracks for each kind of exercise: [label, unit, field]. */
export function metricOf(measure?: Measure): [string, string, 'weight' | 'reps'] {
  const m: Record<Measure, [string, string, 'weight' | 'reps']> = {
    w: ['Top weight', 'kg', 'weight'],
    bw: ['Most reps', 'reps', 'reps'],
    cardio: ['Distance', 'km', 'weight'],
    time: ['Longest', 'min', 'reps'],
    hold: ['Longest hold', 'sec', 'reps'],
    count: ['Most reps', 'reps', 'reps'],
  };
  return m[measure ?? 'w'] ?? m.w;
}
