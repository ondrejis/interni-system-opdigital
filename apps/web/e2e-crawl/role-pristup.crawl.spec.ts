import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs, type Role } from "./roles";

/**
 * Role a oprávnění: každá role projde navigaci a detaily bez chyby; mistr a montér nevidí ceny, fakturaci
 * ani cizí zakázky (adresy, hledání, upozornění). Seznamy záznamů se berou z živé aplikace, takže test nezávisí
 * na konkrétním demo záznamu.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MONEY = /\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?\s*(?:Kč|CZK|EUR|€)/i;
/** Mistři používají kancelářské rozhraní; montéři (role jen pro terminál) mají terminál `/t` (viz terminal-*.crawl.spec.ts). */
const FIELD_ROLES: Role[] = ["foreman1", "foreman2"];
const TERMINAL_ROLES: Role[] = ["worker1", "worker2"];
const ALL_ROLES: Role[] = ["owner", "office", ...FIELD_ROLES];

/** Neexistující adresa nebo adresa bez oprávnění: srozumitelná stránka, ne chyba. */
async function expectNotFound(page: Page, label: string) {
  // buď celá stránka „nenalezena“ (adresa), nebo hláška v detailu záznamu (neexistující či cizí záznam)
  await expect(
    page
      .getByRole("heading", { name: "Stránka nenalezena" })
      .or(page.getByText("Záznam nenalezen")),
    label,
  ).toBeVisible();
  await expect(page.getByText("Něco se nepovedlo")).toHaveCount(0);
}

async function hrefs(page: Page, re: RegExp): Promise<string[]> {
  const all = await page.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")!));
  return [...new Set(all.filter((h) => re.test(h)))];
}

async function navLinks(page: Page): Promise<string[]> {
  await page.goto("/", { waitUntil: "networkidle" });
  const all = await page.$$eval("nav a[href^='/'], aside a[href^='/']", (as) =>
    as.map((a) => a.getAttribute("href")!),
  );
  return [...new Set(all.filter((h) => !h.includes("?")))];
}

for (const role of ALL_ROLES) {
  test(`${role}: navigace a detaily se otevřou bez chyby`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await pageAs(browser, role);
    const c = collectErrors(page);
    const links = await navLinks(page);
    expect(links.length, "navigace není prázdná").toBeGreaterThan(3);
    for (const l of links) {
      await visit(page, l, c);
      // první dva detaily ze seznamu
      for (const d of (await hrefs(page, new RegExp(`^${l}/${UUID}$`))).slice(0, 2)) {
        await visit(page, d, c);
        // jen lišta záložek záznamu: záložky uvnitř Přehledu (psací panel Aktivita / Poznámka / Hovor) po přepnutí zmizí
        for (const tab of await page.getByRole("tablist").first().getByRole("tab").all()) {
          await tab.click();
          await page.waitForLoadState("networkidle").catch(() => undefined);
          await expect(page.getByText("Něco se nepovedlo")).toHaveCount(0);
        }
        expectClean(c, `${d} záložky`);
      }
    }
    await ctx.close();
  });
}

for (const role of FIELD_ROLES) {
  test(`${role}: skryté stránky nejsou v navigaci a přímý odkaz je „nenalezeno“`, async ({
    browser,
  }) => {
    const { ctx, page } = await pageAs(browser, role);
    const c = collectErrors(page);
    const nav = await navLinks(page);
    for (const hidden of ["/fakturace", "/poptavky", "/kontakty/firmy"]) {
      if (role.startsWith("worker")) expect(nav, `${hidden} v navigaci`).not.toContain(hidden);
    }
    expect(nav).not.toContain("/fakturace");
    expect(nav).not.toContain("/poptavky");
    const forbidden = [
      "/fakturace",
      "/fakturace/prijate",
      "/poptavky",
      "/poptavky/prijem",
      "/nastaveni/firma",
      "/nastaveni/uzivatele",
      "/nastaveni/role",
      "/zakazky/00000000-0000-4000-8000-000000000000",
      "/fakturace/00000000-0000-4000-8000-000000000000",
      "/zakazky/neexistuje",
    ];
    for (const p of forbidden) {
      await page.goto(p, { waitUntil: "domcontentloaded" });
      await expectNotFound(page, p);
    }
    expectClean(c, "zakázané adresy");
    await ctx.close();
  });
}

test("mistr vidí jen své zakázky: cizí zakázku druhého mistra otevřít nejde", async ({
  browser,
}) => {
  const f1 = await pageAs(browser, "foreman1");
  const f2 = await pageAs(browser, "foreman2");
  const owner = await pageAs(browser, "owner");
  const c = collectErrors(f1.page);
  const jobsOf = async (p: Page) => {
    await p.goto("/zakazky", { waitUntil: "networkidle" });
    return hrefs(p, new RegExp(`^/zakazky/${UUID}$`));
  };
  const mine1 = await jobsOf(f1.page);
  const mine2 = await jobsOf(f2.page);
  const all = await jobsOf(owner.page);
  expect(mine1.length).toBeGreaterThan(0);
  expect(mine2.length).toBeGreaterThan(0);
  expect(all.length).toBeGreaterThan(mine1.length);
  expect(mine1.filter((j) => mine2.includes(j))).toEqual([]);
  for (const foreign of mine2.slice(0, 3)) {
    await f1.page.goto(foreign, { waitUntil: "domcontentloaded" });
    await expectNotFound(f1.page, foreign);
    // ani záložky s ekonomikou či deníkem cizí zakázky
    await f1.page.goto(`${foreign}?tab=fakturace`, { waitUntil: "domcontentloaded" });
    await expectNotFound(f1.page, foreign);
  }
  expectClean(c, "cizí zakázky");
  await Promise.all([f1.ctx.close(), f2.ctx.close(), owner.ctx.close()]);
});

for (const role of [...FIELD_ROLES, ...TERMINAL_ROLES]) {
  test(`${role}: nikde nevidí částky (stránky, upozornění, hledání, odpovědi serveru)`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await pageAs(browser, role);
    const c = collectErrors(page);
    const leaks: string[] = [];
    // v odpovědích serveru (stránky i volání akcí) nesmí být nenulová částka v haléřích
    const MINOR_KEY =
      /"([A-Za-z]*(?:price|cost|margin|rate|amount|total|revenue|value)[A-Za-z]*Minor)"\s*:\s*-?[1-9]\d*/gi;
    page.on("response", async (r) => {
      const url = r.url();
      if (url.includes("/_next/static") || r.request().resourceType() === "image") return;
      const body = await r.text().catch(() => "");
      for (const m of body.matchAll(MINOR_KEY)) leaks.push(`odpověď ${m[1]} @ ${url.slice(0, 80)}`);
    });
    const seen = new Set<string>();
    const queue = TERMINAL_ROLES.includes(role)
      ? [
          "/t",
          "/t/vice",
          ...[
            "zakazky.today",
            "core.tasks",
            "dochazka.clock",
            "realizace.diary",
            "realizace.report",
            "sklad.issue",
            "stroje.fleet",
          ].map((k) => `/t/w/${k}`),
        ]
      : ["/", "/inbox", "/ukoly", "/zakazky", "/dochazka", "/sklad", "/stroje", "/kalendar"];
    while (queue.length && seen.size < 30) {
      const p = queue.shift()!;
      if (seen.has(p)) continue;
      seen.add(p);
      await visit(page, p, c);
      for (const tab of await page.getByRole("tab").all()) {
        await tab.click();
        await page.waitForLoadState("networkidle").catch(() => undefined);
      }
      const text = await page.locator("body").innerText();
      const m = text.match(MONEY);
      if (m) leaks.push(`stránka ${p}: „${m[0]}“`);
      for (const l of await hrefs(page, /^\/(zakazky|sklad|stroje|dochazka|realizace|kalendar)/))
        if (!seen.has(l) && !l.startsWith("/zakazky/schvalovani")) queue.push(l);
    }
    expect(leaks, "částky viditelné pro roli bez ekonomiky").toEqual([]);
    expectClean(c, "částky");
    await ctx.close();
  });
}
