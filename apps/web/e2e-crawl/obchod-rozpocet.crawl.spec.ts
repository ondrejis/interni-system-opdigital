import { expect, test, type Locator, type Page } from "@playwright/test";
import { collectErrors, expectClean } from "./helpers";
import {
  addFirstItem,
  createCompany,
  createJob,
  minorOf,
  newStamp,
  openJob,
  typeInto,
} from "./obchod-helpers";

/**
 * Rozpočet zakázky skutečným ovládáním: strom (objekty, oddíly, položky), inline editace klávesnicí, DPH po sazbách,
 * hromadné úpravy, přesun a duplikace, výkaz výměr, odeslání nabídky, PDF, zamčení, kopie nabídka → realizace.
 * Čísla se ověřují proti ručně spočítaným součtům.
 */
test.describe.configure({ mode: "serial" });

const stamp = newStamp();
const company = `Rozpočet firma ${stamp} s.r.o.`;
const job = `Rozpočet zakázka ${stamp}`;

/*
  Položky (množství × nákladová / prodejní cena):
    Zdivo      10 × 600 / 1 000 (21 %)  →  prodej 10 000, náklad 6 000
    Omítka      4 × 250 /   400 (21 %)  →  prodej  1 600, náklad 1 000
    Izolace   100 ×  80 /   120 (12 %)  →  prodej 12 000, náklad 8 000
  Celkem prodej 23 600, náklad 15 000, marže 8 600 (36,4 %).
  DPH: 21 % ze 11 600 = 2 436, 12 % z 12 000 = 1 440; s DPH 27 476.
*/

async function addItem(
  page: Page,
  grid: Locator,
  section: string,
  o: { item: string; qty: string; cost: string; price: string },
) {
  const sectionRow = grid.getByRole("row", { name: new RegExp(`^.*${section}`) }).first();
  await sectionRow.hover();
  await sectionRow.getByRole("button", { name: "Další akce" }).click();
  await page.getByRole("menuitem", { name: "Přidat položku" }).click();
  await expect(grid.getByRole("textbox")).toBeFocused(); // psát se smí, až když je buňka v úpravě
  await page.keyboard.type(o.item);
  await page.keyboard.press("Tab");
  const row = grid.getByRole("row", { name: new RegExp(o.item) });
  await expect(row).toBeVisible();
  await typeInto(page, "qty", o.qty, "Tab");
  await typeInto(page, "cost", o.cost, "Tab");
  await typeInto(page, "price", o.price, "Enter");
  return row;
}

test("nabídka: položky, součty, DPH po sazbách a hromadná změna sazby", async ({ page }) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  await createCompany(page, company);
  const view = await createJob(page, {
    title: job,
    company,
    phase: "Nabídka",
    address: "Plzeň, Rozpočtová 1",
  });
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  const grid = view.getByTestId("budget-grid");
  await addFirstItem(page, view, {
    section: "Hrubá stavba",
    item: "Zdivo",
    qty: "10",
    cost: "600",
    price: "1000",
  });
  await addItem(page, grid, "Hrubá stavba", {
    item: "Omítka",
    qty: "4",
    cost: "250",
    price: "400",
  });
  await addItem(page, grid, "Hrubá stavba", {
    item: "Izolace",
    qty: "100",
    cost: "80",
    price: "120",
  });
  const stats = view.getByTestId("budget-stats");
  await expect(stats).toContainText("23 600 Kč");
  await expect(stats).toContainText("15 000 Kč");
  await expect(stats).toContainText("8 600 Kč");
  await expect(stats).toContainText("36,4 %");
  // všechny položky jsou ve výchozí sazbě 21 %: 23 600 × 1,21 = 28 556
  await expect(stats).toContainText("28 556 Kč");

  // hromadná změna sazby u Izolace na 12 %
  await grid.getByRole("checkbox", { name: "Vybrat položku Izolace" }).check();
  const bulk = view.getByRole("toolbar", { name: "Hromadné úpravy" });
  await expect(bulk).toContainText("Vybráno 1");
  await bulk.getByRole("button", { name: "DPH" }).click();
  await page.getByRole("menuitem", { name: /^12\s?%$/ }).click();
  const vat = view.getByTestId("budget-vat");
  await expect(vat).toContainText("12 000 Kč");
  await expect(vat).toContainText("1 440 Kč");
  await expect(vat).toContainText("11 600 Kč");
  await expect(vat).toContainText("2 436 Kč");
  await expect(stats).toContainText("27 476 Kč");
  // součty se nezměnily (DPH se do prodeje bez DPH nepočítá)
  await expect(stats).toContainText("23 600 Kč");
  expectClean(c, "nabídka: položky a DPH");

  // „Cena o procento“: Zdivo +10 % → 1 100 Kč za jednotku, prodej 11 000
  await grid.getByRole("checkbox", { name: "Vybrat položku Izolace" }).uncheck();
  await grid.getByRole("checkbox", { name: "Vybrat položku Zdivo" }).check();
  await bulk.getByRole("button", { name: "Cena o procento…" }).click();
  const pct = page.getByRole("dialog");
  await pct.getByRole("textbox").first().fill("10");
  await pct
    .getByRole("button", { name: /Použít|Uložit|Změnit|Přepočítat/ })
    .last()
    .click();
  await expect(stats).toContainText("24 600 Kč");
  // a zpět na −10 / 1,1 není přesné; vrátíme cenu položky přímo v tabulce
  await grid.getByRole("checkbox", { name: "Vybrat položku Zdivo" }).uncheck();
  expectClean(c, "nabídka: cena o procento");
});

test("struktura: objekt, nový oddíl, přesun, duplikace a smazání položky se součty", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  const view = await openJob(page, stamp);
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  const grid = view.getByTestId("budget-grid");
  const stats = view.getByTestId("budget-stats");
  await expect(stats).toContainText("24 600 Kč");

  // duplikace položky přidá další stejný řádek: +1 600 Kč (Omítka)
  const omitka = grid.getByRole("row", { name: /Omítka/ });
  await omitka.hover();
  await omitka.getByRole("button", { name: "Další akce" }).click();
  await page.getByRole("menuitem", { name: "Duplikovat" }).click();
  await expect(grid.getByRole("row", { name: /Omítka/ })).toHaveCount(2);
  await expect(stats).toContainText("26 200 Kč");

  // nový oddíl a přesun jedné z kopií tam
  await view.getByRole("button", { name: "Další akce rozpočtu" }).click();
  await page.getByRole("menuitem", { name: "Přidat oddíl" }).click();
  await expect(grid.getByRole("textbox")).toBeFocused(); // psát se smí, až když je buňka v úpravě
  await page.keyboard.type("Dokončovací práce");
  await page.keyboard.press("Enter");
  await expect(grid).toContainText("Dokončovací práce");
  const copy = grid.getByRole("row", { name: /Omítka/ }).last();
  await copy.hover();
  await copy.getByRole("button", { name: "Další akce" }).click();
  await page.getByRole("menuitem", { name: "Přesunout do oddílu…" }).click();
  const move = page.getByRole("dialog");
  await move.getByLabel("Cílový oddíl").click();
  await page.getByRole("option", { name: /Dokončovací práce/ }).click();
  await move
    .getByRole("button", { name: /Přesunout/ })
    .last()
    .click();
  // součet se přesunem nemění
  await expect(stats).toContainText("26 200 Kč");

  // smazání kopie se vrátí ve součtu: −1 600 Kč
  const last = grid.getByRole("row", { name: /Omítka/ }).last();
  await last.hover();
  await last.getByRole("button", { name: "Další akce" }).click();
  await page.getByRole("menuitem", { name: "Smazat položku" }).click();
  const confirm = page.getByRole("dialog");
  if (await confirm.isVisible().catch(() => false))
    await confirm
      .getByRole("button", { name: /Smazat/ })
      .last()
      .click();
  await expect(grid.getByRole("row", { name: /Omítka/ })).toHaveCount(1);
  await expect(stats).toContainText("24 600 Kč");

  // stavební objekt a oddíl pod ním
  await view.getByRole("button", { name: "Další akce rozpočtu" }).click();
  await page.getByRole("menuitem", { name: "Přidat stavební objekt" }).click();
  const obj = page.getByRole("dialog", { name: "Nový stavební objekt" });
  await obj.getByLabel("Kód").fill("SO 01");
  await obj.getByLabel("Název").fill("Hlavní budova");
  await obj.getByRole("button", { name: "Přidat objekt" }).click();
  await expect(grid).toContainText("Hlavní budova");
  expectClean(c, "struktura rozpočtu");
});

test("výkaz výměr se vzorci a proměnnými mění množství a součet", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  const view = await openJob(page, stamp);
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  const grid = view.getByTestId("budget-grid");
  const row = grid.getByRole("row", { name: /Zdivo/ });
  await row.hover();
  await row.getByRole("button", { name: "Další akce" }).click();
  await page.getByRole("menuitem", { name: /Výkaz výměr/ }).click();
  const calc = page.getByRole("dialog", { name: "Výkaz výměr" });
  await calc.getByLabel("Proměnná, řádek 1").fill("a");
  await calc.getByLabel("Vzorec, řádek 1").fill("4,5 * 2");
  await calc.getByRole("button", { name: "Řádek", exact: true }).click();
  await calc.getByLabel("Vzorec, řádek 2").fill("a + 3");
  await expect(calc).toContainText("21");
  // neplatný vzorec nejde uložit
  await calc.getByLabel("Vzorec, řádek 2").fill("a +");
  await expect(calc.getByRole("button", { name: "Uložit" })).toBeDisabled();
  await calc.getByLabel("Vzorec, řádek 2").fill("a + 3");
  await calc.getByRole("button", { name: "Uložit" }).click();
  // množství 21 × 1 100 Kč = 23 100; celkem 23 100 + 1 600 + 12 000 = 36 700
  await expect(row).toContainText("21");
  await expect(view.getByTestId("budget-stats")).toContainText("36 700 Kč");
  expectClean(c, "výkaz výměr");
});

test("odeslání nabídky, PDF, zamčení; po výhře se nabídka zkopíruje do realizace s původními hodnotami", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  const view = await openJob(page, stamp);
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  const stats = view.getByTestId("budget-stats");
  const sellBefore = minorOf(await stats.innerText());
  expect(sellBefore).toBe(36_700_00);

  await view.getByRole("button", { name: "Odeslat nabídku" }).click();
  await expect(page.getByText("Nabídka je označená jako odeslaná zákazníkovi.")).toBeVisible();
  await expect(view.getByTestId("budget-status")).toHaveText("Odesláno zákazníkovi");
  const pdf = page.context().waitForEvent("response", (r) => r.url().includes("/nabidka/pdf"));
  const popup = page.waitForEvent("popup");
  await view.getByRole("button", { name: "Stáhnout PDF" }).click();
  const res = await pdf;
  await (await popup).close(); // otevřená záložka s PDF by při ukončení testu přerušila přenos
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  // tělo odpovědi z nové záložky už není dostupné; stáhne se znovu stejnou adresou (relace je sdílená)
  const again = await page.request.get(res.url());
  expect(again.status()).toBe(200);
  expect((await again.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // vyhráno → příprava: smluvní cena je cena nabídky, náklad plán
  await view.getByTestId("job-primary-action").getByRole("button").click();
  await page
    .getByRole("dialog", { name: /Přesunout do fáze „Příprava“/ })
    .getByRole("button", { name: "Přesunout" })
    .click();
  await expect(view.getByTestId("job-phase")).toHaveText("Příprava");
  await expect(view.getByTestId("kpi-contract")).toContainText("36 700 Kč");
  await expect(view.getByTestId("kpi-cost")).toContainText("z plánu 21 600 Kč");

  // v Rozpočtu je nabídka zamčená a realizace má stejné součty
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  await expect(view.getByTestId("budget-stats")).toContainText("36 700 Kč");
  expectClean(c, "odeslání a výhra");
});

test("revize nabídky, zamčení a odemčení, název nabídky, šablona zakázky (uložit, použít, smazat)", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const c = collectErrors(page);
  const title2 = `Revize zakázka ${stamp}`;
  const template = `Šablona ${stamp}`;
  const view = await createJob(page, {
    title: title2,
    company,
    phase: "Nabídka",
    address: "Plzeň, Revizní 1",
  });
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  await addFirstItem(page, view, {
    section: "Základy",
    item: "Beton",
    qty: "2",
    cost: "500",
    price: "800",
  });
  const stats = view.getByTestId("budget-stats");
  await expect(stats).toContainText("1 600 Kč");

  // nová revize nabídky je kopie; úprava revize 2 nemění revizi 1
  await view.getByRole("button", { name: "Další akce rozpočtu" }).click();
  await page.getByRole("menuitem", { name: "Nová revize nabídky" }).click();
  const grid = view.getByTestId("budget-grid");
  await expect(view.getByLabel("Revize nabídky")).toBeVisible();
  await expect(grid.getByRole("row", { name: /Beton/ })).toBeVisible();
  const qty = grid.getByRole("row", { name: /Beton/ }).getByRole("gridcell").nth(5);
  await qty.dblclick();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("5");
  await page.keyboard.press("Enter");
  await expect(stats).toContainText("4 000 Kč");
  await view.getByLabel("Revize nabídky").click();
  await page.getByRole("option").first().click(); // první revize
  await expect(stats).toContainText("1 600 Kč");

  // název a poznámka nabídky (jdou do PDF), pak zamčení a odemčení vlastníkem
  await view.getByRole("button", { name: "Další akce rozpočtu" }).click();
  await page.getByRole("menuitem", { name: /Název a poznámka nabídky/ }).click();
  const meta = page.getByRole("dialog");
  await meta.getByRole("textbox").first().fill(`Nabídka ${stamp}`);
  await meta.getByRole("button", { name: /Uložit/ }).click();
  await expect(meta).toBeHidden();
  await view.getByRole("button", { name: "Další akce rozpočtu" }).click();
  await page.getByRole("menuitem", { name: "Zamknout nabídku" }).click();
  await expect(view.getByTestId("budget-lock")).toContainText("zamčená");
  await grid.getByRole("row", { name: /Beton/ }).getByRole("gridcell").nth(5).dblclick();
  await expect(grid.getByRole("textbox")).toHaveCount(0);
  await view.getByTestId("budget-lock").getByRole("button", { name: "Odemknout" }).click();
  await expect(view.getByTestId("budget-lock")).toHaveCount(0);

  // šablona: uložit z hotové zakázky, použít v nové, smazat
  await view.getByRole("button", { name: "Uložit jako šablonu" }).click();
  const save = page.getByRole("dialog", { name: "Uložit jako šablonu" });
  await save.getByLabel("Název šablony").fill(template);
  await save.getByRole("button", { name: "Uložit šablonu" }).click();
  await expect(page.getByText(`Šablona „${template}“ je uložená.`)).toBeVisible();
  const view2 = await createJob(page, { title: `Ze šablony ${stamp}`, company });
  await view2.getByRole("tab", { name: "Rozpočet" }).click();
  await view2.getByRole("button", { name: "Použít šablonu" }).click();
  const picker = page.getByRole("dialog", { name: "Použít šablonu" });
  await picker.getByRole("option", { name: new RegExp(template) }).click();
  await picker.getByRole("button", { name: "Použít šablonu" }).click();
  await expect(view2.getByTestId("budget-grid")).toContainText("Beton");
  // šablona nese strukturu a množství z poslední revize (5 ks), ceny jen když se uložily „s cenami“ (výchozí ne)
  await expect(view2.getByTestId("budget-grid").getByRole("row", { name: /Beton/ })).toContainText(
    "5",
  );
  await page.goto("/zakazky/sablony");
  const row = page.getByTestId("template-row").filter({ hasText: template });
  await row.getByRole("button", { name: `Smazat šablonu ${template}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat", exact: true }).click();
  await expect(page.getByTestId("template-row").filter({ hasText: template })).toHaveCount(0);
  expectClean(c, "revize, zámek, šablona");
});
