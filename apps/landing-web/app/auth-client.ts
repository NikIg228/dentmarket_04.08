import { workspaceContextSchema, workspaceChoicesSchema, type WorkspaceContext } from "@marketplace/schemas";
import { productReturnPath } from "@marketplace/schemas/product-navigation";
export type AuthCapability = "BUYER" | "SUPPLIER";

export type AuthSession = {
  accessToken: string;
  sessionId?: string;
  activeOrganizationId?: string | null;
  organizationId?: string;
  organizationDisplayName?: string;
  capability?: AuthCapability;
  user: { id: string; displayName: string; email: string };
};

type ApiErrorPayload = {
  message?: string | string[];
  requestId?: string;
};

export class AuthRequestError extends Error {
  readonly requestId?: string;

  constructor(message: string, requestId?: string) {
    super(message);
    this.name = "AuthRequestError";
    this.requestId = requestId;
  }
}

export type AuthFeedback = {
  kind: "error" | "success";
  message: string;
  requestId?: string;
};

export const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "https://dentmarket-api.vercel.app/api";
export const buyerAppUrl =
  process.env.NEXT_PUBLIC_BUYER_APP_URL ??
  "https://dentmarket-store.vercel.app";
export const supplierAppUrl =
  process.env.NEXT_PUBLIC_SUPPLIER_APP_URL ??
  "https://dentmarket-supplier.vercel.app";

export function apiErrorMessage(payload: ApiErrorPayload | null, status: number) {
  if (Array.isArray(payload?.message)) return payload.message.join(". ");
  return payload?.message ?? `Сервис вернул ошибку ${status}`;
}

export function feedbackFromError(
  cause: unknown,
  fallback: string,
): AuthFeedback {
  if (cause instanceof AuthRequestError) {
    return {
      kind: "error",
      message: cause.message,
      requestId: cause.requestId,
    };
  }
  return {
    kind: "error",
    message: cause instanceof TypeError || (cause instanceof Error && ["TimeoutError", "AbortError"].includes(cause.name))
      ? "Сервер не ответил. Данные формы сохранены — проверьте соединение и повторите вход."
      : cause instanceof Error ? cause.message : fallback,
  };
}

export async function authRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & ApiErrorPayload)
    | null;
  if (!response.ok) {
    throw new AuthRequestError(
      apiErrorMessage(payload, response.status),
      payload?.requestId,
    );
  }
  return payload as T;
}

export function pickCapability(
  available: string[],
  sessionCapability?: AuthCapability,
  preferredCapability?: AuthCapability,
): AuthCapability | undefined {
  if (preferredCapability) return available.includes(preferredCapability) ? preferredCapability : undefined;
  if (sessionCapability) return available.includes(sessionCapability) ? sessionCapability : undefined;
  if (available.includes("BUYER")) return "BUYER";
  if (available.includes("SUPPLIER")) return "SUPPLIER";
  return undefined;
}

export function workspaceHandoffUrl({
  capability,
  handoffCode,
  displayName,
  organizationDisplayName,
  organizationId,
  returnTo,
}: {
  capability: AuthCapability;
  handoffCode: string;
  displayName: string;
  organizationDisplayName?: string;
  organizationId: string;
  returnTo?: string;
}) {
  const handoff = encodeURIComponent(
    JSON.stringify({
      displayName,
      organizationDisplayName,
      organizationId,
      handoffCode,
      capability,
    }),
  );
  const base = capability === "SUPPLIER" ? supplierAppUrl : buyerAppUrl;
  const path = capability === "BUYER" ? productReturnPath(returnTo) ?? "/" : "/";
  return `${base.replace(/\/$/, "")}${path}#session=${handoff}`;
}

export async function openWorkspace(
  session: AuthSession,
  preferredCapability?: AuthCapability,
  selectedOrganizationId?: string,
  returnTo?: string,
) {
  if (selectedOrganizationId && selectedOrganizationId !== session.activeOrganizationId) {
    if (!session.sessionId) throw new Error("Не удалось определить сессию. Войдите заново.");
    const switched = await fetch(`${apiUrl}/auth/sessions/${encodeURIComponent(session.sessionId)}/organization`, {
      method: "POST", headers: { authorization: `Bearer ${session.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ organizationId: selectedOrganizationId }), signal: AbortSignal.timeout(15_000),
    });
    if (!switched.ok) throw new Error("Организация недоступна. Обновите список и войдите заново.");
    const result = await switched.json() as { accessToken: string; activeOrganizationId: string };
    if (!result.accessToken || result.activeOrganizationId !== selectedOrganizationId) throw new Error("Не удалось подтвердить выбранную организацию");
    session = { ...session, ...result };
  }
  const organizationId =
    session.activeOrganizationId ?? session.organizationId;
  if (!organizationId) {
    throw new Error("У аккаунта нет активной организации");
  }

  const response = await fetch(`${apiUrl}/auth/workspace-context`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = payload as ApiErrorPayload | null;
    throw new AuthRequestError(apiErrorMessage(failure, response.status), failure?.requestId);
  }
  const parsed = workspaceContextSchema.safeParse(payload);
  if (!parsed.success || parsed.data.organizationId !== organizationId) {
    throw new Error("Не удалось подтвердить активную организацию. Войдите заново.");
  }
  const organizationDisplayName = parsed.data.organizationDisplayName;
  const capability = pickCapability(parsed.data.capabilities, session.capability, preferredCapability);

  if (!capability) {
    throw new Error("У организации нет доступа к выбранному кабинету. Выберите доступную роль или обратитесь к владельцу организации.");
  }

  const handoffResponse = await fetch(`${apiUrl}/auth/handoff`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ capability }),
    credentials: "include",
    signal: AbortSignal.timeout(15_000),
  });
  const handoffPayload = (await handoffResponse.json().catch(() => null)) as {
    handoffCode?: string;
    organizationDisplayName?: string;
    message?: string;
    requestId?: string;
  } | null;
  if (!handoffResponse.ok || !handoffPayload?.handoffCode) {
    throw new AuthRequestError(
      handoffPayload?.message ?? "Не удалось открыть кабинет",
      handoffPayload?.requestId,
    );
  }

  window.location.assign(
    workspaceHandoffUrl({
      capability,
      handoffCode: handoffPayload.handoffCode,
      displayName: session.user.displayName,
      organizationDisplayName:
        handoffPayload.organizationDisplayName ?? organizationDisplayName,
      organizationId,
      returnTo,
    }),
  );
}

export async function availableWorkspaces(session: AuthSession, capability: AuthCapability): Promise<WorkspaceContext[]> {
  if (!session.activeOrganizationId && !session.organizationId) throw new Error("У аккаунта нет активной организации");
  const response = await fetch(`${apiUrl}/auth/workspaces`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Не удалось получить доступные организации. Повторите вход.");
  const choices = workspaceChoicesSchema.parse(await response.json()).filter(item => item.capabilities.includes(capability));
  if (!choices.length) throw new Error("У аккаунта нет доступа к выбранному кабинету. Выберите доступную роль.");
  return choices;
}
