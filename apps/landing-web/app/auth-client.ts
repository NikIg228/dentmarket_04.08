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
    message: cause instanceof Error ? cause.message : fallback,
  };
}

export async function authRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
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
  if (sessionCapability && available.includes(sessionCapability)) {
    return sessionCapability;
  }
  if (preferredCapability && available.includes(preferredCapability)) {
    return preferredCapability;
  }
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
}: {
  capability: AuthCapability;
  handoffCode: string;
  displayName: string;
  organizationDisplayName?: string;
  organizationId: string;
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
  return `${capability === "SUPPLIER" ? supplierAppUrl : buyerAppUrl}/#session=${handoff}`;
}

export async function openWorkspace(
  session: AuthSession,
  preferredCapability?: AuthCapability,
) {
  const organizationId =
    session.activeOrganizationId ?? session.organizationId;
  if (!organizationId) {
    throw new Error("У аккаунта нет активной организации");
  }

  let capability = session.capability;
  let organizationDisplayName = session.organizationDisplayName;
  if (!capability || (preferredCapability && capability !== preferredCapability)) {
    const response = await fetch(`${apiUrl}/organizations/${organizationId}`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
    });
    const organization = (await response.json().catch(() => null)) as {
      displayName?: string;
      capabilities?: Array<{ capability: string }>;
      message?: string;
      requestId?: string;
    } | null;
    if (!response.ok) {
      throw new AuthRequestError(
        organization?.message ?? "Не удалось определить организацию",
        organization?.requestId,
      );
    }
    organizationDisplayName = organization?.displayName;
    capability = pickCapability(
      organization?.capabilities?.map((item) => item.capability) ?? [],
      session.capability,
      preferredCapability,
    );
  }

  if (!capability) {
    throw new Error("Для аккаунта не найден кабинет клиники или поставщика");
  }

  const handoffResponse = await fetch(`${apiUrl}/auth/handoff`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessToken}`,
      "x-user-id": session.user.id,
      "x-organization-id": organizationId,
      ...(session.sessionId ? { "x-session-id": session.sessionId } : {}),
    },
    body: JSON.stringify({ capability }),
    credentials: "include",
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
    }),
  );
}
