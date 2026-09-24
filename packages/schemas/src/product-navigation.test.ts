import { describe, expect, it } from "vitest";
import { productReturnPath, withProductReturn, workspaceReturnPath, withWorkspaceReturn } from "./product-navigation";
import { emailRegisterSchema } from "./commercial";

const product = "/products/00000000-0000-4000-8000-000000000001";
const target = `${product}?${new URLSearchParams({ returnTo: "/catalog?q=боры&sort=PRICE_ASC&count=48" })}`;
describe("workspace return allowlist", () => {
  it("retains documents for either verified capability and catalog only for buyers", () => {
    for (const capability of ["BUYER", "SUPPLIER"] as const) expect(workspaceReturnPath("/documents", capability)).toBe("/documents");
    expect(workspaceReturnPath("/catalog?count=48", "BUYER")).toBe("/catalog?count=48");
    expect(workspaceReturnPath("/catalog?count=48", "SUPPLIER")).toBeUndefined();
    expect(workspaceReturnPath(product, "SUPPLIER")).toBeUndefined();
    expect(withWorkspaceReturn("/login", "/documents")).toBe("/login?returnTo=%2Fdocuments");
  });
  it.each(["//outside.invalid", "/admin", "/documents?organizationId=other", "/catalog?action=buy", "/catalog?session=token", "/catalog?q=a&q=b", "/catalog?q=%0a", "/%2e%2e/documents", "/documents#session=foo"])("rejects authority, action and unsafe paths: %s", value => expect(workspaceReturnPath(value)).toBeUndefined());
});
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
