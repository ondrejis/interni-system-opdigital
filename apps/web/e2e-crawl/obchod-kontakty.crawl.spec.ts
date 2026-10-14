import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";

/**
 * Kontakty: firmy a osoby od založení po smazání se Zpět; hledání bez diakritiky, filtr, uložený pohled,
 * vazba firma ↔ osoba ↔ zakázka. Všechna data si test vytvoří sám (unikátní `stamp`).
 */
test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const company = `Žluťoučký ${stamp} s.r.o.`;
const person = `Příliš ${stamp}`;
const job = `Kontakty zakázka ${stamp}`;

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const cell = (page: Page, text: string, attr: string) =>
  row(page, text).locator(`[data-attr="${attr}"]`);

test("firma: založení, inline editace města, hledání bez diakritiky, filtr a uložený pohled", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/kontakty/firmy", c);
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(company);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name: company })).toBeVisible();
  expectClean(c, "založení firmy");

  await visit(page, "/kontakty/firmy", c);
  // hledání bez diakritiky a bez ohledu na velikost písmen
  const search = page.getByPlaceholder("Hledat…");
  await search.fill(`zlutoucky ${stamp}`);
  await expect(row(page, company)).toBeVisible();
  await expect(page.getByTestId("table-footer")).toContainText("1 záznam");

  // inline editace města (tabulka se po hledání nejdřív ustálí)
  const city = cell(page, company, "city");
  await city.dblclick();
  await city.getByRole("textbox").fill("Cheb");
  await city.getByRole("textbox").press("Enter");
  await expect(city).toContainText("Cheb");
  expectClean(c, "inline editace");

  // filtr podle názvu a uložený pohled
  await search.fill("");
  await page.getByTestId("add-filter").click();
  await page.getByRole("option", { name: "Název" }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Název" }).fill(stamp);
  await page.getByRole("button", { name: "Hotovo" }).click();
  await expect(page.getByTestId("filter-chip")).toContainText(stamp);
  await expect(page.getByTestId("table-footer")).toContainText("1 záznam");
  await page.getByTestId("list-options").click();
  await page.getByRole("menuitem", { name: "Uložit jako pohled…" }).click();
  await page.getByLabel("Název pohledu").fill(`Pohled firem ${stamp}`);
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.getByRole("tab", { name: `Pohled firem ${stamp}` })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // pohled přežije obnovení
  await page.reload();
  await page.getByRole("tab", { name: `Pohled firem ${stamp}` }).click();
  await expect(page.getByTestId("table-footer")).toContainText("1 záznam");
  // odstranění pohledu po sobě
  await page.getByRole("button", { name: "Nastavení pohledu" }).click();
  await page.getByRole("menuitem", { name: "Smazat pohled" }).click();
  await page
    .getByRole("dialog", { name: "Smazat pohled" })
    .getByRole("button", { name: "Smazat" })
    .click();
  await expect(page.getByRole("tab", { name: `Pohled firem ${stamp}` })).toHaveCount(0);
  expectClean(c, "filtr a pohled");
});

test("osoba patří k firmě; firma ukáže osoby, zakázky a faktury", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/kontakty/osoby", c);
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(/Jméno|Název/)
    .first()
    .fill(person);
  await dialog.getByRole("button", { name: /Další pole/ }).click();
  await dialog.getByRole("button", { name: "Vybrat…" }).first().click();
  await page.getByPlaceholder("Hledat…").last().fill(stamp);
  await page.getByRole("option", { name: company }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: person }),
  ).toBeVisible();
  expectClean(c, "založení osoby");

  // zakázka pro firmu → v záložce Zakázky firmy
  await visit(page, "/zakazky", c);
  await page.getByTestId("create-record").click();
  const jd = page.getByRole("dialog");
  await jd.getByLabel(/Název/).fill(job);
  await jd.getByRole("button", { name: "Vybrat…" }).click();
  await page.getByPlaceholder("Hledat…").last().fill(stamp);
  await page.getByRole("option", { name: company }).click();
  await jd.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: job })).toBeVisible();

  await visit(page, "/kontakty/firmy", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await row(page, company).hover();
  await row(page, company).getByRole("button", { name: "Otevřít" }).click();
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name: company })).toBeVisible();
  await view.getByRole("tab", { name: "Zakázky" }).click();
  await expect(view).toContainText(job);
  await view.getByRole("tab", { name: "Faktury" }).click();
  await view.getByRole("tab", { name: "Poptávky" }).click();
  await view.getByRole("tab", { name: "Úkoly" }).click();
  await view.getByRole("tab", { name: "Soubory" }).click();
  await view.getByRole("tab", { name: "Aktivita" }).click();
  await view.getByRole("tab", { name: "Přehled" }).click();
  // osoba je vidět u firmy v záložce Osoby (stejný seznam s pevným filtrem na firmu)
  await view.getByRole("tab", { name: "Osoby" }).click();
  await expect(view.getByRole("row").filter({ hasText: person })).toBeVisible();
  expectClean(c, "záložky firmy");
});

test("smazání firmy a osoby jde vzít zpět", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/kontakty/osoby", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(row(page, person)).toBeVisible();
  await row(page, person).getByRole("checkbox").click();
  const bar = page.getByRole("region", { name: "Hromadné akce" });
  await bar.getByRole("button", { name: "Smazat" }).click();
  await expect(row(page, person)).toBeHidden();
  await page.getByRole("button", { name: "Zpět" }).click();
  await expect(row(page, person)).toBeVisible();
  // a znovu, tentokrát natrvalo (do koše; zpět už nikdo nepotřebuje)
  await row(page, person).getByRole("checkbox").click();
  await bar.getByRole("button", { name: "Smazat" }).click();
  await expect(row(page, person)).toBeHidden();
  expectClean(c, "smazání osoby");
});
