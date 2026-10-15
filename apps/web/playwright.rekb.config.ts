import { defineConfig, devices } from "@playwright/test";

// Dočasná konfigurace REK-B: e2e proti už běžícímu vývojovému serveru (port 3117), bez buildu.
const url = "http://localhost:3117";
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  use: { baseURL: url, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.77" } },
  projects: [
    { name: "setup", testMatch: /rekb\.setup\.ts/ },
    {
      name: "chromium",
      testMatch: /reklama-debug\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
    },
  ],
});
