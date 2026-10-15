import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);

/*
  Nastavení → Integrace (kostra): stránka se otevře, stav je vidět, webhook jde přidat (tajemství se ukáže jednou),
  poslat test (na neexistující adresu skončí chybou v seznamu doručení) a smazat; tajemství příchozích požadavků.
  Odesílání na skutečný HTTP server pokrývají integrační testy jádra (`packages/core/src/webhooks`).
*/

test("integrace: stránka, stav a návod se zobrazí", async ({ page }) => {
  await page.goto("/nastaveni/integrace");
  await expect(page.getByRole("heading", { name: "Integrace", level: 2 })).toBeVisible();
  await expect(page.getByTestId("integration-status")).toBeVisible();
  await expect(page.getByTestId("integration-help")).toContainText("X-Opsys-Signature");
});

test("webhook: přidání, jednorázové tajemství, zkušební odeslání a smazání", async ({ page }) => {
  const name = `n8n ${stamp}`;
  await page.goto("/nastaveni/integrace");
  await page.getByTestId("add-webhook").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Název").fill(name);
  // nepoužitelná, ale platná adresa v interní síti: test skončí chybou spojení
  await dialog.getByLabel("Adresa (URL)").fill("http://localhost:9/webhook/opsys");
  await dialog.getByRole("checkbox", { name: "Obchody: všechny události" }).click();
  await dialog.getByRole("button", { name: "Přidat webhook" }).click();

  const secret = page.getByTestId("revealed-secret");
  await expect(secret).toContainText("whsec_");
  await page.getByRole("button", { name: "Uložil(a) jsem si ho" }).click();
  await expect(page.getByTestId("revealed-secret")).toHaveCount(0);

  const row = page.getByTestId("webhooks-table").getByRole("row", { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: new RegExp(`Odeslat test: ${name}`) }).click();
  await expect(page.getByText(/Test se nepovedl/)).toBeVisible();
  await expect(
    page.getByTestId("deliveries-table").getByText("Zkušební webhook").first(),
  ).toBeVisible();

  await row.getByRole("button", { name: `Smazat ${name}` }).click();
  await page.getByRole("button", { name: "Smazat webhook" }).click();
  await expect(page.getByText("Webhook smazán.")).toBeVisible();
});

test("příchozí požadavky: tajemství se vygeneruje a ukáže jednou", async ({ page }) => {
  await page.goto("/nastaveni/integrace");
  await page.getByTestId("rotate-ingest-secret").click();
  if (await page.getByRole("button", { name: "Vyměnit tajemství", exact: true }).last().isVisible())
    await page.getByRole("dialog").getByRole("button", { name: "Vyměnit tajemství" }).click();
  await expect(page.getByTestId("revealed-secret")).toContainText("ingest_");
});
