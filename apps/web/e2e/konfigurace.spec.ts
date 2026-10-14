import { expect, test, type Page } from "@playwright/test";
import { clickSubmenuItem } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const fieldLabel = `Číslo smlouvy ${stamp}`;
const fieldKey = `cislo_smlouvy_${stamp}`;
const company = `Konfigurace ${stamp} s.r.o.`;
const contractNo = `S-${stamp.toUpperCase()}-7`;

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const cell = (page: Page, text: string, attr: string) =>
  row(page, text).locator(`[data-attr="${attr}"]`);

async function showColumn(page: Page, label: string) {
  await page.getByTestId("list-options").click();
  await page.getByRole("menuitem", { name: "Sloupce" }).click();
  const item = page.getByRole("menuitemcheckbox", { name: label });
  if ((await item.getAttribute("aria-checked")) !== "true") await clickSubmenuItem(page, item);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
}

test("vlastní pole: založení v Nastavení se projeví v tabulce, filtru, řazení a hledání", async ({
  page,
}) => {
  await page.goto("/nastaveni/vlastni-pole");
  await page.getByRole("button", { name: /^Firmy/ }).click();
  await page.getByRole("button", { name: "Nové pole" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Název pole").fill(fieldLabel);
  await expect(dialog.getByLabel("Interní klíč")).toHaveValue(fieldKey);
  await dialog.getByRole("button", { name: "Přidat pole" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("field-row").filter({ hasText: fieldLabel })).toBeVisible();

  // firma s hodnotou v novém poli
  await page.goto("/kontakty/firmy");
  await page.getByTestId("create-record").click();
  await dialog.getByLabel(/Název/).fill(company);
  await dialog.getByLabel(/Název/).press("ControlOrMeta+Enter");
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: company }),
  ).toBeVisible();
  await page.goBack();
  await page.getByPlaceholder("Hledat…").fill(stamp);
  // tabulka se po hledání a po zapnutí sloupce ještě překresluje; úprava buňky smí začít až v ustáleném stavu
  await expect(page.getByTestId("table-footer")).toContainText("1 záznam");
  await showColumn(page, fieldLabel);
  const value = cell(page, company, `custom.${fieldKey}`);
  await expect(value).toBeVisible();
  await expect(page.getByTestId("table-footer")).toContainText("1 záznam");
  await value.dblclick();
  await expect(value.getByRole("textbox")).toBeFocused();
  await value.getByRole("textbox").fill(contractNo);
  await value.getByRole("textbox").press("Enter");
  await expect(value).toContainText(contractNo);

  // hledání v tabulce podle hodnoty vlastního pole
  await page.getByPlaceholder("Hledat…").fill(contractNo.toLowerCase());
  await expect(page.getByTestId("table-footer")).toContainText("1 záznam");
  await expect(row(page, company)).toBeVisible();

  // filtr podle vlastního pole
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(page.getByTestId("table-footer")).toContainText("1 záznam"); // tabulka se ustálí, než se otevře nabídka filtru
  await page.getByTestId("add-filter").click();
  await page.getByPlaceholder("Hledat podmínku…").fill(fieldLabel);
  await page.getByRole("option", { name: fieldLabel }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: fieldLabel }).fill("-7");
  await page.getByRole("button", { name: "Hotovo" }).click();
  await expect(page.getByTestId("filter-chip")).toContainText(fieldLabel);
  await expect(page.getByTestId("table-footer")).toContainText("1 záznam");

  // řazení z nabídky
  await page.getByTestId("list-options").click();
  await page.getByRole("menuitem", { name: "Řazení" }).click();
  await clickSubmenuItem(page, page.getByRole("menuitem", { name: fieldLabel }));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: new RegExp(fieldLabel) })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );

  // detail záznamu: vlastní pole je v panelu atributů s hodnotou a jde upravit
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await row(page, company).hover();
  await row(page, company).getByRole("button", { name: "Otevřít" }).click();
  await expect(page.getByTestId("attributes-panel")).toContainText(fieldLabel);
  await expect(page.getByTestId("attributes-panel")).toContainText(contractNo);

  // Cmd+K najde firmu podle hodnoty vlastního pole
  await page.goto("/");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder(/Hledat/).fill(contractNo.toLowerCase());
  await expect(page.getByRole("option", { name: new RegExp(company) })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("vlastní pole: skrytí pole ho odstraní z tabulky, hodnota zůstane a po zobrazení se vrátí", async ({
  page,
}) => {
  await page.goto("/nastaveni/vlastni-pole");
  await page.getByRole("button", { name: /^Firmy/ }).click();
  await page.getByRole("button", { name: `Upravit pole ${fieldLabel}` }).click();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: /Skrýt pole/ })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByTestId("field-row").filter({ hasText: fieldLabel }).getByText("Skryté"),
  ).toBeVisible();

  await page.goto("/kontakty/firmy");
  await page.getByTestId("list-options").click();
  await page.getByRole("menuitem", { name: "Sloupce" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: fieldLabel })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await page.goto("/nastaveni/vlastni-pole");
  await page.getByRole("button", { name: /^Firmy/ }).click();
  await page.getByRole("button", { name: `Upravit pole ${fieldLabel}` }).click();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: /Skrýt pole/ })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByTestId("field-row").filter({ hasText: fieldLabel }).getByText("Skryté"),
  ).toHaveCount(0);
  await page.goto("/kontakty/firmy");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await showColumn(page, fieldLabel);
  await expect(cell(page, company, `custom.${fieldKey}`)).toContainText(contractNo);
});

test("stavy: nový stav se objeví na kanbanu poptávek a po smazání zmizí; fáze zakázek jsou pokryté", async ({
  page,
}) => {
  const stage = `Konfigurace ${stamp}`;
  await page.goto("/nastaveni/stavy");
  await page.getByRole("radio", { name: "Zakázky" }).click();
  await expect(page.getByTestId("phase-list").getByText("Bez stavu")).toHaveCount(0);
  await page.getByRole("radio", { name: "Poptávky" }).click();
  await page.getByRole("button", { name: "Přidat stav" }).click();
  await page.getByLabel("Název stavu").fill(stage);
  await page.getByRole("dialog").getByRole("button", { name: "Přidat stav" }).click();
  await expect(page.getByTestId("stage-row").filter({ hasText: stage })).toBeVisible();

  await page.goto("/poptavky");
  await page.getByRole("button", { name: "Kanban" }).click();
  await expect(page.getByRole("region", { name: stage, exact: true })).toBeVisible();

  await page.goto("/nastaveni/stavy");
  await page.getByRole("radio", { name: "Poptávky" }).click();
  await page.getByRole("button", { name: `Smazat stav ${stage}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat stav" }).click();
  await expect(page.getByTestId("stage-row").filter({ hasText: stage })).toHaveCount(0);

  // poslední stav fáze zakázky smazat nejde: hláška řekne proč
  await page.getByRole("radio", { name: "Zakázky" }).click();
  await page.getByRole("button", { name: "Smazat stav Pozastaveno" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat stav" }).click();
  await expect(
    page.getByText(/Fáze „Pozastaveno“ musí mít aspoň jeden stav|používá/).first(),
  ).toBeVisible();
});

test("sazby DPH: nová sazba je vidět v nabídce, výchozí sazba jde změnit a vrátit", async ({
  page,
}) => {
  const label = `Zkušební ${stamp}`;
  await page.goto("/nastaveni/dph");
  await page.getByRole("button", { name: "Nová sazba" }).click();
  await page.getByLabel("Název").fill(label);
  await page.getByLabel("Sazba (%)").fill("9");
  await page.getByRole("dialog").getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const newRow = page.getByTestId("vat-row").filter({ hasText: label });
  await expect(newRow).toBeVisible();

  // zvolená výchozí sazba se zobrazí a pak se vrátí základní
  await newRow.getByRole("button", { name: "Nastavit jako výchozí" }).click();
  await expect(newRow.getByText("Výchozí")).toBeVisible();
  await page
    .getByTestId("vat-row")
    .filter({ hasText: "Základní" })
    .getByRole("button", { name: "Nastavit jako výchozí" })
    .click();
  await expect(
    page.getByTestId("vat-row").filter({ hasText: "Základní" }).getByText("Výchozí"),
  ).toBeVisible();

  await newRow.getByRole("button", { name: `Smazat sazbu ${label}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat sazbu" }).click();
  await expect(newRow).toHaveCount(0);
});

test("číselné řady: změna vzoru platí od dalšího dokladu; úklid zpět", async ({ page }) => {
  await page.goto("/nastaveni/rady");
  const series = page.getByTestId("series-row").filter({ hasText: "Dobropisy" });
  const original = (await series.locator(".font-mono").first().innerText()).trim();
  await series.getByRole("button", { name: /Upravit vzor řady/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Vzor").fill("DOB-{YYYY}-{NNNNN}");
  await expect(dialog.getByTestId("series-preview")).toContainText(/DOB-\d{4}-\d{5}/);
  await dialog.getByRole("button", { name: "Uložit" }).click();
  await expect(series).toContainText("DOB-{YYYY}-{NNNNN}");
  await expect(series).toContainText(/DOB-\d{4}-\d{5}/);

  await series.getByRole("button", { name: /Upravit vzor řady/ }).click();
  await dialog.getByLabel("Vzor").fill(original);
  await dialog.getByRole("button", { name: "Uložit" }).click();
  await expect(dialog).toBeHidden();
  await expect(series).toContainText(original);
});

test("moduly: přehled zapnutých modulů s vysvětlením, jak modul zapnout", async ({ page }) => {
  await page.goto("/nastaveni/moduly");
  await expect(page.getByTestId("module-zakazky")).toContainText("Zapnuto");
  await expect(page.getByText("Jak zapnout nebo vypnout modul")).toBeVisible();
});

test("úklid: vlastní pole z testu se smaže a jde obnovit tlačítkem Zpět", async ({ page }) => {
  await page.goto("/nastaveni/vlastni-pole");
  await page.getByRole("button", { name: /^Firmy/ }).click();
  await page.getByRole("button", { name: `Smazat pole ${fieldLabel}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat pole" }).click();
  await expect(page.getByTestId("field-row").filter({ hasText: fieldLabel })).toHaveCount(0);
  await page.getByRole("button", { name: "Zpět" }).click();
  await expect(page.getByTestId("field-row").filter({ hasText: fieldLabel })).toBeVisible();
  await page.getByRole("button", { name: `Smazat pole ${fieldLabel}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat pole" }).click();
  await expect(page.getByTestId("field-row").filter({ hasText: fieldLabel })).toHaveCount(0);
});
