import { ServiceUnavailableException } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { MarketplaceEnvironment } from "../../platform/config/environment";

export function authMailMode(config: MarketplaceEnvironment): "LOCAL_FILE" | "PROVIDER" | "UNAVAILABLE" {
  if (config.AUTH_LOCAL_MAIL_ENABLED) {
    if (config.NODE_ENV === "production" || !["127.0.0.1", "::1", "localhost"].includes(config.API_HOST)) throw new ServiceUnavailableException("Локальная доставка запрещена в этом окружении");
    return "LOCAL_FILE";
  }
  return config.EMAIL_PROVIDER_URL && config.EMAIL_PROVIDER_TOKEN ? "PROVIDER" : "UNAVAILABLE";
}
export function requireAuthMail(config: MarketplaceEnvironment) {
  const mode = authMailMode(config);
  if (mode === "UNAVAILABLE") throw new ServiceUnavailableException("Доставка писем не настроена. Обратитесь к оператору и повторите попытку после настройки.");
  return mode;
}
export async function deliverAuthMail(config: MarketplaceEnvironment, message: { to: string; subject: string; text: string }) {
  const mode = requireAuthMail(config);
  try {
    if (mode === "LOCAL_FILE") {
      // Never public/object storage. No mail content, token, address or path in API/log output.
      const directory = resolve(".tmp/auth-mail");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(resolve(directory, `${randomUUID()}.json`), JSON.stringify({ ...message, delivery: "LOCAL_FILE", externalDelivery: false, createdAt: new Date().toISOString() }, null, 2), { flag: "wx", mode: 0o600 });
    } else {
      const response = await fetch(config.EMAIL_PROVIDER_URL!, { method: "POST", redirect: "error", headers: { "content-type": "application/json", authorization: `Bearer ${config.EMAIL_PROVIDER_TOKEN}` }, body: JSON.stringify(message), signal: AbortSignal.timeout(2_000) });
      await response.body?.cancel();
      if (!response.ok) throw new Error("Delivery rejected");
    }
    return mode;
  } catch { throw new ServiceUnavailableException("Не удалось передать письмо. Повторите попытку позднее или обратитесь к оператору."); }
}
