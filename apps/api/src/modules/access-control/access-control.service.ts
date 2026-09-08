import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../platform/prisma/prisma.service";

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  async permissionsFor(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: {
        roles: {
          where: { role: { organizationId } },
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (!membership || membership.status !== "ACTIVE") return [];
    return [
      ...new Set(
        membership.roles.flatMap(({ role }) =>
          role.permissions.map(({ permission }) => permission.code),
        ),
      ),
    ].sort();
  }

  async hasAll(userId: string, organizationId: string, required: string[]) {
    const permissionCodes = [...new Set(required)];
    if (permissionCodes.length === 0) return true;
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId,
        status: "ACTIVE",
        AND: permissionCodes.map((code) => ({
          roles: {
            some: {
              role: {
                organizationId,
                permissions: { some: { permission: { code } } },
              },
            },
          },
        })),
      },
      select: { id: true },
    });
    return Boolean(membership);
  }
}
