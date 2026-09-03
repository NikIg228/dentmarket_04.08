import { describe, expect, it } from "vitest";
import {
  getAdminLoginCopy,
  getAdminProviderAvailability,
} from "./admin-login-view-model";

describe("admin login view model", () => {
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
