import { expect, test, type Page } from "@playwright/test";
import { pickCompany } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const job = `Náklady ${stamp}`;
const invoiceNo = `FV-${stamp}`;

/** Otevře detail zakázky ze seznamu a přepne na záložku Náklady (skupina) a její podzáložku. */
async function openCosts(page: Page, sub: string) {
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: job });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  const view = page.getByTestId("record-view");
  await view.getByRole("tab", { name: "Náklady", exact: true }).click();
  await view.getByRole("radio", { name: sub, exact: true }).click();
  return view;
}

test("příprava: zakázka v realizaci", async ({ page }) => {
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(job);
  await pickCompany(page, dialog);
  await dialog.getByRole("button", { name: "Poptávka" }).click();
  await page.getByRole("option", { name: "Realizace" }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: job })).toBeVisible();
});

test("ruční náklad je v seznamu jako nespárovaný a v Přehledu nákladů", async ({ page }) => {
  const view = await openCosts(page, "Náklady");
  await view.getByRole("button", { name: "Přidat náklad" }).click();
  const dialog = page.getByRole("dialog", { name: "Přidat náklad" });
  await dialog.getByRole("button", { name: "Vybrat datum" }).click();
  await page.locator("td[data-day] button").first().click();
  await dialog.getByLabel("Za co náklad je").fill("Kontejner na suť");
  await dialog.getByLabel("Částka nákladu bez DPH").fill("4 000");
  await dialog.getByRole("button", { name: "Přidat náklad" }).click();
  const list = view.getByTestId("costs-tab");
  await expect(list).toContainText("Kontejner na suť");
  await expect(list).toContainText("4 000 Kč");
  await expect(list).toContainText("nespárováno 1");

  await view.getByRole("radio", { name: "Přehled nákladů" }).click();
  await expect(view.getByTestId("unpaired-costs")).toContainText("Nespárované náklady: 1");
  await expect(view.getByTestId("cost-overview")).toContainText("Skutečné náklady");
});

test("objednávka: koncept → schválení a zamčení → přijetí", async ({ page }) => {
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
  await expect(panel).toContainText("Ke schválení");
  await panel.getByRole("button", { name: "Schválit" }).click();
  await expect(panel).toContainText("Schváleno");
  await expect(panel).toContainText("Zamčeno");
  // zamčenou objednávku nejde upravit, jen vrátit do konceptu
  await expect(panel.getByRole("button", { name: "Upravit" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Přijmout zboží" }).click();
  await expect(panel).toContainText("Přijato");
  await page.keyboard.press("Escape");
  await expect(view.getByTestId("orders-tab")).toContainText("Otevřený závazek: 25 000 Kč");
});

test("přijatá faktura: rozpad, schválení, vstup do nákladů a odmítnutí duplicity", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const view = await openCosts(page, "Přijaté faktury");
  const add = async () => {
    await view.getByRole("button", { name: "Přidat fakturu" }).click();
    const dialog = page.getByRole("dialog", { name: "Nová přijatá faktura" });
    await dialog.getByLabel("Číslo dokladu dodavatele").fill(invoiceNo);
    await pickCompany(page, dialog, "Dodavatel", true);
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
  await expect(panel).toContainText("Ke schválení");
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

  // schválená faktura je v seznamu nákladů (základ bez DPH) a čeká na spárování s oddílem
  await view.getByRole("radio", { name: "Náklady", exact: true }).click();
  const list = view.getByTestId("costs-tab");
  await expect(list).toContainText("Přijatá faktura");
  await expect(list).toContainText(invoiceNo);
  await expect(list).toContainText("10 000 Kč");
  await expect(list).toContainText("nespárováno 2");
});

test("seznam přijatých faktur ve Fakturaci", async ({ page }) => {
  await page.goto("/fakturace/prijate");
  await page.getByPlaceholder("Hledat…").fill(invoiceNo);
  await expect(page.getByRole("row").filter({ hasText: invoiceNo })).toBeVisible();
});
