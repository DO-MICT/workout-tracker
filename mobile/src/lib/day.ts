import { LABS } from '@/data';
import { getS, save } from '@/state/store';
import type { Day, DayEx, ExGroup, SetEntry } from '@/state/types';

/* Logging logic for the Today screen: same behaviour as the web app's day view. */

export function labOf(ex: { lab?: DayEx['lab'] }): [string, string] {
  return LABS[ex.lab ?? 'w'] ?? LABS.w;
}

function curSets(): Record<string, SetEntry[]> {
  const S = getS();
  if (!S.cur[S.who]) S.cur[S.who] = {};
  return S.cur[S.who];
}
function lastMap() {
  const S = getS();
  if (!S.last[S.who]) S.last[S.who] = {};
  return S.last[S.who];
}
function prMap(): Record<string, string> {
  const S = getS();
  if (!S.pr) S.pr = [{}, {}];
  return S.pr[S.who] ?? (S.pr[S.who] = {});
}

const blankSet = (): SetEntry => ({ w: '', r: '', d: false });

/** Today's sets for an exercise, padded to the planned count. Does not change saved state. */
export function setsRead(ex: DayEx): SetEntry[] {
  const arr = (getS().cur[getS().who] ?? {})[ex.id] ?? [];
  const out = arr.slice();
  while (out.length < ex.sets) out.push(blankSet());
  return out;
}
/** Same, but stored, so edits stick. */
function ensureSets(ex: DayEx): SetEntry[] {
  const c = curSets();
  if (!c[ex.id]) c[ex.id] = [];
  const arr = c[ex.id];
  while (arr.length < ex.sets) arr.push(blankSet());
  return arr;
}

/** Heaviest weight logged for this exercise (personal record), as text. */
export function prFor(ex: { id: string }): string {
  let best = parseFloat(prMap()[ex.id]) || 0;
  lastMap()[ex.id]?.sets?.forEach((s) => {
    const v = parseFloat(s.w);
    if (v > best) best = v;
  });
  return best > 0 ? String(best) : '';
}

/** Grey hints: copy the nearest earlier set logged today; otherwise PR (weight) and last time / target (reps). */
export function phFor(ex: DayEx, i: number): [string, string] {
  const arr = setsRead(ex);
  const lb = labOf(ex);
  const L = lastMap()[ex.id];
  let wp = '';
  let rp = '';
  for (let j = i - 1; j >= 0; j--) {
    if (!wp && arr[j].w) wp = arr[j].w;
    if (!rp && arr[j].r) rp = arr[j].r;
  }
  if (!wp) wp = prFor(ex) || lb[0];
  if (!rp) {
    const ls = L?.sets ? (L.sets[i] ?? L.sets[L.sets.length - 1]) : null;
    rp = ls?.r ? ls.r : ex.reps === 'max' ? 'max' : String(ex.reps).split(/[–\s]/)[0];
  }
  return [wp, rp];
}

export function groupsOf(d: Day): ExGroup[] {
  const out: ExGroup[] = [];
  for (let i = 0; i < d.ex.length; i++) {
    const ex = d.ex[i];
    if (ex.ss === 'c') {
      const items = [ex];
      while (d.ex[i + 1]?.ss === 'c') items.push(d.ex[++i]);
      out.push({ kind: 'circuit', items });
    } else if (ex.ss === 'a') {
      const items = [ex];
      while (d.ex[i + 1]?.ss === 'b') items.push(d.ex[++i]);
      out.push({ kind: 'superset', items });
    } else out.push({ kind: 'single', items: [ex] });
  }
  return out;
}
export function groupOf(d: Day, ex: DayEx): ExGroup | null {
  return groupsOf(d).find((g) => g.kind !== 'single' && g.items.some((x) => x.id === ex.id)) ?? null;
}

export function lastText(ex: DayEx): string {
  const L = lastMap()[ex.id];
  const lb = labOf(ex);
  if (!L || !L.sets || !L.sets.length) {
    return lb[0] === 'kg' ? 'First time: pick a weight you can do with good form.' : 'First time: start easy and log what you do.';
  }
  const unit2 = lb[1] === 'reps' ? '' : ` ${lb[1]}`;
  const parts = L.sets
    .map(
      (s) =>
        (s.w && lb[0] ? `${s.w} ${lb[0].replace('+', '')}` : '') + (s.w && lb[0] && s.r ? ' × ' : '') + (s.r ? `${s.r}${unit2}` : ''),
    )
    .filter(Boolean);
  const dt = new Date(L.date);
  const ds = isNaN(dt.getTime())
    ? ''
    : ` (${dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })})`;
  return `Last time${ds}: ${parts.join(', ')}`;
}

/** Number of ticked sets for an exercise. */
export function doneCount(ex: DayEx): number {
  return setsRead(ex)
    .slice(0, ex.sets)
    .filter((s) => s.d).length;
}
export function dayProgress(d: Day): { done: number; total: number } {
  let done = 0;
  let total = 0;
  d.ex.forEach((ex) => {
    total += ex.sets;
    done += doneCount(ex);
  });
  return { done, total };
}

/** Typing in a weight or reps box. */
export function updateSet(ex: DayEx, i: number, field: 'w' | 'r', value: string) {
  const s = ensureSets(ex)[i];
  s[field] = value.replace(',', '.').slice(0, 6);
  s.t = 1;
  save();
}

export type TickResult = {
  ticked: boolean;
  /** start the rest timer (the whole superset/circuit round, or the single exercise, is done for this set number) */
  startTimer: boolean;
  /** in a superset/circuit: the exercise to do next at this set number */
  next?: DayEx;
  /** every set of this exercise (or its whole group) is now ticked */
  advance: boolean;
};

/** Tick or untick a set. Fills weight and reps from the grey hints when left blank. */
export function toggleSet(d: Day, ex: DayEx, i: number): TickResult {
  const arr = ensureSets(ex);
  const s = arr[i];
  s.d = !s.d;
  const res: TickResult = { ticked: s.d, startTimer: false, advance: false };
  if (s.d) {
    if (!s.at) s.at = Date.now();
    const lb = labOf(ex);
    const ph = phFor(ex, i);
    if (lb[0] && !s.w && isFinite(parseFloat(ph[0]))) s.w = ph[0];
    if (!s.r && isFinite(parseFloat(ph[1]))) s.r = ph[1];
    const g = groupOf(d, ex);
    if (!g || g.items.every((x) => x.sets <= i || setsRead(x)[i].d)) res.startTimer = true;
    else res.next = g.items.find((x) => x.sets > i && !setsRead(x)[i].d);
    const exDone = arr.slice(0, ex.sets).every((x) => x.d);
    if (exDone) {
      res.advance = g ? g.items.every((x) => setsRead(x).slice(0, x.sets).every((y) => y.d)) : true;
    }
  }
  save();
  return res;
}

/** Index of the first exercise card (or group) after `ex` that still has sets to do. */
export function nextUndone(d: Day, ex: DayEx): DayEx | null {
  const groups = groupsOf(d);
  const gi = groups.findIndex((g) => g.items.some((x) => x.id === ex.id));
  for (let k = gi + 1; k < groups.length; k++) {
    const g = groups[k];
    if (!g.items.every((x) => doneCount(x) === x.sets)) return g.items[0];
  }
  return null;
}
