import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
test.use({ hasTouch: true });

const apiUrl = process.env.E2E_LOGOUT_API_URL ?? "http://127.0.0.1:4012/api";
const apps = [
  { role: "BUYER", key: "dentmarket:buyer-session", url: process.env.E2E_BUYER_URL ?? "http://127.0.0.1:3001", account: "buyer-a" },
  { role: "SUPPLIER", key: "dentmarket:supplier-session", url: process.env.E2E_SUPPLIER_URL ?? "http://127.0.0.1:3002", account: "supplier-a" },
] as const;

async function pressLogout(page: Page, width: number) {
  if (width === 390) await page.getByRole("button", { name: "Открыть меню", exact: true }).tap();
  const button = page.getByRole("button", { name: "Выйти", exact: true });
  await expect(button).toBeVisible();
  if (width === 390) await button.tap();
  else { await button.focus(); await button.press("Enter"); }
}

async function loginDestination(page: Page) {
  // Only the destination screen is synthetic, not logout or server auth.
  await page.route("**/login", route => route.fulfill({ contentType: "text/html", body: "<h1>Login destination (test)</h1>" }));
}

for (const app of apps) for (const width of [1440, 390]) {
  test(`UI-only ${app.role} logout errors, pending, retry at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    // Browser-only fixtures: all API requests below are mocked. These tests
    // prove UI behavior, not authorization, persistence, or session revocation.
    await page.addInitScript(({ key, role }) => {
      sessionStorage.setItem(key, JSON.stringify({ sessionId: "ui-session", accessToken: "synthetic", accessTokenExpiresAt: Date.now() + 900000, organizationId: "00000000-0000-4000-8000-000000000020", capability: role }));
    }, app);
    await loginDestination(page);
    let calls = 0;
    let mode: "network" | "unauthorized" | "pending" = "network";
    let release: (() => void) | undefined;
    await page.route("**/api/**", async route => {
      if (route.request().url().endsWith("/auth/workspace-context")) return route.fulfill({ json: { organizationId: "00000000-0000-4000-8000-000000000020", organizationDisplayName: "Synthetic UI organization", capabilities: [app.role] } });
      if (route.request().url().endsWith("/supplier-terms/current")) return route.fulfill({ json: {
        organization: { id: "00000000-0000-4000-8000-000000000020", legalName: "Synthetic supplier", bin: "000000000000", version: 1, representativeName: "Test" },
        bundle: { hash: "0".repeat(64), available: false, documents: [] }, acceptance: null, contractAccepted: false, admitted: false, legacyAgreementActive: false,
      } });
      if (route.request().url().endsWith("/revoke")) {
        calls++;
        if (mode === "network") return route.abort("failed");
        if (mode === "unauthorized") return route.fulfill({ status: 401, json: { message: "internal-details-not-for-user" } });
        await new Promise<void>(resolve => { release = resolve; });
        return route.fulfill({ json: { id: "ui-session", status: "REVOKED" } });
      }
      return route.fulfill({ json: route.request().url().includes("summary") ? null : { items: [], nextCursor: null } });
    });
    await page.goto(`${app.url}/documents`);
    await page.evaluate(() => {
      const channel = new BroadcastChannel("dentmarket:session-revoked");
      channel.postMessage({ type: "revoked", sessionId: "another-session" });
      channel.close();
    });
    expect(await page.evaluate(key => sessionStorage.getItem(key), app.key)).not.toBeNull();
    await pressLogout(page, width);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Выход не подтверждён");
    expect(await page.evaluate(key => sessionStorage.getItem(key), app.key)).not.toBeNull();
    expect(calls).toBe(1);
    mode = "unauthorized";
    await page.getByRole("button", { name: "Повторить выход" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("доступ к сессии истёк или уже отозван");
    await expect(page.getByRole("main").getByRole("alert")).not.toContainText("internal-details");
    expect(await page.evaluate(key => sessionStorage.getItem(key), app.key)).not.toBeNull();
    mode = "pending";
    await page.getByRole("button", { name: "Повторить выход" }).dblclick();
    // Logout closes the mobile drawer so errors remain visible in main. Reopen
    // it normally before inspecting its pending control; no hidden/forced click.
    if (width === 390) await page.getByRole("button", { name: "Открыть меню", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Выходим…" })).toBeDisabled();
    expect(calls).toBe(3);
    // Capture only this synthetic failure/pending state, no session material.
    await page.screenshot({ path: test.info().outputPath(`${app.role}-${width}-pending.png`) });
    release?.();
    await expect(page).toHaveURL(/\/login$/);
    expect(calls).toBe(3);
  });
}

test.describe("real isolated JWT session logout", () => {
  test.skip(process.env.E2E_LOGOUT_LIVE !== "true", "Needs explicitly prepared isolated audit API and accounts");
  test.beforeAll(() => {
    const target = new URL(process.env.DATABASE_URL ?? "http://invalid");
    expect(target.hostname).toBe("127.0.0.1");
    expect(target.pathname).toBe("/dentmarket_audit_20260914");
    expect(new URL(apiUrl).hostname).toBe("127.0.0.1");
    expect(process.env.E2E_LOGOUT_PASSWORD).toBeTruthy();
  });

  for (const [index, app] of apps.entries()) {
    test(`${app.role}: real revoke, sibling tab, old access/refresh rejection`, async ({ page, playwright }) => {
      const client: APIRequestContext = await playwright.request.newContext();
      let session: { sessionId: string; accessToken: string; csrfToken: string } | undefined;
      try {
        const response = await client.post(`${apiUrl}/auth/login`, { data: { email: `audit-${app.account}@example.invalid`, password: process.env.E2E_LOGOUT_PASSWORD } });
        expect(response.status()).toBe(201);
        session = await response.json();
        if (!session) throw new Error("Missing session");
        const authorization = `Bearer ${session.accessToken}`;
        // Retain the established CSRF protection before using bearer revoke.
        expect((await client.post(`${apiUrl}/auth/logout`, { data: {} })).status()).toBe(401);
        const handoffResponse = await client.post(`${apiUrl}/auth/handoff`, { headers: { authorization }, data: { capability: app.role } });
        expect(handoffResponse.status()).toBe(201);
        const handoff = await handoffResponse.json();
        const width = index === 0 ? 1440 : 390;
        await page.setViewportSize({ width, height: 900 });
        await loginDestination(page);
        await page.goto(`${app.url}/documents#session=${encodeURIComponent(JSON.stringify({ organizationId: handoff.organizationId, capability: app.role, handoffCode: handoff.handoffCode }))}`);
        // Normal server handoff exchange must have completed; no DB tokens or injected identity.
        await expect.poll(() => page.evaluate(key => Boolean(JSON.parse(sessionStorage.getItem(key) ?? "null")?.accessToken), app.key)).toBe(true);
        const destination = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), app.key) as { accessToken: string; sessionId: string; csrfToken: string };
        const siblingPromise = page.waitForEvent("popup");
        await page.evaluate(() => { window.open("/documents", "_blank"); });
        const sibling = await siblingPromise;
        await loginDestination(sibling);
        await expect.poll(() => sibling.evaluate(key => Boolean(JSON.parse(sessionStorage.getItem(key) ?? "null")?.accessToken), app.key)).toBe(true);
        await expect(sibling.getByRole("button", { name: "Выйти", exact: true })).toBeAttached();
        await page.screenshot({ path: test.info().outputPath(`${app.role}-authenticated-documents.png`) });
        await pressLogout(page, width);
        await expect(page).toHaveURL(/\/login$/);
        await expect(sibling).toHaveURL(/\/login$/);
        // Return to same-origin synthetic blank to inspect storage without mounting
        // the app/demo fallback after logout. This is not a navigation acceptance.
        for (const tab of [page, sibling]) {
          await tab.route("**/logout-storage-check", route => route.fulfill({ body: "storage check", contentType: "text/html" }));
          await tab.goto(`${app.url}/logout-storage-check`);
          expect(await tab.evaluate(key => sessionStorage.getItem(key), app.key)).toBeNull();
        }
        const destinationAuthorization = `Bearer ${destination.accessToken}`;
        expect((await client.get(`${apiUrl}/auth/sessions`, { headers: { authorization: destinationAuthorization } })).status()).toBe(401);
        expect((await page.context().request.post(`${apiUrl}/auth/refresh`, { headers: { "x-csrf-token": destination.csrfToken }, data: { workspace: app.role, expectedSessionId: destination.sessionId } })).status()).toBe(401);
        expect((await client.post(`${apiUrl}/auth/sessions/${destination.sessionId}/revoke`, { headers: { authorization: destinationAuthorization }, data: { reason: "user_logout" } })).status()).toBe(401);
        expect((await client.get(`${apiUrl}/auth/sessions`, { headers: { authorization } })).status()).toBe(200);
        await sibling.close();
      } finally {
        // Scoped API cleanup only; never delete/reseed audit records. A revoked
        // token returns 401 here. Do not print cookies, bodies or access tokens.
        if (session) await client.post(`${apiUrl}/auth/logout`, { headers: { "x-csrf-token": session.csrfToken }, data: {} });
        await client.dispose();
      }
    });
  }
});
