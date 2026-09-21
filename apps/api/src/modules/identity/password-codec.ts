import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Shared with normal email login; existing hashes and the algorithm are unchanged.
export const passwordHash = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
};
export const passwordMatches = (password: string, encoded: string | null) => {
  if (!encoded?.startsWith("scrypt$")) return false;
  const [, salt, expected] = encoded.split("$");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
