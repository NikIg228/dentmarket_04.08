import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
test.skip(process.env.E2E_WORKSPACE_LIVE !== "true", "Requires isolated audit DB and production artifacts");
type Account = { email: string; password: string; organizationId: string };
let child: ChildProcess, apiUrl: string, counter = 0;
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
function fixture<T>(type: string, input: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++counter, timer = setTimeout(() => { pending.delete(id); reject(new Error("Private fixture timeout")); }, 15000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value as T); }, reject: error => { clearTimeout(timer); reject(error); } });
    child.send({ id, type, ...input });
  });
}
test.beforeAll(async () => {
  child = spawn(process.execPath, [path.resolve("../../scripts/verify-workspace-context.mjs"), "--serve"], { windowsHide: true, stdio: ["ignore","ignore","ignore","ipc"] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Workspace fixture startup timeout")), 75000);
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Owned fixture exited ${code}`)); });
    child.on("message", (message: { type?: string; apiUrl?: string; id?: number; value?: unknown; error?: string }) => {
      if (message.type === "startup-diagnostics") { console.error(JSON.stringify(message.value)); return; }
      if (message.type === "ready") { apiUrl = message.apiUrl!; clearTimeout(timer); resolve(); return; }
      if (message.id) { const response = pending.get(message.id); pending.delete(message.id); if (message.error) response?.reject(new Error(message.error)); else response?.resolve(message.value); }
    });
  });
});
test.afterAll(async () => {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>(resolve => { const timer = setTimeout(resolve, 15000); child.once("exit", () => { clearTimeout(timer); resolve(); }); if (child.connected) child.disconnect(); });
  if (child.exitCode === null) child.kill();
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed()) await page.screenshot({ path: info.outputPath("failure-masked.png"), mask: [page.locator("input")] }).catch(() => undefined);
  if (!page.isClosed()) await page.goto("about:blank");
});
for (const [index, capability] of (["BUYER", "SUPPLIER"] as const).entries()) {
  test(`normal ${capability} password login reaches the real workspace and consumes one handoff`, async ({ page, request }) => {
    const account = await fixture<Account>("account", { index: 41 + index, capability });
    const before = await fixture<{ sessions: number; consumedHandoffs: number }>("readback", { email: account.email });
    await page.setViewportSize({ width: index ? 390 : 1440, height: index ? 844 : 900 });
    const apiPaths: string[] = [];
    page.on("request", req => { if (req.url().startsWith(apiUrl)) apiPaths.push(new URL(req.url()).pathname); });
    await page.goto("http://127.0.0.1:3103/login");
    if (capability === "SUPPLIER") await page.getByRole("button", { name: /Поставщик/ }).tap();
    await page.getByLabel("Рабочий email").fill(account.email);
    await page.getByLabel("Пароль", { exact: false }).fill(account.password);
    const handoffResponse = page.waitForResponse(response => response.url() === `${apiUrl}/auth/handoff` && response.request().method() === "POST");
    const exchangeRequest = page.waitForRequest(req => req.url() === `${apiUrl}/auth/handoff/exchange` && req.method() === "POST");
    const exchangeResponse = page.waitForResponse(response => response.url() === `${apiUrl}/auth/handoff/exchange` && response.request().method() === "POST");
    await page.getByRole("button", { name: "Войти по email", exact: true }).focus(); await page.keyboard.press("Enter");
    const issued = await handoffResponse; expect(issued.status()).toBe(201);
    // Cross-origin navigation can discard the issuing response body in Chromium.
    // Observe the actual recipient's request instead; do not pause or fake navigation.
    const { handoffCode } = (await exchangeRequest).postDataJSON();
    expect((await exchangeResponse).status()).toBe(201);
    const port = index ? 3102 : 3101, sessionKey = index ? "dentmarket:supplier-session" : "dentmarket:buyer-session";
    await page.waitForURL(url => url.origin === `http://127.0.0.1:${port}` && url.hash === "");
    const safeSession = await page.evaluate(key => { const item = JSON.parse(sessionStorage.getItem(key) ?? "null"); return item ? { organizationId: item.organizationId, capability: item.capability, hasAccessToken: Boolean(item.accessToken) } : null; }, sessionKey);
    expect(safeSession).toEqual({ organizationId: account.organizationId, capability, hasAccessToken: true });
    await expect(page.getByRole("main")).toBeVisible();
    const after = await fixture<{ sessions: number; consumedHandoffs: number }>("readback", { email: account.email });
    expect(after).toEqual({ sessions: before.sessions + 2, consumedHandoffs: before.consumedHandoffs + 1 });
    expect((await request.post(`${apiUrl}/auth/handoff/exchange`, { data: { handoffCode } })).status()).toBe(401);
    expect(apiPaths).toContain("/api/auth/workspace-context");
    expect(apiPaths.some(value => /^\/api\/organizations\/[0-9a-f-]+$/.test(value))).toBe(false);
    await test.info().attach("safe-handoff-readback", { body: JSON.stringify({ ...safeSession, ...after, replayStatus: 401 }), contentType: "application/json" });
    await page.screenshot({ path: test.info().outputPath(`${capability.toLowerCase()}-authenticated-${index ? 390 : 1440}.png`) });
  });
}
test("disabled membership never redirects or issues a handoff", async ({ page }) => {
  const account = await fixture<Account>("account", { index: 43, capability: "BUYER" });
  await fixture("block-membership", { email: account.email });
  const before = await fixture("readback", { email: account.email });
  let handoffRequested = false;
  page.on("request", req => { if (req.url() === `${apiUrl}/auth/handoff`) handoffRequested = true; });
  await page.goto("http://127.0.0.1:3103/login");
  await page.getByLabel("Рабочий email").fill(account.email); await page.getByLabel("Пароль", { exact: false }).fill(account.password);
  await page.getByRole("button", { name: "Войти по email", exact: true }).click();
  const membershipAlert = page.getByRole("alert").filter({ hasText: "нет активной организации" });
  await expect(membershipAlert).toContainText("нет активной организации");
  expect(new URL(page.url()).pathname).toBe("/login"); expect(handoffRequested).toBe(false);
  const after = await fixture<{ consumedHandoffs: number }>("readback", { email: account.email });
  expect(after.consumedHandoffs).toBe((before as { consumedHandoffs: number }).consumedHandoffs);
  await test.info().attach("disabled-membership-readback", { body: JSON.stringify({ path: new URL(page.url()).pathname, handoffRequested, before, after }), contentType: "application/json" });
  await membershipAlert.screenshot({ path: test.info().outputPath("disabled-membership-alert.png") });
});
