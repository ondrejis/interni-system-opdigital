import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
// Údaje demo uživatelů jsou sdílené se seedem (jediný zdroj pravdy; jde o testovací hodnoty, ne o tajemství).
import { DEMO_PASSWORD, DEMO_USERS, type DemoUserKey } from "../../../clients/demo/seed/users";

export type Role = DemoUserKey;
export const ROLES: readonly Role[] = [
  "owner",
  "office",
  "foreman1",
  "foreman2",
  "worker1",
  "worker2",
];

export const userOf = (role: Role) => {
  const u = DEMO_USERS.find((x) => x.key === role);
  if (!u) throw new Error(`Neznámá role ${role}`);
  return u;
};

/**
 * Cesta k uloženému stavu přihlášení (složka `.auth` je v .gitignore). Stav patří k jedné instanci (adresa a port),
 * jinak by se po přepnutí na jinou databázi použila relace, která v ní neexistuje.
 */
export const statePath = (
  role: Role,
  baseURL = process.env.CRAWL_BASE_URL ?? "http://localhost:3100",
) => `e2e-crawl/.auth/${new URL(baseURL).host.replace(/[^a-z0-9]+/gi, "_")}-${role}.json`;

/** Uložený stav se znovu použije jen když je čerstvý (relace v testovací databázi nesmí vypršet uprostřed běhu). */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

async function loginFresh(browser: Browser, role: Role, baseURL: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    baseURL,
    // `browser.newContext` dědí `storageState` projektu (přihlášený majitel); přihlášení musí začít čisté
    storageState: { cookies: [], origins: [] },
    // omezení pokusů o přihlášení je podle IP; každé přihlášení má vlastní „adresu“
    extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${1 + Math.floor(Math.random() * 250)}` },
  });
  const page = await ctx.newPage();
  const u = userOf(role);
  await page.goto("/prihlaseni");
  await page.getByLabel("E-mail").fill(u.email);
  await page.getByLabel("Heslo").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  // role jen pro terminál (montér) skončí rovnou na /t
  await expect(page).toHaveURL(/\/(t)?$/, { timeout: 30_000 });
  const path = statePath(role, baseURL);
  mkdirSync(dirname(path), { recursive: true });
  await ctx.storageState({ path });
  await page.close();
  return ctx;
}

/** Telefon (do 767 px) je dotykový „mobilní“ prohlížeč, tablet a víc je běžný prohlížeč v dané velikosti. */
const viewportOptions = (viewport: { width: number; height: number }) => ({
  viewport,
  hasTouch: viewport.width < 768,
  isMobile: viewport.width < 768,
});

/**
 * Vrátí kontext přihlášený jako demo uživatel dané role. Použije uložený `storageState`, když je čerstvý, jinak se
 * přihlásí znovu. Volající kontext zavírá (`await ctx.close()`).
 */
export async function loginAs(
  browser: Browser,
  role: Role,
  opts: {
    baseURL?: string;
    mobile?: boolean;
    viewport?: { width: number; height: number };
    /** Časové pásmo prohlížeče (např. „UTC“); server běží v Europe/Prague, text se nesmí lišit. */
    timezoneId?: string;
  } = {},
): Promise<BrowserContext> {
  const baseURL = opts.baseURL ?? process.env.CRAWL_BASE_URL ?? "http://localhost:3100";
  const path = statePath(role, baseURL);
  if (!existsSync(path) || Date.now() - statSync(path).mtimeMs > MAX_AGE_MS) {
    await (await loginFresh(browser, role, baseURL)).close();
  }
  return browser.newContext({
    baseURL,
    storageState: JSON.parse(readFileSync(path, "utf8")),
    ...(opts.timezoneId ? { timezoneId: opts.timezoneId } : {}),
    ...(opts.mobile || opts.viewport
      ? viewportOptions(opts.viewport ?? { width: 412, height: 915 })
      : {}),
  });
}

/** Zkratka: nová stránka přihlášená jako daná role. */
export async function pageAs(
  browser: Browser,
  role: Role,
  opts?: Parameters<typeof loginAs>[2],
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await loginAs(browser, role, opts);
  return { ctx, page: await ctx.newPage() };
}
