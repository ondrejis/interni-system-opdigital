import { expect, type Locator, type Page } from "@playwright/test";

/** Chyby, které nejsou chybou aplikace (zrušená navigace, chybějící favicon z vývojového serveru…). */
const IGNORE: RegExp[] = [
  /net::ERR_ABORTED/,
  /favicon/i,
  /Download the React DevTools/,
  /\[Fast Refresh\]/,
  /Failed to load resource: the server responded with a status of 404 \(Not Found\)\s*$/, // doplňte jen s důvodem
];

export type Collected = { errors: string[]; ignore: (re: RegExp) => void };

/**
 * Sbírá chyby stránky: `console.error`, nezachycené výjimky, odpovědi 5xx a neúspěšné požadavky na naši adresu.
 * Po každém kroku zavolejte `expectClean(c)`.
 */
export function collectErrors(page: Page): Collected {
  const errors: string[] = [];
  const ignores = [...IGNORE];
  const push = (m: string) => {
    if (!ignores.some((re) => re.test(m))) errors.push(m);
  };
  page.on("console", (msg) => {
    if (msg.type() === "error") push(`console: ${msg.text()} (${msg.location().url})`);
  });
  page.on("pageerror", (e) => push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => {
    const origin = new URL(page.url() === "about:blank" ? "http://localhost" : page.url()).origin;
    if (r.url().startsWith(origin))
      push(`requestfailed ${r.failure()?.errorText ?? ""} ${r.url()}`);
  });
  return { errors, ignore: (re) => void ignores.push(re) };
}

export const expectClean = (c: Collected, label = "") =>
  expect(c.errors, `chyby při: ${label}`).toEqual([]);

/** Otevře adresu, počká na dokončení načítání a ověří, že stránka není chybová ani 404. */
export async function visit(page: Page, path: string, c: Collected) {
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(res?.status(), `${path} → HTTP`).toBeLessThan(500);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await expect(page.getByText("Něco se nepovedlo")).toHaveCount(0);
  await expect(page.getByText("Stránka nenalezena")).toHaveCount(0);
  // vývojový overlay Next.js s chybou sestavení nebo běhu
  await expect(
    page.locator("nextjs-portal").getByText(/Build Error|Runtime Error|Unhandled Runtime Error/),
  ).toHaveCount(0);
  expectClean(c, path);
}

/**
 * Klik na položku podnabídky (Zobrazení → Sloupce, Řazení, Export). Radix podnabídku zavře, když ukazatel od jejího
 * spouštěče skočí rovnou na položku, nebo když zabloudí přes sousední spouštěče (Playwright posouvá myš po přímce), takže
 * se myš vede jako rukou: nejdřív vodorovně do horního okraje podnabídky, pak svisle k položce. Dlouhý seznam se přitom
 * posune tak, aby položka byla vidět.
 */
export async function clickSubmenuItem(page: Page, item: Locator) {
  const menu = (await item.locator('xpath=ancestor::*[@role="menu"][1]').boundingBox())!;
  await page.mouse.move(menu.x + menu.width / 2, menu.y + 12, { steps: 12 });
  await item.scrollIntoViewIfNeeded();
  const box = (await item.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await item.click();
}
