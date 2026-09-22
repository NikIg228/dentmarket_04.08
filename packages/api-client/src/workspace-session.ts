import { parseSessionHandoff, type SessionHandoffEnvelope } from "./session-handoff";

type Capability = "BUYER" | "SUPPLIER";
export type WorkspaceSessionSnapshot = { session: SessionHandoffEnvelope | null; ready: boolean; error: string | null };
const initial: WorkspaceSessionSnapshot = { session: null, ready: false, error: null };
const loginAgain = "Сессия истекла или доступ к организации изменился. Войдите заново.";

export function createWorkspaceSession(apiUrl: string, capability: Capability) {
  const key = `dentmarket:${capability.toLowerCase()}-session`;
  let snapshot = initial;
  let initialization: Promise<void> | undefined;
  let refreshing: Promise<string> | undefined;
  const listeners = new Set<() => void>();
  const publish = (session: SessionHandoffEnvelope | null, error: string | null = null) => {
    snapshot = { session, ready: true, error };
    for (const notify of listeners) notify();
  };
  const save = (session: SessionHandoffEnvelope, ready = true) => {
    window.sessionStorage.setItem(key, JSON.stringify(session));
    snapshot = { session, ready, error: null };
    for (const notify of listeners) notify();
  };
  const invalidate = () => { window.sessionStorage.removeItem(key); publish(null, loginAgain); };
  async function call(path: string, init: RequestInit) {
    try {
      return await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    } catch { throw new Error("Сервер не ответил. Проверьте соединение и повторите вход."); }
  }
  async function refresh(current: SessionHandoffEnvelope): Promise<string> {
    if (!current.csrfToken || !current.sessionId) { invalidate(); throw new Error(loginAgain); }
    let csrfToken = current.csrfToken;
    // Another tab can have rotated the cookie while this tab was idle.
    if (typeof document !== "undefined") {
      const name = `mp_csrf_${capability.toLowerCase()}=`;
      const cookie = document.cookie.split(";").map(value => value.trim()).find(value => value.startsWith(name));
      if (cookie) { try { csrfToken = decodeURIComponent(cookie.slice(name.length)); } catch { /* Use the last known token. */ } }
    }
    const response = await call("/auth/refresh", { method: "POST", credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ workspace: capability, expectedSessionId: current.sessionId }) });
    if (response.status === 401 || response.status === 403) { invalidate(); throw new Error(loginAgain); }
    if (!response.ok) throw new Error("Не удалось продлить сессию. Повторите попытку после восстановления сервера.");
    const { workspaceRefreshResponseSchema } = await import("@marketplace/schemas/workspace-session");
    const result = workspaceRefreshResponseSchema.safeParse(await response.json());
    if (!result.success || result.data.sessionId !== current.sessionId || result.data.activeOrganizationId !== current.organizationId) {
      invalidate(); throw new Error(loginAgain);
    }
    // Never replace a newer login when a delayed refresh completes.
    if (snapshot.session?.sessionId !== current.sessionId) throw new Error(loginAgain);
    save({ ...current, ...result.data, accessTokenExpiresAt: Date.now() + result.data.accessTokenExpiresIn * 1000 }, snapshot.ready);
    return result.data.accessToken;
  }
  async function getAccessToken(forceRefresh = false): Promise<string | undefined> {
    const current = snapshot.session;
    if (!current?.accessToken) return undefined;
    if (!forceRefresh && current.accessTokenExpiresAt && current.accessTokenExpiresAt > Date.now() + 30_000) return current.accessToken;
    refreshing ??= (async () => {
      if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request(`dentmarket:refresh:${capability}`, () => refresh(current));
      return refresh(current);
    })().finally(() => { refreshing = undefined; });
    return refreshing;
  }
  async function initialize() {
    try {
      const fromHash = window.location.hash.startsWith("#session=");
      const serialized = fromHash ? decodeURIComponent(window.location.hash.slice(9)) : window.sessionStorage.getItem(key);
      let session = parseSessionHandoff(serialized, capability);
      if (!session) { publish(null); return; }
      const { workspaceContextSchema, workspaceSessionSchema } = await import("@marketplace/schemas/workspace-session");
      if (session.handoffCode) {
        const response = await call("/auth/handoff/exchange", { method: "POST", credentials: "include",
          headers: { "content-type": "application/json" }, body: JSON.stringify({ handoffCode: session.handoffCode }) });
        if (!response.ok) throw new Error("Не удалось завершить переход в кабинет. Вернитесь на страницу входа и войдите заново.");
        const result = workspaceSessionSchema.safeParse(await response.json());
        if (!result.success || result.data.capability !== capability || result.data.organizationId !== session.organizationId) throw new Error(loginAgain);
        session = { ...result.data, actorId: result.data.user.id, displayName: result.data.user.displayName,
          accessTokenExpiresAt: Date.now() + result.data.accessTokenExpiresIn * 1000 };
        window.sessionStorage.setItem(key, JSON.stringify(session));
      }
      if (fromHash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      // Keep the shell closed until the server verifies membership and capability.
      snapshot = { session, ready: false, error: null };
      let token = session.accessToken;
      if (session.accessTokenExpiresAt && session.accessTokenExpiresAt <= Date.now() + 30_000) token = await getAccessToken();
      let response = await call("/auth/workspace-context", { headers: { authorization: `Bearer ${token}` } });
      if (response.status === 401) {
        token = await getAccessToken(true);
        response = await call("/auth/workspace-context", { headers: { authorization: `Bearer ${token}` } });
      }
      if (response.status === 401 || response.status === 403) { invalidate(); return; }
      if (!response.ok) throw new Error("Не удалось проверить доступ. Сервер временно недоступен — повторите попытку.");
      const context = workspaceContextSchema.safeParse(await response.json());
      if (!context.success || context.data.organizationId !== session.organizationId || !context.data.capabilities.includes(capability)) { invalidate(); return; }
      save({ ...snapshot.session, ...context.data, capability, accessToken: token });
    } catch (error) { publish(null, error instanceof Error ? error.message : "Не удалось проверить вход. Войдите заново."); }
  }
  return {
    sessionKey: key,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    // A shared promise survives React StrictMode's effect setup/cleanup/setup.
    start: () => { initialization ??= initialize(); return initialization; },
    retry: () => { initialization = initialize(); return initialization; },
    getAccessToken, invalidate,
  };
}

const stores = new Map<string, ReturnType<typeof createWorkspaceSession>>();
export function workspaceSessionStore(apiUrl: string, capability: Capability) {
  const key = `${apiUrl}:${capability}`;
  let store = stores.get(key);
  if (!store) { store = createWorkspaceSession(apiUrl, capability); stores.set(key, store); }
  return store;
}
