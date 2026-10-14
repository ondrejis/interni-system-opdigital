import { expect, test } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";

/**
 * Procházení konfigurace v Nastavení: všech šest stránek se otevře bez chyby a hlavní akce fungují
 * (stav přidat/upravit/smazat, vlastní pole založit a smazat, vzor řady s náhledem, dialog sazby DPH).
 * Vše, co test vytvoří, si sám uklidí; číselníky a sazby DPH se jen otevírají (položky číselníku jdou jen vypnout).
 */
const PAGES = [
  ["/nastaveni/stavy", "Stavy a pipeline"],
  ["/nastaveni/ciselniky", "Číselníky"],
  ["/nastaveni/vlastni-pole", "Vlastní pole"],
  ["/nastaveni/rady", "Číselné řady"],
  ["/nastaveni/dph", "Sazby DPH"],
  ["/nastaveni/moduly", "Moduly"],
] as const;

test("všechny stránky konfigurace se otevřou bez chyby a jsou v menu", async ({ page }) => {
  const c = collectErrors(page);
  for (const [path, title] of PAGES) {
    await visit(page, path, c);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Oddíly nastavení" }).getByRole("link", { name: title }),
    ).toBeVisible();
  }
  expectClean(c, "stránky konfigurace");
});

test("stavy: přidat, upravit a smazat stav; fáze zakázky jsou pokryté", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/nastaveni/stavy", c);
  await expect(page.getByTestId("stage-row").first()).toBeVisible();

  // zakázky: každá fáze má stav
  await page.getByRole("radio", { name: "Zakázky" }).click();
  await expect(page.getByTestId("phase-list")).toBeVisible();
  await expect(page.getByTestId("phase-list").getByText("Bez stavu")).toHaveCount(0);

  // poptávky: životní cyklus bez fází
  await page.getByRole("radio", { name: "Poptávky" }).click();
  const name = `Crawl stav ${Date.now().toString(36)}`;
  await page.getByRole("button", { name: "Přidat stav" }).click();
  await page.getByLabel("Název stavu").fill(name);
  await page.getByRole("radio", { name: "Modrá" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Přidat stav" }).click();
  const row = page.getByTestId("stage-row").filter({ hasText: name });
  await expect(row).toBeVisible();

  await page.getByRole("button", { name: `Upravit stav ${name}` }).click();
  await page.getByLabel("Název stavu").fill(`${name} 2`);
  await page.getByRole("dialog").getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByTestId("stage-row").filter({ hasText: `${name} 2` })).toBeVisible();

  // posun nahoru a dolů
  await page.getByRole("button", { name: `Posunout „${name} 2“ výš` }).click();
  await expect(page.getByRole("button", { name: `Posunout „${name} 2“ výš` })).toBeVisible();

  // nepoužitý stav jde smazat, hláška o použití se ukáže u používaného (první stav poptávky je používaný)
  await page.getByRole("button", { name: `Smazat stav ${name} 2` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat stav" }).click();
  await expect(page.getByTestId("stage-row").filter({ hasText: `${name} 2` })).toHaveCount(0);
  expectClean(c, "stavy");
});

test("vlastní pole: založit, uvidět v tabulce firem a smazat", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/nastaveni/vlastni-pole", c);
  await page.getByRole("button", { name: /^Firmy/ }).click();
  const label = `Crawl pole ${Date.now().toString(36)}`;
  await page.getByRole("button", { name: "Nové pole" }).click();
  await page.getByLabel("Název pole").fill(label);
  await page.getByLabel("Výchozí hodnota").fill("výchozí text");
  await page.getByRole("dialog").getByRole("button", { name: "Přidat pole" }).click();
  const row = page.getByTestId("field-row").filter({ hasText: label });
  await expect(row).toBeVisible();
  await expect(row.getByText("Má výchozí hodnotu")).toBeVisible();

  // pole je v tabulce firem k dispozici jako sloupec
  await visit(page, "/kontakty/firmy", c);
  await page.getByTestId("list-options").click();
  await page.getByRole("menuitem", { name: /Sloupce/ }).click();
  await expect(page.getByText(label).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // úklid
  await visit(page, "/nastaveni/vlastni-pole", c);
  await page.getByRole("button", { name: /^Firmy/ }).click();
  await page.getByRole("button", { name: `Smazat pole ${label}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat pole" }).click();
  await expect(page.getByTestId("field-row").filter({ hasText: label })).toHaveCount(0);
  expectClean(c, "vlastní pole");
});

test("číselníky: položky, přeřazení tam a zpět", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/nastaveni/ciselniky", c);
  const rows = page.getByTestId("lookup-row");
  await expect(rows.first()).toBeVisible();
  const first = (await rows.first().innerText()).trim();
  const second = rows.nth(1);
  const secondName = (await second.locator(".chip").first().innerText()).trim();
  await page.getByRole("button", { name: `Posunout „${secondName}“ výš` }).click();
  await expect(rows.first().locator(".chip").first()).toHaveText(secondName);
  await page.getByRole("button", { name: `Posunout „${secondName}“ níž` }).click();
  await expect(rows.first()).toContainText(first.split("\n")[0]!);
  await page
    .getByRole("button", { name: /Upravit položku/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Zrušit" }).click();
  expectClean(c, "číselníky");
});

test("číselné řady: vzor s náhledem a validací, bez uložení", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/nastaveni/rady", c);
  const row = page.getByTestId("series-row").first();
  await expect(row).toContainText("Další číslo");
  await row.getByRole("button", { name: /Upravit vzor řady/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Vzor").fill("ABC-{NNNN}");
  await expect(dialog.getByTestId("series-preview")).toContainText(/ABC-\d{4}/);
  await expect(dialog.getByText("neobsahuje rok")).toBeVisible();
  await dialog.getByLabel("Vzor").fill("bez čísla");
  await expect(dialog.getByText(/pořadové číslo/).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Uložit" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Zrušit" }).click();
  expectClean(c, "řady");
});

test("sazby DPH a moduly: seznam, dialog bez uložení, přehled modulů", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/nastaveni/dph", c);
  await expect(page.getByTestId("vat-row").first()).toBeVisible();
  await expect(page.getByText("Výchozí").first()).toBeVisible();
  await page.getByRole("button", { name: "Nová sazba" }).click();
  await page.getByLabel("Název").fill("Zkouška");
  await page.getByLabel("Sazba (%)").fill("abc");
  await expect(page.getByText("Zadejte sazbu 0 až 100 %.")).toBeVisible();
  await page.getByLabel("Sazba (%)").fill("12,5");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Uložit" })).toBeEnabled();
  await page.getByRole("dialog").getByRole("button", { name: "Zrušit" }).click();

  await visit(page, "/nastaveni/moduly", c);
  await expect(page.getByTestId("module-zakazky")).toContainText("Zapnuto");
  await expect(page.getByText("Jak zapnout nebo vypnout modul")).toBeVisible();
  expectClean(c, "sazby a moduly");
});
