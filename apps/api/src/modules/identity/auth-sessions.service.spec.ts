import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthSessionsService } from "./auth-sessions.service";

describe("AuthSessionsService invitation authority", () => {
  it("revalidates stored roles before the social invitation transaction", async () => {
    const transaction = vi.fn();
    const prisma = {
      membershipInvitation: {
        findUnique: vi.fn(async () => ({
          organizationId: "organization",
          email: "invitee@example.test",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 60_000),
          roles: [{ roleId: "legacy-global-role" }],
        })),
      },
      $transaction: transaction,
    };
    const authority = {
      assertRolesBelongToOrganization: vi.fn(async () => {
        throw new ForbiddenException("Role ownership mismatch");
      }),
    };
    const service = new AuthSessionsService(
      prisma as never,
      {} as never,
      {} as never,
      authority as never,
    );

    await expect(
      (
        service as unknown as {
          acceptInvitation(
            token: string,
            userId: string,
            email: string,
          ): Promise<void>;
        }
      ).acceptInvitation(
        "legacy-invitation-token-with-safe-length",
        "user",
        "invitee@example.test",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(authority.assertRolesBelongToOrganization).toHaveBeenCalledWith(
      "organization",
      ["legacy-global-role"],
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});
