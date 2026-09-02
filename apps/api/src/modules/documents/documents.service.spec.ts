import { describe, expect, it, vi } from "vitest";
import { DocumentsService } from "./documents.service";

describe("DocumentsService signature status", () => {
  it("does not let a stale partial refresh regress a signed document", async () => {
    const prisma = {
      document: {
        findUniqueOrThrow: vi.fn()
          .mockResolvedValueOnce({ id: "document", immutableAt: null, requiredSignatureCount: 2, signatures: [{ status: "SIGNED" }] })
          .mockResolvedValueOnce({ id: "document", status: "SIGNED" }),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const service = new DocumentsService(prisma as never, {} as never, {} as never, {} as never, {} as never);

    const result = await (service as any).refreshDocumentSignatureStatus("document");

    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "document", status: { not: "SIGNED" } } }));
    expect(result.status).toBe("SIGNED");
  });

  it("rejects a local EDS signer from another organization", async () => {
    const service = new DocumentsService({} as never, {} as never, {} as never, {} as never, {} as never);
    vi.spyOn(service, "get").mockResolvedValue({
      id: "document",
      checksumSha256: "a".repeat(64),
      storageKey: "documents/document.pdf",
      status: "GENERATED",
    } as never);
    vi.spyOn(service as any, "isOperator").mockResolvedValue(false);

    await expect(service.createLocalEdsSignatureSession("document", {
      method: "EDS",
      signerOrganizationId: "organization-b",
      signerUserId: "user-a",
      signerName: "Signer",
      expiresInMinutes: 60,
    }, { actorId: "user-a", organizationId: "organization-a" })).rejects.toThrow("Signer organization must be the active organization");
  });

  it("rejects a local EDS session created for another user", async () => {
    const service = new DocumentsService({} as never, {} as never, {} as never, {} as never, {} as never);
    vi.spyOn(service, "get").mockResolvedValue({
      id: "document",
      checksumSha256: "a".repeat(64),
      storageKey: "documents/document.pdf",
      status: "GENERATED",
    } as never);
    vi.spyOn(service as any, "isOperator").mockResolvedValue(false);

    await expect(service.createLocalEdsSignatureSession("document", {
      method: "EDS",
      signerOrganizationId: "organization-a",
      signerUserId: "user-b",
      signerName: "Signer",
      expiresInMinutes: 60,
    }, { actorId: "user-a", organizationId: "organization-a" })).rejects.toThrow("Signer user must be the authenticated user");
  });
});
