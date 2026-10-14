import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

/*
  Sdílené pomocníky e2e testů. Testy nesmí záviset na datech zbylých v databázi z dřívějších běhů ani na pořadí souborů:
  firmu, kterou potřebují, si každý soubor (spec) vytvoří sám přes `ensureCompany`.
*/

const companies = new Map<string, Promise<string>>();

/** Vytvoří firmu přes stránku Firmy (dialog, jen povinný název) a vrátí její název. Používá vlastní záložku, aby neovlivnila `page`. */
export async function createCompany(context: BrowserContext, name: string): Promise<string> {
  const page = await context.newPage();
  try {
    await page.goto("/kontakty/firmy");
    await page.getByTestId("create-record").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Název/).fill(name);
    await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
    await expect(
      page.getByTestId("record-view").getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  } finally {
    await page.close();
  }
  return name;
}

/** Firma tohoto souboru testů (vznikne při prvním použití; při opakování testu po pádu se vytvoří znovu). */
export function ensureCompany(context: BrowserContext): Promise<string> {
  const key = test.info().file;
  let c = companies.get(key);
  if (!c) {
    const stamp = Math.random().toString(36).slice(2, 8);
    c = createCompany(context, `Testovací firma ${stamp} s.r.o.`);
    c.catch(() => companies.delete(key));
    companies.set(key, c);
  }
  return c;
}

/**
 * V otevřeném dialogu vybere firmu tohoto souboru testů ve výběru s tlačítkem `trigger` (výchozí „Vybrat…“ u zákazníka zakázky;
 * u přijaté faktury „Dodavatel“).
 */
export async function pickCompany(
  page: Page,
  dialog: Locator,
  trigger: string | RegExp = "Vybrat…",
  exact = false,
) {
  const name = await ensureCompany(page.context());
  await dialog.getByRole("button", { name: trigger, exact }).click();
  await page.getByPlaceholder("Hledat…").last().fill(name);
  await page.getByRole("option", { name }).click();
  return name;
}

/**
 * Klik na položku podnabídky (Zobrazení → Sloupce, Řazení, Export). Radix podnabídku zavře, když ukazatel od jejího
 * spouštěče skočí rovnou na položku, nebo když zabloudí přes sousední spouštěče (Playwright posouvá myš po přímce), takže
 * se myš vede jako rukou: nejdřív vodorovně do horního okraje podnabídky, pak svisle k položce. Dlouhý seznam (sloupce
 * s vlastními poli) se přitom posune tak, aby položka byla vidět.
 */
export async function clickSubmenuItem(page: Page, item: Locator) {
  const menu = (await item.locator('xpath=ancestor::*[@role="menu"][1]').boundingBox())!;
  await page.mouse.move(menu.x + menu.width / 2, menu.y + 12, { steps: 12 });
  await item.scrollIntoViewIfNeeded();
  const box = (await item.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await item.click();
}
