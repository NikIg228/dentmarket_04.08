import { describe, expect, it } from "vitest";
import {
  getAdminLoginCopy,
  getAdminProviderAvailability,
  hasOperatorOrganizationAccess,
} from "./admin-login-view-model";

describe("admin login view model", () => {
  it("accepts only the active operator organization from the protected collection", () => {
    expect(hasOperatorOrganizationAccess([{ id: "operator", capabilities: [{ capability: "MARKETPLACE_OPERATOR" }] }], "operator")).toBe(true);
    expect(hasOperatorOrganizationAccess([{ id: "other", capabilities: [{ capability: "MARKETPLACE_OPERATOR" }] }], "operator")).toBe(false);
    expect(hasOperatorOrganizationAccess([{ id: "operator", capabilities: [{ capability: "BUYER" }] }], "operator")).toBe(false);
  });
  it("fails closed on missing or malformed collection data", () => {
    for (const payload of [null, {}, { message: "Unauthorized" }, [{ id: "operator" }], [{ id: "operator", capabilities: [null, "MARKETPLACE_OPERATOR"] }]]) {
      expect(hasOperatorOrganizationAccess(payload, "operator")).toBe(false);
    }
  });
  it("requires the complete Apple configuration before exposing the provider", () => {
    expect(
      getAdminProviderAvailability({
        googleClientId: "",
        appleClientId: "service-id",
        appleRedirectUri: "",
      }),
    ).toEqual({ google: false, apple: false, any: false });
  });

  it("provides explicit copy for the MFA enrollment step", () => {
    expect(getAdminLoginCopy("enroll")).toMatchObject({
      eyebrow: "Первичная настройка",
      title: "Подключите двухфакторную проверку",
    });
  });
});
