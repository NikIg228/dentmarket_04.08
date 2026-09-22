import { describe, expect, it } from "vitest";
import { productReturnPath, withProductReturn } from "./product-navigation";
import { emailRegisterSchema } from "./commercial";

const product = "/products/00000000-0000-4000-8000-000000000001";
const target = `${product}?${new URLSearchParams({ returnTo: "/catalog?q=боры&sort=PRICE_ASC&count=48" })}`;
describe("product return intent", () => {
  it("preserves the product and catalog context without a purchase action", () => {
    expect(productReturnPath(target)).toBe(target);
    const href = withProductReturn("/register?role=buyer", target);
    const url = new URL(href, "https://landing.invalid");
    expect(url.searchParams.get("role")).toBe("buyer");
    expect(url.searchParams.get("returnTo")).toBe(target);
    expect(withProductReturn("/login", undefined)).toBe("/login");
  });
  it.each([
    "https://outside.invalid" + product, "//outside.invalid" + product,
    "/\\outside.invalid", "/products/../login", "/products/%2e%2e/login",
    product + "#session=untrusted", product + "?action=buy", product + "?returnTo=%2F%2Foutside.invalid",
    product + "?returnTo=%2Fcatalog%5Coutside", product + "?returnTo=%2Fcatalog%0A",
    product + "?returnTo=%2Flogin", product + "?returnTo=%2F&returnTo=%2Fcatalog",
    product + "?returnTo=" + "a".repeat(4096), null,
  ])("rejects unsafe or unsupported destinations: %s", value => {
    expect(productReturnPath(value)).toBeUndefined();
    expect(withProductReturn("/login", value)).toBe("/login");
  });
  it("validates the optional registration field at the API boundary", () => {
    const input = { email: "test@example.invalid", displayName: "Test", password: "Synthetic-password" };
    expect(emailRegisterSchema.parse({ ...input, returnTo: target }).returnTo).toBe(target);
    expect(emailRegisterSchema.parse(input).returnTo).toBeUndefined();
    expect(emailRegisterSchema.safeParse({ ...input, returnTo: "https://outside.invalid" }).success).toBe(false);
  });
});
