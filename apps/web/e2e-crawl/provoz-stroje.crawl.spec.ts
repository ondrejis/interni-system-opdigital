import { expect, test, type Locator, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";

/**
 * Procházka: stroje a vozidla. Evidence, kniha jízd (kontrola vstupů), tankování (spotřeba mezi plnými nádržemi),
 * servisní intervaly (km i měsíce), STK, rezervace s kolizí, závady (blokující odstaví stroj) a náklady stroje na zakázku
 * (provoz × interní sazba a palivo bez DPH): částky na kartě zakázky se shodují s ekonomikou zakázky na haléř.
 */
const stamp = Math.random().toString(36).slice(2, 8);
const van = `Dodávka ${stamp}`;
const jobTitle = `Stroje ${stamp}`;
const defect = `Netěsní hydraulika ${stamp}`;
const plate = `QA${stamp}`.toUpperCase();

async function pick(page: Page, trigger: Locator, search: string) {
  await trigger.click();
  await page.getByPlaceholder("Hledat…").last().fill(search);
  await page.getByRole("option").filter({ hasText: search }).first().click();
}

async function openAsset(page: Page) {
  await page.goto("/stroje/evidence");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: van });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  return page.getByTestId("record-view");
}

/** „1 234,50 Kč“ → haléře. */
const toMinor = (t: string) =>
  Math.round(Number(t.replace(/[^\d,-]/g, "").replace(",", ".")) * 100);

test.describe.configure({ mode: "serial" });

test("příprava: zakázka a karta stroje se SPZ a interní sazbou", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await page.goto("/kontakty/firmy");
  await page.getByTestId("create-record").click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(`Investor ${stamp}`);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: `Investor ${stamp}` }),
  ).toBeVisible();
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(jobTitle);
  await dialog.getByRole("button", { name: "Vybrat…" }).click();
  await page.getByPlaceholder("Hledat…").last().fill(`Investor ${stamp}`);
  await page.getByRole("option").first().click();
  await dialog.getByRole("button", { name: "Poptávka" }).click();
  await page.getByRole("option", { name: "Realizace" }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: jobTitle }),
  ).toBeVisible();

  await page.goto("/stroje/evidence");
  await page.getByTestId("create-record").click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(van);
  await dialog.getByRole("button", { name: /Další pole/ }).click();
  await dialog.getByLabel("SPZ").fill(plate.toLowerCase());
  await dialog.getByLabel("Stav tachometru").fill("50000");
  await dialog.getByLabel(/Interní sazba/).fill("12");
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name: van })).toBeVisible();
  await expect(view).toContainText(plate); // SPZ se uloží velkými písmeny
  expectClean(c, "příprava");
});

test("kniha jízd: kontrola vstupů, zápis na zakázku zvýší stav a objeví se v knize", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/stroje", c);
  await page.getByRole("button", { name: "Zapsat jízdu / provoz" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Zapsat jízdu nebo provoz" });
  await pick(page, dialog.getByRole("button", { name: /^Stroj/ }), stamp);
  await expect(dialog.getByLabel(/Počáteční stav/)).toHaveValue("50000");
  // konečný stav pod počátečním se odmítne
  await dialog.getByLabel(/Konečný stav/).fill("49000");
  await dialog.getByRole("button", { name: "Zapsat", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel(/Konečný stav/).fill("50120");
  await dialog.getByLabel("Trasa").fill("Plzeň – Rokycany");
  await dialog.getByLabel("Účel").fill("Rozvoz materiálu");
  await pick(page, dialog.getByRole("button", { name: /^Zakázka/ }), jobTitle);
  await dialog.getByRole("button", { name: "Zapsat", exact: true }).click();
  await expect(page.getByText("Zapsáno: 120,0")).toBeVisible();

  // druhý zápis „Počet km“ bez tachometru: 30 km
  await page.getByRole("button", { name: "Zapsat jízdu / provoz" }).first().click();
  const d2 = page.getByRole("dialog", { name: "Zapsat jízdu nebo provoz" });
  await pick(page, d2.getByRole("button", { name: /^Stroj/ }), stamp);
  await d2.getByRole("button", { name: "Počet km" }).click();
  await d2.getByLabel("Ujeto (km)").fill("30");
  await d2.getByLabel("Účel").fill("Vývoz suti");
  await pick(page, d2.getByRole("button", { name: /^Zakázka/ }), jobTitle);
  await d2.getByRole("button", { name: "Zapsat", exact: true }).click();
  await expect(page.getByText("Zapsáno: 30,0")).toBeVisible();

  await page.getByRole("link", { name: "Kniha jízd" }).click();
  await expect(page).toHaveURL(/\/stroje\/kniha$/);
  const row = page.getByTestId("log-row").filter({ hasText: "Rozvoz materiálu" });
  await expect(row.first()).toContainText("Plzeň – Rokycany");
  await expect(row.first()).toContainText("120 km");
  await expect(page.getByTestId("log-row").filter({ hasText: "Vývoz suti" }).first()).toContainText(
    "30 km",
  );
  expectClean(c, "kniha jízd");
});

test("tankování: spotřeba mezi plnými nádržemi, palivo na zakázku bez DPH", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  const view = await openAsset(page);
  await view.getByRole("tab", { name: "Tankování" }).click();
  // stav tachometru po jízdách je 50150
  for (const [meter, liters, total, job] of [
    ["50200", "40", "1600", false],
    ["50700", "35", "1400", false],
    ["50800", "10", "1001", true],
    ["50900", "10", "1001", true],
  ] as const) {
    await view.getByRole("button", { name: "Natankováno" }).click();
    const dialog = page.getByRole("dialog", { name: "Natankováno" });
    await dialog.getByLabel(/Stav tachometru/).fill(meter);
    await dialog.getByLabel("Litrů").fill(liters);
    await dialog.getByLabel("Částka z účtenky").fill(total);
    if (job) await pick(page, dialog.getByRole("button", { name: /^Zakázka/ }), jobTitle);
    await dialog.getByRole("button", { name: "Zapsat tankování" }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(view.getByTestId("fuel-row")).toHaveCount(4);
  // první tankování je start, druhé: 35 l na 500 km = 7,0 l/100 km
  await expect(view.getByTestId("fuel-row").filter({ hasText: /50\s700/ })).toContainText("7,0");
  // průměr je vážený ujetou vzdáleností: 55 l / 700 km = 7,9 l/100 km (ne 9,0 jako průměr spotřeb 7, 10, 10)
  await expect(view).toContainText("Průměrná spotřeba 7,9 l/100 km");
  // tachometr nižší než poslední známý stav (50 900) se odmítne větou, tankování se nezapíše
  await view.getByRole("button", { name: "Natankováno" }).click();
  const low = page.getByRole("dialog", { name: "Natankováno" });
  await low.getByLabel(/Stav tachometru/).fill("50000");
  await low.getByLabel("Litrů").fill("20");
  await low.getByLabel("Částka z účtenky").fill("800");
  await low.getByRole("button", { name: "Zapsat tankování" }).click();
  await expect(low.getByRole("alert")).toContainText("nižší než poslední známý");
  await low.getByRole("button", { name: "Zrušit" }).click();
  await expect(view.getByTestId("fuel-row")).toHaveCount(4);
  // smazání se potvrzuje dialogem aplikace (ne nativním confirm); „Zrušit“ nic nesmaže
  page.on("dialog", () => {
    throw new Error("Neočekávaný nativní dialog prohlížeče");
  });
  await view
    .getByTestId("fuel-row")
    .first()
    .getByRole("button", { name: "Smazat tankování" })
    .click();
  const del = page.getByRole("dialog", { name: "Smazat tankování" });
  await expect(del).toContainText("Smazat toto tankování?");
  await del.getByRole("button", { name: "Zrušit" }).click();
  await expect(del).toBeHidden();
  await expect(view.getByTestId("fuel-row")).toHaveCount(4);
  // tankování bez litrů se odmítne hláškou v dialogu
  await view.getByRole("button", { name: "Natankováno" }).click();
  const bad = page.getByRole("dialog", { name: "Natankováno" });
  await bad.getByLabel(/Stav tachometru/).fill("51000");
  await bad.getByLabel("Částka z účtenky").fill("500");
  await bad.getByRole("button", { name: "Zapsat tankování" }).click();
  await expect(bad.getByRole("alert")).toBeVisible();
  await bad.getByRole("button", { name: "Zrušit" }).click();
  expectClean(c, "tankování");
});

test("servis: kilometrový interval a interval v měsících, zápis servisu a STK", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  const view = await openAsset(page);
  await view.getByRole("tab", { name: "Servis" }).click();

  await view.getByRole("button", { name: "Nový interval" }).click();
  let dialog = page.getByRole("dialog", { name: "Servisní interval" });
  await dialog.getByLabel("Název").fill("Výměna oleje");
  await dialog.getByLabel(/^Každých/).fill("15000");
  await dialog.getByLabel(/Stav při posledním/).fill("30000");
  await dialog.getByRole("button", { name: "Uložit interval" }).click();
  const intervals = view.getByTestId("intervals");
  // 30 000 + 15 000 = 45 000 a stroj má 50 900 → překročeno o 5 900
  await expect(intervals.getByText("Výměna oleje")).toBeVisible();
  await expect(intervals).toContainText(/překročeno o 5\s900/);

  await view.getByRole("button", { name: "Nový interval" }).click();
  dialog = page.getByRole("dialog", { name: "Servisní interval" });
  await dialog.getByLabel("Název").fill("STK a emise");
  await dialog.getByLabel(/měsíc/i).first().fill("24");
  // poslední STK před 25 měsíci → po termínu
  await dialog.getByRole("button", { name: "Uložit interval" }).click();
  await expect(intervals.getByText("STK a emise")).toBeVisible();

  await view.getByRole("button", { name: "Zapsat servis" }).click();
  dialog = page.getByRole("dialog", { name: "Servis" });
  await dialog.getByLabel("Co se dělalo").fill("Olej a filtry");
  await dialog.getByLabel("Cena servisu").fill("6500");
  await dialog.getByLabel(/Stav \(km\)/).fill("50900");
  await pick(page, dialog.getByRole("button", { name: /^Interval/ }), "Výměna oleje");
  await dialog.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(view.getByTestId("service-row")).toContainText("Olej a filtry");
  // po servisu při 50 900 km: další za 15 000 km → zbývá 15 000
  await expect(intervals).toContainText(/zbývá 15\s000/);

  // karta nákladů stroje: servis 6 500 Kč bez DPH
  await view.getByRole("tab", { name: "Náklady" }).click();
  await expect(view).toContainText("6 500 Kč");
  expectClean(c, "servis");
});

test("rezervace: kolize se odmítne, jiné dny projdou, zrušení uvolní termín", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  const view = await openAsset(page);
  await view.getByRole("tab", { name: "Rezervace" }).click();
  await view.getByRole("button", { name: "Rezervovat" }).click();
  let dialog = page.getByRole("dialog", { name: "Rezervace" });
  await dialog.getByRole("button", { name: "Rezervovat", exact: true }).click(); // dnes až dnes
  await expect(dialog).toBeHidden();
  await expect(view.getByTestId("reservations")).toBeVisible();

  await view.getByRole("button", { name: "Rezervovat" }).click();
  dialog = page.getByRole("dialog", { name: "Rezervace" });
  await dialog.getByRole("button", { name: "Rezervovat", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("už rezervovaný");
  await dialog.getByRole("button", { name: "Zrušit" }).click();

  // zrušení rezervace se potvrzuje dialogem aplikace: „Ponechat“ nic nezmění, potvrzení termín uvolní
  await view.getByRole("button", { name: "Zrušit rezervaci" }).first().click();
  const cancel = page.getByRole("dialog", { name: "Zrušit rezervaci" });
  await expect(cancel).toContainText("Zrušit tuto rezervaci?");
  await cancel.getByRole("button", { name: "Ponechat" }).click();
  await expect(cancel).toBeHidden();
  await expect(view.getByTestId("reservations")).toBeVisible();
  await view.getByRole("button", { name: "Zrušit rezervaci" }).first().click();
  await cancel.getByRole("button", { name: "Zrušit rezervaci" }).click();
  await expect(view.getByText("Žádné rezervace.")).toBeVisible();

  // přehled rezervací všech strojů (mřížka) se otevře
  await visit(page, "/stroje/rezervace", c);
  await expect(page.getByTestId("reservation-grid")).toBeVisible();
  expectClean(c, "rezervace");
});

test("závada: blokující závada odstaví stroj, vyřešení ho vrátí", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/stroje", c);
  await page.getByRole("button", { name: "Nahlásit závadu" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nahlásit závadu" });
  await pick(page, dialog.getByRole("button", { name: /^Stroj/ }), stamp);
  await dialog.getByLabel("Co je špatně").fill(defect);
  await dialog.getByLabel(/Stroj nesmí jet/).click();
  await dialog.getByRole("button", { name: "Nahlásit závadu" }).click();
  await expect(page.getByText(/Závada nahlášena/)).toBeVisible();
  await expect(page.getByTestId("fleet-card").filter({ hasText: van })).toContainText(
    "Mimo provoz",
  );

  await visit(page, "/stroje/zavady", c);
  await page.getByPlaceholder("Hledat…").fill(defect);
  const row = page.getByRole("row").filter({ hasText: defect }).first();
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Vyřešit závadu" }).click();
  const resolve = page.getByRole("dialog", { name: "Vyřešit závadu" });
  await resolve.getByLabel("Jak se vyřešilo").fill("Vyměněno těsnění");
  await resolve.getByRole("button", { name: "Vyřešit", exact: true }).click();
  await expect(page.getByText("Vyřešeno, stroj je zpět v provozu.")).toBeVisible();

  await visit(page, "/stroje", c);
  await expect(page.getByTestId("fleet-card").filter({ hasText: van })).not.toContainText(
    "Mimo provoz",
  );
  expectClean(c, "závada");
});

test("náklady stroje na zakázku: provoz × sazba a palivo bez DPH sedí na kartě zakázky i v ekonomice", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/zakazky", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const jobRow = page.getByRole("row").filter({ hasText: jobTitle });
  await jobRow.hover();
  await jobRow.getByRole("button", { name: "Otevřít" }).click();
  const panel = page.getByTestId("record-view");
  await panel.getByRole("tab", { name: "Náklady", exact: true }).click();
  await panel.getByRole("radio", { name: "Stroje", exact: true }).click();
  await expect(panel).toContainText(van);
  // provoz: 150 km × 12 Kč = 1 800 Kč; palivo: 2 × 1 001 Kč s DPH 21 % = 2 × 827,27 = 1 654,54 Kč (zaokrouhleno po záznamech, stejně jako v nákladech zakázky)
  await expect(panel).toContainText("1 800 Kč");
  await expect(panel).toContainText(/1\s654,54\sKč/);

  await panel.getByRole("radio", { name: "Náklady", exact: true }).click();
  // celkem v ekonomice zakázky: provoz + palivo = 3 454,54 Kč (jiné náklady zakázka nemá)
  const header = panel.getByTestId("kpi-cost");
  await expect(header).toContainText(/3\s454,54\sKč/);
  expect(toMinor((await header.textContent()) ?? "")).toBe(345_454);
  expectClean(c, "náklady zakázky");
});
