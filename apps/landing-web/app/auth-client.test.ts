import { describe, expect, it } from "vitest";
import {
  apiErrorMessage,
  feedbackFromError,
  AuthRequestError,
  pickCapability,
  workspaceHandoffUrl,
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
    expect(pickCapability(["BUYER"], undefined, "SUPPLIER")).toBe("BUYER");
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
