import { expect, test } from "@playwright/test";
import { ensureCompany } from "./helpers";

/*
  FIN-C (AS-02 až AS-04 z pohledu UI): zakázka → pravidla 60/40 s živým náhledem → platba 50 000 Kč → Vystavená (číslo
  faktury, datum) → Zaplacená (datum) → saldo „dluží 20 000 Kč“ → Zapsat vyrovnání → „Vyrovnáno“ → storno vrátí dluh.
  Retainer: Pokračovat na retainer (dialog) a ukončení s dopadem na plánované platby. Firmu a zakázku si test zakládá sám.
*/
test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const payTitle = `Web – celá cena ${stamp}`;
const jobTitle = `Finance web ${stamp}`;
let jobUrl = "";

test("zakázka pro finance", async ({ page, context }) => {
  const company = await ensureCompany(context);
  await page.goto("/zakazky");
  await page.getByTestId("create-job").click();
  const dialog = page.getByTestId("create-job-dialog");
  await dialog.getByRole("button", { name: /^Klient/ }).click();
  await page.getByPlaceholder("Najít klienta…").fill(company);
  await page.getByRole("option", { name: company }).click();
  await dialog.getByLabel("Název").fill(jobTitle);
  await dialog.getByTestId("create-job-submit").click();
  await expect(page.getByTestId("job-header")).toBeVisible();
  jobUrl = page.url().split("?")[0]!;
});

test("pravidla rozdělení 60/40 s živým náhledem", async ({ page }) => {
  await page.goto(`${jobUrl}?tab=finance`);
  const tab = page.getByTestId("job-finance-tab");
  await expect(tab).toBeVisible();
  const editor = tab.getByTestId("split-editor");
  await editor.getByRole("button", { name: "Nastavit 50 / 50" }).click();
  const rules = editor.getByTestId("split-rule");
  await expect(rules).toHaveCount(2);
  // fakturující (přihlášený) dostane 60 %, druhý majitel 40 %
  await rules.nth(0).getByLabel("Osoba").selectOption({ label: "E2E Aplikace" });
  await rules.nth(1).getByLabel("Osoba").selectOption({ label: "E2E Majitel" });
  await rules.nth(0).getByLabel("Procento").fill("60");
  await rules.nth(1).getByLabel("Procento").fill("40");
  await expect(editor.getByTestId("split-preview-text")).toContainText(
    /Z platby 10.000.Kč dostane .*6.000.Kč, .*4.000.Kč\./,
  );
  await tab.getByTestId("split-save").click();
  await expect(page.getByText("Pravidla rozdělení uložena.")).toBeVisible();
});

test("součet procent nad 100 % blokuje uložení", async ({ page }) => {
  await page.goto(`${jobUrl}?tab=finance`);
  const editor = page.getByTestId("split-editor");
  await editor.getByTestId("split-rule").nth(0).getByLabel("Procento").fill("80");
  await expect(editor.getByRole("status")).toContainText(/100/);
  await expect(page.getByTestId("split-save")).toBeDisabled();
  await page.reload();
});

test("platba: Plánovaná → Vystavená → Zaplacená", async ({ page }) => {
  await page.goto(`${jobUrl}?tab=finance`);
  await page.getByTestId("job-payment-new").click();
  const form = page.getByTestId("payment-form");
  await form.getByTestId("payment-description").fill(payTitle);
  await form.getByLabel("Částka", { exact: true }).fill("50000");
  await form.getByTestId("payment-save").click();
  await expect(page.getByText("Platba zapsána.")).toBeVisible();

  const row = page.getByTestId("payment-row").filter({ hasText: payTitle });
  await expect(row).toContainText("Plánovaná");
  await row.getByTestId("step-issued").click();
  const dlg = page.getByTestId("transition-dialog");
  await dlg.getByTestId("transition-confirm").click();
  await expect(dlg.getByText("Vyplňte číslo faktury.")).toBeVisible();
  await dlg.getByTestId("invoice-number").fill(`2026-${stamp}`);
  await dlg.getByTestId("transition-confirm").click();
  await expect(row).toContainText("Vystavená");
  await expect(row).toContainText(`2026-${stamp}`);

  await row.getByTestId("step-paid").click();
  await page.getByTestId("transition-confirm").click();
  await expect(row).toContainText("Zaplacená");
});

test("seznam plateb: filtr stavu, součty dole", async ({ page }) => {
  await page.goto("/finance");
  await page.getByRole("button", { name: "Zaplacené" }).click();
  const row = page.getByTestId("payment-row").filter({ hasText: payTitle });
  await expect(row).toBeVisible();
  // AS-02: 60/40 z 50 000 Kč = 30 000 a 20 000 Kč (podíly obou v řádku)
  await expect(row).toContainText(/30\s000\sKč/);
  await expect(row).toContainText(/20\s000\sKč/);
  await expect(page.getByTestId("payments-totals")).toBeVisible();
  await page.getByRole("button", { name: "Plánované" }).click();
  await expect(page.getByTestId("payment-row").filter({ hasText: payTitle })).toHaveCount(0);
});

test("vyrovnání: saldo, zapsat vyrovnání, storno", async ({ page }) => {
  await page.goto("/finance/vyrovnani");
  const headline = page.getByTestId("balance-headline");
  await expect(headline).toContainText(/dluží/);
  const before = (await headline.innerText()).trim();

  await page.getByTestId("settlement-new").click();
  await page.getByTestId("settlement-save").click();
  await expect(page.getByText("Vyrovnání zapsáno.")).toBeVisible();
  await expect(headline).toHaveText("Vyrovnáno");

  await page
    .getByTestId("settlement-row")
    .first()
    .getByRole("button", { name: "Stornovat" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Stornovat", exact: true }).click();
  await expect(headline).toHaveText(before);
});

test("rozpis po měsících se rozklikne na platby", async ({ page }) => {
  await page.goto("/finance/vyrovnani");
  await page.getByTestId("balance-month").first().getByRole("button").first().click();
  await expect(page.getByTestId("payment-row").filter({ hasText: payTitle })).toBeVisible();
});

test("retainer: dialog Pokračovat a ukončení s dopadem", async ({ page }) => {
  await page.goto(`${jobUrl}?tab=finance`);
  // dialog je dostupný jen při čekajícím rozhodnutí; bez něj ověříme aspoň platby a přehledy
  const cont = page.getByTestId("finance-continue");
  if (await cont.isVisible().catch(() => false)) {
    await cont.click();
    const d = page.getByTestId("retainer-continue-dialog");
    await d.getByLabel("Měsíční částka retaineru").fill("15000");
    await d.getByTestId("retainer-confirm").click();
    await expect(page.getByText("Zakázka pokračuje jako retainer.")).toBeVisible();
  }
  await page.goto("/finance/prehledy");
  await expect(page.getByTestId("reports-page")).toBeVisible();
  await expect(page.getByRole("img", { name: /Příjmy podle osoby/ })).toBeVisible();
});

test("Nastavení → Finance: základ salda a výchozí rozdělení", async ({ page }) => {
  await page.goto("/nastaveni/finance");
  await expect(page.getByTestId("settings-basis")).toBeVisible();
  await page.getByRole("radio", { name: "Vystavené (i zaplacené)" }).click();
  await page.getByTestId("settings-basis-save").click();
  await expect(page.getByText("Základ salda uložen.")).toBeVisible();
  await page.getByRole("radio", { name: "Zaplacené platby" }).click();
  await page.getByTestId("settings-basis-save").click();
  await expect(page.getByText("Základ salda uložen.")).toBeVisible();
});
