import { expect, test } from "@playwright/test";
import { ensureCompany } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);

/*
  MPR-3: opakované faktury přes Fakturoid. Vyžaduje server spuštěný s `FAKTUROID_MODE=fake` (faktury se pak vytvářejí jen
  v paměti procesu, nic nejde do skutečného Fakturoidu): `FAKTUROID_MODE=fake pnpm test:e2e muj-prostor-faktury`
  (Playwright předá své prostředí i spouštěnému serveru). Bez příznaku se spec přeskočí.
*/
test.skip(process.env.FAKTUROID_MODE !== "fake", "Vyžaduje FAKTUROID_MODE=fake");

const addDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test("panel Fakturoid v Integracích: uložení a test spojení, tajemství se nevrací", async ({
  page,
}) => {
  await page.goto("/nastaveni/integrace");
  const panel = page.getByTestId("fakturoid-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Vývojový režim");
  await panel.getByTestId("fakturoid-account").fill("acme");
  await panel.getByTestId("fakturoid-email").fill("dvorak@example.com");
  await panel.getByTestId("fakturoid-client-id").fill("client-id-1234");
  await panel.getByTestId("fakturoid-secret").fill(`tajne-${stamp}`);
  await panel.getByTestId("fakturoid-save").click();
  await expect(page.getByText("Přístup k Fakturoidu uložen.")).toBeVisible();
  await expect(panel.getByTestId("fakturoid-secret")).toHaveValue("");
  await panel.getByTestId("fakturoid-test").click();
  await expect(panel.getByTestId("fakturoid-test-result")).toContainText("Spojení funguje");
  await expect(page.locator("body")).not.toContainText(`tajne-${stamp}`);
});

test("stránka Opakované faktury: prázdný stav a ruční příprava návrhů", async ({ page }) => {
  await page.goto("/muj-prostor/faktury");
  await expect(page.getByTestId("invoices-page")).toBeVisible();
  await expect(page.getByTestId("kpi-drafts")).toBeVisible();
  await page.getByTestId("invoices-prepare").click();
  await expect(page.getByText(/Připraveno návrhů|Žádný nový návrh/)).toBeVisible();
});

test("návrh faktury: z hostingu přes schválení po vytvoření ve Fakturoidu a posun obnovy", async ({
  page,
  context,
}) => {
  const company = await ensureCompany(context);
  const name = `Hosting fakturace ${stamp}`;
  await page.goto("/muj-prostor/hosting/vse?novy=1");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(name);
  await dialog
    .getByRole("button", { name: /^Vybrat/ })
    .first()
    .click();
  await page.getByPlaceholder("Hledat…").last().fill(company);
  await page.getByRole("option", { name: company }).click();
  await dialog.getByLabel(/Cena za období/).fill("6000");
  await dialog.getByLabel(/Další obnova/).fill(addDays(5));
  await dialog.getByRole("checkbox", { name: /Připravovat fakturu/ }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();

  await page.goto("/muj-prostor/faktury");
  await page.getByTestId("invoices-prepare").click();
  const row = page.getByTestId("invoice-row").filter({ hasText: name });
  await expect(row).toHaveAttribute("data-status", "draft");
  await expect(row.getByTestId("invoice-amount")).toContainText("6");

  // upravit koncept
  await row.getByTestId("invoice-edit").click();
  const edit = page.getByTestId("invoice-edit-dialog");
  await edit.getByLabel("Částka v Kč").fill("6500");
  await edit.getByTestId("invoice-edit-save").click();
  await expect(row.getByTestId("invoice-amount")).toContainText("6");

  // schválit
  await row.getByTestId("invoice-approve").click();
  await page.getByRole("button", { name: "Schválit a vytvořit", exact: true }).click();
  await expect(row).toHaveAttribute("data-status", "sent_to_fakturoid");
  await expect(row.getByTestId("invoice-number")).toBeVisible();
  await expect(row).toContainText("Platba založena");
  // hotovou fakturu už nejde ani schválit, ani upravit
  await expect(row.getByTestId("invoice-approve")).toHaveCount(0);
  await expect(row.getByTestId("invoice-edit")).toHaveCount(0);
});

test("zrušení a obnovení návrhu", async ({ page, context }) => {
  const company = await ensureCompany(context);
  const name = `Údržba fakturace ${stamp}`;
  await page.goto("/muj-prostor/hosting/vse?novy=1");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(name);
  await dialog
    .getByRole("button", { name: /^Vybrat/ })
    .first()
    .click();
  await page.getByPlaceholder("Hledat…").last().fill(company);
  await page.getByRole("option", { name: company }).click();
  await dialog.getByLabel(/Cena za období/).fill("1200");
  await dialog.getByLabel(/Další obnova/).fill(addDays(3));
  await dialog.getByRole("checkbox", { name: /Připravovat fakturu/ }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await page.goto("/muj-prostor/faktury");
  await page.getByTestId("invoices-prepare").click();
  const row = page.getByTestId("invoice-row").filter({ hasText: name });
  await row.getByTestId("invoice-cancel").click();
  await expect(row).toHaveAttribute("data-status", "canceled");
  await row.getByTestId("invoice-reopen").click();
  await expect(row).toHaveAttribute("data-status", "draft");
});
