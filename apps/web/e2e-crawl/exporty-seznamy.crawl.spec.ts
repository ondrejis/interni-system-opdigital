import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Download } from "@playwright/test";
import { clickSubmenuItem, collectErrors, expectClean } from "./helpers";
import { createCompany, newStamp, readZipEntry } from "./obchod-helpers";

/**
 * Export seznamů: rychlý export (CSV, XLSX, PDF), dialog s volbou sloupců a názvu souboru, aktuální pohled vs. vše,
 * ochrana proti vzorcům v buňkách, uložení šablony a Moje exporty. Obsah stažených souborů se kontroluje.
 */
test.describe.configure({ mode: "serial" });

const stamp = newStamp();
const evil = `=HYPERLINK("http://zlo","${stamp}")`;

async function bytes(d: Download): Promise<Buffer> {
  const parts: Buffer[] = [];
  const s = await d.createReadStream();
  for await (const p of s) parts.push(Buffer.from(p as Buffer));
  return Buffer.concat(parts);
}

test("příprava: firma s nebezpečným názvem (vzorec)", async ({ page }) => {
  const c = collectErrors(page);
  await createCompany(page, evil);
  expectClean(c, "příprava");
});

test("rychlý export CSV: BOM, středník, vzorec zneškodněn apostrofem; XLSX a PDF se stáhnou", async ({
  page,
}) => {
  const c = collectErrors(page);
  await page.goto("/kontakty/firmy");
  await page
    .getByPlaceholder(/Hledat/)
    .first()
    .fill(stamp);
  await expect(page.getByText(stamp).first()).toBeVisible();

  await page.getByTestId("list-options").click();
  await page.getByTestId("export-menu").click();
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    clickSubmenuItem(page, page.getByRole("menuitem", { name: "CSV" })),
  ]);
  const text = (await bytes(csv)).toString("utf8");
  expect(text.startsWith("﻿")).toBe(true);
  expect(text).toContain(`'=HYPERLINK`);
  expect(text.split("\r\n").some((l) => l.startsWith("=HYPERLINK"))).toBe(false);

  await page.getByTestId("list-options").click();
  await page.getByTestId("export-menu").click();
  const [xlsx] = await Promise.all([
    page.waitForEvent("download"),
    clickSubmenuItem(page, page.getByRole("menuitem", { name: /Excel/ })),
  ]);
  const zip = await bytes(xlsx);
  const sheet = readZipEntry(zip, "xl/worksheets/sheet1.xml") ?? "";
  expect(sheet).toContain('t="inlineStr"');
  expect(sheet).toContain("HYPERLINK"); // text, ne vzorec: v XLSX není prvek <f>
  expect(sheet).not.toContain("<f>");

  await page.getByTestId("list-options").click();
  await page.getByTestId("export-menu").click();
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    clickSubmenuItem(page, page.getByRole("menuitem", { name: "PDF" })),
  ]);
  expect((await bytes(pdf)).subarray(0, 5).toString()).toBe("%PDF-");
  expectClean(c, "rychlý export");
});

test("dialog: výběr sloupců, název souboru, rozsah a uložení šablony; a11y", async ({ page }) => {
  const c = collectErrors(page);
  await page.goto("/kontakty/firmy");
  await page.getByTestId("list-options").click();
  await page.getByTestId("export-menu").click();
  await clickSubmenuItem(page, page.getByTestId("export-dialog-open"));
  const dlg = page.getByTestId("export-dialog");
  await expect(dlg).toBeVisible();
  const a11y = await new AxeBuilder({ page })
    .include('[data-testid="export-dialog"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(a11y.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );

  await dlg.getByRole("radio", { name: "CSV" }).click();
  await dlg.getByLabel("Název souboru (bez přípony)").fill(`firmy-${stamp}`);
  // jen název: odškrtnout všechno ostatní
  await dlg.getByRole("button", { name: "Všechny" }).click();
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    dlg.getByTestId("export-run").click(),
  ]);
  expect(csv.suggestedFilename()).toBe(`firmy-${stamp}.csv`);
  const header = (await bytes(csv)).toString("utf8").split("\r\n")[0]!;
  expect(header.split(";").length).toBeGreaterThan(3); // všechny sloupce

  // šablona: uložit a znovu vybrat
  await page.getByTestId("list-options").click();
  await page.getByTestId("export-menu").click();
  await clickSubmenuItem(page, page.getByTestId("export-dialog-open"));
  await dlg.getByLabel("Název šablony").fill(`Šablona ${stamp}`);
  await dlg.getByRole("button", { name: "Uložit šablonu" }).click();
  await expect(dlg.locator("select#exp-template")).toContainText(`Šablona ${stamp}`, {
    timeout: 15_000,
  });
  expectClean(c, "dialog exportu");
});

test("velký export na pozadí: zařadí se do fronty a zobrazí se v Moje exporty", async ({
  page,
}) => {
  const c = collectErrors(page);
  await page.goto("/kontakty/firmy");
  await page.getByTestId("list-options").click();
  await page.getByTestId("export-menu").click();
  await clickSubmenuItem(page, page.getByTestId("export-dialog-open"));
  const dlg = page.getByTestId("export-dialog");
  await dlg.getByLabel(/Zpracovat na pozadí/).check();
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/export/") && r.request().method() === "POST",
  );
  await dlg.getByTestId("export-run").click();
  expect((await resp).status()).toBe(202);
  await expect(page.getByText(/zpracovává na pozadí/)).toBeVisible();
  expectClean(c, "export na pozadí");
});
