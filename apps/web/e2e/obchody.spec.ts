import { expect, test, type Page } from "@playwright/test";

/*
  OBC-B, AS-12 a část AS-01: rychlé založení obchodu (klávesa C), tažení mezi fázemi a zóny Vyhráno/Prohráno na boardu,
  prohra s povinným důvodem a znovuotevření, výhra s dialogem zakázek, mobil („Přesunout do fáze“).
  Každý test si zakládá vlastní obchod (název s náhodnou příponou), takže nezávisí na datech z dřívějších běhů.
*/

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const dealTitle = (n: number) => `E2E obchod ${stamp}-${n}`;

/** Přes „Nový obchod“ založí obchod (firma a kontakt v jednom kroku) a vrátí se na board. */
async function quickAdd(page: Page, title: string, extra?: { company?: string }) {
  await page.goto("/obchody");
  await expect(page.getByTestId("obchody-page")).toBeVisible();
  await page.getByTestId("add-deal").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Název obchodu").fill(title);
  await dialog.getByLabel("Název nové firmy").fill(extra?.company ?? `Firma ${stamp} s.r.o.`);
  await dialog.getByLabel("Jméno nového kontaktu").fill(`Jan Novák ${stamp}`);
  await dialog.getByLabel("Hodnota obchodu").fill("50000");
  await dialog.getByLabel("Web", { exact: true }).click();
  await dialog.getByTestId("quick-add-submit").click();
  // po založení se otevře detail v pop-upu
  await expect(page.getByTestId("deal-header-band")).toBeVisible();
  await page.keyboard.press("Escape");
}

const card = (page: Page, title: string) =>
  page.getByTestId("deal-card").filter({ hasText: title });

test("rychlé založení: firma, kontakt a obchod v jednom kroku; karta v první fázi s výstrahou", async ({
  page,
}) => {
  await quickAdd(page, dealTitle(1));
  const c = card(page, dealTitle(1));
  await expect(c).toBeVisible();
  // bez naplánované aktivity je na kartě výstražná ikona (OBCH-07)
  await expect(page.getByTestId("kanban").getByTestId("no-next-activity").first()).toBeVisible();
  // hlavička sloupce: počet, součet a vážený součet (OBCH-05)
  const firstColumn = page.locator("[data-stage]").filter({ has: c }).first();
  await expect(firstColumn.getByTestId("column-count")).not.toHaveText("0");
  await expect(firstColumn.getByTestId("column-weighted")).toContainText("Vážená");
});

test("tažení mezi fázemi: karta přejde do sousedního sloupce a fáze přežije obnovení", async ({
  page,
}) => {
  await page.goto("/obchody");
  const c = card(page, dealTitle(1));
  await expect(c).toBeVisible();
  const columns = page.locator("[data-stage][data-testid]").or(page.locator("[data-stage]"));
  const target = columns.nth(1);
  const from = await c.boundingBox();
  const to = await target.boundingBox();
  expect(from && to).toBeTruthy();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2 + 20, from!.y + 20, { steps: 5 });
  // při tažení se dole objeví zóny Vyhráno a Prohráno (OBCH-08)
  await expect(page.getByTestId("kanban-drop-targets")).toBeVisible();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 120, { steps: 15 });
  await page.mouse.up();
  await expect(target.getByTestId("deal-card").filter({ hasText: dealTitle(1) })).toBeVisible();
  await page.reload();
  await expect(target.getByTestId("deal-card").filter({ hasText: dealTitle(1) })).toBeVisible();
});

test("prohra: bez důvodu nejde uložit, s důvodem a poznámkou ano; znovu otevřít vrátí na board", async ({
  page,
}) => {
  await page.goto("/obchody");
  await card(page, dealTitle(1)).click();
  await page.getByTestId("deal-lose").click();
  const dialog = page.getByTestId("lose-dialog");
  await dialog.getByTestId("lose-confirm").click();
  await expect(dialog.getByText("Vyberte důvod prohry.")).toBeVisible();
  await dialog.getByLabel("Důvod prohry").click();
  await page.getByRole("option", { name: "Cena" }).click();
  await dialog.getByLabel("Poznámka k prohře").fill("Vybrali levnější nabídku.");
  await dialog.getByTestId("lose-confirm").click();
  await expect(page.getByTestId("deal-lost-chip")).toContainText("Cena");
  await expect(page.getByTestId("deal-lost-note")).toContainText("levnější");
  // prohraný obchod na boardu není
  await page.keyboard.press("Escape");
  await expect(card(page, dealTitle(1))).toHaveCount(0);
  // znovuotevření z detailu (seznam → obchod)
  await page.goto("/obchody?zobrazeni=seznam");
  await page
    .getByRole("tab", { name: /Všechny/ })
    .or(page.getByRole("button", { name: /Všechny/ }))
    .first()
    .click()
    .catch(() => undefined);
  await page.getByPlaceholder("Hledat…").fill(dealTitle(1));
  await page.getByText(dealTitle(1)).first().click();
  await page.getByTestId("deal-reopen").click();
  await page.goto("/obchody");
  await expect(card(page, dealTitle(1))).toBeVisible();
});

test("výhra: potvrzení, dialog zakázek a zakázka ze služby obchodu", async ({ page }) => {
  await page.goto("/obchody");
  await card(page, dealTitle(1)).click();
  await page.getByTestId("deal-win").click();
  await page.getByTestId("win-confirm").click();
  const jobs = page.getByTestId("jobs-from-deal-dialog");
  await expect(jobs).toBeVisible();
  // jeden řádek za službu obchodu (Web)
  await expect(jobs.getByTestId("deal-row")).toHaveCount(1);
  await jobs.getByRole("button", { name: /^Založit zakázky/ }).click();
  await expect(page.getByTestId("deal-won-chip")).toBeVisible();
  await page.goto("/zakazky");
  await expect(page.getByText(`Firma ${stamp} s.r.o.`).first()).toBeVisible();
});

test("mobil: board jako posuvné sloupce a „Přesunout do fáze“", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await quickAdd(page, dealTitle(2), { company: `Mobilní firma ${stamp}` }).catch(async () => {
    // na telefonu se po založení otevře stránka detailu místo pop-upu
  });
  await page.goto("/obchody");
  const board = page.getByTestId("mobile-board");
  await expect(board).toBeVisible();
  const c = page.getByTestId("mobile-deal-card").filter({ hasText: dealTitle(2) });
  await expect(c).toBeVisible();
  await c.getByTestId("mobile-deal-menu").click();
  await page.getByRole("menuitem", { name: /Kontaktováno/ }).click();
  const moved = board.locator('section[aria-label="Kontaktováno"]').getByTestId("mobile-deal-card");
  await expect(moved.filter({ hasText: dealTitle(2) })).toBeVisible();
});
