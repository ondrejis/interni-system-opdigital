import { defineConfig, devices } from "@playwright/test";

// Port 3101, ať se e2e nepere s vývojovým serverem na 3100.
const PORT = 3101;
const url = `http://localhost:${PORT}`;
const STATE = "e2e/.auth/user.json";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // na pomalejším CI runneru (1 vCPU) potřebují akce víc času
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: process.env.CI ? 10_000 : 5_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: url,
    trace: "on-first-retry",
    // Omezení počtu pokusů o přihlášení je podle IP; každé spuštění testů má vlastní „adresu“ (za Caddy ji nastavuje proxy).
    extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${1 + Math.floor(Math.random() * 250)}` },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: STATE },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: `${url}/prihlaseni`,
    env: {
      ...(process.env as Record<string, string>),
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      APP_URL: url,
      APP_ALLOW_HTTP: "1",
      // ukázková stránka komponent `/ui` (v ostrém provozu je vypnutá)
      UI_SHOWCASE: "1",
    },
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
