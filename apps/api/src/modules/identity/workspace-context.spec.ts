import { expect, it, vi } from "vitest";
import { AuthSessionsService } from "./auth-sessions.service";
const actor = "00000000-0000-4000-8000-000000000001", organizationId = "00000000-0000-4000-8000-000000000002";
function setup(result: unknown) {
  const findFirst = vi.fn().mockResolvedValue(result);
  const service = new AuthSessionsService({ organizationMembership: { findFirst } } as never, {} as never, {} as never, {} as never);
  return { service, findFirst };
}
it("rejects absent authenticated context before lookup", async () => {
  const { service, findFirst } = setup(null);
  await expect(service.workspaceContext()).rejects.toThrow("Войдите");
  await expect(service.workspaceContext(actor)).rejects.toThrow("Войдите");
  expect(findFirst).not.toHaveBeenCalled();
});
it("binds lookup to active actor, tenant, membership and organization; returns no privileged capabilities", async () => {
  const { service, findFirst } = setup({ organization: { id: organizationId, displayName: "Test", capabilities: [{ capability: "BUYER" }, { capability: "SUPPLIER" }, { capability: "MARKETPLACE_OPERATOR" }] } });
  expect(await service.workspaceContext(actor, organizationId)).toEqual({ organizationId, organizationDisplayName: "Test", capabilities: ["BUYER", "SUPPLIER"] });
  expect(findFirst).toHaveBeenCalledWith({ where: { userId: actor, organizationId, status: "ACTIVE", user: { status: "ACTIVE" }, organization: { status: "ACTIVE" } }, select: { organization: { select: { id: true, displayName: true, capabilities: { select: { capability: true } } } } } });
});
it("denies absent or inactive membership without returning tenant data", async () => {
  const { service } = setup(null);
  await expect(service.workspaceContext(actor, organizationId)).rejects.toMatchObject({ status: 403 });
});
