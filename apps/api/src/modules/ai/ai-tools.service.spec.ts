import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AiToolsService, AI_TOOL_PERMISSION_MAP, type ToolPlan } from "./ai-tools.service";

const context = { userId: "user-1", organizationId: "org-1", role: "BUYER" as const };

describe("AiToolsService authorization", () => {
  it("keeps every allowlisted tool behind an explicit permission map", async () => {
    const authority = {
      assertAiToolPermissions: vi.fn().mockResolvedValue(undefined),
      assertPlatformOperator: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AiToolsService({} as never, authority as never);
    const tools = Object.keys(AI_TOOL_PERMISSION_MAP);
    expect(tools).toHaveLength(10);
    for (const name of tools) {
      await service.assertAuthorized({ name, input: {}, requiresConfirmation: false }, context);
    }
    expect(authority.assertAiToolPermissions).toHaveBeenCalledTimes(tools.length);
    for (const permissions of authority.assertAiToolPermissions.mock.calls.map((call) => call[2])) {
      expect(permissions.length).toBeGreaterThan(0);
    }
  });

  it("requires platform authority for global operations", async () => {
    const authority = {
      assertAiToolPermissions: vi.fn().mockResolvedValue(undefined),
      assertPlatformOperator: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AiToolsService({} as never, authority as never);
    await service.assertAuthorized({ name: "support_queue", input: {}, requiresConfirmation: false }, { ...context, role: "SUPPORT" });
    await service.assertAuthorized({ name: "trust_operations_queue", input: {}, requiresConfirmation: false }, { ...context, role: "OPERATOR" });
    expect(authority.assertPlatformOperator).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown tools before touching Prisma", async () => {
    const authority = {
      assertAiToolPermissions: vi.fn(),
      assertPlatformOperator: vi.fn(),
    };
    const service = new AiToolsService({} as never, authority as never);
    await expect(service.assertAuthorized({ name: "not-allowlisted", input: {}, requiresConfirmation: false }, context)).rejects.toThrow("not allowlisted");
  });

  it("does not execute a tool after the authority policy denies it", async () => {
    const authority = {
      assertAiToolPermissions: vi.fn().mockRejectedValue(new ForbiddenException("missing permission")),
      assertPlatformOperator: vi.fn(),
    };
    const prisma = { product: { findMany: vi.fn() } };
    const service = new AiToolsService(prisma as never, authority as never);
    const plan: ToolPlan = { name: "search_catalog", input: { query: "mask" }, requiresConfirmation: false };
    await expect(service.execute(plan, context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });
});
