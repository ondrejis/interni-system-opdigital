import { defineConfig, devices } from "@playwright/test";

/**
 * Mobilní e2e (MOB): telefon 375×812 proti už běžícímu vývojovému serveru (výchozí port 3180, `MOBIL_URL` ho přepíše).
 * Spuštění: `pnpm test:e2e -c playwright.mobil.config.ts` (z `apps/web`, server `next dev -p 3180` musí běžet).
 */
const url = process.env.MOBIL_URL ?? "http://localhost:3180";
const phone = { ...devices["Pixel 5"], viewport: { width: 375, height: 812 } };
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  use: { baseURL: url, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.88" } },
  projects: [
    { name: "setup", testMatch: /mobil\.setup\.ts/, use: phone },
    {
      name: "mobile",
      testMatch: /mobil.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...phone, storageState: "e2e/.auth/mobil.json" },
    },
  ],
});
