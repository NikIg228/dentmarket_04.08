import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PlatformAuthorityPolicy } from "./platform-authority.policy";

function membership(capabilities: string[], permissionCodes: string[]) {
  return {
    organization: {
      capabilities: capabilities.map((capability) => ({ capability })),
    },
    roles: [
      {
        role: {
          permissions: permissionCodes.map((code) => ({
            permission: { code },
          })),
        },
      },
    ],
  };
}

function policyFixture(
  activeMembership: ReturnType<typeof membership> | null,
  roles: Array<{ permissions: Array<{ permission: { code: string } }> }> = [],
) {
  const prisma = {
    organizationMembership: { findFirst: vi.fn(async () => activeMembership) },
    role: {
      count: vi.fn(async () => roles.length),
      findMany: vi.fn(async () => roles),
    },
  };
  return { policy: new PlatformAuthorityPolicy(prisma as never), prisma };
}

const context = { actorId: "actor", organizationId: "organization" };

describe("PlatformAuthorityPolicy", () => {
  it("requires active marketplace-operator membership for platform writes", async () => {
    const supplier = policyFixture(
      membership(["SUPPLIER"], ["catalog.product.create"]),
    );
    await expect(
      supplier.policy.assertPlatformOperator(context),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const operator = policyFixture(
      membership(["MARKETPLACE_OPERATOR"], ["catalog.product.create"]),
    );
    await expect(
      operator.policy.assertPlatformOperator(context),
    ).resolves.toBeUndefined();
  });

  it("binds buyer, supplier and privileged AI roles to organization capabilities", async () => {
    const supplier = policyFixture(membership(["SUPPLIER"], ["ai.use"]));
    await expect(
      supplier.policy.assertAiRole(context, "SUPPLIER"),
    ).resolves.toBeUndefined();
    await expect(
      supplier.policy.assertAiRole(context, "OPERATOR"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      supplier.policy.assertAiRole(context, "SUPPORT"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("enforces the operation permission map for AI tools", async () => {
    const fixture = policyFixture(membership(["BUYER"], ["ai.use", "budget.view"]));
    await expect(
      fixture.policy.assertAiToolPermissions(context, "BUYER", ["budget.view"]),
    ).resolves.toBeUndefined();
    await expect(
      fixture.policy.assertAiToolPermissions(context, "BUYER", ["order.create"]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("prevents a role from granting permissions the actor does not hold", async () => {
    const fixture = policyFixture(
      membership(
        ["SUPPLIER"],
        ["catalog.product.view", "organization.roles.manage"],
      ),
    );
    await expect(
      fixture.policy.assertCanCreateRole(context, ["catalog.product.view"]),
    ).resolves.toBeUndefined();
    await expect(
      fixture.policy.assertCanCreateRole(context, ["security.event.view"]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects global, foreign and privilege-escalating role assignments", async () => {
    const actor = membership(
      ["SUPPLIER"],
      ["catalog.product.view", "organization.roles.manage"],
    );
    const missingRole = policyFixture(actor, []);
    await expect(
      missingRole.policy.assertCanAssignRoles(context, ["global-role"]),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const elevatedRole = policyFixture(actor, [
      { permissions: [{ permission: { code: "security.event.view" } }] },
    ]);
    await expect(
      elevatedRole.policy.assertCanAssignRoles(context, ["tenant-role"]),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const allowedRole = policyFixture(actor, [
      { permissions: [{ permission: { code: "catalog.product.view" } }] },
    ]);
    await expect(
      allowedRole.policy.assertCanAssignRoles(context, ["tenant-role"]),
    ).resolves.toBeUndefined();
  });

  it("revalidates stored role ownership before an invitation is consumed", async () => {
    const missingRole = policyFixture(membership(["SUPPLIER"], ["ai.use"]));
    await expect(
      missingRole.policy.assertRolesBelongToOrganization("organization", [
        "legacy-global-role",
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const ownedRole = policyFixture(membership(["SUPPLIER"], ["ai.use"]), [
      { permissions: [] },
    ]);
    await expect(
      ownedRole.policy.assertRolesBelongToOrganization("organization", [
        "tenant-role",
      ]),
    ).resolves.toBeUndefined();
  });

  it("denies when the actor has no active membership", async () => {
    const fixture = policyFixture(null);
    await expect(
      fixture.policy.assertPlatformOperator(context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
