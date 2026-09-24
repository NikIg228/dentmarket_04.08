import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { completeFixtureOrganization } from "../../../scripts/lib/organization-profile-fixture.mjs";

const { passwordHash } = createRequire(path.resolve("package.json"))(path.resolve("../api/dist/src/modules/identity/password-codec.js")) as { passwordHash(value: string): string };
const db = new PrismaClient();
const run = `e2e-organization-${randomUUID()}`;
const ownedUsers: string[] = [];
const buyer = "http://127.0.0.1:3001", supplier = "http://127.0.0.1:3002", landing = "http://127.0.0.1:3003";
test.describe.configure({ timeout: 90000 });
test.beforeAll(async () => {
  const target = new URL(process.env.DATABASE_URL!);
  const name = process.env.GITHUB_ACTIONS === "true" ? "marketplace" : "dentmarket_audit_20260914";
  expect(["127.0.0.1", "localhost"]).toContain(target.hostname); expect(target.pathname).toBe(`/${name}`);
  const [identity] = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  expect(identity.name).toBe(name);
});
test.afterAll(async () => {
  try { await db.authSession.updateMany({ where: { userId: { in: ownedUsers }, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: "organization_ready_fixture_finished" } }); }
  finally { await db.$disconnect(); }
});
async function account(capabilities: Array<"BUYER" | "SUPPLIER" | "MARKETPLACE_OPERATOR">) {
  const password = randomBytes(24).toString("base64url");
  const user = await db.user.create({ data: { email: `${run}-${ownedUsers.length}@example.invalid`, displayName: "Synthetic Owner", emailVerifiedAt: new Date(), passwordHash: passwordHash(password) } });
  ownedUsers.push(user.id);
  const organizations = [];
  for (const [index, capability] of capabilities.entries()) {
    const org = await db.organization.create({ data: { bin: `93${String(Date.now()).slice(-8)}${index}${ownedUsers.length}`, legalName: `Synthetic ${capability}`, displayName: `Test ${capability}`, capabilities: { create: { capability } }, ...(capability === "SUPPLIER" ? { supplierProfile: { create: {} } } : {}) } });
    const permissions = ["organization.view", "organization.members.manage", "catalog.product.view", "document.view", "document.sign", "notification.view", ...(capability === "SUPPLIER" ? ["supplier.profile.manage", "supplier.warehouse.manage", "inventory.view", "order.confirm", "integration.view", "import.manage", "compliance.view"] : ["order.create"])];
    const role = await db.role.create({ data: { organizationId: org.id, code: "synthetic_owner", name: "Synthetic Owner", permissions: { create: permissions.map(code => ({ permission: { connect: { code } } })) } } });
    await db.organizationMembership.create({ data: { organizationId: org.id, userId: user.id, status: "ACTIVE", acceptedAt: new Date(), isPrimary: index === 0, roles: { create: { roleId: role.id } } } });
    if (capability === "BUYER") await completeFixtureOrganization(db, org.id);
    organizations.push(org);
  }
  return { user, password, organizations };
}

for (const width of [1280, 390]) test(`supplier onboarding and catalog return use its server session at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const owner = await account(["SUPPLIER"]);
  await page.goto(`${landing}/login`);
  await expect(page.getByRole("combobox", { name: "Организация и кабинет" })).toHaveCount(0);
  await page.getByLabel("Рабочий email").fill(owner.user.email);
  await page.getByLabel("Пароль").fill(owner.password);
  await page.getByRole("button", { name: "Войти по email" }).click();
  await page.waitForURL(url => url.origin === supplier && !url.hash);
  const onboarding = page.getByRole("region", { name: "Подключение поставщика" });
  await expect(onboarding).toBeVisible();
  const form = onboarding.getByRole("form", { name: "Анкета организации" });
  await form.getByLabel("Контактное лицо").fill("Synthetic Owner");
  await form.getByLabel("Контактный телефон").fill("+77000000000");
  await form.getByLabel("Email организации").fill(owner.user.email);
  for (const label of ["Юридический адрес", "Адрес доставки"]) {
    await form.getByLabel(`${label}: город`).selectOption({ index: 1 });
    await form.getByLabel(`${label}: улица, дом, помещение`).fill(`${label}, тестовый дом 1`);
  }
  await form.getByRole("button", { name: "Сохранить анкету и продолжить" }).click();
  await expect(onboarding.getByRole("button", { name: "Изменить анкету" })).toBeVisible();
  await onboarding.getByLabel("Город склада").selectOption({ index: 1 });
  await onboarding.getByLabel("Адрес склада").fill("Synthetic warehouse street 1");
  await onboarding.getByRole("button", { name: "Сохранить склад" }).focus(); await page.keyboard.press("Enter");
  await expect(onboarding.getByText("2 из 5 шагов завершено", { exact: true })).toBeVisible();
  await expect(onboarding.getByText("Утверждённые тексты ещё не опубликованы.", { exact: false })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`supplier-onboarding-${width}.png`) });
  await page.getByRole("link", { name: "Публичный каталог", exact: true }).click();
  await expect(page).toHaveURL(`${buyer}/catalog`);
  await expect(page.getByRole("link", { name: "Кабинет поставщика", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("dentmarket:buyer-session"))).toBeNull();
  await page.reload();
  await page.getByRole("link", { name: "Кабинет поставщика", exact: true }).click();
  await expect(onboarding.getByText("2 из 5 шагов завершено", { exact: true })).toBeVisible();
  const tab = await context.newPage();
  await tab.goto(supplier);
  await expect(tab.getByRole("region", { name: "Подключение поставщика" })).toBeVisible();
  await tab.goto(buyer);
  await tab.waitForURL(url => url.origin === supplier);
  await tab.close();
  expect(await db.warehouse.count({ where: { supplierOrganizationId: owner.organizations[0].id } })).toBe(1);
  expect(await db.cart.count({ where: { buyerOrganizationId: owner.organizations[0].id } })).toBe(0);
});

test("chooses only actual workspaces, retains documents and does not silently switch a revoked membership", async ({ page }) => {
  const owner = await account(["BUYER", "SUPPLIER", "MARKETPLACE_OPERATOR"]);
  await page.goto(`${landing}/login?returnTo=%2Fdocuments`);
  await page.getByLabel("Рабочий email").fill(owner.user.email);
  await page.getByLabel("Пароль").fill(owner.password);
  await page.getByRole("button", { name: "Войти по email" }).click();
  const selector = page.getByRole("combobox", { name: "Организация и кабинет" });
  await expect(selector.locator("option")).toHaveCount(2);
  await expect(selector).not.toContainText("MARKETPLACE_OPERATOR");
  await selector.selectOption({ label: "Test BUYER · Клиника" });
  await page.getByRole("button", { name: "Открыть выбранную организацию" }).click();
  await page.waitForURL(url => url.origin === buyer && url.pathname === "/documents" && !url.hash);
  await expect(page.getByRole("link", { name: "Войти", exact: true })).toHaveCount(0);
  await db.organizationMembership.updateMany({ where: { userId: owner.user.id, organizationId: owner.organizations[0].id }, data: { status: "REVOKED" } });
  await page.reload();
  await expect(page.getByRole("link", { name: "Войти", exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/documents");
  expect(await page.evaluate(() => sessionStorage.getItem("dentmarket:buyer-session"))).toBeNull();
});
