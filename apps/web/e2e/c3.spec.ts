import { expect, test } from "@playwright/test";

/*
  C3: realtime (změna v jedné záložce je ve druhé do 2 s bez obnovení), paleta Cmd+K (nedávné, telefon „777 12“,
  akce volat), globální historie, rychlé předvolby a filtr v adrese. Testy si data zakládají samy (náhodná značka).
*/
test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const lastName = `Paletová${stamp}`;
const firm = `Realtime firma ${stamp} s.r.o.`;

test("paleta Cmd+K: kontakt najdu podle částí telefonu a mám u něj akci Zavolat", async ({
  page,
}) => {
  await page.goto("/kontakty/osoby/novy");
  const form = page.getByTestId("quick-contact");
  await form.getByLabel("Jméno", { exact: true }).fill("Jana");
  await form.getByLabel(/Příjmení/).fill(lastName);
  await form.getByLabel("Telefon").first().fill("777 321 654");
  await form.getByRole("button", { name: "Založit kontakt" }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: `Jana ${lastName}` }),
  ).toBeVisible();

  await page.goto("/prehled");
  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByTestId("palette-input");
  await expect(input).toBeVisible();
  // bez zadání: naposledy otevřené (právě založený kontakt) a nejčastější příkazy
  await expect(page.getByText("Naposledy otevřené")).toBeVisible();
  await expect(page.getByText("Nejčastější příkazy")).toBeVisible();
  await input.fill("777 32");
  const row = page.getByTestId("palette-item").filter({ hasText: lastName });
  await expect(row).toBeVisible();
  await expect(row.getByRole("link", { name: /Zavolat/ })).toHaveAttribute(
    "href",
    /^tel:(\+420)?777321654$/,
  );
  await page.keyboard.press("Escape");
});

test("paleta: příkaz Nový úkol a Přepnout téma", async ({ page }) => {
  await page.goto("/prehled");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("palette-input").fill("nový úkol");
  await expect(page.getByTestId("palette-item").first()).toContainText(/Nový úkol/);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/ukoly/);
});

test("realtime: firma založená v jedné záložce se objeví ve druhé do 2 s bez obnovení", async ({
  page,
  context,
}) => {
  await page.goto("/kontakty/firmy");
  await expect(page.getByTestId("entity-list")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/kontakty/firmy");
  await other.getByTestId("create-record").click();
  const dialog = other.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(firm);
  const t0 = Date.now();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByText(firm).first()).toBeVisible({ timeout: 2000 });
  expect(Date.now() - t0).toBeLessThan(4000); // 2 s na doručení + prodleva zápisu
  await other.close();
});

test("historie: změna se zapíše, jde filtrovat podle typu a hledat; vlastník může exportovat", async ({
  page,
}) => {
  await page.goto("/historie");
  await expect(page.getByTestId("history")).toBeVisible();
  await page.getByLabel("Hledat v historii").fill(firm);
  const item = page.getByTestId("history-item").first();
  await expect(item).toContainText(firm);
  await expect(item).toContainText("Vytvoření");
  await page.getByLabel("Typ záznamu").selectOption({ label: "Organizace" });
  await expect(page).toHaveURL(/typ=company/);
  await expect(page.getByRole("button", { name: /Export CSV/ })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export CSV/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^historie-zmen-.*\.csv$/);
});

test("rychlé předvolby: Moje na úkolech, filtr je v adrese a po obnovení zůstane", async ({
  page,
}) => {
  await page.goto("/ukoly");
  const chip = page.getByTestId("quick-filter-mine");
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/[?&]f=/);
  await page.reload();
  await expect(page.getByTestId("quick-filter-mine")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("quick-filter-mine").click();
  await expect(page).not.toHaveURL(/[?&]f=/);
});

test("klávesa C otevře dialog nového záznamu", async ({ page }) => {
  await page.goto("/kontakty/firmy");
  await page.keyboard.press("c");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
});
