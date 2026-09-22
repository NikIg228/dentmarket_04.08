import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

export function localAuthConfig(env, root = process.cwd()) {
  if (env.NODE_ENV === "production") throw new Error("Local auth cannot configure production");
  if (env.AUTH_MODE && env.AUTH_MODE !== "jwt") throw new Error("Ordinary local login requires AUTH_MODE=jwt. Development identity headers belong only in isolated API test fixtures.");
  if (env.JWT_PUBLIC_KEY && !env.JWT_PRIVATE_KEY || env.JWT_PRIVATE_KEY && !env.JWT_PUBLIC_KEY) throw new Error("Both JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required for local login");
  let secret = env.JWT_SECRET;
  if (!secret && !env.JWT_PRIVATE_KEY) {
    const dir = path.join(root, ".tmp", "local-runtime");
    const file = path.join(dir, "jwt-secret");
    mkdirSync(dir, { recursive: true });
    if (!existsSync(file)) writeFileSync(file, randomBytes(48).toString("base64url"), { flag: "wx", mode: 0o600 });
    secret = readFileSync(file, "utf8").trim();
  }
  if (secret && secret.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters");
  return { AUTH_MODE: "jwt", ...(secret ? { JWT_SECRET: secret } : {}),
    JWT_ISSUER: env.JWT_ISSUER ?? "dentmarket-kz", JWT_AUDIENCE: env.JWT_AUDIENCE ?? "dentmarket-web",
    PUBLIC_DEMO_MODE: "false", AUTH_LOCAL_MAIL_ENABLED: env.AUTH_LOCAL_MAIL_ENABLED ?? "true" };
}
