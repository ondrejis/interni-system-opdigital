import { expect, test } from "@playwright/test";
import { clickSubmenuItem } from "./helpers";

test.describe.configure({ mode: "serial" });

const name = `Nástěnka ${Math.random().toString(36).slice(2, 8)}`;

test("nástěnka: vytvoření, KPI a graf, uložení, export CSV a smazání", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-dashboard").click();
  await page.getByLabel("Název nástěnky").fill(name);
  await page.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("dashboard-title")).toHaveText(name);

  await page.getByTestId("edit-dashboard").click();
  await page.getByTestId("add-widget").click();
  await page.getByRole("menuitem", { name: "Číslo (KPI)" }).click();
  const editor = page.getByTestId("widget-editor");
  await editor.getByLabel("Název widgetu").fill("Firmy");
  await editor.getByLabel("Záznamy").selectOption({ label: "Firmy" });
  await editor.getByTestId("widget-save").click();
  await page.getByTestId("save-dashboard").click();
  await expect(page.getByTestId("widget-kpi")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("widget-menu").click();
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "CSV" }).click(),
  ]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);

  await page.getByTestId("dashboard-menu").click();
  await page.getByRole("menuitem", { name: "Smazat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("export seznamu: XLSX z tabulky firem a dialog s nastavením", async ({ page }) => {
  await page.goto("/kontakty/firmy");
  await page.getByTestId("list-options").click();
  await page.getByTestId("export-menu").click();
  const [xlsx] = await Promise.all([
    page.waitForEvent("download"),
    clickSubmenuItem(page, page.getByRole("menuitem", { name: /Excel/ })),
  ]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
  // export doběhl (tlačítko se na dobu exportu zakáže) a první nabídka je úplně zavřená; jinak by se druhý klik mohl trefit
  // do nabídky, která se právě zavírá, a ta by se znovu neotevřela
  await expect(page.getByTestId("list-options")).toBeEnabled();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByTestId("list-options").click();
  await page.getByTestId("export-menu").click();
  await expect(page.getByRole("menu").first()).toBeVisible();
  await clickSubmenuItem(page, page.getByTestId("export-dialog-open"));
  await expect(page.getByTestId("export-dialog")).toBeVisible();
});
