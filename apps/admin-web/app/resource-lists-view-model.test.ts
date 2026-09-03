import { describe, expect, it } from "vitest";
import {
  getOrganizationSummary,
  getProductSummary,
} from "./resource-lists-view-model";

describe("resource list view model", () => {
  it("keeps a partial organization response renderable", () => {
    expect(
      getOrganizationSummary({
        id: "organization-1",
        displayName: "Клиника NovaDent",
        capabilities: [{ capability: "BUYER" }],
      }),
    ).toEqual({
      displayName: "Клиника NovaDent",
      legalName: "Юридическое наименование не указано",
      bin: "БИН не указан",
      capabilities: "Покупатель",
    });
  });

  it("keeps a partial product response renderable", () => {
    expect(
      getProductSummary({
        id: "product-1",
        canonicalName: "Перчатки SafeTouch Ultra",
        status: "ACTIVE",
        variants: [{ id: "variant-1" }],
      }),
    ).toMatchObject({
      categories: "Без категории",
      productType: "Тип не указан",
      variants: 1,
      statusLabel: "Активна",
      statusTone: "success",
    });
  });
});
