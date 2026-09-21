import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import type { MarketplaceEnvironment } from "../../platform/config/environment";
import { authMailMode, deliverAuthMail } from "./auth-mail.delivery";
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn(), writeFile: vi.fn() }));
const config = { NODE_ENV: "test", API_HOST: "127.0.0.1", AUTH_LOCAL_MAIL_ENABLED: true } as MarketplaceEnvironment;
const message = { to: "synthetic@example.invalid", subject: "Test", text: "Synthetic one-time link" };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(mkdir).mockResolvedValue(undefined); vi.mocked(writeFile).mockResolvedValue(undefined); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => vi.unstubAllGlobals());
it("writes private local JSON without external delivery or returning its path", async () => {
  expect(await deliverAuthMail(config, message)).toBe("LOCAL_FILE");
  expect(mkdir).toHaveBeenCalledWith(expect.stringMatching(/[\\/]\.tmp[\\/]auth-mail$/), { recursive: true, mode: 0o700 });
  const [file, data, options] = vi.mocked(writeFile).mock.calls[0]!;
  expect(String(file)).toMatch(/[\\/][a-f0-9-]{36}\.json$/);
  expect(JSON.parse(String(data))).toMatchObject({ ...message, externalDelivery: false, delivery: "LOCAL_FILE" });
  expect(options).toEqual({ flag: "wx", mode: 0o600 });
  expect(fetch).not.toHaveBeenCalled();
});
it.each([{ NODE_ENV: "production" }, { API_HOST: "0.0.0.0" }])("rejects unsafe local runtime %j", async override => {
  await expect(deliverAuthMail({ ...config, ...override } as MarketplaceEnvironment, message)).rejects.toThrow("запрещена");
  expect(writeFile).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it("fails closed when unconfigured", async () => {
  const disabled = { ...config, AUTH_LOCAL_MAIL_ENABLED: false };
  expect(authMailMode(disabled)).toBe("UNAVAILABLE");
  await expect(deliverAuthMail(disabled, message)).rejects.toThrow("не настроена");
  expect(writeFile).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it("redacts filesystem errors", async () => {
  vi.mocked(writeFile).mockRejectedValue(new Error("private-path-and-token"));
  await expect(deliverAuthMail(config, message)).rejects.toThrow("Не удалось передать письмо");
});
it("preserves provider contract, timeout and no redirects", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ ok: true }));
  expect(await deliverAuthMail({ ...config, AUTH_LOCAL_MAIL_ENABLED: false, EMAIL_PROVIDER_URL: "https://mail.example.invalid/send", EMAIL_PROVIDER_TOKEN: "synthetic" }, message)).toBe("PROVIDER");
  expect(fetch).toHaveBeenCalledWith("https://mail.example.invalid/send", expect.objectContaining({ method: "POST", redirect: "error", signal: expect.any(AbortSignal), body: JSON.stringify(message) }));
  expect(writeFile).not.toHaveBeenCalled();
});
it("does not return provider error bodies", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("private provider body", { status: 500 }));
  await expect(deliverAuthMail({ ...config, AUTH_LOCAL_MAIL_ENABLED: false, EMAIL_PROVIDER_URL: "https://mail.example.invalid/send", EMAIL_PROVIDER_TOKEN: "synthetic" }, message)).rejects.toThrow("Не удалось передать письмо");
});
