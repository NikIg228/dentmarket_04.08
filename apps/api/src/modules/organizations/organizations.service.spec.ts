import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { OrganizationsService } from "./organizations.service";

const context = { actorId: "operator-user", organizationId: "operator-org" };

describe("OrganizationsService", () => {
  it("requires platform authority before returning the cross-tenant organization view", async () => {
    const assertPlatformOperator = vi.fn(async () => {
      throw new ForbiddenException("Marketplace operator authority is required");
    });
    const findMany = vi.fn();
    const service = new OrganizationsService(
      { organization: { findMany } } as never,
      { assertPlatformOperator } as never,
    );

    await expect(service.list({ actorId: "tenant-user", organizationId: "tenant-org" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(assertPlatformOperator).toHaveBeenCalledWith({ actorId: "tenant-user", organizationId: "tenant-org" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("keeps the full capability projection for an authorized operator", async () => {
    const findMany = vi.fn(async () => [{ id: "supplier-org", capabilities: [{ capability: "SUPPLIER" }] }]);
    const service = new OrganizationsService(
      { organization: { findMany } } as never,
      { assertPlatformOperator: vi.fn(async () => undefined) } as never,
    );

    await expect(service.list(context)).resolves.toEqual([{ id: "supplier-org", capabilities: [{ capability: "SUPPLIER" }] }]);
    expect(findMany).toHaveBeenCalledWith({ include: { capabilities: true }, orderBy: { createdAt: "desc" } });
  });
});
