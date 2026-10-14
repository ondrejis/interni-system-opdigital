import { defineConfig, devices } from "@playwright/test";

/**
 * „Procházecí“ testy: projdou obrazovky a akce proti už běžícímu serveru (výchozí vývojový na 3100 s vývojovou databází)
 * a selžou na jakékoli chybě v konzoli, výjimce stránky nebo odpovědi 5xx. Nespouštějí vlastní build, takže se nepletou
 * do běhu `pnpm test:e2e:local`. Přihlášení: `CRAWL_EMAIL`/`CRAWL_PASSWORD` (výchozí `OWNER_EMAIL`/`OWNER_PASSWORD`
 * z `.env.local`). Adresa: `CRAWL_BASE_URL`. Spuštění: `pnpm test:crawl [soubor]`.
 */
const base = process.env.CRAWL_BASE_URL ?? "http://localhost:3100";
const STATE = "e2e-crawl/.auth/owner.json";

export default defineConfig({
  testDir: "./e2e-crawl",
  // vlastní složka výstupů, ať se procházecí testy nepletou do souběžného běhu e2e (společné `test-results`)
  outputDir: process.env.CRAWL_OUTPUT_DIR ?? "test-results-crawl",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: base,
    // bez limitu by chybný lokátor držel test až do jeho celkového časového limitu a skryl skutečné místo selhání
    actionTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // omezení pokusů o přihlášení je podle IP; každé spuštění má vlastní „adresu“
    extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${1 + Math.floor(Math.random() * 250)}` },
  },
  projects: [
    { name: "setup", testMatch: /login\.setup\.ts/ },
    {
      name: "desktop",
      testIgnore: [/login\.setup\.ts/, /\.mobile\.spec\.ts/],
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: STATE },
    },
    {
      name: "mobile",
      testMatch: /\.mobile\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], storageState: STATE },
    },
  ],
});
