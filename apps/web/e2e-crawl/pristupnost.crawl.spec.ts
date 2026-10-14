import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { collectErrors, visit } from "./helpers";
import { pageAs } from "./roles";

/**
 * Přístupnost (WCAG 2 A a AA) hlavních stránek automatickou kontrolou axe-core: kritické a vážné nálezy test shodí.
 * Axe jako vývojová závislost: malá, udržovaná (Deque), standardní nástroj pro Playwright; ruční kontrola popisků,
 * kontrastu a role prvků by byla delší a méně spolehlivá. Nálezy mírné a střední (`minor`, `moderate`) se jen vypíšou.
 */
const BLOCKING = new Set(["critical", "serious"]);

async function scan(page: Page, label: string) {
  const res = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // vývojový odznak Next.js není součástí aplikace
    .exclude("nextjs-portal")
    .analyze();
  const blocking = res.violations
    .filter((v) => BLOCKING.has(v.impact ?? ""))
    .map(
      (v) =>
        `${label}: ${v.id} (${v.impact}) ${v.help}: ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    );
  return blocking;
}

const PAGES = [
  "/",
  "/inbox",
  "/ukoly",
  "/zakazky",
  "/dochazka",
  "/sklad",
  "/stroje",
  "/kalendar",
  "/fakturace",
  "/kontakty/firmy",
  "/poptavky",
  "/nastaveni/firma",
  "/nastaveni/ucet",
  "/nastaveni/upozorneni",
  "/nastaveni/zabezpeceni",
];

for (const scheme of ["light", "dark"] as const) {
  test(`axe: hlavní stránky majitele, ${scheme === "light" ? "světlý" : "tmavý"} režim`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await pageAs(browser, "owner", {
      viewport: { width: 1280, height: 800 },
    });
    await page.emulateMedia({ colorScheme: scheme });
    const c = collectErrors(page);
    const found: string[] = [];
    for (const p of PAGES) {
      await visit(page, p, c);
      found.push(...(await scan(page, p)));
    }
    // detail zakázky se záložkami
    await visit(page, "/zakazky", c);
    const job = (
      await page.$$eval("a[href^='/zakazky/']", (as) => as.map((a) => a.getAttribute("href")!))
    ).find((h) => /^\/zakazky\/[0-9a-f-]{36}$/.test(h));
    if (job) {
      await visit(page, job, c);
      for (const tab of await page.getByRole("tab").all()) {
        const name = (await tab.innerText()).trim();
        await tab.click();
        await page.waitForLoadState("networkidle").catch(() => undefined);
        found.push(...(await scan(page, `${job} záložka ${name}`)));
      }
    }
    expect(found, "kritické a vážné nálezy přístupnosti").toEqual([]);
    await ctx.close();
  });
}

test("axe: přihlášení a stránky montéra", async ({ browser }) => {
  const anon = await browser.newContext({
    baseURL: process.env.CRAWL_BASE_URL ?? "http://localhost:3100",
    storageState: { cookies: [], origins: [] },
  });
  const lp = await anon.newPage();
  await lp.goto("/prihlaseni", { waitUntil: "networkidle" });
  const found = await scan(lp, "/prihlaseni");
  await anon.close();
  const { ctx, page } = await pageAs(browser, "worker1", {
    viewport: { width: 1280, height: 800 },
  });
  const c = collectErrors(page);
  // montér má jen terminál (kancelářské stránky ho přesměrují na /t, viz terminal-pristup)
  for (const p of ["/t", "/nastaveni/ucet", "/nastaveni/zabezpeceni"]) {
    await visit(page, p, c);
    found.push(...(await scan(page, `worker ${p}`)));
  }
  expect(found, "kritické a vážné nálezy přístupnosti").toEqual([]);
  await ctx.close();
});

for (const scheme of ["light", "dark"] as const) {
  test(`axe: terminál řemeslníka na telefonu, ${scheme === "light" ? "světlý" : "tmavý"} režim`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await pageAs(browser, "worker2", {
      viewport: { width: 375, height: 812 },
    });
    await page.emulateMedia({ colorScheme: scheme });
    const c = collectErrors(page);
    await visit(page, "/t", c);
    const pages = [
      "/t",
      ...new Set(
        await page.$$eval("a[href^='/t/w/']", (as) => as.map((a) => a.getAttribute("href")!)),
      ),
      "/t/vice",
    ];
    const found: string[] = [];
    for (const p of pages) {
      await visit(page, p, c);
      found.push(...(await scan(page, `terminál ${p}`)));
    }
    expect(pages.length, "terminál má aspoň jednu obrazovku dlaždice").toBeGreaterThan(2);
    expect(found, "kritické a vážné nálezy přístupnosti").toEqual([]);
    await ctx.close();
  });
}

test("dialogy: zachytí focus, mají popisky bez nálezů axe a Esc je zavře", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "office", { viewport: { width: 1280, height: 800 } });
  const c = collectErrors(page);
  for (const url of ["/kontakty/firmy?novy=1", "/zakazky?novy=1"]) {
    await visit(page, url, c);
    const dialog = page.getByRole("dialog");
    await expect(dialog, url).toBeVisible();
    await expect(dialog, "dialog má název").toHaveAccessibleName(/.+/);
    // focus je uvnitř dialogu a Tab ho z něj neodnese
    for (let i = 0; i < 12; i++) {
      expect(
        await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")),
        `${url}: focus po ${i} Tabech`,
      ).toBe(true);
      await page.keyboard.press("Tab");
    }
    const res = await new AxeBuilder({ page })
      .include("[role=dialog]")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      res.violations
        .filter((v) => BLOCKING.has(v.impact ?? ""))
        .map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`),
      `${url}: nálezy v dialogu`,
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog, `${url}: Esc zavře dialog`).toHaveCount(0);
  }
  await ctx.close();
});

test("klávesnice: každý prvek, na který se dostane Tab, má viditelný focus", async ({
  browser,
}) => {
  const { ctx, page } = await pageAs(browser, "office", { viewport: { width: 1280, height: 800 } });
  const c = collectErrors(page);
  for (const url of ["/", "/zakazky", "/kontakty/firmy"]) {
    await visit(page, url, c);
    const bad: string[] = [];
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const st = getComputedStyle(el);
        const ring =
          (st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0) ||
          (st.boxShadow !== "none" && st.boxShadow !== "") ||
          // vlastní vykreslení focusu rodičem (např. položka seznamu)
          !!el.closest("[data-focus-visible], [data-highlighted]");
        return ring
          ? null
          : `${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") ?? el.innerText ?? "").trim().slice(0, 30)}`;
      });
      if (r) bad.push(r);
    }
    expect(bad, `${url}: prvky bez viditelného focusu`).toEqual([]);
  }
  await ctx.close();
});
