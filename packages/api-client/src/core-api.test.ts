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
});
