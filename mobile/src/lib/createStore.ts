import { useSyncExternalStore } from 'react';

/** A tiny shared-state store. `use()` re-renders the component whenever `set()` is called. */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe,
    use: () => useSyncExternalStore(subscribe, () => state, () => state),
  };
}
