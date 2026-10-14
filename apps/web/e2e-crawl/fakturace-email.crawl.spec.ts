import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { clickSubmenuItem, collectErrors, expectClean, visit } from "./helpers";

/**
 * Procházka: odesílání faktur e-mailem (dialog, evidence, hromadné odeslání, šablony), exporty (XLSX seznamu,
 * balík pro účetní) a stránka SMTP. Vývojová databáze nemá nastavené SMTP, takže se ověřuje hláška s odkazem
 * do Nastavení; nic se neodesílá a žádné nastavení se neukládá. Snímky: `CRAWL_SHOTS=<složka>`.
 */
const shots = process.env.CRAWL_SHOTS;
const shot = async (page: Page, name: string) => {
  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
  }
};

test("stránky: nastavení fakturace, export, SMTP a seznam faktur se otevřou bez chyby", async ({
  page,
}) => {
  const c = collectErrors(page);
  await visit(page, "/fakturace/nastaveni", c);
  await expect(page.getByRole("heading", { name: "E-maily s doklady" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Šablona faktury (PDF)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Šablona nabídky (PDF)" })).toBeVisible();
  await shot(page, "nastaveni-fakturace");

  await visit(page, "/fakturace/export", c);
  await expect(page.getByRole("heading", { name: "Balík pro účetní" })).toBeVisible();
  await shot(page, "export");

  await visit(page, "/nastaveni/email", c);
  await expect(page.getByRole("heading", { name: "Odesílání (SMTP)" })).toBeVisible();
  await shot(page, "smtp");

  await visit(page, "/fakturace", c);
  expectClean(c, "stránky");
});

test("šablona e-mailu: překlep v proměnné se odmítne, náhled ukáže ukázková data (nic se neukládá)", async ({
  page,
}) => {
  const c = collectErrors(page);
  await visit(page, "/fakturace/nastaveni", c);
  await page.getByRole("button", { name: "Náhled" }).first().click();
  const preview = page.getByTestId("template-preview").first();
  await expect(preview).toContainText("FV-2026-0012");
  await expect(preview).not.toContainText("{cislo}");

  const body = page.getByLabel("Text e-mailu").first();
  const original = await body.inputValue();
  await body.fill(`${original}\n{castak}`);
  await page.getByTestId("save-settings").click();
  await expect(page.getByText(/Neznámá proměnná \{castak\}/)).toBeVisible();
  await body.fill(original); // nic se neuložilo; vracíme pole jen pro pořádek
  expectClean(c, "šablona");
});

test("export seznamu faktur do XLSX je celá filtrovaná sada a otevře se jako ZIP/OOXML", async ({
  page,
}) => {
  const c = collectErrors(page);
  await visit(page, "/fakturace", c);
  await page.getByTestId("list-options").click();
  await page.getByTestId("export-menu").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    clickSubmenuItem(page, page.getByRole("menuitem", { name: "Excel (XLSX)" })),
  ]);
  expect(download.suggestedFilename()).toMatch(/^faktury-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const path = await download.path();
  const bytes = fs.readFileSync(path);
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  expect(bytes.length).toBeGreaterThan(1000);
  await expect(page.getByText(/Exportováno záznamů: \d+/)).toBeVisible();
  expectClean(c, "export XLSX");
});

test("balík pro účetní: API vrací ZIP, prázdné období srozumitelnou chybu", async ({ page }) => {
  const c = collectErrors(page);
  c.ignore(/status of 422/); // prázdné období je očekávaná chyba 422 s hláškou
  await visit(page, "/fakturace/export", c);
  const zip = await page.evaluate(async () => {
    const r = await fetch("/api/fakturace/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "2020-01-01", to: "2035-01-01", format: "xlsx" }),
    });
    const buf = new Uint8Array(await r.arrayBuffer());
    return {
      status: r.status,
      type: r.headers.get("content-type"),
      head: String.fromCharCode(buf[0]!, buf[1]!),
      size: buf.length,
    };
  });
  expect(zip).toMatchObject({ status: 200, type: "application/zip", head: "PK" });
  expect(zip.size).toBeGreaterThan(500);

  const empty = await page.evaluate(async () => {
    const r = await fetch("/api/fakturace/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "2001-01-01", to: "2001-01-31", format: "csv" }),
    });
    return { status: r.status, body: (await r.json()) as { error: string } };
  });
  expect(empty.status).toBe(422);
  expect(empty.body.error).toMatch(/nejsou žádné/);
  expectClean(c, "balík");
});

test("faktura: Odeslat e-mailem (dialog, náhled, hláška o SMTP) a záložka Odeslání", async ({
  page,
}) => {
  const c = collectErrors(page);
  await visit(page, "/fakturace", c);
  // první vystavená faktura (má číslo; koncept ho nemá)
  const row = page
    .getByRole("row")
    .filter({ hasText: /(ZF|FV|DB)-\d{4}-\d{4}/ })
    .first();
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}$/);
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Odeslat e-mailem" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Komu")).toBeVisible();
  await expect(dialog.getByLabel("Předmět")).not.toHaveValue("");
  await expect(dialog.getByText(/Příloha: .*\.pdf/)).toBeVisible();
  await dialog.getByRole("radio", { name: "Náhled" }).click();
  await expect(dialog.getByTestId("mail-preview")).toContainText("Dobrý den");
  await expect(dialog.getByTestId("mail-preview")).not.toContainText("{cislo}");
  // dev databáze nemá SMTP: hláška s odkazem do Nastavení a odeslání je zakázané
  await expect(dialog.getByText("Odesílání e-mailů není nastavené")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Nastavení → E-maily" })).toHaveAttribute(
    "href",
    "/nastaveni/email",
  );
  await expect(dialog.getByRole("button", { name: "Odeslat e-mail" })).toBeDisabled();
  await shot(page, "dialog-odeslat");
  await dialog.getByRole("button", { name: "Zrušit" }).click();

  await view.getByRole("tab", { name: "Odeslání" }).click();
  await expect(view.getByText("Doklad zatím nebyl odeslán e-mailem.")).toBeVisible();
  await shot(page, "zalozka-odeslani");
  expectClean(c, "detail faktury");
});

test("seznam: hromadné odeslání se potvrzuje a ukáže, komu co odejde", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/fakturace", c);
  await page.getByRole("checkbox", { name: "Vybrat vše" }).click();
  const bar = page.getByRole("region", { name: "Hromadné akce" });
  await expect(bar.getByRole("button", { name: "Odeslat e-mailem" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Poslat upomínky" })).toBeVisible();
  // hromadně jde odeslat nejvýš 50 dokladů; ve větší databázi dialog řekne, co s tím, a vybere se jen pár řádků
  const selected = Number((await bar.innerText()).match(/Vybráno:?\s*(\d+)/)?.[1] ?? 0);
  if (selected > 50) {
    await bar.getByRole("button", { name: "Odeslat e-mailem" }).click();
    await expect(page.getByRole("dialog").getByTestId("bulk-too-many")).toContainText("nejvýš 50");
    await page
      .getByTestId("bulk-too-many")
      .getByRole("button", { name: "Zavřít", exact: true })
      .click();
    await bar.getByRole("button", { name: "Zrušit výběr" }).click();
    const rows = page.getByRole("row").filter({ hasText: /(ZF|FV|DB)-\d{4}-\d{4}/ });
    for (let i = 0; i < 3; i++) await rows.nth(i).getByRole("checkbox").click();
  }
  await bar.getByRole("button", { name: "Odeslat e-mailem" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("bulk-preview")).toBeVisible();
  await expect(dialog.getByText("Odesílání e-mailů není nastavené")).toBeVisible();
  // bez SMTP je odeslání zakázané, zbytek dialogu je pro kontrolu
  await expect(dialog.getByRole("button", { name: /^Odeslat \d+ e-mailů$/ })).toBeDisabled();
  await shot(page, "hromadne-odeslani");
  await dialog.getByRole("button", { name: "Zrušit" }).click();
  expectClean(c, "hromadné odeslání");
});
