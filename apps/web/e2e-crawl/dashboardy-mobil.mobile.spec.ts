import { expect, test } from "@playwright/test";
import { collectErrors, expectClean } from "./helpers";

/** Nástěnky na telefonu: jeden sloupec, žádný vodorovný posun, přepínač se posouvá, úpravy jdou přes dialog. */
test("nástěnka na telefonu je jednosloupcová a bez vodorovného posunu", async ({ page }) => {
  test.setTimeout(90_000);
  const c = collectErrors(page);
  await page.goto("/");
  const switcher = page.getByTestId("dashboard-switcher");
  await expect(switcher).toBeVisible();
  await switcher.getByTestId("dashboard-tab").filter({ hasText: "Majitel" }).click();
  await expect(page.getByTestId("dashboard-title")).toContainText("Majitel");
  await expect(page.getByTestId("widget-card").first()).toBeVisible();
  await expect(page.getByTestId("widget-kpi").first()).toBeVisible({ timeout: 25_000 });
  const cards = page.getByTestId("widget-card");
  const n = await cards.count();
  expect(n).toBeGreaterThan(3);
  // všechny karty pod sebou (stejné x, plná šířka)
  const boxes = await Promise.all([0, 1, 2, 3].map((i) => cards.nth(i).boundingBox()));
  const x0 = boxes[0]!.x;
  for (const b of boxes) expect(Math.abs(b!.x - x0)).toBeLessThan(2);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  if (process.env.E2E_SHOTS)
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/dashboard-mobil.png`, fullPage: true });

  // úpravy: přidání widgetu přes dialog (rukojeť velikosti na telefonu není, velikost se volí v dialogu)
  await page.getByTestId("edit-dashboard").click();
  await page.getByTestId("add-widget").click();
  await page.getByRole("menuitem", { name: "Číslo (KPI)" }).click();
  await expect(page.getByLabel("Šířka")).toBeVisible();
  await page.keyboard.press("Escape");
  expectClean(c, "nástěnka na telefonu");
});
