import { expect, test, type Locator, type Page } from "@playwright/test";
import { collectErrors, expectClean } from "./helpers";
import { addFirstItem, createCompany, createJob, newStamp, openJob } from "./obchod-helpers";

/**
 * Náklady zakázky: ruční náklad, párování na oddíl, objednávka se schválením a přijetím, náklad krytý objednávkou,
 * přijatá faktura s rozpadem a odmítnutou duplicitou, přehled plán vs skutečnost a hlavička zakázky.
 *
 * Rozpočet: Beton 10 × 600 / 1 000 v oddílu Zdivo (plán nákladu 6 000, prodej 10 000, smluvní cena 10 000).
 * Náklady: ruční 4 000 + ruční krytý objednávkou 5 000 + přijatá faktura 10 000 = 19 000 Kč.
 * Objednávka 25 000 Kč; po nákladu 5 000 s objednávkou zůstává otevřený závazek 20 000 Kč.
 */
test.describe.configure({ mode: "serial" });

const stamp = newStamp();
const company = `Náklady firma ${stamp} s.r.o.`;
const job = `Náklady zakázka ${stamp}`;
const invoiceNo = `FP-${stamp}`;

const kpi = (view: Locator, id: "contract" | "cost" | "margin" | "invoiced") =>
  view.getByTestId(`kpi-${id}`);

async function openCosts(page: Page, sub: string) {
  const view = await openJob(page, stamp);
  await view.getByRole("tab", { name: "Náklady", exact: true }).click();
  await view.getByRole("radio", { name: sub, exact: true }).click();
  return view;
}

async function pickDate(page: Page, dialog: Locator) {
  await dialog.getByRole("button", { name: "Vybrat datum" }).click();
  await page.locator("td[data-day] button").first().click();
}

test("příprava: zakázka v realizaci s rozpočtem Zdivo / Beton", async ({ page }) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await createCompany(page, company);
  const view = await createJob(page, { title: job, company, phase: "Realizace", value: "10 000" });
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  await addFirstItem(page, view, {
    section: "Zdivo",
    item: "Beton",
    qty: "10",
    cost: "600",
    price: "1000",
  });
  await expect(kpi(view, "cost")).toContainText("z plánu 6 000 Kč");
  expectClean(c, "příprava nákladů");
});

test("ruční náklad: nespárovaný, pak spárovaný na oddíl; hlavička a přehled sedí", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  const view = await openCosts(page, "Náklady");
  await view.getByRole("button", { name: "Přidat náklad" }).click();
  const dialog = page.getByRole("dialog", { name: "Přidat náklad" });
  await pickDate(page, dialog);
  await dialog.getByLabel("Za co náklad je").fill("Kontejner na suť");
  await dialog.getByLabel("Částka nákladu bez DPH").fill("4 000");
  await dialog.getByRole("button", { name: "Přidat náklad" }).click();
  const list = view.getByTestId("costs-tab");
  await expect(list).toContainText("Kontejner na suť");
  await expect(list).toContainText("4 000 Kč");
  await expect(list).toContainText("nespárováno 1");
  await expect(kpi(view, "cost")).toContainText("4 000 Kč");

  // párování na oddíl rozpočtu přímo v řádku
  await list.getByLabel("Oddíl rozpočtu pro náklad Kontejner na suť").click();
  await page.getByRole("option", { name: /Zdivo/ }).click();
  await expect(list).not.toContainText("nespárováno");

  await view.getByRole("radio", { name: "Přehled nákladů" }).click();
  const overview = view.getByTestId("cost-overview");
  await expect(overview).toContainText("Plánovaný náklad");
  await expect(overview).toContainText("6 000 Kč");
  await expect(overview).toContainText("Skutečné náklady");
  await expect(overview).toContainText("4 000 Kč");
  // oddíl Zdivo: 4 000 z 6 000
  await expect(overview.getByTestId("plan-row").filter({ hasText: "Zdivo" })).toContainText(
    "4 000 Kč",
  );
  expectClean(c, "ruční náklad");
});

test("objednávka: koncept → schválení a zamčení → přijetí; náklad s objednávkou snižuje závazek", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  const view = await openCosts(page, "Objednávky");
  await view.getByRole("button", { name: "Nová objednávka" }).click();
  const dialog = page.getByRole("dialog", { name: "Nová objednávka" });
  await dialog.getByLabel("Název objednávky").fill("Beton C25");
  await dialog.getByLabel(/nebo dodavatel textem/).fill("Betonárna Plzeň");
  await dialog.getByLabel("Popis řádku 1").fill("Beton C25/30");
  await dialog.getByLabel("Množství řádku 1").fill("10");
  await dialog.getByLabel("Jednotka řádku 1").fill("m3");
  await dialog.getByLabel("Cena za jednotku řádku 1").fill("2 500");
  await dialog.getByRole("button", { name: "Založit objednávku" }).click();
  const panel = page.getByTestId("order-panel");
  await expect(panel).toContainText("OBJ-");
  await expect(panel).toContainText("Koncept");
  await expect(panel).toContainText("25 000 Kč");
  await panel.getByRole("button", { name: "Odeslat ke schválení" }).click();
  await expect(panel).toContainText(/Ke schválení|Schváleno/);
  if ((await panel.innerText()).includes("Ke schválení"))
    await panel.getByRole("button", { name: "Schválit" }).click();
  await expect(panel).toContainText("Schváleno");
  await expect(panel).toContainText("Zamčeno");
  await expect(panel.getByRole("button", { name: "Upravit" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Přijmout zboží" }).click();
  await expect(panel).toContainText("Přijato");
  await page.keyboard.press("Escape");
  await expect(view.getByTestId("orders-tab")).toContainText("Otevřený závazek: 25 000 Kč");

  // ruční náklad 5 000 Kč krytý objednávkou: závazek klesne na 20 000 Kč
  await view.getByRole("radio", { name: "Náklady", exact: true }).click();
  await view.getByRole("button", { name: "Přidat náklad" }).click();
  const cost = page.getByRole("dialog", { name: "Přidat náklad" });
  await pickDate(page, cost);
  await cost.getByLabel("Za co náklad je").fill("Beton – první dodávka");
  await cost.getByLabel("Částka nákladu bez DPH").fill("5 000");
  await cost.getByLabel("Objednávka", { exact: true }).click();
  await page.getByRole("option", { name: /OBJ-/ }).click();
  await cost.getByRole("button", { name: "Přidat náklad" }).click();
  await expect(view.getByTestId("costs-tab")).toContainText("Beton – první dodávka");
  await view.getByRole("radio", { name: "Objednávky", exact: true }).click();
  await expect(view.getByTestId("orders-tab")).toContainText("Otevřený závazek: 20 000 Kč");
  await view.getByRole("radio", { name: "Přehled nákladů" }).click();
  await expect(view.getByTestId("cost-overview")).toContainText("20 000 Kč"); // Objednáno, nepokryto
  expectClean(c, "objednávka");
});

test("přijatá faktura: rozpad, schválení, úhrada, odmítnutá duplicita; náklady a marže v hlavičce", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  const view = await openCosts(page, "Přijaté faktury");
  const add = async () => {
    await view.getByRole("button", { name: "Přidat fakturu" }).click();
    const dialog = page.getByRole("dialog", { name: "Nová přijatá faktura" });
    await dialog.getByLabel("Číslo dokladu dodavatele").fill(invoiceNo);
    await dialog.getByRole("button", { name: "Dodavatel", exact: true }).click();
    await page.getByPlaceholder("Hledat…").last().fill(company);
    await page.getByRole("option", { name: company }).click();
    await dialog.getByLabel("Základ bez DPH").fill("10 000");
    await dialog.getByLabel("Celkem s DPH").fill("12 100");
    await dialog.getByLabel("Základ řádku 1").fill("10 000");
    return dialog;
  };
  let dialog = await add();
  await dialog.getByRole("button", { name: "Založit fakturu" }).click();
  const panel = page.getByTestId("received-panel");
  await expect(panel).toContainText(invoiceNo);
  await expect(panel).toContainText("Koncept");
  await expect(panel).toContainText("12 100 Kč");
  await panel.getByRole("button", { name: "Odeslat ke schválení" }).click();
  await expect(panel).toContainText(/Ke schválení|Schváleno/);
  if ((await panel.innerText()).includes("Ke schválení"))
    await panel.getByRole("button", { name: "Schválit" }).click();
  await expect(panel).toContainText("Schváleno");
  await expect(panel).toContainText("Zamčeno");
  await panel.getByRole("button", { name: "Označit jako uhrazenou" }).click();
  await page
    .getByRole("dialog", { name: "Označit jako uhrazenou" })
    .getByRole("button", { name: "Uhrazeno" })
    .click();
  await expect(panel).toContainText("Uhrazeno");
  const detail = page.getByRole("dialog", { name: "Přijatá faktura", exact: true });
  await detail.getByRole("button", { name: "Zavřít", exact: true }).click();
  await expect(detail).toBeHidden();

  // stejný dodavatel a číslo: duplicita se odmítne
  dialog = await add();
  await dialog.getByRole("button", { name: "Založit fakturu" }).click();
  await expect(dialog).toContainText("už v systému je");
  await page.keyboard.press("Escape");

  // faktura je v nákladech jako základ bez DPH a čeká na spárování
  await view.getByRole("radio", { name: "Náklady", exact: true }).click();
  const list = view.getByTestId("costs-tab");
  await expect(list).toContainText(invoiceNo);
  await expect(list).toContainText("10 000 Kč");
  await expect(list).toContainText("nespárováno 2");

  // hlavička: náklady 4 000 + 5 000 + 10 000 = 19 000 Kč (bez DPH), plán 6 000 Kč, marže 10 000 − 19 000
  await expect(kpi(view, "cost")).toContainText("19 000 Kč");
  await expect(kpi(view, "cost")).toContainText("z plánu 6 000 Kč");
  await expect(kpi(view, "margin")).toContainText("9 000 Kč");
  await expect(view.getByTestId("job-health")).toContainText("Problém"); // čerpání nad 100 %
  await view.getByRole("radio", { name: "Přehled nákladů" }).click();
  await expect(view.getByTestId("cost-overview")).toContainText("19 000 Kč");

  // seznam přijatých faktur ve Fakturaci
  await page.goto("/fakturace/prijate");
  await page.getByPlaceholder("Hledat…").fill(invoiceNo);
  await expect(page.getByRole("row").filter({ hasText: invoiceNo })).toBeVisible();
  expectClean(c, "přijatá faktura");
});

test("rozpad nákladu na dva oddíly sedí na haléř; změna částky rozpad zneplatní a ukáže nespárováno; smazání nákladu", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  let view = await openJob(page, stamp);
  // druhý oddíl rozpočtu
  await view.getByRole("tab", { name: "Rozpočet", exact: true }).click();
  await view.getByRole("button", { name: "Další akce rozpočtu" }).click();
  await page.getByRole("menuitem", { name: "Přidat oddíl" }).click();
  await expect(view.getByTestId("budget-grid").getByRole("textbox")).toBeFocused();
  await page.keyboard.type("Omítky");
  await page.keyboard.press("Enter");
  await expect(view.getByTestId("budget-grid")).toContainText("Omítky");

  view = await openCosts(page, "Náklady");
  await view.getByRole("button", { name: "Přidat náklad" }).click();
  const dialog = page.getByRole("dialog", { name: "Přidat náklad" });
  await pickDate(page, dialog);
  await dialog.getByLabel("Za co náklad je").fill("Rozdělený náklad");
  await dialog.getByLabel("Částka nákladu bez DPH").fill("1 000,01");
  await dialog.getByRole("button", { name: "Přidat náklad" }).click();
  const list = view.getByTestId("costs-tab");
  await expect(list).toContainText("Rozdělený náklad");

  const costRow = list.getByRole("row").filter({ hasText: "Rozdělený náklad" });
  await costRow.hover();
  await costRow.getByRole("button", { name: "Rozdělit náklad na víc oddílů" }).click();
  const split = page.getByRole("dialog", { name: "Rozdělit náklad na oddíly" });
  await split.getByLabel("Oddíl části 1").click();
  await page.getByRole("option", { name: /Zdivo/ }).click();
  await split.getByLabel("Částka části 1").fill("600");
  await split.getByLabel("Oddíl části 2").click();
  await page.getByRole("option", { name: /Omítky/ }).click();
  await split.getByLabel("Částka části 2").fill("400");
  // chybí 0,01 Kč: rozpad nejde uložit
  await expect(split).toContainText("Zbývá rozdělit 0,01 Kč");
  await expect(split.getByRole("button", { name: "Uložit rozpad" })).toBeDisabled();
  await split.getByLabel("Částka části 2").fill("400,01");
  await expect(split).toContainText("Součet sedí");
  await split.getByRole("button", { name: "Uložit rozpad" }).click();
  await expect(page.getByText("Náklad je rozdělený.")).toBeVisible();
  await expect(list).toContainText("Rozpad na 2 oddíly");

  // přehled nákladů po oddílech: Omítky mají 400,01 Kč
  await view.getByRole("radio", { name: "Přehled nákladů" }).click();
  await expect(
    view.getByTestId("cost-overview").getByTestId("plan-row").filter({ hasText: "Omítky" }),
  ).toContainText("400,01 Kč");

  // změna částky zdroje: rozpad přestane sedět, náklad je zase nespárovaný
  await view.getByRole("radio", { name: "Náklady", exact: true }).click();
  const row = list.getByRole("row").filter({ hasText: "Rozdělený náklad" });
  await row.hover();
  await row
    .getByRole("button", { name: /Upravit/ })
    .first()
    .click();
  const edit = page.getByRole("dialog", { name: "Upravit náklad" });
  await edit.getByLabel("Částka nákladu bez DPH").fill("1 500");
  await edit
    .getByRole("button", { name: /Uložit|Přidat náklad/ })
    .last()
    .click();
  await expect(edit).toBeHidden();
  await expect(list).toContainText(/nespárováno/);
  await expect(page.getByText(/Něco se nepovedlo/)).toHaveCount(0);

  // smazání nákladu (potvrzení)
  await row.hover();
  await row.getByRole("button", { name: "Smazat náklad Rozdělený náklad" }).click();
  await page
    .getByRole("dialog", { name: "Smazat náklad?" })
    .getByRole("button", { name: "Smazat" })
    .click();
  await expect(list).not.toContainText("Rozdělený náklad");
  expectClean(c, "rozpad nákladu");
});
