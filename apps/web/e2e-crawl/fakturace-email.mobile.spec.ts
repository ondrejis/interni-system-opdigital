import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";

/** Mobil (Pixel 7): stránky exportu a šablon, dialog odeslání a hromadné odeslání se vejdou na šířku bez vodorovného posunu. */
const shots = process.env.CRAWL_SHOTS;
const shot = async (page: Page, name: string) => {
  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/mobile-${name}.png` });
  }
};
const noHorizontalScroll = async (page: Page, label: string) =>
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    `vodorovný posun: ${label}`,
  ).toBeLessThanOrEqual(1);

test("mobil: export, šablony a SMTP bez vodorovného posunu", async ({ page }) => {
  const c = collectErrors(page);
  for (const [path, name] of [
    ["/fakturace/export", "export"],
    ["/fakturace/nastaveni", "nastaveni"],
    ["/nastaveni/email", "smtp"],
  ] as const) {
    await visit(page, path, c);
    await noHorizontalScroll(page, path);
    await shot(page, name);
  }
  expectClean(c, "mobil stránky");
});

test("mobil: dialog Odeslat e-mailem a záložka Odeslání", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/fakturace", c);
  // na telefonu je seznam jako karty: otevře se klepnutím na číslo dokladu
  await page
    .getByText(/(ZF|FV)-\d{4}-\d{4}/)
    .first()
    .click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Odeslat e-mailem" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Komu")).toBeVisible();
  await noHorizontalScroll(page, "dialog");
  await shot(page, "dialog");
  await dialog.getByRole("radio", { name: "Náhled" }).click();
  await shot(page, "dialog-nahled");
  await dialog.getByRole("button", { name: "Zrušit" }).click();
  expectClean(c, "mobil dialog");
});
