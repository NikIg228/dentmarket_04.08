import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PaymentSettlementService } from "./payment-settlement.service";

type ClaimOperation = (paymentIntentId: string, providerId: string, type: string, target: string, clientIdempotencyKey: string, request: Record<string, unknown>) => Promise<unknown>;

function serviceWithAttempt(create: ReturnType<typeof vi.fn>, findUnique: ReturnType<typeof vi.fn>) {
  const service = new PaymentSettlementService({ paymentAttempt: { create, findUnique, update: vi.fn() } } as never, {} as never, {} as never);
  const claim = (service as unknown as { claimOperation: ClaimOperation }).claimOperation.bind(service);
  return { service, claim };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "test" });
}

describe("payment operation claims", () => {
  it("allows one concurrent claimant and rejects the duplicate before provider execution", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ id: "attempt-1", status: "PROCESSING" })
      .mockRejectedValueOnce(uniqueViolation());
    const findUnique = vi.fn().mockResolvedValue({ id: "attempt-1", status: "PROCESSING" });
    const { claim } = serviceWithAttempt(create, findUnique);

    const results = await Promise.allSettled([
      claim("intent-1", "provider-1", "CAPTURE", "allocation-1", "client-a", { amountMinor: "100" }),
      claim("intent-1", "provider-1", "CAPTURE", "allocation-1", "client-b", { amountMinor: "100" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected" && result.reason instanceof ConflictException)).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(2);
    expect(findUnique).toHaveBeenCalledWith({ where: { paymentIntentId_idempotencyKey: { paymentIntentId: "intent-1", idempotencyKey: "payment-operation:CAPTURE:allocation-1" } } });
  });

  it("reuses the durable provider result instead of invoking the provider again", async () => {
    const create = vi.fn().mockRejectedValue(uniqueViolation());
    const findUnique = vi.fn().mockResolvedValue({ id: "attempt-1", status: "SUCCEEDED", externalAttemptId: "external-1", responsePayload: { status: "SUCCEEDED", externalId: "external-1", data: { confirmed: true } } });
    const { claim } = serviceWithAttempt(create, findUnique);

    const result = await claim("intent-1", "provider-1", "AUTHORIZATION", "intent-1", "client-a", { amountMinor: "100" }) as { shouldCallProvider: boolean; operationKey: string; result: { externalId: string; status: string } };

    expect(result.shouldCallProvider).toBe(false);
    expect(result.operationKey).toBe("payment-operation:AUTHORIZATION:intent-1");
    expect(result.result).toMatchObject({ externalId: "external-1", status: "SUCCEEDED" });
  });

  it("keeps capture allocations untouched when the provider answers PENDING", async () => {
    const paymentAttempt = {
      create: vi.fn().mockResolvedValue({ id: "attempt-1", status: "PROCESSING" }),
      findUnique: vi.fn(),
      update: vi.fn(),
    };
    const tx = {
      paymentTransaction: { create: vi.fn().mockResolvedValue({ id: "transaction-1" }) },
      paymentIntent: { update: vi.fn() },
      paymentAllocation: { update: vi.fn(), aggregate: vi.fn() },
      paymentCapture: { create: vi.fn() },
    };
    const intent = {
      id: "intent-1",
      providerId: "provider-1",
      provider: { capabilities: {} },
      buyerOrganizationId: "buyer-1",
      totalAmountMinor: new Prisma.Decimal(100),
      currency: "KZT",
      status: "AUTHORIZED",
      authorization: { paymentTransactionId: "auth-1" },
      allocations: [{ id: "allocation-1", status: "AUTHORIZED", grossAmountMinor: new Prisma.Decimal(100), merchantAccount: { onboardingStatus: "ACTIVE", verificationStatus: "VERIFIED", payoutStatus: "READY" }, supplierOrder: { supplierOrganizationId: "supplier-1", items: [] } }],
      transactions: [],
    };
    const prisma = {
      paymentIntent: { findUnique: vi.fn().mockResolvedValue(intent), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      paymentAttempt,
      $transaction: vi.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    };
    const adapter = { capture: vi.fn().mockResolvedValue({ externalId: "external-1", status: "PENDING", data: { pending: true } }) };
    const service = new PaymentSettlementService(prisma as never, { resolve: vi.fn().mockReturnValue({ adapter, context: {} }) } as never, { assertActive: vi.fn() } as never);

    await service.capture("intent-1", { idempotencyKey: "client-1" }, { actorId: "user-1", organizationId: "buyer-1" });

    expect(adapter.capture).toHaveBeenCalledTimes(1);
    expect(tx.paymentIntent.update).toHaveBeenCalledWith({ where: { id: "intent-1" }, data: { status: "PROCESSING" } });
    expect(tx.paymentCapture.create).not.toHaveBeenCalled();
    expect(tx.paymentAllocation.update).not.toHaveBeenCalled();
    expect(tx.paymentAllocation.aggregate).not.toHaveBeenCalled();
  });

  it("uses the payment intent state as a broad capture lock", async () => {
    const updateMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const service = new PaymentSettlementService({ paymentIntent: { updateMany } } as never, {} as never, {} as never);
    const claim = (service as unknown as { claimIntentProcessing: (id: string, statuses: string[]) => Promise<void> }).claimIntentProcessing.bind(service);

    await claim("intent-1", ["AUTHORIZED"]);
    await expect(claim("intent-1", ["AUTHORIZED"])).rejects.toBeInstanceOf(ConflictException);
    expect(updateMany).toHaveBeenCalledTimes(2);
  });
});
