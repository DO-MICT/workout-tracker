import { getS, save } from '@/state/store';
import type { Day, WorkoutRec } from '@/state/types';

import { labOf, prFor, setsRead } from './day';
import { buildWorkout, recordWorkout } from './history';

export type Wins = {
  prs: { n: string; now: number; was: number }[];
  up: { n: string; by: number }[];
};
export type FinishResult = { rec: WorkoutRec | null; wins: Wins; saved: number };

/** "Complete workout": compare with PRs and last time, update them, save the record, clear today's sets. */
export function finishWorkout(d: Day): FinishResult {
  const S = getS();
  const cur = S.cur[S.who] ?? (S.cur[S.who] = {});
  const last = S.last[S.who] ?? (S.last[S.who] = {});
  if (!S.pr) S.pr = [{}, {}];
  const pr = S.pr[S.who] ?? (S.pr[S.who] = {});
  const now = new Date().toISOString();
  const rec = buildWorkout(d);
  const wins: Wins = { prs: [], up: [] };
  let saved = 0;

  d.ex.forEach((ex) => {
    const arr = setsRead(ex)
      .slice(0, ex.sets)
      .filter((s) => s.w || s.r);
    /* before overwriting: compare with the PR and with last time (weighted exercises only) */
    let top = 0;
    arr.forEach((s) => {
      const v = parseFloat(s.w);
      if (v > top) top = v;
    });
    if (top > 0 && labOf(ex)[0]) {
      const oldPr = parseFloat(prFor(ex)) || 0;
      let prevTop = 0;
      last[ex.id]?.sets?.forEach((s) => {
        const v = parseFloat(s.w);
        if (v > prevTop) prevTop = v;
      });
      if (oldPr > 0 && top > oldPr) wins.prs.push({ n: ex.n, now: top, was: oldPr });
      else if (prevTop > 0 && top > prevTop) wins.up.push({ n: ex.n, by: Math.round((top - prevTop) * 100) / 100 });
    }
    if (arr.length) {
      last[ex.id] = { date: now, sets: arr.map((s) => ({ w: s.w, r: s.r })) };
      saved++;
    }
    arr.forEach((s) => {
      const v = parseFloat(s.w);
      if (v > (parseFloat(pr[ex.id]) || 0)) pr[ex.id] = String(v);
    });
    delete cur[ex.id];
  });

  if (rec) recordWorkout(rec);
  else save();
  return { rec, wins, saved };
}
