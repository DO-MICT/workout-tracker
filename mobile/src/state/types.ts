/* Shapes shared with the web app. `AppState` is exactly what the web app stores in
   `user_state.data`, so one account works on both. Unknown fields (Cole's Sessions,
   suggestions, etc.) are kept untouched via the index signature. */

export type Measure = 'w' | 'bw' | 'cardio' | 'time' | 'hold' | 'count';

export type SetEntry = { w: string; r: string; d: boolean; at?: number; t?: number };
export type LastEntry = { date: string; sets: { w: string; r: string }[] };

export type PlanEx = { id: string; sets: number; reps: string; link?: boolean };
export type DaySrc = { title: string; ex: PlanEx[] };
export type CustomPlan = {
  id: string;
  name: string;
  days?: Record<string, DaySrc>;
  dayIds?: string[];
  rest?: number;
};
export type PlanMeta = { name?: string; dayIds?: string[]; rest?: number };
export type Plans = {
  active: string;
  custom: CustomPlan[];
  edits: Record<string, Record<string, DaySrc>>;
  meta?: Record<string, PlanMeta>;
  dayLoc?: Record<string, Record<string, string>>;
};
export type Loc = { id: string; name: string; gear: string[] };

export type HistSet = {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string | null;
  exercise_order: number;
  set_no: number;
  measure: Measure;
  weight: number | null;
  reps: number | null;
  done: boolean;
  group_tag: 'a' | 'b' | 'c' | null;
};
export type WorkoutRec = {
  id: string;
  performed_at: string;
  started_at: string | null;
  duration_sec: number | null;
  plan_id: string | null;
  plan_name: string | null;
  day_id: string | null;
  day_title: string | null;
  location_id: string | null;
  location_name: string | null;
  source: 'app' | 'import';
  app_version: string;
  who?: number;
  err?: number;
  sets: HistSet[];
};

export type Account = {
  v?: number;
  id: string;
  provider?: string;
  email: string;
  emailVerified?: boolean;
  signedIn: boolean;
  tier?: string;
  tierSource?: string;
  createdAt?: string;
  authMode?: string;
  serverTier?: string;
};

export type Profile = {
  rest?: number;
  vals: Record<string, string>;
  hist: { d: string; v: Record<string, string> }[];
};

export type ThemePref = 'auto' | 'light' | 'dark';

export type AppState = {
  v: 1;
  names: string[];
  who: number;
  cur: Record<string, SetEntry[]>[];
  last: Record<string, LastEntry>[];
  pr?: Record<string, string>[];
  notes?: Record<string, string>;
  profile?: Profile;
  plans?: Plans;
  locs?: { active: string; list: Loc[] };
  theme?: ThemePref;
  onboarded?: boolean;
  ts?: number;
  account?: Account;
  wout?: WorkoutRec[];
  histImportV1?: number;
  [k: string]: unknown;
};

/* ---- resolved plan days (what the Today screen renders) ---- */
export type DayEx = {
  id: string;
  n: string;
  f: string;
  c: string[];
  mg: string;
  lab: Measure;
  sets: number;
  reps: string;
  link?: boolean;
  ss?: 'a' | 'b' | 'c';
  gl?: string;
  _base?: string;
};
export type Day = {
  id: string;
  short: string;
  title: string;
  sub?: string;
  warm?: string;
  custom?: boolean;
  ex: DayEx[];
};
export type ExGroup = { kind: 'single' | 'superset' | 'circuit'; items: DayEx[] };

export type LibEx = {
  id: string;
  n: string;
  f: string;
  c: string[];
  mg: string;
  req: string;
  sets: number;
  reps: string;
  lab: Measure;
};
