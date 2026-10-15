import { expect, test } from "@playwright/test";

/*
  Modul „disk“ (DSK): tlačítko Otevřít Disk na kartě klienta a Nastavení → Google Disk. Stavy, které potřebují
  odpověď n8n (Otevřít Disk, Zkusit znovu), pokrývá `tests/disk.int.test.ts` a `packages/modules/disk/src/state.test.ts`
  (model tlačítka); tady je vidět to, co jde z prohlížeče: Vytvořit složku → Vytváří se… a editor stromu složek.
*/
test("klient bez složky: Vytvořit složku → Vytváří se…", async ({ page }) => {
  const name = `Disk e2e ${Math.random().toString(36).slice(2, 8)} s.r.o.`;
  await page.goto("/kontakty/firmy");
  await page.getByTestId("create-record").click();
  await page.getByRole("dialog").getByLabel(/Název/).fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Vytvořit", exact: true }).click();
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name, exact: true })).toBeVisible();

  const card = view.getByTestId("drive-card");
  const button = card.getByTestId("drive-button");
  await expect(button).toHaveAttribute("data-kind", "create");
  await expect(button).toHaveText(/Vytvořit složku/);
  await button.click();
  await expect(button).toHaveAttribute("data-kind", "wait");
  await expect(button).toHaveText(/Vytváří se…/);
  await expect(button).toBeDisabled();
});

test("Nastavení → Google Disk: test napojení a úprava stromu složek", async ({ page }) => {
  await page.goto("/nastaveni/google-disk");
  await expect(page.getByRole("heading", { name: "Google Disk" })).toBeVisible();

  await page.getByRole("button", { name: /Otestovat napojení/ }).click();
  await expect(page.getByTestId("disk-test-result")).toBeVisible();

  // strom klienta: přidat složku, uložit, vrátit zpět
  const folder = `E2E ${Math.random().toString(36).slice(2, 6)}`;
  await page.getByRole("button", { name: "Přidat složku" }).click();
  const inputs = page.getByTestId("tree-node").getByRole("textbox");
  await inputs.last().fill(folder);
  await page.getByRole("button", { name: "Uložit strom" }).click();
  await expect(page.getByText(/Strom složek uložen/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByTestId("tree-node").getByRole("textbox").filter({ hasText: "" }).last(),
  ).toHaveValue(folder);

  // úklid: smazat přidanou složku
  await page.getByRole("button", { name: "Smazat složku" }).last().click();
  await page.getByRole("button", { name: "Uložit strom" }).click();
  await expect(page.getByText(/Strom složek uložen/)).toBeVisible();
});
