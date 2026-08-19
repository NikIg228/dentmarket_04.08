import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketplaceApiClient } from "./index.js";

afterEach(() => vi.restoreAllMocks());

describe("core marketplace API client", () => {
  it("serializes typed public catalog search parameters", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ total: 0, items: [] }), { status: 200 }));
    const api = new MarketplaceApiClient("http://localhost:4012/api", {});

    await api.searchPublicCatalog({ q: "композит", inStock: "true", limit: 24 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "http://localhost:4012/api/catalog/search?q=%D0%BA%D0%BE%D0%BC%D0%BF%D0%BE%D0%B7%D0%B8%D1%82&inStock=true&limit=24",
    );
  });

  it("uses identity headers and a typed checkout body", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "checkout-1" }), { status: 201 }));
    const api = new MarketplaceApiClient("http://localhost:4012/api/", {
      actorId: "user-1",
      organizationId: "org-1",
    });

    await api.checkoutCart("cart-1", { idempotencyKey: "checkout-key-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4012/api/carts/cart-1/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ idempotencyKey: "checkout-key-1" }),
        headers: expect.objectContaining({
          "x-user-id": "user-1",
          "x-organization-id": "org-1",
        }),
      }),
    );
  });

  it("generates an order document pack from a persisted shipment", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ documents: [] }), { status: 201 }));
    const api = new MarketplaceApiClient("http://localhost:4012/api", {
      actorId: "supplier-user",
      organizationId: "supplier-org",
    });

    await api.generateOrderDocumentPack("order-1", { shipmentId: "00000000-0000-4000-8000-000000000071" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4012/api/supplier-orders/order-1/document-pack",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ shipmentId: "00000000-0000-4000-8000-000000000071" }),
      }),
    );
  });

  it("uses typed supplier import staging, processing, and diagnostics routes", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        new Response(JSON.stringify({ status: "MAPPED" }), { status: 201 }),
      );
    const api = new MarketplaceApiClient("http://localhost:4012/api", {
      actorId: "supplier-user",
      organizationId: "supplier-org",
    });
    const supplierId = "00000000-0000-4000-8000-000000000081";
    const sourceId = "00000000-0000-4000-8000-000000000082";
    const batchId = "00000000-0000-4000-8000-000000000083";

    await api.createSupplierImportBatch(supplierId, {
      sourceId,
      fileName: "price.csv",
      fileType: "CSV",
      columnMapping: { externalId: "externalId", name: "name" },
      rows: [{ externalId: "row-1", name: "Композит A2" }],
    });
    await api.processSupplierImportBatch(supplierId, batchId);
    await api.getSupplierImportDiagnostics(supplierId, batchId);
    await api.rollbackSupplierImportBatch(supplierId, batchId, {
      reason: "Supplier confirmed that the uploaded price list was incorrect",
      expectedUpdatedAt: "2026-08-19T00:00:00.000Z",
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `http://localhost:4012/api/suppliers/${supplierId}/import-batches`,
      `http://localhost:4012/api/suppliers/${supplierId}/import-batches/${batchId}/process`,
      `http://localhost:4012/api/suppliers/${supplierId}/import-batches/${batchId}/diagnostics`,
      `http://localhost:4012/api/suppliers/${supplierId}/import-batches/${batchId}/rollback`,
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
    expect(fetchMock.mock.calls[3]?.[1]).toEqual(expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ reason: "Supplier confirmed that the uploaded price list was incorrect", expectedUpdatedAt: "2026-08-19T00:00:00.000Z" }),
    }));
  });

  it("uses typed operator review and versioned offer publication routes", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const api = new MarketplaceApiClient("http://localhost:4012/api", {
      actorId: "operator-user",
      organizationId: "operator-org",
    });
    const candidateId = "00000000-0000-4000-8000-000000000091";
    const supplierId = "00000000-0000-4000-8000-000000000092";
    const offerId = "00000000-0000-4000-8000-000000000093";

    await api.listCatalogImportReviews();
    await api.approveCatalogImportCandidate(candidateId, {
      canonicalName: "Flow B3.2 product",
      slug: "flow-b3-2-product",
      productType: "MATERIAL",
      industryIds: ["00000000-0000-4000-8000-000000000094"],
      categoryIds: ["00000000-0000-4000-8000-000000000095"],
      saleUnitId: "00000000-0000-4000-8000-000000000096",
      packageQuantity: 1,
      decisionReason: "Validated supplier import row",
    });
    await api.setSupplierOfferPublication(supplierId, offerId, {
      status: "PUBLISHED",
      marketplaceVisible: true,
      expectedVersion: 1,
      decisionReason: "Publication gate passed",
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:4012/api/moderation/import-reviews",
      `http://localhost:4012/api/moderation/import-reviews/${candidateId}/approve`,
      `http://localhost:4012/api/suppliers/${supplierId}/offers/${offerId}/publication`,
    ]);
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ status: "PUBLISHED", marketplaceVisible: true, expectedVersion: 1, decisionReason: "Publication gate passed" }),
    }));
  });
});
