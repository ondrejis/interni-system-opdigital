import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean } from "./helpers";
import { newStamp } from "./obchod-helpers";

/**
 * Vlastní nástěnky: vytvoření, přidání widgetů (KPI, graf, souhrn podle stavu), přesun, změna velikosti, uložení,
 * filtry v adrese, export dat widgetu, sdílení, klonování a smazání. Každý test si založí nástěnku s unikátním názvem.
 */
test.describe.configure({ mode: "serial" });

const stamp = newStamp();
const name = `Test nástěnka ${stamp}`;
let boardUrl = "";

const shot = async (page: Page, file: string) => {
  if (process.env.E2E_SHOTS)
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/${file}.png`, fullPage: true });
};

async function addWidget(
  page: Page,
  kind: string,
  fill: (d: ReturnType<Page["getByTestId"]>) => Promise<void>,
) {
  await page.getByTestId("add-widget").click();
  await page.getByRole("menuitem", { name: kind }).click();
  const editor = page.getByTestId("widget-editor");
  await expect(editor).toBeVisible();
  await fill(editor);
  await editor.getByTestId("widget-save").click();
  await expect(editor).toBeHidden();
}

test("nová nástěnka na úvodní stránce s přepínačem", async ({ page }) => {
  const c = collectErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("dashboard-switcher")).toBeVisible();
  await page.getByTestId("new-dashboard").click();
  await page.getByLabel("Název nástěnky").fill(name);
  await page.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page).toHaveURL(/board=/);
  await expect(page.getByTestId("dashboard-title")).toHaveText(name);
  boardUrl = page.url();
  await expect(page.getByText("Nástěnka je zatím prázdná.")).toBeVisible();
  expectClean(c, "nová nástěnka");
});

test("přidání KPI, grafu a souhrnu podle stavu, přesun a velikost, uložení", async ({ page }) => {
  test.setTimeout(150_000);
  const c = collectErrors(page);
  await page.goto(boardUrl);
  await page.getByTestId("edit-dashboard").click();

  await addWidget(page, "Číslo (KPI)", async (e) => {
    await e.getByLabel("Název widgetu").fill("Počet zakázek");
    await e.getByLabel("Záznamy").selectOption({ label: "Zakázky" });
  });
  await addWidget(page, "Graf", async (e) => {
    await e.getByLabel("Název widgetu").fill("Zakázky podle fáze");
    await e.getByLabel("Záznamy").selectOption({ label: "Zakázky" });
    await e.getByLabel("Seskupit podle").selectOption({ label: "Fáze" });
  });
  await addWidget(page, "Souhrn podle stavu", async (e) => {
    await e.getByLabel("Název widgetu").fill("Zakázky podle stavu");
    await e.getByLabel("Záznamy").selectOption({ label: "Zakázky" });
    await e.getByLabel(/Stav \(seskupit/).selectOption({ label: "Stav" });
  });
  const cards = page.getByTestId("widget-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.first().getByTestId("widget-kpi")).toBeVisible({ timeout: 20_000 });

  // přesun: třetí widget klávesnicí na první místo
  const handle = cards.nth(2).getByTestId("widget-drag");
  await handle.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(250);
  await page.keyboard.press("Space");
  await expect(cards.first()).toHaveAttribute("aria-label", "Zakázky podle stavu");
  // velikost: šipkou doprava na rukojeti
  const resize = cards.first().getByTestId("widget-resize");
  await resize.focus();
  await page.keyboard.press("ArrowRight");
  await shot(page, "dashboard-edit");

  await page.getByTestId("save-dashboard").click();
  await expect(page.getByTestId("edit-dashboard")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("widget-card")).toHaveCount(3);
  await expect(page.getByTestId("widget-status")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("widget-kpi")).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "dashboard-view");
  expectClean(c, "sestavení nástěnky");
});

test("změna velikosti widgetu tažením myši a zrušení úprav", async ({ page }) => {
  const c = collectErrors(page);
  await page.goto(boardUrl);
  await page.getByTestId("edit-dashboard").click();
  const card = page.getByTestId("widget-card").nth(1);
  const before = (await card.boundingBox())!;
  const handle = (await card.getByTestId("widget-resize").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 260, handle.y + 120, { steps: 8 });
  await page.mouse.up();
  const after = (await card.boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width + 50);
  expect(after.height).toBeGreaterThan(before.height + 20);
  // zrušení úprav nic neuloží
  await page.getByTestId("cancel-edit").click();
  await page.reload();
  const saved = (await page.getByTestId("widget-card").nth(1).boundingBox())!;
  expect(Math.abs(saved.width - before.width)).toBeLessThan(2);
  expectClean(c, "změna velikosti");
});

test("filtry nástěnky jsou v adrese a propsají se do widgetů", async ({ page }) => {
  const c = collectErrors(page);
  await page.goto(boardUrl);
  await page.getByLabel("Období").selectOption({ label: "Tento měsíc" });
  await expect(page).toHaveURL(/obdobi=this_month/);
  await page.reload();
  await expect(page.getByLabel("Období")).toHaveValue("this_month");
  await expect(page.getByTestId("widget-card").first()).toBeVisible();
  expectClean(c, "filtry nástěnky");
});

test("export dat widgetu do CSV a XLSX a celé nástěnky do PDF", async ({ page }) => {
  const c = collectErrors(page);
  await page.goto(boardUrl);
  const widget = page.getByTestId("widget-card").filter({ hasText: "Zakázky podle stavu" });
  await expect(widget.getByTestId("widget-status")).toBeVisible({ timeout: 20_000 });
  await widget.getByTestId("widget-menu").click();
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "CSV" }).click(),
  ]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  const text = (await readStream(await csv.createReadStream())).toString("utf8");
  expect(text.startsWith("﻿")).toBe(true);
  expect(text.split("\r\n")[0]).toContain("Stav");

  await widget.getByTestId("widget-menu").click();
  const [xlsx] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /Excel/ }).click(),
  ]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);

  await page.getByTestId("dashboard-menu").click();
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-pdf").click(),
  ]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  const head = (await readStream(await pdf.createReadStream())).subarray(0, 5).toString();
  expect(head).toBe("%PDF-");

  await page.getByTestId("dashboard-menu").click();
  const [png] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /obrázek \(PNG\)/ }).click(),
  ]);
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  expect((await readStream(await png.createReadStream())).subarray(1, 4).toString()).toBe("PNG");
  expectClean(c, "exporty nástěnky");
});

test("sdílení, klonování, celá obrazovka a smazání; přístupnost", async ({ page }) => {
  const c = collectErrors(page);
  await page.goto(boardUrl);
  await expect(page.getByTestId("widget-card").first()).toBeVisible();
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(a11y.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );

  await page.getByTestId("dashboard-menu").click();
  await page.getByRole("menuitem", { name: /Sdílet/ }).click();
  const dlg = page.getByTestId("share-dialog");
  await expect(dlg).toBeVisible();
  await dlg.getByLabel("Role").click();
  await page.getByRole("option").first().click();
  await page.keyboard.press("Escape");
  await dlg.getByRole("button", { name: "Uložit sdílení" }).click();
  await expect(dlg).toBeHidden();

  await page.getByTestId("dashboard-menu").click();
  await page.getByRole("menuitem", { name: /Klonovat/ }).click();
  await expect(page.getByTestId("dashboard-title")).toContainText("(kopie)");

  // TV režim
  const id = new URL(boardUrl).searchParams.get("board");
  await page.goto(`/tv/${id}`);
  await expect(page.getByTestId("tv-board")).toBeVisible();
  await expect(page.getByRole("complementary")).toHaveCount(0);

  // úklid: smazat kopii i originál
  for (const n of [`${name} (kopie)`, name]) {
    await page.goto("/");
    await page.getByTestId("dashboard-tab").filter({ hasText: n }).first().click();
    await page.getByTestId("dashboard-menu").click();
    await page.getByRole("menuitem", { name: "Smazat" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Smazat" }).click();
    await expect(page).toHaveURL(/\/$/);
  }
  expectClean(c, "sdílení a smazání");
});

async function readStream(s: NodeJS.ReadableStream | null): Promise<Buffer> {
  const parts: Buffer[] = [];
  if (!s) return Buffer.alloc(0);
  for await (const p of s) parts.push(Buffer.from(p as Buffer));
  return Buffer.concat(parts);
}
