import { ForbiddenException, Injectable } from "@nestjs/common";
import type { OrganizationCapabilityType } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";

export type AuthorityActorContext = {
  actorId: string;
  organizationId: string;
};

export type AuthorityAiRole = "BUYER" | "SUPPLIER" | "OPERATOR" | "SUPPORT";

const aiRoleCapability: Record<AuthorityAiRole, OrganizationCapabilityType> = {
  BUYER: "BUYER",
  SUPPLIER: "SUPPLIER",
  OPERATOR: "MARKETPLACE_OPERATOR",
  SUPPORT: "MARKETPLACE_OPERATOR",
};

@Injectable()
export class PlatformAuthorityPolicy {
  constructor(private readonly prisma: PrismaService) {}

  private async activeMembership(context: AuthorityActorContext) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: context.actorId,
        organizationId: context.organizationId,
        status: "ACTIVE",
        organization: { status: "ACTIVE" },
      },
      include: {
        organization: { include: { capabilities: true } },
        roles: {
          where: { role: { organizationId: context.organizationId } },
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
    if (!membership) {
      throw new ForbiddenException(
        "Active organization membership is required",
      );
    }
    return membership;
  }

  private permissionCodes(
    membership: Awaited<
      ReturnType<PlatformAuthorityPolicy["activeMembership"]>
    >,
  ) {
    return new Set(
      membership.roles.flatMap(({ role }) =>
        role.permissions.map(({ permission }) => permission.code),
      ),
    );
  }

  async assertRolesBelongToOrganization(
    organizationId: string,
    roleIds: string[],
  ) {
    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length === 0) return;
    const ownedRoleCount = await this.prisma.role.count({
      where: {
        id: { in: uniqueRoleIds },
        organizationId,
      },
    });
    if (ownedRoleCount !== uniqueRoleIds.length) {
      throw new ForbiddenException(
        "Only roles owned by the active organization can be assigned",
      );
    }
  }

  async assertPlatformOperator(context: AuthorityActorContext) {
    const membership = await this.activeMembership(context);
    if (
      !membership.organization.capabilities.some(
        ({ capability }) => capability === "MARKETPLACE_OPERATOR",
      )
    ) {
      throw new ForbiddenException(
        "Marketplace operator authority is required",
      );
    }
  }

  async assertAiRole(context: AuthorityActorContext, role: AuthorityAiRole) {
    const membership = await this.activeMembership(context);
    const requiredCapability = aiRoleCapability[role];
    if (
      !membership.organization.capabilities.some(
        ({ capability }) => capability === requiredCapability,
      )
    ) {
      throw new ForbiddenException(
        "Selected AI role is not available to the active organization",
      );
    }
  }

  async allowedAiRoles(
    context: AuthorityActorContext,
    roles: readonly AuthorityAiRole[],
  ) {
    const membership = await this.activeMembership(context);
    const capabilities = new Set(
      membership.organization.capabilities.map(({ capability }) => capability),
    );
    return roles.filter((role) => capabilities.has(aiRoleCapability[role]));
  }

  async assertAiToolPermissions(
    context: AuthorityActorContext,
    role: AuthorityAiRole,
    requiredPermissionCodes: readonly string[],
  ) {
    const membership = await this.activeMembership(context);
    const requiredCapability = aiRoleCapability[role];
    if (
      !membership.organization.capabilities.some(
        ({ capability }) => capability === requiredCapability,
      )
    ) {
      throw new ForbiddenException(
        "Selected AI role is not available to the active organization",
      );
    }
    const actorPermissions = this.permissionCodes(membership);
    const missing = requiredPermissionCodes.filter(
      (code) => !actorPermissions.has(code),
    );
    if (missing.length > 0) {
      throw new ForbiddenException(
        `AI tool permissions are missing: ${missing.join(", ")}`,
      );
    }
  }

  async assertCanCreateRole(
    context: AuthorityActorContext,
    requestedPermissionCodes: string[],
  ) {
    const membership = await this.activeMembership(context);
    const actorPermissions = this.permissionCodes(membership);
    if (requestedPermissionCodes.some((code) => !actorPermissions.has(code))) {
      throw new ForbiddenException(
        "A role cannot grant permissions the actor does not hold",
      );
    }
  }

  async assertCanAssignRoles(
    context: AuthorityActorContext,
    roleIds: string[],
  ) {
    if (roleIds.length === 0) return;
    const membership = await this.activeMembership(context);
    const actorPermissions = this.permissionCodes(membership);
    const roles = await this.prisma.role.findMany({
      where: {
        id: { in: [...new Set(roleIds)] },
        organizationId: context.organizationId,
      },
      include: { permissions: { include: { permission: true } } },
    });
    if (roles.length !== new Set(roleIds).size) {
      throw new ForbiddenException(
        "Only roles owned by the active organization can be assigned",
      );
    }
    const escalates = roles.some((role) =>
      role.permissions.some(
        ({ permission }) => !actorPermissions.has(permission.code),
      ),
    );
    if (escalates) {
      throw new ForbiddenException(
        "A role cannot grant permissions the actor does not hold",
      );
    }
  }
}
