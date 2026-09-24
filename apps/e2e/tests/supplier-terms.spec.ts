import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

test.skip(process.env.E2E_SUPPLIER_TERMS !== "true", "Explicit isolated audit fixture required");
let child: ChildProcess; let counter = 0;
const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
function fixture<T>(type: string, data: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => { const id = ++counter; const timer = setTimeout(() => { waiting.delete(id); reject(new Error("Terms fixture timeout")); }, 45_000);
    waiting.set(id, { resolve: value => { clearTimeout(timer); resolve(value as T); }, reject: error => { clearTimeout(timer); reject(error); } }); child.send?.({ id, type, ...data }); });
}
test.beforeAll(async () => {
  child = spawn(process.execPath, [path.resolve("../../scripts/verify-supplier-terms-fixture.mjs")], { windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let diagnostic = ""; child.stderr?.on("data", data => { diagnostic = (diagnostic + String(data)).slice(-2500); });
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Terms fixture readiness timeout")), 90_000);
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Fixture exited ${code}: ${diagnostic.replace(/postgres(?:ql)?:\/\/\S+/g, "[DB]")}`)); });
    child.on("message", (message: { type?: string; id?: number; value?: unknown; error?: string }) => { if (message.type === "ready") { clearTimeout(timer); resolve(); } else if (message.id) { const task = waiting.get(message.id); waiting.delete(message.id); if (message.error) task?.reject(new Error(message.error)); else task?.resolve(message.value); } });
  });
});
test.afterAll(async () => { if (!child || child.exitCode !== null) return; const exited = new Promise(resolve => child.once("exit", resolve)); if (child.connected) child.disconnect(); await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 15_000))]); if (child.exitCode === null) child.kill(); });

type Setup = { organizationId: string; name: string; session: object };
async function openSupplier(page: Page, key: string) {
  const setup = await fixture<Setup>("setup", { key });
  await page.goto(`http://127.0.0.1:3102/documents#session=${encodeURIComponent(JSON.stringify(setup.session))}`);
  await expect(page.getByRole("heading", { name: "Договор с площадкой", exact: true })).toBeVisible();
  return setup;
}
async function readAll(page: Page) {
  const nav = page.getByRole("navigation", { name: "Документы для ознакомления" });
  for (let index = 0; index < 4; index++) {
    await nav.getByRole("button").nth(index).click();
    const reader = page.getByRole("region", { name: /^Текст:/ });
    await reader.scrollIntoViewIfNeeded(); await reader.focus(); await page.keyboard.press("Control+Home");
    const height = await reader.evaluate(element => element.scrollHeight);
    const viewport = await reader.evaluate(element => element.clientHeight);
    for (let cursor = 0; cursor < height + viewport; cursor += Math.floor(viewport / 2)) { await page.keyboard.press("ArrowDown"); await reader.evaluate((element, position) => { element.scrollTop = position; }, cursor); await page.waitForTimeout(35); }
    await expect(nav.getByRole("button").nth(index)).toContainText("просмотрено");
  }
}

test("real JWT API: immutable evidence, idempotence, tenant isolation and independent admission", async () => {
  expect(await fixture("api-tests")).toMatchObject({ passed: true, authenticated: true, atomicEvidence: true, independentAdmission: true, tenantIsolation: true, immutableDownload: true });
});
test("blank legal pages cannot be accepted", async ({ page }) => {
  await fixture("documents", { draft: true }); await openSupplier(page, "draft");
  await expect(page.getByText("Документы готовятся", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ознакомлен", exact: true })).toBeDisabled();
  await page.goto("http://127.0.0.1:3102/legal/seller-agreement");
  await expect(page.getByRole("heading", { name: "Договор с продавцом" })).toBeVisible();
  await expect(page.getByText("Текст пока не опубликован.")).toBeVisible();
  await fixture("documents", { draft: false });
});
for (const mobile of [false, true]) test(`all documents and authority required before acceptance (${mobile ? "mobile" : "desktop"})`, async ({ page }) => {
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  const key = mobile ? "mobile" : "desktop"; await openSupplier(page, key);
  const button = page.getByRole("button", { name: "Ознакомлен", exact: true });
  await page.getByLabel("Основание полномочий", { exact: true }).fill("Руководитель на основании устава");
  await page.getByRole("checkbox", { name: /Принимаю договор/ }).check(); await expect(button).toBeDisabled();
  const reader = page.getByRole("region", { name: /^Текст:/ }); await reader.scrollIntoViewIfNeeded(); await reader.focus(); await page.keyboard.press("End");
  await expect(button).toBeDisabled(); await expect(page.getByRole("navigation", { name: "Документы для ознакомления" }).getByRole("button").first()).not.toContainText("просмотрено");
  await readAll(page); await expect(button).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`${key}-reviewed.png`), fullPage: true });
  const response = page.waitForResponse(value => value.url().endsWith("/supplier-terms/acceptances") && value.request().method() === "POST");
  await button.focus(); await page.keyboard.press("Enter"); expect((await response).status()).toBe(201);
  await expect(page.getByText("Договор принят", { exact: true })).toBeVisible();
  await expect(page.getByText("Поставщик не допущен к работе", { exact: true })).toBeVisible();
  const records = await fixture<Array<{ admissionStatus: string }>>("readback", { key }); expect(records).toHaveLength(1); expect(records[0]?.admissionStatus).toBe("PENDING");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Скачать принятые условия" }).click(); expect((await download).suggestedFilename()).toMatch(/\.txt$/);
});
test("operator verifies both organization and representative before admission", async ({ page }) => {
  const seller = await fixture<Setup>("setup", { key: "operator-review" });
  await fixture("accept", { key: "operator-review" });
  const operator = await fixture<Setup>("setup", { key: "operator", operator: true });
  await page.goto(`http://127.0.0.1:3100/#session=${encodeURIComponent(JSON.stringify(operator.session))}`);
  await page.getByRole("button", { name: "Открыть очередь", exact: true }).click();
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: new RegExp(seller.name) }) });
  await card.getByRole("button", { name: "Проверить поставщика" }).click();
  await expect(card.getByText("Юридический адрес", { exact: true })).toBeVisible();
  await expect(card.getByText("Адрес доставки", { exact: true })).toBeVisible();
  await card.getByLabel("Основание решения", { exact: true }).fill("Тест: организация и полномочия проверены");
  const approve = card.getByRole("button", { name: "Допустить к работе" }); await expect(approve).toBeDisabled();
  await card.getByLabel("Организация и реквизиты проверены", { exact: true }).check(); await expect(approve).toBeDisabled();
  await card.getByLabel("Полномочия представителя проверены", { exact: true }).check(); await expect(approve).toBeEnabled();
  await approve.click(); await expect(card.getByText("Поставщик допущен к работе", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("operator-approved.png"), fullPage: true });
  await openSupplier(page, "operator-review"); await expect(page.getByText("Поставщик допущен к работе", { exact: true })).toBeVisible();
});
