import { expect, test } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";

/**
 * Procházení nad demo daty (`pnpm demo:seed`): každá obrazovka systému má co ukázat a nic nehlásí chybu.
 * Test nic nemění, jen čte. Spouští se proti vývojové databázi s nasazenými demo daty.
 */

/** Stránka, text, který musí být vidět (z demo dat). */
const LISTS: [string, RegExp][] = [
  ["/zakazky", /Dostavba skladové haly B/],
  ["/poptavky", /Oprava střechy skladu/],
  ["/kontakty/firmy", /Stavebniny Plzeňka/],
  ["/kontakty/osoby", /Josef Vondráček/],
  ["/fakturace", /FV-\d{4}-\d{4}/],
  ["/fakturace/prijate", /Betonárna Západ/],
  ["/zakazky/objednavky", /Betonáž základů/],
  ["/zakazky/schvalovani", /Sedmá vrata do expedice/],
  ["/zakazky/sablony", /./],
  ["/realizace", /Dostavba skladové haly B/],
  ["/realizace/vady", /Netěsné spáry/],
  ["/sklad", /Hlavní sklad Plzeň|Cement/],
  ["/sklad/karty", /Silikon sanitární/],
  ["/sklad/doklady", /PR-\d{4}-\d{4}/],
  ["/sklad/objednavky", /OB-\d{4}-\d{3}/],
  ["/sklad/umisteni", /Hlavní sklad Plzeň/],
  ["/sklad/inventury", /INV-\d{4}-\d{3}/],
  ["/stroje", /Renault Master/],
  ["/stroje/evidence", /Minibagr Kubota/],
  ["/stroje/zavady", /hydraulika/],
  ["/dochazka", /./],
  ["/dochazka/schvalovani", /./],
  ["/kalendar", /./],
  ["/kalendar/udalosti", /Kontrolní den – hala B/],
  ["/kalendar/zdroje", /Zasedací místnost/],
  ["/ukoly", /Moje úkoly/],
  ["/inbox", /./],
];

test("seznamy a stránky modulů ukazují demo data", async ({ page }) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  for (const [path, text] of LISTS) {
    await visit(page, path, c);
    await expect(
      page.locator("main").getByText(text).first(),
      `${path} má ukázat ${text}`,
    ).toBeVisible({
      timeout: 15_000,
    });
  }
  expectClean(c, "seznamy");
});

test("Přehled ukazuje, co vyžaduje pozornost", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/", c);
  await expect(page.getByText(/Vyžaduje pozornost/i).first()).toBeVisible();
  // po splatnosti, nabídka bez odpovědi, zakázka s problémem, záruka končí
  await expect(page.locator("main")).toContainText(/po splatnosti|čeká na odpověď|problém|Záruka/i);
  expectClean(c, "přehled");
});

const TABS = [
  "prehled",
  "rozpocet",
  "zmeny",
  "naklady",
  "fakturace",
  "realizace",
  "ukoly",
  "soubory",
];

test("detail každé zakázky se otevře ve všech záložkách bez chyby", async ({ page }) => {
  test.setTimeout(600_000);
  const c = collectErrors(page);
  await visit(page, "/zakazky", c);
  const hrefs = await page
    .locator("main a[href^='/zakazky/']")
    .evaluateAll((as) =>
      [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))].filter((h) =>
        /^\/zakazky\/[0-9a-f-]{36}$/.test(h),
      ),
    );
  expect(hrefs.length, "odkazy na zakázky v seznamu").toBeGreaterThanOrEqual(12);
  for (const href of hrefs) for (const tab of TABS) await visit(page, `${href}?tab=${tab}`, c);
  expectClean(c, "detaily zakázek");
});

test("detail faktury, firmy, skladové karty a stroje se otevře", async ({ page }) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  for (const [list, prefix] of [
    ["/fakturace", "/fakturace/"],
    ["/kontakty/firmy", "/kontakty/firmy/"],
    ["/sklad/karty", "/sklad/karty/"],
    ["/stroje/evidence", "/stroje/evidence/"],
    ["/poptavky", "/poptavky/"],
    ["/realizace/vady", "/realizace/vady/"],
  ] as const) {
    await visit(page, list, c);
    const hrefs = await page
      .locator(`main a[href^='${prefix}']`)
      .evaluateAll((as) => [
        ...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!)),
      ]);
    for (const href of hrefs.filter((h) => /[0-9a-f-]{36}$/.test(h)).slice(0, 4))
      await visit(page, href, c);
  }
  expectClean(c, "detaily");
});
