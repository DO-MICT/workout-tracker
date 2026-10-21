/* Static data, generated from the web app by `npm run extract-data`
   (library.json, templates.json, equipment.json, diagrams.json). */
import type { Day, LibEx, Measure, PlanEx } from '@/state/types';

import diagramsJson from './diagrams.json';
import equipmentJson from './equipment.json';
import libraryJson from './library.json';
import templatesJson from './templates.json';

type RawDefaultEx = {
  id: string;
  n: string;
  sets: number;
  reps: string;
  f: string;
  c: string[];
  ss?: 'a' | 'b' | 'c';
  gl?: string;
};
type RawDefaultDay = { id: string; short: string; title: string; sub: string; warm: string; ex: RawDefaultEx[] };
type RawExtra = [string, string, string, string, string, number, string, Measure, string[]];

const lib = libraryJson as unknown as {
  DEFAULT_DAYS: RawDefaultDay[];
  LABS: Record<Measure, [string, string]>;
  MGS: string[];
  EXMETA: Record<string, [string, string]>;
  EXTRA: RawExtra[];
};

export const LABS = lib.LABS;
export const MGS = lib.MGS;

/** Every exercise by id: the ones in the built-in plan, plus the extra library. */
export const LIB: Record<string, LibEx> = {};
lib.DEFAULT_DAYS.forEach((d) =>
  d.ex.forEach((ex) => {
    const m = lib.EXMETA[ex.id] ?? ['Chest', ''];
    LIB[ex.id] = { id: ex.id, n: ex.n, f: ex.f, c: ex.c, mg: m[0], req: m[1], sets: ex.sets, reps: ex.reps, lab: 'w' };
  }),
);
lib.EXTRA.forEach((e) => {
  if (!LIB[e[0]]) LIB[e[0]] = { id: e[0], n: e[1], mg: e[2], req: e[3], f: e[4], sets: e[5], reps: e[6], lab: e[7], c: e[8] };
});

/** The built-in "5-day split", with muscle group and measure filled in from the library. */
export const DEFAULT_DAYS: Day[] = lib.DEFAULT_DAYS.map((d) => ({
  id: d.id,
  short: d.short,
  title: d.title,
  sub: d.sub,
  warm: d.warm,
  ex: d.ex.map((x) => ({
    id: x.id,
    n: x.n,
    f: x.f,
    c: x.c,
    mg: LIB[x.id]?.mg ?? '',
    lab: 'w' as Measure,
    sets: x.sets,
    reps: x.reps,
    ss: x.ss,
    gl: x.gl,
  })),
}));

export type Template = {
  id: string;
  name: string;
  desc: string;
  days: Record<string, { title: string; ex: PlanEx[] }> | null;
  random?: boolean;
};
export const TEMPLATES = templatesJson as unknown as Template[];

export type EquipGroup = { g: string; items: [string, string, string][] };
export const EQUIP = equipmentJson as unknown as EquipGroup[];

export type DiagramFrame = { h: [number, number]; b?: number[]; a?: number[]; x?: number[][]; q?: (string | number)[][] };
export type DiagramPattern = { p?: (string | number)[][]; s: DiagramFrame; e?: Partial<DiagramFrame> };
export const DIAGRAMS = diagramsJson as unknown as Record<string, DiagramPattern>;

export const WEEK = [
  { id: 'mon', short: 'Mon', long: 'Monday' },
  { id: 'tue', short: 'Tue', long: 'Tuesday' },
  { id: 'wed', short: 'Wed', long: 'Wednesday' },
  { id: 'thu', short: 'Thu', long: 'Thursday' },
  { id: 'fri', short: 'Fri', long: 'Friday' },
  { id: 'sat', short: 'Sat', long: 'Saturday' },
  { id: 'sun', short: 'Sun', long: 'Sunday' },
] as const;

export function weekLong(id: string): string {
  return WEEK.find((w) => w.id === id)?.long ?? id;
}
/** id of today's weekday ('mon'..'sun'). */
export function todayId(): string {
  return WEEK[(new Date().getDay() + 6) % 7].id;
}

export function gearName(id: string): string {
  for (const g of EQUIP) for (const it of g.items) if (it[0] === id) return it[1];
  return id;
}

/** [] when you can do it with this gear, otherwise the "any of" groups that are missing. */
export function missingFor(ex: { req: string }, gear: string[]): string[] {
  if (!ex.req) return [];
  return ex.req.split(',').filter((alt) => !alt.split('|').some((id) => gear.includes(id)));
}
export function needsText(ex: { req: string }, gear: string[]): string {
  return missingFor(ex, gear)
    .map((alt) => alt.split('|').map(gearName).join(' or '))
    .join(' and ');
}
