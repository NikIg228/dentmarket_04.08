import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("deployment request boundary", () => {
  it.each([undefined, "pilot", "unknown"])(
    "blocks optional read/write/download before fetch for %s",
    async (profile) => {
      vi.stubEnv("NEXT_PUBLIC_DEPLOYMENT_PROFILE", profile);
      vi.resetModules();
      const { MarketplaceApiClient, frontendFeatures } =
        await import("./index.js");
      expect(frontendFeatures.ai).toBe(false);
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const api = new MarketplaceApiClient("https://api.example.test/api/", {});
      for (const prefix of [
        "ai",
        "trust",
        "promotions",
        "billing",
        "recommendations",
      ]) {
        for (const request of [
          () => api.get(`/${prefix}`),
          () => api.post(`/${prefix}/action`, {}),
          () => api.patch(`/${prefix}/id`, {}),
          () => api.put(`/${prefix}/id`, {}),
          () => api.download(`/${prefix}/export`),
        ]) {
          await expect(request()).rejects.toMatchObject({
            status: 404,
            payload: { code: "FEATURE_UNAVAILABLE" },
          });
        }
      }
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("preserves core reads and writes in pilot", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOYMENT_PROFILE", "pilot");
    vi.resetModules();
    const { MarketplaceApiClient } = await import("./index.js");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}"));
    const api = new MarketplaceApiClient("https://api.example.test/api", {
      accessToken: "test-token",
    });
    await api.get("/geo/cities");
    await api.get("/documents/archive");
    await api.post("/carts/test/checkout", { idempotencyKey: "test-key" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.example.test/api/carts/test/checkout",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("preserves optional requests in an explicit go_live build", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOYMENT_PROFILE", "go_live");
    vi.resetModules();
    const { MarketplaceApiClient, frontendFeatures } =
      await import("./index.js");
    expect(Object.values(frontendFeatures)).toEqual(Array(5).fill(true));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}"));
    const api = new MarketplaceApiClient("https://api.example.test/api", {});
    for (const prefix of [
      "ai",
      "trust",
      "promotions",
      "billing",
      "recommendations",
    ]) {
      await api.get(`/${prefix}`);
      await api.post(`/${prefix}/action`, {});
    }
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});
