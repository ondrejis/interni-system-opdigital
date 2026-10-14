import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs, type Role } from "./roles";
import { PHONE, expectTerminalBasics } from "./terminal-helpers";

/**
 * Terminál řemeslníka na telefonu (375 × 812): úvodní obrazovka, obrazovky dlaždic a „Více“ pro montéry a mistra,
 * náhled pro majitele a kancelář. Bez chyb v konzoli, bez vodorovného přetoku, dotykové cíle aspoň 44 px, žádné
 * tabulky, spodní lišta nejvýš pět položek a žádné ceny ani ekonomika zakázky v obsahu řemeslníka.
 */
const FIELD: Role[] = ["worker1", "worker2", "foreman1"];

/** Odkazy na obrazovky dlaždic z úvodní obrazovky a spodní lišty. */
async function widgetPages(page: Page): Promise<string[]> {
  const hrefs = await page.$$eval("a[href^='/t/w/']", (as) =>
    as.map((a) => a.getAttribute("href")!),
  );
  return [...new Set(hrefs)];
}

for (const role of [...FIELD, "owner", "office"] as Role[]) {
  test(`${role}: úvodní obrazovka a obrazovky dlaždic bez chyb, přetoku a malých cílů`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await pageAs(browser, role, { viewport: PHONE });
    const c = collectErrors(page);
    await visit(page, "/t", c);
    await expect(page.getByTestId("terminal")).toBeVisible();
    await expectTerminalBasics(page, `${role} /t`);

    const pages = await widgetPages(page);
    expect(pages.length, `${role}: aspoň jedna dlaždice s vlastní obrazovkou`).toBeGreaterThan(0);
    for (const href of [...pages, "/t/vice"]) {
      await visit(page, href, c);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expectTerminalBasics(page, `${role} ${href}`);
    }

    // náhled pro ostatní role má pruh se zpětným odkazem, role jen pro terminál ne
    await visit(page, "/t", c);
    const banner = page.getByTestId("preview-banner");
    if (role.startsWith("worker")) await expect(banner).toHaveCount(0);
    else await expect(banner).toBeVisible();
    expectClean(c, role);
    await ctx.close();
  });
}

for (const role of FIELD) {
  test(`${role}: v terminálu nejsou ceny, sazby ani ekonomika zakázky`, async ({ browser }) => {
    const { ctx, page } = await pageAs(browser, role, { viewport: PHONE });
    const c = collectErrors(page);
    await visit(page, "/t", c);
    const hrefs = await widgetPages(page);
    for (const href of ["/t", ...hrefs, "/t/vice"]) {
      await visit(page, href, c);
      const text = await page.locator("main").innerText();
      expect(text, `${role} ${href}: částka`).not.toMatch(/\d\s?(Kč|CZK|€)/);
      expect(text, `${role} ${href}: ekonomika`).not.toMatch(
        /\b(marže|sazba|rozpočet|fakturov|smluvní cena|hodinov[áé] sazb)/i,
      );
    }
    expectClean(c, role);
    await ctx.close();
  });
}

test("worker1: Dnes na stavbě ukazuje adresu s navigací, kontakt k zavolání a dnešní práci", async ({
  browser,
}) => {
  const { ctx, page } = await pageAs(browser, "worker1", { viewport: PHONE });
  const c = collectErrors(page);
  await visit(page, "/t/w/zakazky.today", c);
  const sites = page.getByTestId("site");
  await expect(sites.first()).toBeVisible();
  expect(await sites.count()).toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: /Navigovat/ }).first()).toHaveAttribute(
    "href",
    /^https:\/\/mapy\.cz\//,
  );
  const tel = page.locator("a[href^='tel:']").first();
  await expect(tel).toBeVisible();
  expectClean(c, "Dnes na stavbě");
  await ctx.close();
});

test("tmavý režim: terminál je čitelný a bez přetoku", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "worker2", { viewport: PHONE });
  await page.emulateMedia({ colorScheme: "dark" });
  const c = collectErrors(page);
  await visit(page, "/t", c);
  await expectTerminalBasics(page, "tmavý režim");
  expectClean(c, "tmavý režim");
  await ctx.close();
});

for (const vp of [
  { name: "telefon 360", width: 360, height: 740 },
  { name: "Pixel 7", width: 412, height: 915 },
  { name: "tablet", width: 768, height: 1024 },
]) {
  test(`worker1, ${vp.name}: terminál bez přetoku a malých cílů`, async ({ browser }) => {
    test.setTimeout(180_000);
    const { ctx, page } = await pageAs(browser, "worker1", { viewport: vp });
    const c = collectErrors(page);
    await visit(page, "/t", c);
    const pages = await widgetPages(page);
    for (const href of ["/t", ...pages, "/t/vice"]) {
      await visit(page, href, c);
      await expectTerminalBasics(page, `${vp.name} ${href}`);
    }
    expectClean(c, vp.name);
    await ctx.close();
  });
}
