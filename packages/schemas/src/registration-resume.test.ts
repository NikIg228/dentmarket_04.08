import { describe, expect, it } from "vitest";
import { registrationResumeCompleteSchema, registrationResumeRequestSchema, registrationResumeProofSchema, registrationResumeCompletedSchema } from "./registration-resume.js";
const target = { email: "Owner@Example.invalid", bin: "123456789012", capability: "BUYER" };
describe("registration resume contracts", () => {
  it("normalizes the same email without accepting a tenant or actor", () => {
    expect(registrationResumeRequestSchema.parse(target).email).toBe("owner@example.invalid");
    expect(registrationResumeRequestSchema.safeParse({ ...target, organizationId: "foreign" }).success).toBe(false);
  });
  it.each(["OPERATOR", "ADMIN", "SUPPORT"])("does not self-register %s", capability => {
    expect(registrationResumeRequestSchema.safeParse({ ...target, capability }).success).toBe(false);
  });
  it("requires proof, target and a bounded password", () => {
    expect(registrationResumeCompleteSchema.safeParse({ ...target, password: "long-test-password" }).success).toBe(false);
    expect(registrationResumeCompleteSchema.safeParse({ ...target, token: "A".repeat(64), password: "long-test-password" }).success).toBe(true);
    expect(registrationResumeCompleteSchema.safeParse({ ...target, token: "A".repeat(64), password: "A".repeat(129) }).success).toBe(false);
    expect(registrationResumeProofSchema.safeParse({ token: "A".repeat(63) }).success).toBe(false);
  });
  it("never treats a missing or unconfirmed response as success", () => {
    expect(registrationResumeCompletedSchema.safeParse({ ok: true }).success).toBe(false);
    expect(registrationResumeCompletedSchema.parse({ status: "COMPLETED", next: "LOGIN" })).toEqual({ status: "COMPLETED", next: "LOGIN" });
  });
});
