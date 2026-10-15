import { defineConfig, devices } from "@playwright/test";

// Konfigurace e2e Kalendáře (KAL-B): proti běžícímu vývojovému serveru s fake-google na portu 3107, spuštěnému s
// NODE_OPTIONS="--import tsx --import apps/web/e2e/support/fake-google-preload.ts" (viz docs/moduly/kalendar.md).
process.env.KALENDAR_FAKE_GOOGLE = "1";
const url = "http://localhost:3107";
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  use: { baseURL: url, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.78" } },
  projects: [
    { name: "setup", testMatch: /kalendar\.setup\.ts/ },
    {
      name: "chromium",
      testMatch: /kalendar.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/kalendar.json" },
    },
  ],
});
