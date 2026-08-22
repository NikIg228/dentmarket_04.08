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
});
