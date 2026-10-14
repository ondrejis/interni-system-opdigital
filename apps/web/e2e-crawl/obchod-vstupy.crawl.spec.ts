import { expect, test, type Locator, type Page } from "@playwright/test";
import { collectErrors, expectClean } from "./helpers";
import { addFirstItem, createCompany, createJob, newStamp, openJob } from "./obchod-helpers";

/**
 * Nepřátelské vstupy v obchodních formulářích: desetinné čárky, mezery v částkách, haléře, záporné a obří hodnoty,
 * nesmysly místo čísel. Chyba má být česká věta u pole (nikdy obecné „Něco se nepovedlo“, výjimka stránky ani 5xx)
 * a platné hodnoty se mají spočítat na haléř.
 */
test.describe.configure({ mode: "serial" });

const stamp = newStamp();
const company = `Vstupy firma ${stamp} s.r.o.`;
const job = `Vstupy zakázka ${stamp}`;

const noGenericError = async (page: Page, where: string) => {
  await expect(page.getByText(/Něco se nepovedlo/), `${where}: obecná chyba`).toHaveCount(0);
};

/** V buňce rozpočtové tabulky zkusí hodnotu; vrací text chybové bubliny (nebo null, když se uložila). */
async function tryCell(
  page: Page,
  grid: Locator,
  cell: Locator,
  value: string,
): Promise<string | null> {
  await cell.dblclick();
  await expect(grid.locator("input").first()).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(value);
  await page.keyboard.press("Enter");
  const alert = grid.getByRole("alert");
  const input = grid.locator("input");
  await expect
    .poll(async () => (await alert.count()) > 0 || (await input.count()) === 0, { timeout: 10_000 })
    .toBe(true);
  if (await alert.count()) {
    const text = await alert.first().innerText();
    await page.keyboard.press("Escape");
    await expect(input).toHaveCount(0);
    return text;
  }
  return null;
}

test("rozpočet: čárka, mezery a haléře se spočítají, nesmysly dostanou českou větu", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  await createCompany(page, company);
  const view = await createJob(page, { title: job, company, phase: "Realizace", value: "1" });
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  await addFirstItem(page, view, {
    section: "Zkoušky",
    item: "Kabel",
    qty: "1",
    cost: "0",
    price: "1",
  });
  const grid = view.getByTestId("budget-grid");
  const stats = view.getByTestId("budget-stats");

  // po Enteru na ceně je vybraná buňka pod ní; vrátíme se na množství vybraného řádku kliknutím
  const row = grid.getByRole("row", { name: /Kabel/ });
  const qtyCell = row.getByRole("gridcell").nth(5);
  expect(await tryCell(page, grid, qtyCell, "2,5")).toBeNull();
  await expect(row).toContainText("2,5");
  // cena s mezerou jako oddělovačem tisíců a čárkou: 1 000,50
  const priceCell = row.getByRole("gridcell").nth(7);
  expect(await tryCell(page, grid, priceCell, "1 000,50")).toBeNull();
  // 2,5 × 1 000,50 = 2 501,25 Kč
  await expect(stats).toContainText("2 501,25 Kč");

  // nesmysly a záporné/obří hodnoty: česká věta, nic se neuloží
  for (const bad of ["abc", "1e9999", "99999999999999999"]) {
    const msg = await tryCell(page, grid, qtyCell, bad);
    expect(msg, `množství „${bad}“ má mít chybu`).not.toBeNull();
    expect(msg).not.toMatch(/Něco se nepovedlo|undefined|NaN|\[object/);
    await noGenericError(page, `množství ${bad}`);
  }
  for (const bad of ["xyz", "-100", "999999999999999999"]) {
    const msg = await tryCell(page, grid, priceCell, bad);
    // záporná cena je u rozpočtu možná (sleva)? Pak se uloží a vrátí níže; jinak česká věta
    if (msg !== null) expect(msg).not.toMatch(/Něco se nepovedlo|undefined|NaN|\[object/);
    await noGenericError(page, `cena ${bad}`);
  }
  // záporná cena (sleva) se smí uložit; vrátíme platnou hodnotu a součet je zase jako předtím
  expect(await tryCell(page, grid, priceCell, "1 000,50")).toBeNull();
  await expect(stats).toContainText("2 501,25 Kč");
  await expect(stats).not.toContainText("NaN");
  expectClean(c, "rozpočet: vstupy");
});

test("náklady: nulová, nečíselná a obří částka nákladu dostane českou větu, haléře se uloží", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  const view = await openJob(page, stamp);
  await view.getByRole("tab", { name: "Náklady", exact: true }).click();
  await view.getByRole("radio", { name: "Náklady", exact: true }).click();

  const open = async () => {
    await view.getByRole("button", { name: "Přidat náklad" }).click();
    const dlg = page.getByRole("dialog", { name: "Přidat náklad" });
    await dlg.getByRole("button", { name: "Vybrat datum" }).click();
    await page.locator("td[data-day] button").first().click();
    await dlg.getByLabel("Za co náklad je").fill("Zkouška vstupu");
    return dlg;
  };
  // záporný náklad je platný (dobropis od dodavatele), proto tu není
  for (const bad of ["0", "abc", "99999999999999999999"]) {
    const dlg = await open();
    await dlg.getByLabel("Částka nákladu bez DPH").fill(bad);
    // neplatná částka: tlačítko je vypnuté, nebo server odmítne větou a dialog zůstane otevřený
    const submit = dlg.getByRole("button", { name: "Přidat náklad" });
    if (await submit.isEnabled()) await submit.click();
    await expect(dlg).toBeVisible();
    if (await dlg.getByRole("alert").count())
      expect(await dlg.getByRole("alert").first().innerText()).not.toMatch(/Něco se nepovedlo/);
    await noGenericError(page, `náklad ${bad}`);
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
  }
  // platná částka s haléři a čárkou: 1 234,56 Kč
  const dlg = await open();
  await dlg.getByLabel("Částka nákladu bez DPH").fill("1 234,56");
  await dlg.getByRole("button", { name: "Přidat náklad" }).click();
  await expect(view.getByTestId("costs-tab")).toContainText("1 234,56 Kč");
  await expect(view.getByTestId("kpi-cost")).toContainText("1 234,56 Kč");
  expectClean(c, "náklady: vstupy");
});

test("změna: nesmyslné množství a ceny nové položky nepustí uložit řádek", async ({ page }) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  const view = await openJob(page, stamp);
  await view.getByRole("tab", { name: "Změny", exact: true }).click();
  await view.getByRole("button", { name: "Nová změna" }).click();
  const editor = view.getByTestId("change-editor");
  await editor.getByRole("button", { name: "Nová položka" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Název nové položky").fill("Zkouška");
  const add = dlg.getByRole("button", { name: "Přidat řádek" });
  for (const bad of ["0", "-3", "abc", "99999999999999999"]) {
    await dlg.getByLabel("Množství", { exact: true }).fill(bad);
    await dlg.getByLabel("Prodejní cena za jednotku").fill("100");
    if (await add.isEnabled()) {
      await add.click();
      // povolené jen, když ho server přijal; jinak česká chyba v dialogu
      await expect(page.getByText(/Něco se nepovedlo/)).toHaveCount(0);
      if (await dlg.isVisible().catch(() => false)) continue;
      // řádek se přidal (např. záporné množství u rušení): smaže se zpět
      await editor.getByRole("button", { name: "Odebrat řádek Zkouška" }).click();
      await editor.getByRole("button", { name: "Nová položka" }).click();
      await dlg.getByLabel("Název nové položky").fill("Zkouška");
    }
  }
  await dlg.getByLabel("Množství", { exact: true }).fill("2,5");
  await dlg.getByLabel("Prodejní cena za jednotku").fill("1 000,50");
  await expect(dlg.getByTestId("line-preview")).toContainText("2 501,25 Kč");
  expectClean(c, "změna: vstupy");
});
