import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:43123",
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "off",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:43123/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
