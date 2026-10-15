import { expect, test, type Page } from "@playwright/test";
import { loginOwner } from "./login";

/*
  Žádná položka navigace nevrací 404 ani 500 ani chybu v konzoli (pro vlastníka i partnera). Adresy se čtou z vykreslené
  navigace (postranní panel, nabídka Nastavení), takže test sleduje to, co uživatel opravdu vidí. Přihlašovací údaje:
  CRAWL_EMAIL/CRAWL_PASSWORD (vlastník, přihlášený už projektem `setup`), CRAWL_PARTNER_EMAIL/CRAWL_PARTNER_PASSWORD
  (partner, nepovinné; nesmí mít zatím nastavené 2FA, např. čerstvá databáze po `pnpm dev:seed`).
*/

const BAD = /Stránka nenalezena|Něco se nepovedlo|Application error/;

async function hrefsOf(page: Page): Promise<string[]> {
  const found = new Set<string>();
  for (const start of ["/prehled", "/nastaveni"]) {
    await page.goto(start);
    await page.waitForLoadState("networkidle").catch(() => {});
    const links = await page
      .locator("nav a[href^='/'], aside a[href^='/']")
      .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""));
    for (const l of links) if (l && !l.startsWith("/api/")) found.add(l.split("#")[0]!);
  }
  return [...found];
}

const owner = [process.env.CRAWL_EMAIL, process.env.CRAWL_PASSWORD] as const;
const partner = [process.env.CRAWL_PARTNER_EMAIL, process.env.CRAWL_PARTNER_PASSWORD] as const;

/** Projde navigaci přihlášené stránky; `login` = přihlásit se tady (partner), jinak je relace z projektu `setup`. */
async function crawlNavigation(page: Page, creds: readonly (string | undefined)[], login: boolean) {
  const [email, password] = creds;
  test.skip(!email || !password, "chybí přihlašovací údaje");
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`výjimka: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
  });
  if (login) await loginOwner(page, email!, password!);
  const hrefs = await hrefsOf(page);
  expect(hrefs.length, "navigace je prázdná").toBeGreaterThan(5);
  const problems: string[] = [];
  for (const href of hrefs) {
    errors.length = 0;
    const resp = await page.goto(href);
    await page.waitForLoadState("networkidle").catch(() => {});
    const text = (await page.locator("body").innerText()).slice(0, 2000);
    if ((resp?.status() ?? 0) >= 400 || BAD.test(text) || errors.length)
      problems.push(`${href}: ${resp?.status()} ${BAD.exec(text)?.[0] ?? ""} ${errors.join("; ")}`);
  }
  expect(problems).toEqual([]);
}

test("navigace (vlastník): žádná stránka nevrací 404 ani chybu", async ({ page }) => {
  await crawlNavigation(page, owner, false);
});

test.describe("partner", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("navigace (partner): žádná stránka nevrací 404 ani chybu", async ({ page }) => {
    await crawlNavigation(page, partner, true);
  });
});
