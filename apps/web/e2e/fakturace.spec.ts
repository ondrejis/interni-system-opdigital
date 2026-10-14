import { expect, test } from "@playwright/test";
import { pickCompany } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const job = `Fakturace ${stamp}`;
let invoiceUrl = "";

test("příprava: údaje o firmě a zakázka s hodnotou", async ({ page }) => {
  await page.goto("/nastaveni/firma");
  await page.getByLabel("Název firmy").fill("Stavby E2E s.r.o.");
  await page.getByLabel("IČO", { exact: true }).fill("12345678");
  await page.getByLabel("DIČ").fill("CZ12345678");
  await page.getByLabel("Ulice a č. p.").fill("Hlavní 1");
  await page.getByLabel("Město").fill("Plzeň");
  await page.getByLabel("PSČ").fill("30100");
  await page.getByLabel("Bankovní účet").fill("19-2000145399/0800");
  await page.getByRole("button", { name: "Uložit údaje" }).click();
  await expect(page.getByText("Údaje o firmě uloženy.")).toBeVisible();

  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(job);
  await pickCompany(page, dialog);
  await dialog.getByRole("button", { name: /Další pole/ }).click();
  await dialog.getByLabel("Původní smluvní cena").fill("100 000");
  await dialog.getByRole("button", { name: "Poptávka" }).click();
  await page.getByRole("option", { name: "Realizace" }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: job })).toBeVisible();
});

test("zálohová faktura ze zakázky: koncept → vystavení → číslo, PDF, úhrada", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: job });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  const panel = page.getByTestId("record-view");
  await panel.getByRole("tab", { name: "Fakturace" }).click();
  await panel.getByRole("radio", { name: "Faktury" }).click();
  // přehled fakturace: smluvní cena z hodnoty zakázky, zatím nic vyfakturováno
  const summary = panel.getByTestId("job-invoice-summary");
  await expect(summary.getByTestId("stat-contract")).toContainText("100 000 Kč");
  await expect(summary.getByTestId("stat-remaining")).toContainText("100 000 Kč");
  await panel.getByRole("button", { name: "Zálohová faktura" }).click();
  await page.getByLabel("Kolik procent smluvní ceny").fill("30");
  await page.getByRole("button", { name: "Vytvořit koncept" }).click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}$/);
  invoiceUrl = new URL(page.url()).pathname;

  const view = page.getByTestId("record-view");
  await view.getByRole("tab", { name: "Položky" }).click();
  await expect(view.getByTestId("invoice-totals")).toContainText("36 300 Kč"); // 30 000 + 21 %
  await expect(view.getByLabel("Popis položky 1")).toHaveValue(/Záloha 30 %/);

  await view.getByRole("button", { name: "Vystavit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Vystavit doklad" });
  await dialog.getByRole("button", { name: "Vystavit", exact: true }).click();
  await expect(page.getByText(/Vystaveno: ZF-\d{4}-\d{4}/)).toBeVisible();
  await expect(view.getByRole("button", { name: "Vystavit", exact: true })).toBeHidden();

  // PDF se stáhne a je to platný dokument
  const pdf = await page.request.get(`${invoiceUrl.replace("/fakturace/", "/api/fakturace/")}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // úhrada celé zbývající částky
  await view.getByRole("tab", { name: "Platby" }).click();
  await view.getByRole("button", { name: "Doplnit celou zbývající částku" }).click();
  await view.getByRole("button", { name: "Zapsat úhradu" }).click();
  await expect(view.getByTestId("payments-list")).toContainText("36 300 Kč");
  await expect(view.getByText("Uhrazeno", { exact: true })).toBeVisible();
});

test("vystavená faktura je zamčená a vysvětlí proč; přehled zakázky ukáže zálohu", async ({
  page,
}) => {
  await page.goto(invoiceUrl);
  const view = page.getByTestId("record-view");
  await view.getByRole("tab", { name: "Položky" }).click();
  await expect(view.getByTestId("lock-reason")).toContainText("zamčená");
  await expect(view.getByTestId("lock-reason")).toContainText("dobropisem");
  await expect(view.getByLabel("Popis položky 1")).toBeHidden();

  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: job });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  const panel = page.getByTestId("record-view");
  await panel.getByRole("tab", { name: "Fakturace" }).click();
  await panel.getByRole("radio", { name: "Faktury" }).click();
  const summary = panel.getByTestId("job-invoice-summary");
  // záloha 30 000 Kč bez DPH je vyfakturovaná a uhrazená
  await expect(summary.getByTestId("stat-invoiced")).toContainText("30 000 Kč");
  await expect(summary.getByTestId("stat-paid")).toContainText("30 000 Kč");
  await expect(summary.getByTestId("stat-remaining")).toContainText("70 000 Kč");
});

test("přenesená daňová povinnost na konceptu: bez DPH, s textem a bez sazeb", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: job });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  const panel = page.getByTestId("record-view");
  await panel.getByRole("tab", { name: "Fakturace" }).click();
  await panel.getByRole("radio", { name: "Faktury" }).click();
  await panel.getByRole("button", { name: "Zálohová faktura" }).click();
  await page.getByRole("radio", { name: "Pevná částka" }).click();
  await page.getByLabel("Částka bez DPH").fill("10 000");
  await page.getByRole("button", { name: "Vytvořit koncept" }).click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}$/);

  const view = page.getByTestId("record-view");
  await view.getByRole("tab", { name: "Položky" }).click();
  await expect(view.getByTestId("invoice-totals")).toContainText("12 100 Kč"); // 10 000 + 21 %
  await view.getByRole("button", { name: /Režim DPH/ }).click();
  await page.getByRole("option", { name: "Přenesená daňová povinnost" }).click();
  await expect(view.getByText(/Daň odvede zákazník \(§ 92a/)).toBeVisible();
  await expect(view.getByTestId("invoice-totals")).toContainText("Celkem bez DPH");
  await expect(view.getByTestId("invoice-totals")).toContainText("10 000 Kč");
  await view.getByRole("button", { name: "Uložit položky" }).click();
  await expect(page.getByText("Doklad uložen.")).toBeVisible();
  await page.reload();
  await view.getByRole("tab", { name: "Položky" }).click();
  await expect(view.getByTestId("invoice-totals")).toContainText("Celkem bez DPH");
  await view.getByRole("tab", { name: "Přehled" }).click();
  await expect(view.getByText("Přenesená daň. povinnost")).toBeVisible();
});

test("dobropis stornuje fakturu; export CSV obsahuje vystavené doklady", async ({ page }) => {
  await page.goto(invoiceUrl);
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Dobropis" }).click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}$/);
  await expect(view.getByRole("heading", { name: /Dobropis k ZF-/ })).toBeVisible();
  await view.getByRole("button", { name: "Vystavit", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Vystavit doklad" })
    .getByRole("button", { name: "Vystavit", exact: true })
    .click();
  await expect(page.getByText(/Vystaveno: DB-\d{4}-\d{4}/)).toBeVisible();

  await page.goto(invoiceUrl);
  await expect(
    page.getByTestId("record-view").getByText("Stornováno dobropisem", { exact: true }),
  ).toBeVisible();

  await page.goto("/fakturace/export");
  await page.getByRole("button", { name: "Tento měsíc" }).click();
  await page.getByRole("button", { name: /Formát přehledu/ }).click();
  await page.getByRole("option", { name: "CSV (Excel)" }).click();
  const download = page.waitForEvent("download");
  await page.getByTestId("export-list").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^faktury-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await (await import("node:fs/promises")).readFile((await file.path())!, "utf8");
  expect(csv).toContain("ZF-");
  expect(csv).toContain("DB-");
});

test("nastavení fakturace se uloží", async ({ page }) => {
  await page.goto("/fakturace/nastaveni");
  await page.getByLabel("Patička dokladu").fill("Zapsáno v OR u Krajského soudu v Plzni");
  await page.getByTestId("save-settings").click();
  await expect(page.getByText("Nastavení fakturace uloženo.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Patička dokladu")).toHaveValue(
    "Zapsáno v OR u Krajského soudu v Plzni",
  );
});
