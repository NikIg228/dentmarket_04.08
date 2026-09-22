import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiErrorMessage,
  feedbackFromError,
  AuthRequestError,
  pickCapability,
  workspaceHandoffUrl,
  openWorkspace,
} from "./auth-client";

describe("landing auth contract", () => {
  it("preserves backend validation messages and request id", () => {
    expect(apiErrorMessage({ message: ["Email неверен", "Пароль слишком короткий"] }, 400)).toBe(
      "Email неверен. Пароль слишком короткий",
    );
    expect(
      feedbackFromError(
        new AuthRequestError("Сессия истекла", "request-42"),
        "Не удалось войти",
      ),
    ).toEqual({
      kind: "error",
      message: "Сессия истекла",
      requestId: "request-42",
    });
  });

  it("honors the selected workspace when the organization supports it", () => {
    expect(pickCapability(["BUYER", "SUPPLIER"], undefined, "SUPPLIER")).toBe(
      "SUPPLIER",
    );
    expect(pickCapability(["BUYER"], undefined, "SUPPLIER")).toBeUndefined();
    expect(pickCapability(["BUYER", "SUPPLIER"], "BUYER", "SUPPLIER")).toBe("SUPPLIER");
  });

  it("creates a fragment-only handoff without putting the token in query params", () => {
    const url = workspaceHandoffUrl({
      capability: "BUYER",
      handoffCode: "one-time-code",
      displayName: "Айдана",
      organizationDisplayName: "Клиника",
      organizationId: "org-1",
    });

    expect(url).toContain("/#session=");
    expect(url).not.toContain("?session=");
    expect(decodeURIComponent(url.split("#session=")[1] ?? "")).toContain(
      '"handoffCode":"one-time-code"',
    );
  });
});

describe("workspace context before handoff", () => {
  const organizationId = "00000000-0000-4000-8000-000000000001";
  const session = { accessToken: "synthetic-bearer", activeOrganizationId: organizationId, user: { id: "actor", displayName: "Test", email: "test@example.invalid" } };
  afterEach(() => vi.unstubAllGlobals());
  function setup(context: unknown, status = 200, handoffStatus = 201) {
    const assign = vi.fn(); vi.stubGlobal("window", { location: { assign } });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(context, { status }))
      .mockResolvedValueOnce(Response.json({ handoffCode: "synthetic-one-time-code" }, { status: handoffStatus }));
    vi.stubGlobal("fetch", fetcher); return { assign, fetcher };
  }
  it.each(["BUYER", "SUPPLIER"] as const)("opens the actual %s organization without an operator directory lookup", async capability => {
    const { assign, fetcher } = setup({ organizationId, organizationDisplayName: "Test organization", capabilities: [capability] });
    await openWorkspace(session, capability);
    expect(fetcher.mock.calls[0][0]).toMatch(/\/auth\/workspace-context$/);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { authorization: "Bearer synthetic-bearer" }, cache: "no-store" });
    expect(fetcher.mock.calls[1][1]?.body).toBe(JSON.stringify({ capability }));
    const destination = new URL(assign.mock.calls[0][0]);
    expect(destination.search).toBe("");
    expect(JSON.parse(decodeURIComponent(destination.hash.slice("#session=".length)))).toMatchObject({ capability, organizationId, handoffCode: "synthetic-one-time-code" });
    expect(destination.href).not.toContain("synthetic-bearer");
  });
  it("honors a supported supplier preference for a dual-capability organization", async () => {
    const { fetcher } = setup({ organizationId, organizationDisplayName: "Test", capabilities: ["BUYER", "SUPPLIER"] });
    await openWorkspace(session, "SUPPLIER");
    expect(fetcher.mock.calls[1][1]?.body).toBe('{"capability":"SUPPLIER"}');
  });
  it.each([
    { organizationId: "00000000-0000-4000-8000-000000000002", organizationDisplayName: "Foreign", capabilities: ["BUYER"] },
    { organizationId, organizationDisplayName: "Operator", capabilities: [] },
    { organizationId, organizationDisplayName: "Malformed", capabilities: ["MARKETPLACE_OPERATOR"] },
  ])("does not create a handoff for wrong, unsupported or malformed context", async context => {
    const { assign, fetcher } = setup(context);
    await expect(openWorkspace(session)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1); expect(assign).not.toHaveBeenCalled();
  });
  it("preserves a safe denied-context error and request id", async () => {
    const { assign, fetcher } = setup({ message: "Доступ отключён", requestId: "request-test" }, 403);
    await expect(openWorkspace(session)).rejects.toMatchObject({ message: "Доступ отключён", requestId: "request-test" });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(assign).not.toHaveBeenCalled();
  });
  it("never redirects when handoff issuance fails", async () => {
    const { assign } = setup({ organizationId, organizationDisplayName: "Test", capabilities: ["BUYER"] }, 200, 503);
    await expect(openWorkspace(session)).rejects.toThrow("Не удалось открыть кабинет");
    expect(assign).not.toHaveBeenCalled();
  });
});
