import { expect, test, type Page } from "@playwright/test";
import { pickCompany } from "./helpers";

/*
  Karta „Harmonogram“ na Přehledu zakázky: prázdný stav s akcí Naplánovat, zmenšený Gantt s nejbližšími fázemi,
  proklik na plný harmonogram (Realizace → Harmonogram), skrytí v obchodní fázi a telefon bez horizontálního přetečení.
*/

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const execJob = `Karta harmonogramu ${stamp}`;
const inquiryJob = `Poptávka bez harmonogramu ${stamp}`;
let execId = "";
let inquiryId = "";

async function createJob(page: Page, title: string, stage?: string) {
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(title);
  await pickCompany(page, dialog);
  if (stage) {
    await dialog.getByRole("button", { name: "Poptávka" }).click();
    await page.getByRole("option", { name: stage }).click();
  }
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: title })).toBeVisible();
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(title);
  await page
    .getByRole("row")
    .filter({ hasText: title })
    .locator('[data-attr="title"]')
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

test("prázdný harmonogram: karta nabízí Naplánovat a vede do záložky Harmonogram", async ({
  page,
}) => {
  test.setTimeout(120_000);
  execId = await createJob(page, execJob, "Realizace");
  await page.goto(`/zakazky/${execId}`);
  const card = page.getByTestId("overview-card-schedule");
  await expect(card.getByText("Harmonogram zatím není naplánovaný")).toBeVisible();
  await expect(card.getByTestId("schedule-card-strip")).toHaveCount(0);

  await card.getByRole("button", { name: "Naplánovat" }).click();
  await expect(page).toHaveURL(/tab=realizace&sub=harmonogram/);
  await expect(
    page.getByTestId("record-view").getByRole("radio", { name: "Harmonogram" }),
  ).toBeChecked();
});

test("karta ukáže pás s fázemi a nejbližší; klik na pás i odkaz otevřou plný harmonogram", async ({
  page,
}) => {
  await page.goto(`/zakazky/${execId}?tab=realizace&sub=harmonogram`);
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Přidat první fázi" }).click();
  await page.getByLabel("Název fáze").fill("Bourání");
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(view.getByTestId("gantt")).toBeVisible();
  await view.getByRole("button", { name: "Přidat milník" }).click();
  await page.getByLabel("Název fáze").fill("Kontrolní den");
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(view.locator("[data-phase]")).toHaveCount(2);

  await view.getByRole("tab", { name: "Přehled" }).click();
  await expect(page).not.toHaveURL(/tab=/);
  const card = page.getByTestId("overview-card-schedule");
  await expect(card.getByTestId("schedule-card-strip")).toBeVisible();
  await expect(card.getByTestId("schedule-card-next")).toContainText("Bourání");
  await expect(card.getByTestId("schedule-card-next")).toContainText("Kontrolní den");
  // karta nic neplánuje a neukazuje peníze
  await expect(card).not.toContainText("Kč");
  await expect(card.getByRole("button", { name: "Naplánovat" })).toHaveCount(0);

  await card.getByTestId("schedule-card-strip").click();
  await expect(page).toHaveURL(/tab=realizace&sub=harmonogram/);
  await expect(view.getByTestId("gantt")).toBeVisible();

  await view.getByRole("tab", { name: "Přehled" }).click();
  await card.getByRole("button", { name: "Otevřít harmonogram" }).first().click();
  await expect(page).toHaveURL(/tab=realizace&sub=harmonogram/);
});

test("zakázka v obchodní fázi nemá kartu Harmonogram", async ({ page }) => {
  inquiryId = await createJob(page, inquiryJob);
  await page.goto(`/zakazky/${inquiryId}`);
  await expect(page.getByTestId("job-phase")).toHaveText("Poptávka");
  await expect(page.getByTestId("overview-card-schedule")).toHaveCount(0);
  // ostatní karty Přehledu se ukazují dál
  await expect(page.getByTestId("overview-card-team")).toBeVisible();
});

test.describe("telefon", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("karta se vejde do šířky, popisky pásu zmizí, pruhy a klepnutí zůstanou", async ({
    page,
  }) => {
    await page.goto(`/zakazky/${execId}`);
    const card = page.getByTestId("overview-card-schedule");
    await expect(card.getByTestId("schedule-card-strip")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const box = (await card.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    // názvy fází se v pásu skrývají (jsou v seznamu Nejbližší pod ním)
    await expect(card.getByTestId("schedule-card-strip").getByText("Bourání")).toBeHidden();
    await expect(card.getByTestId("schedule-card-next")).toContainText("Bourání");
    // pás je dotykový cíl aspoň 44 px vysoký
    const strip = (await card.getByTestId("schedule-card-strip").boundingBox())!;
    expect(strip.height).toBeGreaterThanOrEqual(44);

    await card.getByTestId("schedule-card-strip").tap();
    await expect(page).toHaveURL(/tab=realizace&sub=harmonogram/);
  });
});
