import { expect, it } from "vitest";
import { saveOrganizationProfileSchema } from "./organization-profile";
const address = { cityId: "00000000-0000-4000-8000-000000000001", line1: "Test street 1", postalCode: null };
const input = { contactName: "Test Person", phone: "+7 700 000 00 00", email: "TEST@example.invalid", legalAddress: address, deliveryAddress: address, expectedVersion: 1, idempotencyKey: "test-profile-key" };
it("requires both addresses, complete contact details and a version without caller-selected ownership", () => {
  expect(saveOrganizationProfileSchema.parse(input).email).toBe("test@example.invalid");
  for (const patch of [{ deliveryAddress: undefined }, { legalAddress: undefined }, { contactName: " " }, { phone: "-------" }, { organizationId: address.cityId }, { expectedVersion: 0 }, { deliveryAddress: { ...address, line1: " " } }]) {
    expect(saveOrganizationProfileSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  }
});
