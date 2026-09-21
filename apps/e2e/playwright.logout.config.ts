import { defineConfig, devices } from "@playwright/test";

// The caller owns the isolated API/web processes. Never auto-start the default
// demo database or reuse an unknown process for this security-sensitive flow.
export default defineConfig({
  testDir: "./tests",
  testMatch: "workspace-logout.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: { ...devices["Desktop Chrome"], trace: "off", screenshot: "off" },
});
