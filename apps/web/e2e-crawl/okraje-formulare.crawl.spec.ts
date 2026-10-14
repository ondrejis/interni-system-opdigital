import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs } from "./roles";

/**
 * Okrajové případy formulářů a seznamů: speciální znaky, příliš dlouhé texty, dvojí odeslání, souběžná úprava,
 * vypršelá relace, neplatná adresa. Každý test si vytvoří vlastní záznamy (unikátní `stamp`) a nic nezávisí na demo datech.
 */
test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

async function openCreate(page: Page) {
  await page.goto("/kontakty/firmy", { waitUntil: "networkidle" });
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("speciální znaky a emoji v názvu: uloží se doslova a nic se nespustí", async ({ page }) => {
  const c = collectErrors(page);
  // vložený HTML nesmí vyvolat `alert`
  page.on("dialog", (d) => {
    void d.dismiss();
    throw new Error(`Neočekávaný dialog prohlížeče: ${d.message()}`);
  });
  const name = `<img src=x onerror=alert(1)> "A" 'B' & 100% 😀 ${stamp}`;
  const dialog = await openCreate(page);
  await dialog.getByLabel(/Název/).fill(name);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name })).toBeVisible();
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  // nová firma bez jakýchkoli dat: všechny záložky detailu se otevřou (prázdné stavy bez chyby)
  // jen lišta záložek záznamu: záložky uvnitř Přehledu (psací panel) po přepnutí zmizí
  for (const tab of await page
    .getByTestId("record-view")
    .getByRole("tablist")
    .first()
    .getByRole("tab")
    .all()) {
    await tab.click();
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await expect(page.getByText("Něco se nepovedlo")).toHaveCount(0);
  }
  // v seznamu i ve vyhledávání (Cmd+K) se text zobrazí doslova
  await visit(page, "/kontakty/firmy", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(row(page, name)).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Hledat zakázky/).fill(stamp);
  await expect(page.locator("[cmdk-item]").filter({ hasText: "<img" })).toBeVisible();
  expectClean(c, "speciální znaky");
});

test("příliš dlouhý název: srozumitelná odpověď, ne „Něco se nepovedlo“", async ({ page }) => {
  const c = collectErrors(page);
  const dialog = await openCreate(page);
  await dialog.getByLabel(/Název/).fill(`${stamp} ${"Dlouhý ".repeat(120)}`);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  // buď se vytvoří, nebo dialog vysvětlí limit; obecná hláška je chyba
  await expect(page.getByText("Něco se nepovedlo")).toHaveCount(0);
  await page.waitForTimeout(800);
  const created = await page.getByTestId("record-view").count();
  if (!created) await expect(dialog).toContainText(/dlouh|znak|nejvýše|maximálně/i);
  expectClean(c, "dlouhý název");
});

test("dvojí odeslání: rychlý dvojklik na Vytvořit založí jednu firmu", async ({ page }) => {
  const c = collectErrors(page);
  const name = `Dvojklik ${stamp}`;
  const dialog = await openCreate(page);
  await dialog.getByLabel(/Název/).fill(name);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).dblclick();
  await expect(page.getByTestId("record-view").getByRole("heading", { name })).toBeVisible();
  await visit(page, "/kontakty/firmy", c);
  await page.getByPlaceholder("Hledat…").fill(`Dvojklik ${stamp}`);
  await expect(row(page, name)).toBeVisible();
  await expect(page.getByTestId("table-footer")).toContainText("1 záznam");
  expectClean(c, "dvojklik");
});

test("souběžná úprava: druhé okno dostane srozumitelnou hlášku o kolizi", async ({ browser }) => {
  const a = await pageAs(browser, "office", { viewport: { width: 1280, height: 800 } });
  const b = await pageAs(browser, "office", { viewport: { width: 1280, height: 800 } });
  const name = `Kolize ${stamp}`;
  const dialog = await openCreate(a.page);
  await dialog.getByLabel(/Název/).fill(name);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(a.page.getByTestId("record-view").getByRole("heading", { name })).toBeVisible();
  const url = a.page.url();
  // obě okna otevřou stejný záznam, první změní město, druhé pak jiné
  await b.page.goto(url, { waitUntil: "networkidle" });
  const edit = async (p: Page, city: string) => {
    await p.goto("/kontakty/firmy", { waitUntil: "networkidle" });
    await p.getByPlaceholder("Hledat…").fill(`Kolize ${stamp}`);
    const cell = row(p, name).locator('[data-attr="city"]');
    await cell.dblclick();
    await cell.getByRole("textbox").fill(city);
    await cell.getByRole("textbox").press("Enter");
    return cell;
  };
  // druhé okno si seznam načte dřív, než první změní záznam
  await b.page.goto("/kontakty/firmy", { waitUntil: "networkidle" });
  await b.page.getByPlaceholder("Hledat…").fill(`Kolize ${stamp}`);
  await expect(row(b.page, name)).toBeVisible();
  const first = await edit(a.page, "Cheb");
  await expect(first).toContainText("Cheb");
  const cellB = row(b.page, name).locator('[data-attr="city"]');
  await cellB.dblclick();
  await cellB.getByRole("textbox").fill("Brno");
  await cellB.getByRole("textbox").press("Enter");
  // druhé okno nesmí potichu přepsat změnu prvního: buď hláška o kolizi, nebo se hodnota prvního zachová
  const msg = b.page.getByText(/mezitím někdo změnil|Obnovte stránku/);
  const conflict = await msg.isVisible().catch(() => false);
  await b.page.waitForTimeout(1000);
  if (!conflict) {
    await b.page.reload({ waitUntil: "networkidle" });
    await b.page.getByPlaceholder("Hledat…").fill(`Kolize ${stamp}`);
    await expect(
      row(b.page, name).locator('[data-attr="city"]'),
      "druhé okno potichu přepsalo změnu prvního",
    ).toContainText("Cheb");
  }
  await expect(b.page.getByText("Něco se nepovedlo")).toHaveCount(0);
  await Promise.all([a.ctx.close(), b.ctx.close()]);
});

test("vypršelá relace uprostřed práce: žádné „Něco se nepovedlo“, uživatel se přihlásí znovu", async ({
  browser,
}) => {
  const { ctx, page } = await pageAs(browser, "office", { viewport: { width: 1280, height: 800 } });
  const dialog = await openCreate(page);
  await dialog.getByLabel(/Název/).fill(`Relace ${stamp}`);
  await ctx.clearCookies();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByText("Něco se nepovedlo")).toHaveCount(0);
  // buď přesměrování na přihlášení, nebo věta o nepřihlášení
  const onLogin = /\/prihlaseni/.test(page.url());
  if (!onLogin) await expect(page.getByText(/přihlás|přihlášen/i).first()).toBeVisible();
  await ctx.close();
});

for (const path of [
  "/kontakty/firmy/00000000-0000-4000-8000-000000000000",
  "/kontakty/osoby/00000000-0000-4000-8000-000000000000",
  "/zakazky/00000000-0000-4000-8000-000000000000",
  "/zakazky/00000000-0000-4000-8000-000000000000?tab=fakturace&sub=soupisy",
  "/fakturace/00000000-0000-4000-8000-000000000000",
  "/poptavky/00000000-0000-4000-8000-000000000000",
  "/sklad/karty/00000000-0000-4000-8000-000000000000",
  "/stroje/evidence/00000000-0000-4000-8000-000000000000",
  "/realizace/vady/00000000-0000-4000-8000-000000000000",
  "/kontakty/firmy/neni-uuid",
  "/zakazky/%00",
  "/nastaveni/neexistuje",
]) {
  test(`neplatná adresa ${path}: srozumitelná hláška, žádná chyba`, async ({ page }) => {
    const c = collectErrors(page);
    // záměrný 404 prohlížeč zapíše do konzole
    c.ignore(/Failed to load resource: the server responded with a status of 40[04]/);
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), "žádná odpověď 5xx").toBeLessThan(500);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await expect(page.getByText("Něco se nepovedlo")).toHaveCount(0);
    await expect(
      page
        .getByRole("heading", { name: "Stránka nenalezena" })
        .or(page.getByText("Záznam nenalezen"))
        .first(),
    ).toBeVisible();
    expectClean(c, path);
  });
}
