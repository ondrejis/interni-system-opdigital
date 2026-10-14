import { expect, test } from "@playwright/test";
import { clickSubmenuItem, pickCompany } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const job = `Cyklus ${stamp}`;

test("fáze zakázky: dialog přechodu vysvětlí, co chybí, a po doplnění přechod projde", async ({
  page,
}) => {
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(job);
  await pickCompany(page, dialog);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name: job })).toBeVisible();

  // nová zakázka je v poptávce; do nabídky nejde bez adresy stavby
  await view.getByRole("button", { name: "Změnit fázi" }).click();
  const change = page.getByRole("dialog", { name: "Změnit fázi zakázky" });
  await change.getByRole("button", { name: /Nabídka/ }).click();
  const transition = page.getByRole("dialog", { name: /Přesunout do fáze „Nabídka“/ });
  await expect(transition).toContainText("Doplňte adresu stavby");
  await expect(transition.getByRole("button", { name: "Přesunout" })).toBeDisabled();
  await transition.getByRole("button", { name: "Zrušit" }).click();

  // adresa doplněná v seznamu; přechod pak projde a fáze se ukáže v seznamu
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await page.getByTestId("list-options").click();
  await page.getByRole("menuitem", { name: "Sloupce" }).click();
  const col = page.getByRole("menuitemcheckbox", { name: "Adresa stavby" });
  if ((await col.getAttribute("aria-checked")) !== "true") await clickSubmenuItem(page, col);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const cell = (attr: string) =>
    page.getByRole("row").filter({ hasText: job }).locator(`[data-attr="${attr}"]`);
  await cell("address").dblclick();
  await cell("address").getByRole("textbox").fill("Plzeň, Nádražní 1");
  await cell("address").getByRole("textbox").press("Enter");
  await expect(cell("address")).toContainText("Nádražní 1");

  await cell("title").getByRole("link").click();
  await page.getByTestId("record-view").getByRole("button", { name: "Změnit fázi" }).click();
  await page
    .getByRole("dialog", { name: "Změnit fázi zakázky" })
    .getByRole("button", { name: /Nabídka/ })
    .click();
  const ok = page.getByRole("dialog", { name: /Přesunout do fáze „Nabídka“/ });
  await ok.getByRole("button", { name: "Přesunout" }).click();
  await expect(page.getByText("Zakázka je ve fázi „Nabídka“.")).toBeVisible();
});

test("výchozí pohledy seznamu zakázek jsou k dispozici", async ({ page }) => {
  await page.goto("/zakazky");
  for (const name of ["Moje zakázky", "Nabídky čekající na odpověď", "V realizaci", "V záruce"])
    await expect(page.getByRole("tab", { name })).toBeVisible();
  await page.getByRole("tab", { name: "Nabídky čekající na odpověď" }).click();
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(page.getByRole("row").filter({ hasText: job })).toBeVisible();
});
