"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useSessionLogout({ sessionKey, sessionId, revoke, redirectUrl }: {
  sessionKey: string;
  sessionId?: string;
  revoke: () => Promise<void>;
  redirectUrl: string;
}) {
  const [logoutPending, setPending] = useState(false);
  const [logoutError, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);

  const clearConfirmedSession = useCallback(() => {
    // A delayed reply or message must not clear a newly selected session.
    const stored = window.sessionStorage.getItem(sessionKey);
    try {
      if (stored && JSON.parse(stored)?.sessionId !== sessionId) return;
    } catch { return; }
    window.sessionStorage.removeItem(sessionKey);
    window.location.replace(redirectUrl);
  }, [sessionKey, sessionId, redirectUrl]);

  useEffect(() => {
    if (!sessionId || typeof BroadcastChannel === "undefined") return;
    const connection = new BroadcastChannel("dentmarket:session-revoked");
    channel.current = connection;
    connection.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data as { type?: string; sessionId?: string } | null;
      if (message?.type === "revoked" && message.sessionId === sessionId) clearConfirmedSession();
    };
    return () => { channel.current = null; connection.close(); };
  }, [sessionId, clearConfirmedSession]);

  const onLogout = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await revoke();
      channel.current?.postMessage({ type: "revoked", sessionId });
      clearConfirmedSession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Выход не подтверждён. Повторите попытку.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [revoke, sessionId, clearConfirmedSession]);

  return { onLogout, logoutPending, logoutError };
}
