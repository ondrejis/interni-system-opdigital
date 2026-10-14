import { expect, test, type Page } from "@playwright/test";
import { pickCompany } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const jobA = `Rozpočet ${stamp}`;
const jobB = `Ze šablony ${stamp}`;
const template = `Šablona ${stamp}`;

/** Založí zakázku přes dialog a otevře její detail. */
async function createJob(page: Page, title: string) {
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(title);
  await pickCompany(page, dialog);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name: title })).toBeVisible();
  return view;
}

/** Zapíše hodnotu do vybrané buňky tabulky klávesnicí: Enter otevře editaci, text, pak Tab nebo Enter uloží. */
async function typeInto(
  page: Page,
  col: "qty" | "cost" | "price",
  value: string,
  commit: "Tab" | "Enter",
) {
  const grid = page.getByTestId("budget-grid");
  // výběr buňky se po uložení předchozí přesouvá asynchronně; Enter před tím by otevřel jinou buňku
  await expect(grid.locator('[aria-selected="true"]')).toHaveAttribute(
    "id",
    new RegExp(`-${col}$`),
  );
  const input = grid.locator("input, textarea");
  await page.keyboard.press("Enter");
  await expect(input.first()).toBeFocused(); // psát se smí, až když je buňka v úpravě
  await page.keyboard.type(value);
  await page.keyboard.press(commit);
  await expect(input).toHaveCount(0);
}

test("rozpočet v tabulce: položky, marže, výkaz výměr, odeslání, PDF a zamčení", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const view = await createJob(page, jobA);
  await view.getByRole("tab", { name: "Rozpočet" }).click();

  // prázdný stav nabízí šablonu i první oddíl
  await expect(view.getByRole("button", { name: "Použít šablonu" })).toBeVisible();
  await view.getByRole("button", { name: "Přidat první oddíl" }).click();
  const grid = view.getByTestId("budget-grid");
  const editor = grid.getByRole("textbox");
  await expect(editor).toBeFocused(); // psát se smí, až když je buňka v úpravě
  await page.keyboard.type("Elektro");
  await page.keyboard.press("Enter");

  // položka přímo v tabulce: název, Tab na množství, náklad a prodej
  await expect(grid).toContainText("Elektro");
  await page.keyboard.type("Kabel CYKY");
  await page.keyboard.press("Tab"); // uloží položku a jde na Množství
  const row = grid.getByRole("row", { name: /Kabel CYKY/ });
  await expect(row).toBeVisible();
  await typeInto(page, "qty", "10", "Tab");
  await typeInto(page, "cost", "600", "Tab");
  await typeInto(page, "price", "1000", "Enter");
  await expect(row).toContainText("10 000");
  await expect(row).toContainText("40,0 %");
  const stats = view.getByTestId("budget-stats");
  await expect(stats).toContainText("10 000 Kč");
  await expect(stats).toContainText("6 000 Kč");
  await expect(view.getByTestId("budget-vat")).toContainText("12 100 Kč");

  // výkaz výměr: množství je součet řádků se vzorci a proměnnými
  await row.hover();
  await row.getByRole("button", { name: "Další akce" }).click();
  await page.getByRole("menuitem", { name: /Výkaz výměr/ }).click();
  const calc = page.getByRole("dialog", { name: "Výkaz výměr" });
  await calc.getByLabel("Proměnná, řádek 1").fill("a");
  await calc.getByLabel("Vzorec, řádek 1").fill("4,5 * 2");
  await calc.getByRole("button", { name: "Řádek", exact: true }).click();
  await calc.getByLabel("Vzorec, řádek 2").fill("a + 3");
  await expect(calc).toContainText("21");
  await calc.getByLabel("Vzorec, řádek 2").fill("a +");
  await expect(calc.getByRole("button", { name: "Uložit" })).toBeDisabled();
  await calc.getByLabel("Vzorec, řádek 2").fill("a + 3");
  await calc.getByRole("button", { name: "Uložit" }).click();
  await expect(row).toContainText("21");
  await expect(row).toContainText("21 000");

  // odeslání nabídky a PDF (jen prodejní ceny, stahuje se po ověření oprávnění)
  await view.getByRole("button", { name: "Odeslat nabídku" }).click();
  await expect(page.getByText("Nabídka je označená jako odeslaná zákazníkovi.")).toBeVisible();
  await expect(view.getByTestId("budget-status")).toHaveText("Odesláno zákazníkovi");
  const pdf = page.context().waitForEvent("response", (r) => r.url().includes("/nabidka/pdf"));
  await view.getByRole("button", { name: "Stáhnout PDF" }).click();
  const res = await pdf;
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");

  // zamčená verze se nedá upravit a říká proč
  await view.getByRole("button", { name: "Další akce rozpočtu" }).click();
  await page.getByRole("menuitem", { name: "Zamknout nabídku" }).click();
  await expect(view.getByTestId("budget-lock")).toContainText("Nabídka je zamčená");
  await grid
    .getByRole("row", { name: /Kabel CYKY/ })
    .getByRole("gridcell")
    .nth(2)
    .dblclick();
  await expect(grid.getByRole("textbox")).toHaveCount(0);
  await expect(view.getByTestId("budget-status")).toHaveText("Zamčeno");
});

test("šablona zakázky: uložení z hotové zakázky a použití v nové", async ({ page }) => {
  test.setTimeout(120_000);
  // zdrojová zakázka z předchozího testu
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const found = page.getByRole("row").filter({ hasText: jobA });
  await found.hover();
  await found.getByRole("button", { name: "Otevřít" }).click();
  const src = page.getByTestId("record-view");
  await src.getByRole("button", { name: "Uložit jako šablonu" }).click();
  const dlg = page.getByRole("dialog", { name: "Uložit jako šablonu" });
  await dlg.getByLabel("Název šablony").fill(template);
  await dlg.getByRole("button", { name: "Uložit šablonu" }).click();
  await expect(page.getByText(`Šablona „${template}“ je uložená.`)).toBeVisible();

  // seznam šablon
  await page.goto("/zakazky/sablony");
  const item = page.getByTestId("template-row").filter({ hasText: template });
  await expect(item).toContainText("1 oddíl");
  await item.getByRole("button", { name: /Ukázat obsah šablony/ }).click();
  await expect(item).toContainText("Kabel CYKY");

  // nová zakázka: prázdný rozpočet → Použít šablonu
  const view = await createJob(page, jobB);
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  await view.getByRole("button", { name: "Použít šablonu" }).click();
  const picker = page.getByRole("dialog", { name: "Použít šablonu" });
  await picker.getByRole("option", { name: new RegExp(template) }).click();
  await picker.getByRole("button", { name: "Použít šablonu" }).click();
  const grid = view.getByTestId("budget-grid");
  await expect(grid).toContainText("Elektro");
  await expect(grid).toContainText("Kabel CYKY");

  // přejmenování a smazání šablony
  await page.goto("/zakazky/sablony");
  const again = page.getByTestId("template-row").filter({ hasText: template });
  await again.getByRole("button", { name: `Smazat šablonu ${template}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat", exact: true }).click();
  await expect(page.getByTestId("template-row").filter({ hasText: template })).toHaveCount(0);
});
