import { describe, expect, it } from "vitest";
import { AccessControlService } from "./access-control.service";

const activeMembership = {
  status: "ACTIVE",
  roles: [
    {
      role: {
        permissions: [
          { permission: { code: "catalog.product.view" } },
          { permission: { code: "catalog.product.create" } },
        ],
      },
    },
    {
      role: { permissions: [{ permission: { code: "catalog.product.view" } }] },
    },
  ],
};

describe("AccessControlService", () => {
  it("returns a sorted unique permission set", async () => {
    const prisma = {
      organizationMembership: { findUnique: async () => activeMembership },
    };
    const service = new AccessControlService(prisma as never);
    await expect(
      service.permissionsFor("user", "organization"),
    ).resolves.toEqual(["catalog.product.create", "catalog.product.view"]);
  });

  it("denies inactive memberships", async () => {
    const prisma = { organizationMembership: { findFirst: async () => null } };
    const service = new AccessControlService(prisma as never);
    await expect(
      service.hasAll("user", "organization", ["catalog.product.view"]),
    ).resolves.toBe(false);
  });

  it("checks all required permissions in one active-membership query", async () => {
    let input: unknown;
    const prisma = {
      organizationMembership: {
        findFirst: async (value: unknown) => {
          input = value;
          return { id: "membership" };
        },
      },
    };
    const service = new AccessControlService(prisma as never);
    await expect(
      service.hasAll("user", "organization", [
        "catalog.product.view",
        "catalog.product.view",
        "order.create",
      ]),
    ).resolves.toBe(true);
    expect(input).toMatchObject({
      where: {
        userId: "user",
        organizationId: "organization",
        status: "ACTIVE",
        AND: [
          {
            roles: {
              some: {
                role: {
                  organizationId: "organization",
                  permissions: {
                    some: { permission: { code: "catalog.product.view" } },
                  },
                },
              },
            },
          },
          {
            roles: {
              some: {
                role: {
                  organizationId: "organization",
                  permissions: {
                    some: { permission: { code: "order.create" } },
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
  });

  it("allows an empty requirement without querying the database", async () => {
    const prisma = {
      organizationMembership: {
        findFirst: async () => {
          throw new Error("database should not be queried");
        },
      },
    };
    const service = new AccessControlService(prisma as never);
    await expect(service.hasAll("user", "organization", [])).resolves.toBe(
      true,
    );
  });
});
