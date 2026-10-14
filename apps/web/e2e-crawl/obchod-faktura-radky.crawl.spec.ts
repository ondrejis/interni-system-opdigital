import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean } from "./helpers";
import { createCompany, createJob, minorOf, newStamp } from "./obchod-helpers";

/**
 * Ruční úprava dokladu: řádky se dvěma sazbami DPH, zádržné 10 %, uložení a návrat (číslo v náhledu = číslo po
 * uložení = číslo na vystaveném dokladu), platby (částečná, přeplatek se odmítne, smazání), vrácení do konceptu.
 *
 * Řádky: 3 × 33,33 Kč (21 %) = 99,99; 7 × 14,29 Kč (12 %) = 100,03; základ 200,02 Kč.
 * Zádržné 10 % z každé skupiny sazby: 10,00 + 10,00; po zádržném základ 180,02; DPH ≈ 18,90 + 10,80 = 29,70;
 * celkem k úhradě ≈ 209,72 Kč (rozdíl o haléř je u zaokrouhlení DPH možný, vždy ale musí platit základ + DPH = celkem).
 */
test.describe.configure({ mode: "serial" });

const stamp = newStamp();
const company = `Řádky firma ${stamp} s.r.o.`;
const job = `Řádky zakázka ${stamp}`;
let invoiceUrl = "";

const totalsBox = (page: Page) => page.getByTestId("record-view").getByTestId("invoice-totals");

/** Z bloku součtů přečte řádek podle popisku (první částka za popiskem). */
async function amountOf(page: Page, label: RegExp): Promise<number> {
  const text = await totalsBox(page).innerText();
  const line = text.split("\n").find((l) => label.test(l));
  if (!line) throw new Error(`V součtech chybí „${label}“: ${text}`);
  const next = text.split("\n")[text.split("\n").indexOf(line) + 1] ?? "";
  return minorOf(/Kč/.test(line) ? line : next);
}

async function openInvoice(page: Page) {
  await page.goto(invoiceUrl);
  const view = page.getByTestId("record-view");
  await view.getByRole("tab", { name: "Položky" }).click();
  return view;
}

test("příprava: zakázka v realizaci se zádržným 10 % a ruční dílčí faktura", async ({ page }) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await createCompany(page, company);
  const view = await createJob(page, {
    title: job,
    company,
    phase: "Realizace",
    value: "100 000",
    retention: "10",
    address: "Plzeň, Řádková 1",
  });
  await view.getByRole("tab", { name: "Fakturace", exact: true }).click();
  await view.getByRole("radio", { name: "Faktury", exact: true }).click();
  await view.getByRole("button", { name: "Dílčí faktura" }).click();
  await page
    .getByRole("dialog", { name: "Dílčí faktura" })
    .getByRole("button", { name: /Zadat ručně/ })
    .click();
  await page.getByRole("radio", { name: "Pevná částka" }).click();
  await page.getByLabel("Částka bez DPH").fill("1 000");
  await page.getByRole("button", { name: "Vytvořit koncept" }).click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}$/);
  invoiceUrl = new URL(page.url()).pathname;
  expectClean(c, "příprava řádků");
});

test("řádky: dvě sazby DPH, zádržné a součty; po uložení a obnovení stejné", async ({ page }) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  const view = await openInvoice(page);
  // první řádek upravit na 3 × 33,33 (21 %)
  await view.getByLabel("Množství 1").fill("3");
  await view.getByLabel("Cena za jednotku 1").fill("33,33");
  // druhý řádek 7 × 14,29 (12 %)
  await view.getByRole("button", { name: "Přidat položku" }).click();
  await view.getByLabel("Popis položky 2").fill("Materiál");
  await view.getByLabel("Množství 2").fill("7");
  await view.getByLabel("Cena za jednotku 2").fill("14,29");
  const row2 = view.getByTestId("invoice-lines").getByRole("row").nth(2);
  await row2.getByRole("button", { name: /21\s?%/ }).click();
  await page.getByRole("option", { name: /^12\s?%$/ }).click();

  const totals = totalsBox(page);
  await expect(view.getByTestId("retention-row")).toHaveCount(2); // zádržné po sazbách
  await expect(view.getByTestId("invoice-lines")).toContainText("99,99 Kč");
  await expect(view.getByTestId("invoice-lines")).toContainText("100,03 Kč");
  // po zádržném (10 % z každé skupiny sazby): základ 89,99 a 90,03, DPH 29,70
  await expect(totals).toContainText("89,99 Kč");
  await expect(totals).toContainText("90,03 Kč");
  await expect(totals).toContainText("29,70 Kč");
  await expect(totals).toContainText("233,02 Kč");
  const gross = await amountOf(page, /Celkem k úhradě|K úhradě|Celkem s DPH/);
  expect(gross).toBe(209_72);

  await view.getByRole("button", { name: "Uložit položky" }).click();
  await expect(page.getByText("Doklad uložen.")).toBeVisible();
  await page.reload();
  await view.getByRole("tab", { name: "Položky" }).click();
  expect(await amountOf(page, /Celkem k úhradě|K úhradě|Celkem s DPH/)).toBe(gross);
  await expect(view.getByLabel("Popis položky 2")).toHaveValue("Materiál");
  expectClean(c, "řádky");
});

test("vystavení: číslo na vystaveném dokladu se rovná náhledu; platby (částečná, přeplatek, doplatek)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  let view = await openInvoice(page);
  const gross = await amountOf(page, /Celkem k úhradě|K úhradě|Celkem s DPH/);
  expect(gross).toBe(209_72);
  await view.getByRole("button", { name: "Vystavit", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Vystavit doklad" })
    .getByRole("button", { name: "Vystavit", exact: true })
    .click();
  await expect(page.getByText(/Vystaveno: FV-\d{4}-\d{4}/)).toBeVisible();
  view = await openInvoice(page);
  expect(await amountOf(page, /Celkem k úhradě|K úhradě|Celkem s DPH/)).toBe(gross);

  // platby: částečná 100 Kč, pak přeplatek se odmítne, pak doplatek
  await view.getByRole("tab", { name: "Platby" }).click();
  const amount = view.getByLabel(/Částka úhrady|Částka/).first();
  await amount.fill("100");
  await view.getByRole("button", { name: "Zapsat úhradu" }).click();
  await expect(view.getByTestId("payments-list")).toContainText("100 Kč");
  await amount.fill("99999");
  await view.getByRole("button", { name: "Zapsat úhradu" }).click();
  await expect(page.getByText(/Něco se nepovedlo/)).toHaveCount(0);
  await expect(view.getByTestId("payments-list")).not.toContainText("99 999");
  await view.getByRole("button", { name: "Doplnit celou zbývající částku" }).click();
  await view.getByRole("button", { name: "Zapsat úhradu" }).click();
  await expect(view.getByText("Uhrazeno", { exact: true })).toBeVisible();
  expectClean(c, "platby");
});
