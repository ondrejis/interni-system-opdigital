import { expect, test } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs } from "./roles";
import { PHONE } from "./terminal-helpers";

/**
 * Přístup do terminálu a z něj: řemeslník (role worker) po přihlášení skončí v terminálu a do kancelářského rozhraní
 * se nedostane (přesměrování na serveru), mistr a kancelář mají terminál jako náhled, dlaždice podle nastavení správce.
 */
const OFFICE_URLS = [
  "/",
  "/zakazky",
  "/dochazka",
  "/sklad",
  "/stroje",
  "/kalendar",
  "/ukoly",
  "/inbox",
  "/fakturace",
  "/kontakty/firmy",
  "/poptavky",
  "/nastaveni/firma",
  "/nastaveni/uzivatele",
  "/nastaveni/terminal",
  "/zakazky/00000000-0000-4000-8000-000000000000",
  "/realizace/vady",
];

for (const role of ["worker1", "worker2"] as const) {
  test(`${role}: kancelářské adresy ho vrátí do terminálu, vlastní účet zůstane dostupný`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const { ctx, page } = await pageAs(browser, role, { viewport: PHONE });
    const c = collectErrors(page);
    for (const url of OFFICE_URLS) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await expect(page, `${url} → terminál`).toHaveURL(/\/t$/);
      await expect(page.getByTestId("terminal")).toBeVisible();
    }
    // stránky vlastního účtu jsou dostupné bez kancelářské navigace a se zpětným odkazem do terminálu
    for (const url of ["/nastaveni/ucet", "/nastaveni/zabezpeceni", "/nastaveni/upozorneni"]) {
      await visit(page, url, c);
      await expect(page, url).toHaveURL(new RegExp(`${url}$`));
      await expect(page.getByRole("link", { name: /Zpět do terminálu/ })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Hlavní navigace" })).toHaveCount(0);
    }
    expectClean(c, role);
    await ctx.close();
  });
}

test("worker1: v terminálu není odkaz do kanceláře ani nabídka Nastavení", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "worker1", { viewport: PHONE });
  const c = collectErrors(page);
  await visit(page, "/t/vice", c);
  await expect(page.getByRole("link", { name: /Zpět do kanceláře/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Můj účet/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nastavení" })).toHaveCount(0);
  expectClean(c, "Více");
  await ctx.close();
});

test("neexistující nebo nepovolená dlaždice je „Stránka nenalezena“", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "worker1", { viewport: PHONE });
  for (const url of ["/t/w/neexistuje.dlazdice", "/t/w/fakturace.prehled"]) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Stránka nenalezena" })).toBeVisible();
  }
  await ctx.close();
});

test("foreman1: do kanceláře smí, terminál si otevře z menu jako náhled", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "foreman1", {
    viewport: { width: 1280, height: 800 },
  });
  const c = collectErrors(page);
  await visit(page, "/zakazky", c);
  await expect(page).toHaveURL(/\/zakazky$/);
  const link = page.getByRole("link", { name: "Terminál řemeslníka" });
  await expect(link.first()).toBeVisible();
  await link.first().click();
  await expect(page).toHaveURL(/\/t$/);
  await expect(page.getByTestId("preview-banner")).toBeVisible();
  await page.getByRole("link", { name: "Zpět do kanceláře" }).first().click();
  await expect(page).toHaveURL(/\/$/);
  expectClean(c, "foreman1");
  await ctx.close();
});

test("správce: dlaždici vypne v Nastavení → Terminál řemeslníka, řemeslník ji nevidí a server ji odmítne", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const admin = await pageAs(browser, "owner", { viewport: { width: 1280, height: 900 } });
  const ca = collectErrors(admin.page);
  await visit(admin.page, "/nastaveni/terminal", ca);
  const row = admin.page.getByTestId("tile-row").filter({ hasText: "Rychlý výdej materiálu" });
  await expect(row).toBeVisible();
  try {
    await row.getByRole("checkbox").click();
    // přejmenování jiné dlaždice
    const rename = admin.page.getByLabel("Název dlaždice Moje úkoly");
    await rename.fill("Co mám udělat");
    await admin.page.getByRole("button", { name: "Uložit", exact: true }).click();
    await expect(admin.page.getByText("Nastavení terminálu uloženo.")).toBeVisible();

    const w = await pageAs(browser, "worker1", { viewport: PHONE });
    const cw = collectErrors(w.page);
    await visit(w.page, "/t", cw);
    await expect(w.page.getByTestId("tile-sklad.issue")).toHaveCount(0);
    await expect(
      w.page.getByTestId("tile-core.tasks").getByRole("heading", { name: "Co mám udělat" }),
    ).toBeVisible();
    // obrazovka vypnuté dlaždice neexistuje (odmítnutí zápisu příkazu bez UI hlídá tests/terminal.int.test.ts)
    await w.page.goto("/t/w/sklad.issue", { waitUntil: "domcontentloaded" });
    await expect(w.page.getByRole("heading", { name: "Stránka nenalezena" })).toBeVisible();
    await w.ctx.close();
  } finally {
    // úklid: výchozí nastavení
    await admin.page.getByRole("button", { name: "Obnovit výchozí" }).click();
    await expect(admin.page.getByText("Obnoveno výchozí nastavení.")).toBeVisible();
  }
  await admin.ctx.close();
});
