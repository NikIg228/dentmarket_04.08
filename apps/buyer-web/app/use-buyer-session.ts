"use client";
import { useEffect, useState } from "react";
import type { SessionHandoffEnvelope } from "@marketplace/api-client";

// Keep authenticated API/schema code outside the public catalog's initial bundle.
export function useBuyerSession() {
  const [snapshot, setSnapshot] = useState<{ ready: boolean; session: SessionHandoffEnvelope | null }>({ ready: false, session: null });
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void import("./workspace-session").then(({ sessionStore }) => {
      if (!active) return;
      const update = () => { if (active) setSnapshot(sessionStore.getSnapshot()); };
      unsubscribe = sessionStore.subscribe(update); update(); void sessionStore.start();
    }).catch(() => { if (active) setSnapshot({ ready: true, session: null }); });
    return () => { active = false; unsubscribe?.(); };
  }, []);
  return snapshot;
}
