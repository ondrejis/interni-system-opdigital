import { expect, test } from "@playwright/test";
import { clickSubmenuItem, collectErrors, expectClean } from "./helpers";

/** Exportní dialog na telefonu: vejde se na šířku, tlačítko Exportovat je dosažitelné, bez vodorovného posunu. */
test("exportní dialog na telefonu", async ({ page }) => {
  const c = collectErrors(page);
  await page.goto("/kontakty/firmy");
  await page.getByTestId("list-options").click();
  await page.getByTestId("export-menu").click();
  await clickSubmenuItem(page, page.getByTestId("export-dialog-open"));
  const dlg = page.getByTestId("export-dialog");
  await expect(dlg).toBeVisible();
  const box = await dlg.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await dlg.getByTestId("export-run").scrollIntoViewIfNeeded();
  await expect(dlg.getByTestId("export-run")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  if (process.env.E2E_SHOTS)
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/export-mobil.png` });
  expectClean(c, "exportní dialog na telefonu");
});
