import { defineConfig, devices } from "@playwright/test";

const workspace = "../..";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
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
      },
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @marketplace/admin-web exec next start --port 3010",
      cwd: workspace,
      url: "http://127.0.0.1:3010",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @marketplace/buyer-web start",
      cwd: workspace,
      url: "http://127.0.0.1:3001",
      env: { NEXT_PUBLIC_API_URL: apiUrl },
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @marketplace/supplier-web start",
      cwd: workspace,
      url: "http://127.0.0.1:3002",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @marketplace/landing-web start",
      cwd: workspace,
      url: "http://127.0.0.1:3003",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
