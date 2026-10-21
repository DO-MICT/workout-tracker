import type { User } from '@supabase/supabase-js';

import { createStore } from '@/lib/createStore';

/** Who is signed in and how syncing is going. Filled in by lib/sync.ts. */
export const session = createStore({
  /** the saved session has been checked (so the app knows whether to show sign-in) */
  ready: false,
  user: null as User | null,
  /** last upload of the app data succeeded */
  ok: false,
  /** the server couldn't be reached */
  offline: false,
  syncing: false,
  admin: false,
  serverTier: '',
});
