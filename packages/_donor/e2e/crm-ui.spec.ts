import { expect, test, type Page } from "@playwright/test";

/*
  Obecné prvky pro CRM (oblast C) na ukázkové stránce /ui: pás fází, nástěnka s kartou a hlavičkou sloupce z „modulu“,
  cílové sloupce Vyhráno / Prohráno, klávesnice a detail v pop-upu s ?record=. Data jsou v paměti stránky, takže test
  nezávisí na databázi. Stránka /ui se v e2e sestavení zapíná proměnnou UI_SHOWCASE=1 (playwright.config.ts).
*/

const board = (page: Page) => page.getByTestId("crm-board");
const dialog = (page: Page) => page.getByTestId("record-dialog");
const card = (page: Page, name: string) =>
  board(page).locator("[data-card-button]").filter({ hasText: name });
const column = (page: Page, stage: string) => board(page).locator(`section[data-stage="${stage}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto("/ui");
  await expect(card(page, "Rekonstrukce koupelny")).toBeVisible();
});

test("pás fází: hotové, aktuální a budoucí fáze, zamčený přechod s důvodem", async ({ page }) => {
  const demo = page.getByTestId("stepper-demo").getByTestId("pipeline-stepper").first();
  const states = demo.locator("li");
  await expect(states.nth(0)).toHaveAttribute("data-state", "done");
  await expect(states.nth(3)).toHaveAttribute("data-state", "current");
  await expect(states.nth(4)).toHaveAttribute("data-state", "future");

  // zamčená fáze: klik nic nezmění a tooltip řekne proč
  const locked = demo.getByRole("button", { name: /Jednání.*zamčeno/ });
  await locked.hover();
  await expect(page.getByText("Nejdřív odešlete nabídku.").first()).toBeVisible();
  // zamčený přechod je `aria-disabled`, Playwright by na běžný klik čekal; `force` odešle klik, který aplikace musí ignorovat
  await locked.click({ force: true });
  await expect(states.nth(3)).toHaveAttribute("data-state", "current");

  // klik na jinou fázi přesune aktuální
  await demo.getByRole("button", { name: /^Obhlídka/ }).click();
  await expect(states.nth(2)).toHaveAttribute("data-state", "current");
  await expect(states.nth(1)).toHaveAttribute("data-state", "done");
});

test("pás fází na úzkém displeji se posouvá uvnitř sebe, stránka se nerozšíří", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/ui");
  const narrow = page.getByTestId("stepper-narrow").getByTestId("pipeline-stepper");
  await expect(narrow).toBeVisible();
  const scrolls = await narrow.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(scrolls).toBe(true);
  const page_ = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(page_).toBe(true);
});

test("karta a hlavička sloupce z modulu: vážený součet a čip zhnilé karty (bez červeného rámu)", async ({
  page,
}) => {
  await expect(column(page, "contacted").getByTestId("column-extra")).toContainText("Vážená");
  await expect(card(page, "Střecha rodinného domu")).toHaveAttribute("data-rotting", "");
  await expect(card(page, "Střecha rodinného domu")).toContainText("Bez pohybu 12 dní");
  await expect(card(page, "Rekonstrukce koupelny")).not.toContainText("Bez pohybu");
  await expect(card(page, "Rekonstrukce koupelny")).not.toHaveAttribute("data-rotting", "");
});

test("klávesnice na nástěnce: šipky, Enter a zkratka W", async ({ page }) => {
  await card(page, "Rekonstrukce koupelny").focus();
  await page.keyboard.press("ArrowDown");
  await expect(card(page, "Fasáda bytového domu")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(card(page, "Půdní vestavba")).toBeFocused();

  await page.keyboard.press("w");
  const win = page.getByRole("dialog", { name: "Označit jako vyhranou" });
  await expect(win).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();

  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
  await expect(page).toHaveURL(/[?&]record=/);
});

test("detail v pop-upu: ?record= v adrese, Zpět a Esc zavřou, přímý odkaz otevře", async ({
  page,
}) => {
  const urlBefore = page.url();
  await card(page, "Půdní vestavba").click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole("heading", { name: "Půdní vestavba" })).toBeVisible();
  await expect(dialog(page).getByTestId("pipeline-stepper")).toBeVisible();
  await expect(page).toHaveURL(/record=[0-9a-f-]{36}/);

  await page.goBack();
  await expect(dialog(page)).toBeHidden();
  await expect(page).toHaveURL(urlBefore);

  await page.goForward();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(page).not.toHaveURL(/record=/);
  // pozice a obsah nástěnky zůstaly
  await expect(card(page, "Půdní vestavba")).toBeVisible();

  // přímý odkaz otevře nástěnku s otevřeným pop-upem
  await page.goto("/ui?record=00000000-0000-4000-8000-000000000006");
  await expect(dialog(page).getByRole("heading", { name: "Střecha rodinného domu" })).toBeVisible();
  await dialog(page).getByRole("button", { name: "Zavřít" }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page).not.toHaveURL(/record=/);
});

test("pás fází v detailu přesune zakázku do jiného sloupce nástěnky", async ({ page }) => {
  await card(page, "Hala pro sklad").click();
  await dialog(page)
    .getByTestId("pipeline-stepper")
    .getByRole("button", { name: /^Jednání/ })
    .click();
  await page.keyboard.press("Escape");
  await expect(column(page, "negotiation").locator("[data-card-button]")).toHaveCount(2);
  await expect(column(page, "visit").locator("[data-card-button]")).toHaveCount(0);
});

test("přetažení na Vyhráno otevře dialog a kartu nepřesune", async ({ page }) => {
  const source = card(page, "Rekonstrukce koupelny");
  // nástěnka je v ukázkové stránce hluboko pod ostatními prvky; myš pracuje se souřadnicemi okna, takže ji nejdřív zobrazíme
  await board(page).scrollIntoViewIfNeeded();
  const box = (await source.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 80, { steps: 6 });
  const zone = page.locator('[data-drop-target="won"]');
  await expect(zone).toBeVisible();
  const z = (await zone.boundingBox())!;
  await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Označit jako vyhranou" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    column(page, "new").locator("[data-card-button]").filter({ hasText: "Rekonstrukce koupelny" }),
  ).toHaveCount(1);
});
