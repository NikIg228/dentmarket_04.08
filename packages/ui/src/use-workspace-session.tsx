"use client";
import { useEffect, useSyncExternalStore } from "react";

/** The store owns the one-time exchange across StrictMode remounts and routes. */
export function useWorkspaceSession<T>(store: {
  subscribe: (notify: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  start: () => Promise<void>;
}) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  useEffect(() => { void store.start(); }, [store]);
  return state;
}
