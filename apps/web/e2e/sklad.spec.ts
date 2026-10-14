import { expect, test, type Locator, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const supplier = `Dodavatel ${stamp}`;
const jobTitle = `Sklad ${stamp}`;
const itemName = `Cement ${stamp}`;
const warehouse = `Sklad A ${stamp}`;
const code = `CEM-${stamp}`.toUpperCase();

/** Otevře výběr, vyhledá a zvolí možnost. */
async function pick(page: Page, trigger: Locator, search: string) {
  await trigger.click();
  await page
    .getByPlaceholder(/Hledat|Kód nebo název/)
    .last()
    .fill(search);
  await page.getByRole("option").filter({ hasText: search }).first().click();
}

test("příprava: dodavatel, zakázka, umístění a skladová karta", async ({ page }) => {
  await page.goto("/kontakty/firmy");
  await page.getByTestId("create-record").click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(supplier);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: supplier }),
  ).toBeVisible();

  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(jobTitle);
  await dialog.getByRole("button", { name: "Vybrat…" }).click();
  await page.getByPlaceholder("Hledat…").last().fill(supplier);
  await page.getByRole("option").first().click();
  await dialog.getByRole("button", { name: "Poptávka" }).click();
  await page.getByRole("option", { name: "Realizace" }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: jobTitle }),
  ).toBeVisible();

  await page.goto("/sklad/umisteni");
  await page.getByTestId("create-record").click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(warehouse);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: warehouse }),
  ).toBeVisible();

  await page.goto("/sklad/karty");
  await page.getByTestId("create-record").click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Kód/).fill(code.toLowerCase());
  await dialog.getByLabel(/Název/).fill(itemName);
  await dialog.getByRole("button", { name: "ks", exact: true }).click(); // výchozí jednotka
  await page.getByRole("option", { name: "pytel" }).click();
  await dialog.getByRole("button", { name: /Další pole/ }).click();
  await dialog.getByLabel("Minimum").fill("10");
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name: itemName })).toBeVisible();
  await expect(view).toContainText(code); // kód se uloží velkými písmeny
});

test("příjemka: zásoba, průměrná cena a číslo dokladu", async ({ page }) => {
  await page.goto("/sklad");
  await page.getByRole("button", { name: "Příjem", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Příjemka" });
  await pick(page, dialog.getByRole("button", { name: /^Umístění/ }), warehouse);
  await pick(page, dialog.getByRole("button", { name: /^Dodavatel/ }), supplier);
  await pick(page, dialog.getByRole("button", { name: /^Položka 1/ }), code);
  await dialog.getByLabel("Množství 1").fill("20");
  await dialog.getByLabel("Cena za jednotku 1").fill("100");
  await dialog.getByRole("button", { name: /^Zaúčtovat/ }).click();
  await expect(page.getByText(/Zaúčtováno: PR-\d{4}-\d{4} · 2\s000\sKč/)).toBeVisible();

  await page.getByLabel("Hledat položku").fill(stamp);
  const row = page.getByTestId("stock-row").filter({ hasText: itemName });
  await expect(row).toContainText("20 pytel");
  await expect(row).toContainText("100 Kč");
});

test("výdej na zakázku: nelze vydat víc, než je skladem; pod minimem se zvýrazní", async ({
  page,
}) => {
  await page.goto("/sklad");
  await page.getByRole("button", { name: "Výdej", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Výdejka na zakázku" });
  await pick(page, dialog.getByRole("button", { name: /^Umístění/ }), warehouse);
  await pick(page, dialog.getByRole("button", { name: /^Zakázka/ }), jobTitle);
  await pick(page, dialog.getByRole("button", { name: /^Položka 1/ }), code);
  await dialog.getByLabel("Množství 1").fill("25");
  await dialog.getByRole("button", { name: /^Zaúčtovat/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("na umístění je jen 20");

  await dialog.getByLabel("Množství 1").fill("15");
  await dialog.getByRole("button", { name: /^Zaúčtovat/ }).click();
  await expect(page.getByText(/Zaúčtováno: VY-\d{4}-\d{4} · 1\s500\sKč/)).toBeVisible();

  await page.getByLabel("Hledat položku").fill(stamp);
  const row = page.getByTestId("stock-row").filter({ hasText: itemName });
  await expect(row).toContainText("5 pytel");
  await page.getByRole("button", { name: "Jen pod minimem" }).click();
  await expect(page.getByTestId("stock-row").filter({ hasText: itemName })).toBeVisible();
});

test("karta ukáže pohyby, zakázka materiál", async ({ page }) => {
  await page.goto("/sklad/karty");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const card = page.getByRole("row").filter({ hasText: itemName });
  await card.hover();
  await card.getByRole("button", { name: "Otevřít" }).click();
  const view = page.getByTestId("record-view");
  await view.getByRole("tab", { name: "Stav a pohyby" }).click();
  await expect(view).toContainText("Výdej");
  await expect(view).toContainText("Příjem");

  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: jobTitle });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  const panel = page.getByTestId("record-view");
  await panel.getByRole("tab", { name: "Náklady", exact: true }).click();
  await panel.getByRole("radio", { name: "Materiál", exact: true }).click();
  await expect(panel).toContainText(itemName);
  await expect(panel).toContainText("Materiál celkem 1 500 Kč");
});

test("inventura: napočítané množství a uzavření zaúčtuje rozdíl", async ({ page }) => {
  await page.goto("/sklad");
  await page.getByRole("button", { name: "Inventura", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nová inventura" });
  await pick(page, dialog.getByRole("button", { name: /^Umístění/ }), warehouse);
  await dialog.getByRole("button", { name: "Založit inventuru" }).click();
  await expect(page).toHaveURL(/\/sklad\/inventury\/[0-9a-f-]{36}$/);

  const view = page.getByTestId("record-view");
  await view.getByRole("tab", { name: "Počítání" }).click();
  const input = view.getByLabel(`Napočítáno ${itemName}`);
  await input.fill("4");
  await input.blur();
  await expect(view.getByTestId("count-row").filter({ hasText: itemName })).toContainText("-1");

  await view.getByRole("button", { name: "Uzavřít inventuru" }).click();
  await page
    .getByRole("dialog", { name: "Uzavřít inventuru" })
    .getByRole("button", { name: "Uzavřít inventuru" })
    .click();
  await expect(page.getByText(/Inventura uzavřena, rozdíly zaúčtovány: IN-/)).toBeVisible();

  await page.goto("/sklad");
  await page.getByLabel("Hledat položku").fill(stamp);
  await expect(page.getByTestId("stock-row").filter({ hasText: itemName })).toContainText(
    "4 pytel",
  );
});

test("objednávka: vytvoření, odeslání a přijetí zboží", async ({ page }) => {
  await page.goto("/sklad");
  await page.getByRole("button", { name: "Objednávka", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nová objednávka" });
  await pick(page, dialog.getByRole("button", { name: /^Příjem do/ }), warehouse);
  await pick(page, dialog.getByRole("button", { name: /^Dodavatel/ }), supplier);
  await pick(page, dialog.getByRole("button", { name: /^Položka 1/ }), code);
  await dialog.getByLabel("Množství 1").fill("30");
  await dialog.getByRole("button", { name: "Vytvořit a odeslat" }).click();
  await expect(page).toHaveURL(/\/sklad\/objednavky\/[0-9a-f-]{36}$/);

  const view = page.getByTestId("record-view");
  await expect(view).toContainText("Objednáno");
  await view.getByRole("button", { name: "Přijmout zboží" }).click();
  const receive = page.getByRole("dialog", { name: "Přijetí zboží" });
  await receive.getByLabel(`Přijato ${itemName}`).fill("12");
  await receive.getByRole("button", { name: "Zaúčtovat příjem" }).click();
  await expect(page.getByText(/Příjem zaúčtován: PR-/)).toBeVisible();
  await expect(view).toContainText("Částečně přijato");
});
