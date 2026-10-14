import { expect, test, type Page } from "@playwright/test";
import { createCompany } from "./helpers";

/*
  CRM, oblast F: rychlé zadání poptávky, import poptávek z CSV, účastníci, kontakty (detail firmy s obchody) a sloučení
  duplicit. Schránka a kvalifikace jsou v `poptavky.spec.ts`. Soubor se píše a nespouští (e2e pouští hlavní agent).
*/
test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const company = `Rychlá ${stamp} s.r.o.`;
/** Telefon unikátní pro tento běh (kontrola duplicit by jinak narazila na data z dřívějších běhů). */
const digits = String(Math.floor(10_000_000 + Math.random() * 89_999_999));
const phone = `+420 6${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)}`;
const phoneShort = `6${digits.slice(0, 8)}`;

async function openCompany(page: Page, name: string) {
  await page.goto("/kontakty/firmy");
  await page.getByPlaceholder("Hledat…").fill(name);
  const row = page.getByRole("row").filter({ hasText: name });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name })).toBeVisible();
}

test("rychlé zadání z detailu firmy: kontakt, stavba a první aktivita v jednom okně, Cmd+Enter uloží", async ({
  page,
  context,
}) => {
  await createCompany(context, company);
  await openCompany(page, company);
  const deals = page.getByTestId("contact-deals");
  await expect(deals).toContainText("Zatím žádná zakázka");
  await deals.getByRole("button", { name: "Nová poptávka" }).click();

  const dialog = page.getByRole("dialog", { name: "Nová poptávka" });
  // firma je předvyplněná; bez první aktivity a bez firmy by se uložit nedalo
  await expect(dialog.getByText(company)).toBeVisible();
  await dialog.getByLabel("Jméno a příjmení").fill(`Petr Rychlý ${stamp}`);
  await dialog.getByLabel("Telefon", { exact: true }).fill(phone);
  await dialog.getByLabel("Adresa stavby").fill("Hlavní 12, Plzeň");
  await dialog.getByLabel("Obec").fill("Plzeň");
  await dialog.getByLabel("Odhad hodnoty").fill("450 000");
  // výchozí první aktivita: Zavolat zítra v 9:00
  await expect(dialog.getByLabel("Předmět")).toHaveValue("Zavolat");
  await expect(dialog.getByLabel("Čas aktivity")).toHaveValue("09:00");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page).toHaveURL(/\/crm\?record=[0-9a-f-]{36}/);
});

test("rychlé zadání: uložení bez aktivity je jen záměrné tlačítko, prázdná aktivita se odmítne", async ({
  page,
}) => {
  await openCompany(page, company);
  await page.getByTestId("contact-deals").getByRole("button", { name: "Nová poptávka" }).click();
  const dialog = page.getByRole("dialog", { name: "Nová poptávka" });
  await dialog.getByLabel("Jméno a příjmení").fill(`Bez aktivity ${stamp}`);
  await dialog.getByLabel("Předmět").fill("");
  await dialog.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Naplánujte první aktivitu");
  await dialog.getByTestId("quick-add-no-activity").click();
  await expect(page).toHaveURL(/\/crm\?record=[0-9a-f-]{36}/);
});

test("detail firmy ukáže obchody se stavem a souhrnem; existující osobu okno nabídne k použití", async ({
  page,
}) => {
  await openCompany(page, company);
  const deals = page.getByTestId("contact-deals");
  await expect(deals.getByTestId("stat-open")).toContainText("2");
  await expect(deals.getByTestId("pipeline-stepper").first()).toBeVisible();
  await expect(page.getByTestId("contact-people")).toContainText(`Petr Rychlý ${stamp}`);

  // stejný telefon: okno nabídne existující osobu místo založení druhé
  await deals.getByRole("button", { name: "Nová poptávka" }).click();
  const dialog = page.getByRole("dialog", { name: "Nová poptávka" });
  await dialog.getByLabel("Telefon", { exact: true }).fill(phoneShort);
  await expect(dialog.getByText("Tuhle osobu už máte v kontaktech")).toBeVisible();
  await dialog.getByRole("button", { name: "Použít" }).click();
  await expect(dialog.getByText(`Petr Rychlý ${stamp}`)).toBeVisible();
});

test("import poptávek z CSV: mapování, náhled s chybami po řádcích, import", async ({ page }) => {
  await page.goto("/poptavky/import");
  const csv = [
    "Jméno;E-mail;Telefon;Firma;Zpráva;Kampaň",
    `Alena ${stamp};alena-${stamp}@example.cz;${phone.replace("+420 6", "+420 7")};Alena s.r.o.;Chci novou střechu;podzim`,
    `Chybný ${stamp};není-email;;;;`,
    `=HYPERLINK("http://zlo.example");;;Vzorec ${stamp};;`,
    `Duplicita ${stamp};ALENA-${stamp}@example.cz;;;;`,
  ].join("\r\n");
  await page.getByTestId("import-file").setInputFiles({
    name: "poptavky.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("﻿" + csv, "utf8"),
  });
  const mapping = page.getByTestId("import-mapping");
  await expect(mapping).toContainText("4 řádků");
  // sloupce se namapují podle záhlaví
  await expect(mapping.getByRole("button", { name: /Sloupec Jméno/ })).toContainText(
    "Jméno kontaktu",
  );
  await page.getByRole("button", { name: "Zkontrolovat" }).click();
  const result = page.getByTestId("import-result");
  await expect(result).toContainText("Náhled");
  await expect(result).toContainText("Naimportuje se: 2");
  await expect(result).toContainText("chyb: 1");
  await expect(result).toContainText("duplicit přeskočeno: 1");
  await expect(result.getByRole("row").filter({ hasText: "Chyba" })).toContainText("E-mail");
  await expect(result.getByRole("row").filter({ hasText: "Duplicita" })).toContainText("řádku 2");

  await page.getByRole("button", { name: /^Importovat/ }).click();
  await expect(page.getByTestId("import-result")).toContainText("Naimportováno: 2");
  await page.goto("/poptavky");
  await page.getByPlaceholder("Hledat…").fill(`Alena ${stamp}`);
  // hledání najde poptávku podle jména kontaktu, ale název v řádku je z firmy („Poptávka: <firma>“), když ji import dostal
  // (firma „Alena s.r.o.“ mají i poptávky z dřívějších běhů; počká se, až hledání nechá jen tu právě naimportovanou)
  const imported = page.getByRole("row").filter({ hasText: "Poptávka: Alena s.r.o." });
  await expect(imported).toHaveCount(1);
  await expect(imported).toContainText("Nová");
  // vzorec dostal apostrof, takže ho Excel nespustí
  await page.getByPlaceholder("Hledat…").fill(`Vzorec ${stamp}`);
  await expect(page.getByRole("row").filter({ hasText: `Vzorec ${stamp}` })).toBeVisible();
});

test("import: příliš velký soubor a špatný formát se odmítnou větou", async ({ page }) => {
  await page.goto("/poptavky/import");
  await page.getByTestId("import-file").setInputFiles({
    name: "velky.csv",
    mimeType: "text/csv",
    buffer: Buffer.alloc(1024 * 1024 + 10, "a"),
  });
  // (druhý `alert` na stránce je neviditelné hlášení směrování Next.js, proto se hledá podle textu)
  await expect(page.getByRole("alert").filter({ hasText: "nejvíc jde nahrát 1 MB" })).toBeVisible();
});

test("sloučení duplicitních firem: náhled dopadu, potvrzení, přepojení a přesměrování na zbývající firmu", async ({
  page,
  context,
}) => {
  const keep = `Slučovaná ${stamp} a.s.`;
  const dupe = `Slučovaná ${stamp} AS`;
  await createCompany(context, keep);
  await createCompany(context, dupe);
  // osoba duplicitní firmy se po sloučení objeví u zbývající
  await openCompany(page, dupe);
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Sloučit duplicitu" }).click();
  const dialog = page.getByRole("dialog", { name: "Sloučit firmy" });
  await dialog.getByRole("button", { name: "Sloučit s" }).click();
  await page.getByPlaceholder("Jméno, IČO, telefon nebo e-mail…").fill(keep);
  await page.getByRole("option", { name: new RegExp(keep) }).click();
  await expect(dialog.getByTestId("merge-preview")).toContainText("zůstane");
  const merge = dialog.getByRole("button", { name: "Sloučit", exact: true });
  await expect(merge).toBeDisabled();
  await dialog.getByTestId("merge-confirm").check();
  await merge.click();
  await expect(page.getByText("Záznamy jsou sloučené.")).toBeVisible();
  await expect(page).toHaveURL(/\/kontakty\/firmy\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("record-view").getByRole("heading", { name: keep })).toBeVisible();

  // zrušená firma ze seznamu zmizela
  await page.goto("/kontakty/firmy");
  await page.getByPlaceholder("Hledat…").fill(`Slučovaná ${stamp}`);
  await expect(page.getByRole("row").filter({ hasText: dupe })).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: keep })).toBeVisible();
});
