import { session } from '@/state/session';

/** One line under the page title about where your data is saved. */
export function useSyncLabel(): string {
  const { user, syncing, ok, offline } = session.use();
  if (!user) return 'Saved on this phone';
  if (offline) return 'Offline · saved on this phone';
  if (syncing) return 'Syncing…';
  return ok ? 'Synced to your account' : 'Saving…';
}
