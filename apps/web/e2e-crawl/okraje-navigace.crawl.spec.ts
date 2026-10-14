import { expect, test } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { createCompany, createJob, newStamp } from "./obchod-helpers";
import { pageAs } from "./roles";

/**
 * Okrajové případy navigace a vazeb: záložka v adrese přežije obnovení a tlačítko Zpět, smazání firmy, která se používá
 * jinde (zakázka), vysvětlí důvod. Data si test vytvoří sám.
 */
const stamp = newStamp();

test("záložka a podzáložka v adrese: obnovení stránky i Zpět drží stejné místo", async ({
  browser,
}) => {
  const { ctx, page } = await pageAs(browser, "office", { viewport: { width: 1280, height: 800 } });
  const c = collectErrors(page);
  // zakázka v realizaci (má záložku Realizace): odkaz „Zapsat do deníku“ na Přehledu
  await visit(page, "/", c);
  const job = (
    await page.$$eval("a[href*='?tab=realizace&sub=denik']", (as) =>
      as.map((a) => a.getAttribute("href")!.split("?")[0]!),
    )
  )[0];
  expect(job, "na Přehledu je zakázka v realizaci").toBeTruthy();
  const tab = (name: string) => page.getByRole("tab", { name, exact: true });

  await visit(page, `${job}?tab=realizace&sub=denik`, c);
  await expect(tab("Realizace")).toHaveAttribute("aria-selected", "true");
  await page.reload({ waitUntil: "networkidle" });
  await expect(tab("Realizace")).toHaveAttribute("aria-selected", "true");
  expect(page.url()).toContain("tab=realizace");
  expect(page.url()).toContain("sub=denik");

  // přepnutí na jinou záložku změní adresu a přežije obnovení
  await tab("Úkoly").click();
  await expect(tab("Úkoly")).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => page.url()).toContain("tab=ukoly");
  await page.reload({ waitUntil: "networkidle" });
  await expect(tab("Úkoly")).toHaveAttribute("aria-selected", "true");
  // záložky nepřidávají položky do historie: Zpět vede na předchozí stránku (Přehled), ne na prázdno ani do chyby
  await page.goBack({ waitUntil: "networkidle" });
  await expect(page.getByText("Něco se nepovedlo")).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/");
  await page.goForward({ waitUntil: "networkidle" });
  await expect(tab("Úkoly")).toHaveAttribute("aria-selected", "true");

  // neznámá záložka a podzáložka nerozbijí stránku
  await visit(page, `${job}?tab=neexistuje&sub=nic`, c);
  await expect(page.getByTestId("record-view")).toBeVisible();
  expectClean(c, "záložky v adrese");
  await ctx.close();
});

test("smazání firmy, která má zakázku: bez chyby, zakázka se otevře dál", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await pageAs(browser, "owner", { viewport: { width: 1280, height: 800 } });
  const c = collectErrors(page);
  const company = await createCompany(page, `Vazba ${stamp} s.r.o.`);
  await createJob(page, { title: `Zakázka vazba ${stamp}`, company });

  await visit(page, "/kontakty/firmy", c);
  await page.getByPlaceholder("Hledat…").fill(company);
  const row = page.getByRole("row").filter({ hasText: company });
  await expect(row).toBeVisible();
  await row.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /Smazat/ })
    .first()
    .click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: /Smazat|Potvrdit|Ano/ });
  if (await confirm.count()) await confirm.first().click();
  // firma se maže měkce (jde vrátit): buď věta o vazbě, nebo smazání; v obou případech žádná obecná chyba
  await expect(page.getByText("Něco se nepovedlo")).toHaveCount(0);
  await page.waitForTimeout(1200);
  // zakázka s odkazem na firmu se otevře dál bez chyby
  await visit(page, "/zakazky", c);
  await page.getByPlaceholder("Hledat…").fill(`Zakázka vazba ${stamp}`);
  const jobRow = page
    .getByRole("row")
    .filter({ hasText: `Zakázka vazba ${stamp}` })
    .first();
  await jobRow.hover();
  await jobRow.getByRole("button", { name: "Otevřít" }).click();
  await expect(page.getByTestId("record-view")).toBeVisible();
  await expect(page.getByText("Něco se nepovedlo")).toHaveCount(0);
  expectClean(c, "smazání používané firmy");
  await ctx.close();
});

test("částky: mezery, čárka a haléře se přečtou správně, nesmysl a záporná cena zůstanou v dialogu s větou", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await pageAs(browser, "owner", { viewport: { width: 1280, height: 800 } });
  const c = collectErrors(page);
  const company = await createCompany(page, `Částky ${stamp} s.r.o.`);
  const view = await createJob(page, {
    title: `Zakázka částky ${stamp}`,
    company,
    value: "1 234 567,89",
  });
  // částka s mezerou a čárkou se uloží do haléře přesně (a zobrazí česky)
  await expect(view).toContainText(/1\s234\s567,89/);

  // nesmyslná a záporná cena: dialog zůstane otevřený a řekne proč, žádná obecná chyba
  for (const bad of ["abc", "-5 000"]) {
    await page.goto("/zakazky", { waitUntil: "networkidle" });
    await page.getByTestId("create-record").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Název/).fill(`Špatná cena ${stamp}`);
    await dialog.getByRole("button", { name: "Vybrat…" }).first().click();
    await page.getByPlaceholder("Hledat…").last().fill(company);
    await page.getByRole("option", { name: company }).click();
    await dialog.getByRole("button", { name: /Další pole/ }).click();
    await dialog.getByLabel("Původní smluvní cena").fill(bad);
    await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
    await page.waitForTimeout(800);
    await expect(page.getByText("Něco se nepovedlo"), `cena „${bad}“`).toHaveCount(0);
    // dialog zůstane otevřený a řekne proč; zakázka s nesmyslnou cenou nevznikne
    await expect(dialog, `cena „${bad}“`).toBeVisible();
    await expect(dialog).toContainText(/neplatnou hodnotu|nesmí být záporné|částku/);
  }
  expectClean(c, "částky");
  await ctx.close();
});
