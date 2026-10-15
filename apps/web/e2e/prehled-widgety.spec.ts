import { expect, test, type Page } from "@playwright/test";

/*
  Přehled (PRE-01 až PRE-07): přepínač přehledů, úpravy jen v režimu Upravit, katalog widgetů a nastavení widgetu, telefon
  (widgety pod sebou, v režimu Upravit jen pořadí). Test nepočítá s tím, že databáze má výchozí sady rolí (zakládá je
  `db:seed`): když je Přehled prázdný, založí si vlastní.
*/

test.describe.configure({ mode: "serial" });

async function openPrehled(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/prehled/);
  const empty = page.getByTestId("prehled-empty");
  if (await empty.isVisible().catch(() => false)) {
    await page.getByTestId("new-dashboard").click();
    await page.getByLabel("Název nástěnky").fill("Den");
    await page.getByRole("button", { name: "Vytvořit", exact: true }).click();
  }
  await expect(page.getByTestId("dashboard")).toBeVisible();
}

test("přehled: `/` přesměruje na /prehled, přepínač přehledů a mřížka widgetů", async ({
  page,
}) => {
  await openPrehled(page);
  await expect(page.getByTestId("dashboard-switcher")).toBeVisible();
  await expect(page.getByTestId("dashboard-tab").first()).toBeVisible();
  await expect(page.getByTestId("dashboard-title")).toBeVisible();
});

test("mimo režim Upravit nejde přehled rozházet; v režimu Upravit jde přidat widget z katalogu", async ({
  page,
}) => {
  await openPrehled(page);
  // mimo režim Upravit nejsou rukojeti pro přesun, nastavení ani odebrání
  await expect(page.getByTestId("widget-drag")).toHaveCount(0);
  await expect(page.getByTestId("widget-remove")).toHaveCount(0);

  await page.getByTestId("edit-dashboard").click();
  await page.getByTestId("add-widget").click();
  const catalog = page.getByTestId("widget-catalog");
  await expect(catalog).toBeVisible();
  // vždy dostupné widgety (pohledy a odkazy), bez ohledu na zapnuté moduly
  await expect(catalog.getByText("Číslo z pohledu", { exact: true })).toBeVisible();
  await expect(catalog.getByText("Seznam z pohledu", { exact: true })).toBeVisible();

  await catalog.getByTestId("catalog-add-rychle-odkazy").click();
  const editor = page.getByTestId("widget-editor");
  await expect(editor).toBeVisible();
  // prázdné odkazy se neuloží
  await editor.getByTestId("widget-save").click();
  await expect(editor.getByRole("alert")).toBeVisible();
  await editor.getByTestId("links-add").click();
  await editor.getByLabel("Název odkazu 1").fill("Obchody");
  await editor.getByLabel("Adresa odkazu 1").fill("/obchody");
  await editor.getByTestId("widget-save").click();

  // přetahování a odebrání je vidět jen v režimu Upravit
  await expect(page.getByTestId("widget-drag").first()).toBeVisible();
  await page.getByTestId("save-dashboard").click();
  await expect(page.getByRole("link", { name: "Obchody" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("widget-drag")).toHaveCount(0);

  // úklid: widget odebereme zpět
  await page.getByTestId("edit-dashboard").click();
  const card = page.getByTestId("widget-card").filter({ hasText: "Rychlé odkazy" });
  await card.getByTestId("widget-remove").click();
  await page.getByTestId("save-dashboard").click();
  await expect(page.getByRole("link", { name: "Obchody" })).toHaveCount(0);
});

test("více přehledů: nový přehled se objeví v přepínači a jde přepnout", async ({ page }) => {
  await openPrehled(page);
  const before = await page.getByTestId("dashboard-tab").count();
  const name = `Finance ${Math.random().toString(36).slice(2, 6)}`;
  await page.getByTestId("new-dashboard").click();
  await page.getByLabel("Název nástěnky").fill(name);
  await page.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("dashboard-title")).toHaveText(name);
  await expect(page.getByTestId("dashboard-tab")).toHaveCount(before + 1);
  await page.getByTestId("dashboard-tab").first().click();
  await expect(page.getByTestId("dashboard-title")).not.toHaveText(name);

  // úklid
  await page.getByTestId("dashboard-tab").filter({ hasText: name }).click();
  await page.getByTestId("dashboard-menu").click();
  await page.getByRole("menuitem", { name: "Smazat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat" }).click();
  await expect(page.getByTestId("dashboard-tab").filter({ hasText: name })).toHaveCount(0);
});

test.describe("telefon", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("widgety pod sebou a v režimu Upravit jen pořadí", async ({ page }) => {
    await openPrehled(page);
    const cards = page.getByTestId("widget-card");
    if ((await cards.count()) > 1) {
      const a = await cards.nth(0).boundingBox();
      const b = await cards.nth(1).boundingBox();
      // jeden sloupec: druhý widget je pod prvním, ne vedle něj
      expect(b!.y).toBeGreaterThan(a!.y);
      expect(Math.abs(b!.x - a!.x)).toBeLessThan(4);
    }
    await page.getByTestId("edit-dashboard").click();
    await expect(page.getByTestId("add-widget")).toHaveCount(0);
    await expect(page.getByTestId("widget-edit")).toHaveCount(0);
    await expect(page.getByTestId("widget-remove")).toHaveCount(0);
    await expect(page.getByTestId("widget-resize")).toHaveCount(0);
    if ((await cards.count()) > 0)
      await expect(page.getByTestId("widget-drag").first()).toBeVisible();
    await page.getByTestId("cancel-edit").click();
  });
});
