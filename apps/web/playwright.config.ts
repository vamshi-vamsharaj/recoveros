import { defineConfig, devices } from "@playwright/test";

/**
 * Milestone 6 acceptance test config.
 *
 * This expects the API (apps/api, default http://localhost:4000) and
 * a seeded database to already be running -- it does not start or
 * seed the API itself, since that requires Postgres/Redis and this
 * config has no way to know how you run those locally. It does start
 * the Next.js dev server for apps/web via webServer below.
 *
 * See apps/web/tests/e2e/README.md for exact setup steps.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
