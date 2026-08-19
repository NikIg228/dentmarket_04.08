import { defineConfig } from "@playwright/test";

const workspace = "../..";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";

export default defineConfig({
  testDir: "./tests",
  testMatch: "flow-b3.spec.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm --filter @marketplace/api start",
    cwd: workspace,
    url: "http://127.0.0.1:4012/api/health",
    env: {
      DATABASE_URL: databaseUrl,
      API_HOST: "127.0.0.1",
      API_PORT: "4012",
      AUTH_MODE: "development",
      DEPLOYMENT_PROFILE: "pilot",
      PROCESS_ROLE: "all",
      BACKGROUND_QUEUE_ENABLED: "false",
      OBJECT_STORAGE_DRIVER: "local",
      AV_SCAN_MODE: "disabled",
    },
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
