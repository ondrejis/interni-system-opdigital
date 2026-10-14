import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean } from "./helpers";
import { pageAs, type Role } from "./roles";

/**
 * Hledání (Cmd+K), exporty, PDF a tisk pro role bez ekonomiky: nenajdou cizí ani skryté záznamy a žádný výstup
 * nenese částky. Data se berou z živé aplikace (seznamy majitele), takže test nezávisí na konkrétním demo záznamu.
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MONEY = /\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?\s*(?:Kč|CZK|EUR|€)/i;

/** Vyhledá v paletě příkazů a vrátí texty výsledků. */
async function search(page: Page, q: string): Promise<string[]> {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder(/Hledat zakázky/);
  await expect(input).toBeVisible();
  const done = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 15_000 });
  await input.fill(q);
  await done.catch(() => undefined);
  await page.waitForTimeout(400);
  return page.locator("[cmdk-item]").allInnerTexts();
}

/**
 * Odkazy na detaily záznamů ze seznamu (`/zakazky`, `/fakturace`). Seznam se načítá po hydrataci (dotaz z prohlížeče),
 * takže „síť se uklidnila“ ještě neznamená, že řádky jsou vidět (na pomalém běhu v kontejneru to selhávalo); čeká se
 * proto na první odkaz na detail. Když žádný není, vrátí se prázdný seznam a volající ohlásí svou chybu.
 */
async function detailLinks(
  page: Page,
  listPath: string,
  requireText = false,
): Promise<{ href: string; text: string }[]> {
  await page.goto(listPath, { waitUntil: "networkidle" });
  const read = () =>
    page.$$eval(
      `a[href^='${listPath}/']`,
      (as, [re, needText]) =>
        as
          .map((a) => ({
            href: a.getAttribute("href")!,
            text: (a as HTMLElement).innerText.trim(),
          }))
          .filter((x) => new RegExp(re as string).test(x.href) && (!needText || x.text)),
      [`^${listPath}/${UUID}$`, requireText],
    );
  await expect
    .poll(async () => (await read()).length, { message: `seznam ${listPath} má řádky` })
    .toBeGreaterThan(0)
    .catch(() => undefined);
  return read();
}

const ownerJobs = (page: Page) => detailLinks(page, "/zakazky", true);

// montér (role jen pro terminál) nemá kancelářské hledání; terminál a jeho obsah bez cen hlídá terminal-obrazovky
for (const role of ["foreman1"] as const satisfies Role[]) {
  test(`${role}: Cmd+K nenajde faktury ani cizí zakázky a výsledky nenesou částky`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const owner = await pageAs(browser, "owner");
    const me = await pageAs(browser, role);
    const c = collectErrors(me.page);
    const all = await ownerJobs(owner.page);
    const mine = new Set((await ownerJobs(me.page)).map((j) => j.href));
    const foreign = all.filter((j) => !mine.has(j.href));
    expect(foreign.length, "role musí mít nějakou cizí zakázku").toBeGreaterThan(0);

    // číslo skutečné faktury (z přehledu majitele) role bez faktur nenajde; částky ve výsledcích nejsou
    await detailLinks(owner.page, "/fakturace"); // počká na načtení řádků
    const invoiceNo = /\bFV-?\d{4}-?\d{3,5}\b/.exec(
      await owner.page.locator("body").innerText(),
    )?.[0];
    expect(invoiceNo, "majitel vidí číslo faktury").toBeTruthy();
    for (const q of [invoiceNo!, "Kč"]) {
      const items = await search(me.page, q);
      expect(items.join(" | "), `hledání „${q}“`).not.toContain(invoiceNo!);
      expect(items.join(" | "), `hledání „${q}“`).not.toMatch(MONEY);
    }
    // číslo cizí zakázky (první řádek textu odkazu) se nenajde, číslo vlastní ano
    const numberOf = (t: string) => /Z-\d{4}-\d{3}/.exec(t)?.[0];
    const foreignNo = foreign.map((j) => numberOf(j.text)).find(Boolean);
    const ownNo = [...mine]
      .map((h) => all.find((j) => j.href === h))
      .map((j) => (j ? numberOf(j.text) : undefined))
      .find(Boolean);
    if (foreignNo) {
      const items = await search(me.page, foreignNo);
      expect(items.join(" | "), `cizí zakázka ${foreignNo}`).not.toContain(foreignNo);
    }
    if (ownNo) {
      const items = await search(me.page, ownNo);
      expect(items.join(" | "), `vlastní zakázka ${ownNo}`).toContain(ownNo);
    }
    expectClean(c, "hledání");
    await Promise.all([owner.ctx.close(), me.ctx.close()]);
  });
}

test("hledání bez diakritiky najde totéž co s diakritikou", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "office");
  const a = await search(page, "Zateplení");
  const b = await search(page, "zatepleni");
  expect(a.length).toBeGreaterThan(0);
  expect(b).toEqual(a);
  await ctx.close();
});

for (const role of ["worker1", "foreman1"] as const satisfies Role[]) {
  test(`${role}: exporty a PDF faktur jsou zavřené, export zakázek bez částek`, async ({
    browser,
  }) => {
    const owner = await pageAs(browser, "owner");
    const me = await pageAs(browser, role);
    await me.page.goto("/", { waitUntil: "domcontentloaded" });
    // majitel najde vystavenou fakturu a její id
    const invoiceHref = (await detailLinks(owner.page, "/fakturace"))[0]?.href;
    expect(invoiceHref, "majitel vidí aspoň jednu fakturu").toBeTruthy();
    const base = new URL(me.page.url()).origin;

    const pdf = await me.ctx.request.get(`${base}/api${invoiceHref}/pdf`);
    expect([401, 403, 404]).toContain(pdf.status());
    expect(pdf.headers()["content-type"] ?? "").not.toContain("pdf");
    for (const entity of ["invoice", "received_invoice", "job_order"]) {
      const r = await me.ctx.request.post(`${base}/api/export/${entity}`, {
        data: { format: "csv" },
        headers: { origin: base },
      });
      expect([401, 403, 404], `${entity} → ${r.status()}`).toContain(r.status());
    }
    // zakázky smí, ale bez sloupců s penězi
    const jobs = await me.ctx.request.post(`${base}/api/export/job`, {
      data: { format: "csv" },
      headers: { origin: base },
    });
    if (jobs.status() === 200) {
      const text = await jobs.text();
      expect(text).not.toMatch(MONEY);
      expect(text.split("\n")[0]).not.toMatch(
        /Cena|Marže|Náklad|Fakturováno|Rozpočet|Zádržné|Uhrazeno/i,
      );
    } else expect([403, 404]).toContain(jobs.status());
    await Promise.all([owner.ctx.close(), me.ctx.close()]);
  });
}

test("tisk deníku: bez cen a cizí zakázka je nenalezena", async ({ browser }) => {
  const owner = await pageAs(browser, "owner");
  const f1 = await pageAs(browser, "foreman1");
  const f2 = await pageAs(browser, "foreman2");
  const c = collectErrors(f1.page);
  // neexistující a cizí zakázka záměrně končí odpovědí 404 (a prohlížeč ji zapíše do konzole)
  c.ignore(/Failed to load resource: the server responded with a status of 404/);
  // vývojové varování Reactu 19 (jen dev sestavení): kořenová stránka 404 se vykreslí znovu na klientu a s ní skript
  // motivu v <head>; v produkci se nevypisuje a skript se nespouští znovu
  c.ignore(/Encountered a script tag while rendering React component/);
  const jobsOf = async (p: Page) => (await ownerJobs(p)).map((j) => j.href.split("/").pop()!);
  const mine = await jobsOf(f1.page);
  const others = await jobsOf(f2.page);
  const own = mine[0]!;
  await f1.page.goto(`/tisk/denik/${own}`, { waitUntil: "networkidle" });
  expect(await f1.page.locator("body").innerText()).not.toMatch(MONEY);
  await expect(f1.page.getByText("Něco se nepovedlo")).toHaveCount(0);
  await f1.page.goto(`/tisk/denik/${others[0]}`, { waitUntil: "networkidle" });
  expect(f1.page.url()).toContain(others[0]);
  expect(await f1.page.locator("body").innerText()).not.toMatch(
    /Hala|Rekonstrukce|Zateplení|Výměna|Dostavba/,
  );
  await f1.page.goto(`/tisk/denik/neplatne-id`, { waitUntil: "networkidle" });
  await expect(f1.page.getByText("Něco se nepovedlo")).toHaveCount(0);
  expectClean(c, "tisk deníku");
  await Promise.all([owner.ctx.close(), f1.ctx.close(), f2.ctx.close()]);
});
