import { DEFAULT_DAYS, LIB, TEMPLATES, WEEK, type Template } from '@/data';
import { getS, profileRest, save } from '@/state/store';
import type { CustomPlan, Day, DayEx, DaySrc, Loc, Plans } from '@/state/types';

/* Plans: built-in templates plus the user's own. Edits to built-ins are stored per plan and day.
   Reading never changes the saved state; only the explicit setters below do. */

/** Cole's Sessions (random sessions) aren't in the mobile app yet. */
const UNSUPPORTED = new Set(['coles']);

export function plansRead(): Plans {
  const S = getS();
  const P = S.plans && typeof S.plans === 'object' ? S.plans : ({ active: 'split5', custom: [], edits: {} } as Plans);
  const edits = { ...(P.edits ?? {}) };
  const legacy = (S as { plan?: unknown }).plan;
  if (legacy && typeof legacy === 'object') edits.split5 = { ...(legacy as Record<string, DaySrc>), ...(edits.split5 ?? {}) };
  return { ...P, custom: Array.isArray(P.custom) ? P.custom : [], edits };
}
function plansWrite(): Plans {
  const S = getS();
  if (!S.plans || typeof S.plans !== 'object') S.plans = { active: 'split5', custom: [], edits: {} };
  const P = S.plans;
  if (!Array.isArray(P.custom)) P.custom = [];
  if (!P.edits) P.edits = {};
  return P;
}

export type PlanInfo = { id: string; name: string; desc: string; builtin: boolean };

export function planMeta(id: string) {
  return plansRead().meta?.[id] ?? {};
}
export function allPlans(): PlanInfo[] {
  const P = plansRead();
  const built = TEMPLATES.filter((t) => !UNSUPPORTED.has(t.id)).map((t) => ({
    id: t.id,
    name: planMeta(t.id).name || t.name,
    desc: t.desc,
    builtin: true,
  }));
  return built.concat(P.custom.map((c) => ({ id: c.id, name: c.name, desc: '', builtin: false })));
}
export function planById(id: string): PlanInfo | null {
  return allPlans().find((p) => p.id === id) ?? null;
}
export function activePlan(): PlanInfo {
  return planById(plansRead().active) ?? (planById('split5') as PlanInfo);
}
function tmplById(id: string): Template | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}
function customById(id: string): CustomPlan | null {
  return plansRead().custom.find((c) => c.id === id) ?? null;
}

function daySource(planId: string, dayId: string): DaySrc | null {
  const P = plansRead();
  const cp = customById(planId);
  if (cp) return cp.days?.[dayId] ?? { title: 'Workout', ex: [] };
  const ed = P.edits[planId]?.[dayId];
  if (ed) return ed;
  const t = tmplById(planId);
  if (!t) return null;
  if (!t.days) return DEFAULT_DAYS.some((d) => d.id === dayId) ? null : { title: 'Rest day', ex: [] };
  return t.days[dayId] ?? { title: 'Rest day', ex: [] };
}

function resolveDay(w: { id: string; short: string }, src: DaySrc): Day {
  const ex: DayEx[] = (src.ex ?? [])
    .filter((x) => LIB[x.id])
    .map((x) => {
      const L = LIB[x.id];
      return { id: x.id, n: L.n, f: L.f, c: L.c, mg: L.mg, lab: L.lab, sets: x.sets, reps: x.reps, link: !!x.link };
    });
  /* "link" chains consecutive exercises into a superset (2) or circuit (3+) */
  const chains: [number, number][] = [];
  for (let i = 0; i < ex.length; ) {
    let j = i;
    while (ex[j].link && ex[j + 1]) j++;
    if (j > i) chains.push([i, j]);
    i = j + 1;
  }
  const counts: Record<string, number> = {};
  chains.forEach(([a, b]) => {
    const items = ex.slice(a, b + 1);
    const circuit = items.length > 2;
    const mgs = items.map((x) => x.mg).filter((v, k, arr) => arr.indexOf(v) === k);
    const base = `${circuit ? 'Circuit' : 'Superset'}: ${mgs.join(' & ')}`;
    counts[base] = (counts[base] ?? 0) + 1;
    items[0].gl = base;
    items[0]._base = base;
    items.forEach((x, k) => {
      x.ss = circuit ? 'c' : k === 0 ? 'a' : 'b';
    });
  });
  const seen: Record<string, number> = {};
  ex.forEach((x) => {
    if (x._base && counts[x._base] > 1) {
      seen[x._base] = (seen[x._base] ?? 0) + 1;
      x.gl = x._base.replace(':', ` ${seen[x._base]}:`);
    }
  });
  return { id: w.id, short: w.short, title: src.title || 'Workout', sub: '', custom: true, ex };
}

export function buildDaysFor(planId: string): Day[] {
  if (UNSUPPORTED.has(planId)) return [];
  const cp = customById(planId);
  if (cp && Array.isArray(cp.dayIds) && cp.dayIds.length) {
    return WEEK.filter((w) => cp.dayIds?.includes(w.id)).map((w) => resolveDay(w, daySource(planId, w.id) as DaySrc));
  }
  const ids = planMeta(planId).dayIds;
  if (tmplById(planId) && Array.isArray(ids) && ids.length) {
    return WEEK.filter((w) => ids.includes(w.id)).map((w) => {
      const src = daySource(planId, w.id);
      if (src) return resolveDay(w, src);
      const def = DEFAULT_DAYS.find((d) => d.id === w.id);
      return def ?? resolveDay(w, { title: 'Rest day', ex: [] });
    });
  }
  return DEFAULT_DAYS.map((d) => {
    const src = daySource(planId, d.id);
    return src ? resolveDay(d, src) : d;
  });
}
export function buildDays(): Day[] {
  return buildDaysFor(activePlan().id);
}

export function isEdited(planId: string): boolean {
  const P = plansRead();
  return !!(tmplById(planId) && ((P.edits[planId] && Object.keys(P.edits[planId]).length) || Object.keys(planMeta(planId)).length));
}
/** Rest seconds set for a plan, or 0 when it uses the profile default. */
export function planRest(id: string): number {
  const cp = customById(id);
  const r = cp ? Number(cp.rest) : Number(planMeta(id).rest);
  return r >= 5 && r <= 600 ? r : 0;
}
export function restSec(): number {
  return planRest(activePlan().id) || profileRest();
}

export function switchPlan(id: string) {
  if (!planById(id)) return;
  plansWrite().active = id;
  save();
}

/* ---------- locations (gear lists) ---------- */
export function locsRead(): { active: string; list: Loc[] } {
  const L = getS().locs;
  if (L && Array.isArray(L.list) && L.list.length) {
    return { active: L.active, list: L.list.map((l) => ({ ...l, gear: Array.isArray(l.gear) ? l.gear : [] })) };
  }
  return { active: 'loc1', list: [{ id: 'loc1', name: 'Gym', gear: [] }] };
}
export function locById(id: string): Loc | null {
  return locsRead().list.find((l) => l.id === id) ?? null;
}
export function curLoc(): Loc {
  const L = locsRead();
  return L.list.find((l) => l.id === L.active) ?? L.list[0];
}
/** Where a plan day is trained (falls back to the active location). */
export function dayLoc(planId: string, dayId: string): { loc: Loc; isSet: boolean } {
  const id = plansRead().dayLoc?.[planId]?.[dayId] ?? '';
  const set = locById(id);
  return { loc: set ?? curLoc(), isSet: !!set };
}
