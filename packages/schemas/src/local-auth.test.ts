import { expect, it } from "vitest";
import { authClientOptionsSchema, authRegistrationAcceptedSchema, localOperatorLoginSchema } from "./local-auth.js";
it("normalizes email without accepting tenant/authority claims", () => {
  expect(localOperatorLoginSchema.parse({ email: " TEST@example.invalid ", password: "test" }).email).toBe("test@example.invalid");
  expect(localOperatorLoginSchema.safeParse({ email: "test@example.invalid", password: "test", organizationId: "injected" }).success).toBe(false);
});
it("requires explicit delivery and never accepts a token in public response", () => {
  expect(authRegistrationAcceptedSchema.safeParse({ ok: true, email: "test@example.invalid", verificationRequired: true }).success).toBe(false);
  expect(authClientOptionsSchema.safeParse({ localOperatorPasswordEnabled: true, emailDelivery: "LOCAL_FILE", token: "secret" }).success).toBe(false);
});
