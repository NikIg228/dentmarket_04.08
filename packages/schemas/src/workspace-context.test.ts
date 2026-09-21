import { expect, it } from "vitest";
import { workspaceContextSchema } from "./workspace-context.js";
const context = { organizationId: "00000000-0000-4000-8000-000000000001", organizationDisplayName: "Test clinic", capabilities: ["BUYER"] };
it("accepts tenant workspaces, including no supported purchasing workspace", () => {
  expect(workspaceContextSchema.parse(context)).toEqual(context);
  expect(workspaceContextSchema.parse({ ...context, capabilities: [] }).capabilities).toEqual([]);
});
it("rejects privileged, duplicate, foreign fields and malformed identifiers", () => {
  for (const value of [{ ...context, capabilities: ["MARKETPLACE_OPERATOR"] }, { ...context, capabilities: ["BUYER", "BUYER"] }, { ...context, email: "private@example.invalid" }, { ...context, organizationId: "bad-id" }]) {
    expect(workspaceContextSchema.safeParse(value).success).toBe(false);
  }
});
