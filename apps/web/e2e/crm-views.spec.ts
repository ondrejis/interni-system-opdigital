import { expect, test, type Locator, type Page } from "@playwright/test";
import { pickCompany } from "./helpers";

/*
  CRM, oblast E (docs/CRM.md): pohledy Seznam, Prognóza a Archiv na stránce /crm, uložené pohledy a navržené podmínky filtru
  a stránka „Moje dnešní práce“ (/crm/dnes). Testy jedou přes skutečné UI a databázi; obchod si vytvoří první test.
*/

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const deal = `Obchod ${stamp}`;
const inquiry = `Poptávka ${stamp}`;
const quickDeal = `Rychlý obchod ${stamp}`;
const forecastDeal = `Prognóza obchod ${stamp}`;

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

/**
 * Rychlé zadání obchodu bez první aktivity tlačítkem `open` (na stránce CRM nebo Moje dnešní práce). Vlastníkem je výchozí
 * přihlášený uživatel, a ten je pro každý běh testů nový, takže „moje“ obchody (filtr vlastníka, Moje dnešní práce) nezávisí
 * na datech z dřívějších běhů. Obchod založený přes /zakazky vlastníka nemá.
 */
async function quickAddOwnDeal(page: Page, open: Locator, title: string) {
  await open.click();
  const quick = page.getByRole("dialog", { name: "Nová poptávka" });
  await quick.getByLabel("Jméno a příjmení").fill(`Kontakt ${stamp}`);
  await quick.getByLabel("Název", { exact: true }).fill(title);
  await quick.getByLabel("Předmět").fill("");
  await quick.getByRole("button", { name: "Uložit", exact: true }).click();
  await quick.getByTestId("quick-add-no-activity").click();
  await expect(page.getByTestId("record-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("record-dialog")).toBeHidden();
}

test("vznik obchodu: nová zakázka je v seznamu CRM mezi otevřenými", async ({ page }) => {
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(deal);
  await pickCompany(page, dialog);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: deal })).toBeVisible();

  await page.goto("/crm?zobrazeni=seznam");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(page.getByRole("row").filter({ hasText: deal })).toBeVisible();
});

test("seznam: výchozí pohledy z seedu jsou seskupené a filtry čištění dat fungují", async ({
  page,
}) => {
  await page.goto("/crm?zobrazeni=seznam");
  // nejčastější pohledy jsou záložky, ostatní jedna nabídka po skupinách
  const tabs = page.getByRole("tablist", { name: "Pohledy" });
  for (const name of ["Otevřené obchody", "Moje otevřené", "Bez další aktivity", "Zhnilé"])
    await expect(tabs.getByRole("tab", { name })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: "Prohrané za čtvrtletí" })).toHaveCount(0);

  const menu = page.getByTestId("views-menu");
  await menu.click();
  const list = page.getByRole("menu");
  for (const group of ["Moje", "Stav obchodu", "Čištění dat"])
    await expect(list.getByText(group, { exact: true })).toBeVisible();
  for (const name of [
    "Uzavření tento měsíc",
    "Prohrané za čtvrtletí",
    "Bez úpravy 90 dní",
    "Otevřené bez aktivit",
    "V první fázi déle než 30 dní",
  ])
    await expect(list.getByRole("menuitemradio", { name })).toBeVisible();
  // čištění dat má u každé kontroly popis, co hledá
  await expect(list.getByRole("menuitemradio", { name: /Bez úpravy 90 dní/ })).toContainText(
    "nic nezměnilo",
  );
  await page.keyboard.press("Escape");

  // obchod bez aktivity je v „Bez další aktivity“, ale nehnije a není po uzavření tento měsíc
  await tabs.getByRole("tab", { name: "Bez další aktivity" }).click();
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(page.getByRole("row").filter({ hasText: deal })).toBeVisible();
  await tabs.getByRole("tab", { name: "Zhnilé" }).click();
  await expect(page.getByRole("row").filter({ hasText: deal })).toHaveCount(0);

  // pohled z nabídky: název je v nabídce místo „Další pohledy“, pohled je vybraný a filtr použitý
  await menu.click();
  await page.getByRole("menuitemradio", { name: /Otevřené bez aktivit/ }).click();
  await expect(menu).toContainText("Čištění: otevřené bez aktivit");
  await expect(page.getByTestId("filter-chip").first()).toBeVisible();
});

test("prognóza: sloupce po měsících, posun, skok na dnešek, obchod bez data a detail v pop-upu", async ({
  page,
}) => {
  await page.goto("/crm?zobrazeni=prognoza");
  const view = page.getByTestId("forecast-view");
  await expect(view).toBeVisible();
  const range = page.getByTestId("forecast-range");
  const first = await range.innerText();

  await page.getByRole("button", { name: "Další měsíc" }).click();
  await expect(range).not.toHaveText(first);
  await page.getByTestId("forecast-today").click();
  await expect(range).toHaveText(first);

  // v hlavičce sloupce je otevřeno, vyhráno a celkem
  const none = page.getByTestId("forecast-column-none");
  await expect(none).toContainText("Bez data");
  const month = view.locator('section[data-testid^="forecast-column-2"]').first();
  await expect(month).toContainText("Otevřeno");
  await expect(month).toContainText("Vyhráno");
  await expect(month).toContainText("Celkem");

  // Obchod bez předpokládaného uzavření je ve sloupci „Bez data“; karta otevře detail v pop-upu. Sloupec ukáže jen 40 obchodů
  // (nejdřív s nejvyšší hodnotou, pak podle čísla), takže v databázi s dřívějšími běhy by nový obchod mohl zůstat skrytý;
  // proto se obchod zadá s vlastníkem a prognóza se zúží na „moje“ (uživatel je pro každý běh nový).
  await quickAddOwnDeal(page, page.getByTestId("add-deal"), forecastDeal);
  await page.getByTestId("owner-filter").click();
  await page.getByRole("option", { name: "Já" }).click();
  await expect(page).toHaveURL(/vlastnik=me/);
  const card = none.getByTestId("forecast-card").filter({ hasText: forecastDeal });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("pipeline-stepper")).toBeVisible();
  await card.click();
  await expect(page.getByTestId("record-dialog")).toBeVisible();
  await expect(page).toHaveURL(/[?&]record=/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("record-dialog")).toBeHidden();
});

test("prognóza na telefonu: sloupce se posouvají uvnitř, stránka se nerozšíří", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/crm?zobrazeni=prognoza");
  await expect(page.getByTestId("forecast-view")).toBeVisible();
  await expect(page.getByTestId("forecast-column-none")).toBeAttached();
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("archiv: rozsahy, hledání a prázdný stav", async ({ page }) => {
  await page.goto("/crm?zobrazeni=archiv");
  const view = page.getByTestId("archive-view");
  await expect(view).toBeVisible();
  const scope = view.getByRole("radiogroup", { name: "Rozsah archivu" });
  for (const name of ["Archivované a prohrané", "Archivované", "Prohrané", "Vyhrané", "Vše"])
    await expect(scope.getByRole("radio", { name, exact: true })).toBeVisible();

  // otevřený obchod v archivu není
  await scope.getByRole("radio", { name: "Vše" }).click();
  await view.getByLabel("Hledat v archivu").fill(stamp);
  await expect(page.getByText("Nic nenalezeno")).toBeVisible();
  await expect(view.getByTestId("archive-row").filter({ hasText: deal })).toHaveCount(0);
});

test("moje dnešní práce: obchod bez další aktivity a nová poptávka ze schránky", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // poptávka ve schránce
  await page.goto("/poptavky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(inquiry);
  // bez firmy nebo jména kontaktu by kvalifikace odmítla založit zakázku; pole jsou v rozbalení „Další pole“
  await dialog.getByRole("button", { name: /^Další pole/ }).click();
  await dialog.getByLabel("Jméno kontaktu").fill(`Kontakt poptávky ${stamp}`);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: inquiry }),
  ).toBeVisible();

  await page.goto("/crm/dnes");
  const today = page.getByTestId("today-page");
  await expect(today.getByRole("heading", { name: /^Dobrý den/ })).toBeVisible();
  await expect(today.getByTestId("today-date")).not.toBeEmpty();

  // Obchod z prvního testu tu být nemůže: zakázka založená přes /zakazky nemá vlastníka a „moje“ obchody jsou jen ty
  // s vlastníkem = přihlášený uživatel. Vlastní obchod bez další aktivity proto vznikne rychlým zadáním přímo ze stránky.
  await quickAddOwnDeal(page, today.getByTestId("today-quick-add"), quickDeal);

  // obchod bez další aktivity jde naplánovat rovnou ze seznamu
  const mine = today.getByTestId("today-no-activity");
  const row = mine.getByTestId("today-deal").filter({ hasText: quickDeal });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("today-plan")).toBeEnabled();

  // nová poptávka: kvalifikace přímo ze seznamu založí zakázku, která se objeví mezi obchody bez aktivity
  const inbox = today.getByTestId("today-inbox");
  // Stránka ukáže jen 25 nejdéle čekajících poptávek. V databázi zachované z dřívějších běhů zůstávají nevyřízené poptávky
  // (např. z importu), takže by nová mezi nimi nemusela být vidět; zbytek se proto zamítne přímo ze stránky.
  const count = inbox.getByTestId("today-inbox-count");
  for (let n = Number(await count.innerText()); n > 25; n--) {
    await inbox.getByTestId("today-reject").first().click();
    const reject = page.getByRole("dialog", { name: "Zamítnout poptávku" });
    await reject.getByRole("button", { name: /Vyberte důvod/ }).click();
    await page.getByRole("option").first().click();
    await reject.getByRole("button", { name: "Zamítnout poptávku" }).click();
    await expect(count).toHaveText(String(n - 1));
  }
  const item = inbox.getByTestId("today-inquiry").filter({ hasText: inquiry });
  await expect(item).toBeVisible();
  await item.getByTestId("today-qualify").click();
  await expect(item).toHaveCount(0);
  await expect(mine.getByTestId("today-deal").filter({ hasText: inquiry })).toBeVisible();
});

test("moje dnešní práce na telefonu: sekce pod sebou, stránka se nerozšíří", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/crm/dnes");
  await expect(page.getByTestId("today-page")).toBeVisible();
  await expect(page.getByTestId("today-no-activity")).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
});
