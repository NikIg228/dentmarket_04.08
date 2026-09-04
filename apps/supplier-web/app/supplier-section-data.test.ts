import { describe, expect, it } from "vitest";
import { loadSupplierSectionData } from "./supplier-section-data";

const supplierId = "supplier-1";

function apiReader() {
  const paths: string[] = [];
  return {
    api: {
      async get<T>(path: string): Promise<T> {
        paths.push(path);
        return [] as T;
      },
    },
    paths,
  };
}

describe("loadSupplierSectionData", () => {
  it("limits the initial dashboard to the seven resources it renders", async () => {
    const { api, paths } = apiReader();

    const result = await loadSupplierSectionData(api, supplierId, "dashboard");

    expect(paths).toEqual([
      `/suppliers/${supplierId}/offers`,
      `/suppliers/${supplierId}/inventory/balances`,
      "/supplier-orders",
      `/suppliers/${supplierId}/integrations`,
      `/compliance/organizations/${supplierId}/credentials`,
      "/compliance/checks",
      `/suppliers/${supplierId}/inventory/freshness/policies`,
    ]);
    expect(Object.keys(result)).toEqual([
      "offers",
      "balances",
      "orders",
      "integrations",
      "credentials",
      "checks",
      "policies",
    ]);
  });

  it.each([
    ["offers", 1],
    ["inventory", 2],
    ["orders", 1],
    ["integrations", 4],
    ["compliance", 2],
    ["documents", 2],
  ])("loads only resources for the %s section", async (section, requestCount) => {
    const { api, paths } = apiReader();

    await loadSupplierSectionData(api, supplierId, section);

    expect(paths).toHaveLength(requestCount);
  });

  it.each(["promotions", "trust"])(
    "leaves the self-loading %s panel without root requests",
    async (section) => {
      const { api, paths } = apiReader();

      await expect(loadSupplierSectionData(api, supplierId, section)).resolves.toEqual(
        {},
      );
      expect(paths).toEqual([]);
    },
  );
});
