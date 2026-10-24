import { createStore } from '@/lib/createStore';
import type { Day, WorkoutRec } from '@/state/types';

import type { Wins } from './workout';

/* Small shared UI state: the rest timer, the toast, and the "well done" popup. */

export const timer = createStore({ on: false, end: 0, total: 90 });
export function startTimer(sec: number) {
  timer.set({ on: true, end: Date.now() + sec * 1000, total: sec });
}
export function addTime(sec: number) {
  const t = timer.get();
  timer.set({ end: t.end + sec * 1000, total: t.total + sec });
}
export function stopTimer() {
  timer.set({ on: false });
}

export const toastStore = createStore({ msg: '', n: 0 });
export function toast(msg: string) {
  toastStore.set({ msg, n: toastStore.get().n + 1 });
}

export const doneStore = createStore<{ open: boolean; rec: WorkoutRec | null; day: Day | null; wins: Wins }>({
  open: false,
  rec: null,
  day: null,
  wins: { prs: [], up: [] },
});
