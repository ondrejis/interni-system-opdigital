import { expect, test } from "@playwright/test";

/*
  Nastavení → Systém (OPS): stav systému, zálohy, databáze a fronty, chyby integrací, chybná doručení webhooků a odkaz
  do Koše. Data (zálohy, chybná doručení) se v e2e nenastavují: ověřuje se, že stránka vykreslí všechny sekce pro
  vlastníka a že odkaz do Koše funguje. Logiku stavů pokrývá `tests/system-status.int.test.ts`.
*/
test("Nastavení → Systém: sekce stavu, záloh, front, integrací, webhooků a Koš", async ({
  page,
}) => {
  await page.goto("/nastaveni/system");
  await expect(page.getByRole("heading", { name: "Systém", exact: true })).toBeVisible();
  await expect(page.getByTestId("system-health")).toBeVisible();
  await expect(page.getByTestId("system-version")).not.toBeEmpty();
  await expect(page.getByTestId("system-db-size")).toHaveText(/\d/);
  await expect(page.getByTestId("system-backup")).toBeVisible();
  await expect(page.getByTestId("system-queue")).toBeVisible();
  await expect(page.getByTestId("system-integrations")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chybná doručení webhooků" })).toBeVisible();
  await expect(page.getByTestId("system-no-failed-deliveries")).toBeVisible();

  await page.getByTestId("system-trash-link").click();
  await expect(page).toHaveURL(/\/kos$/);
});
