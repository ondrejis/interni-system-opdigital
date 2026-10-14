import { expect, test, type Page } from "@playwright/test";
import { pickCompany } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const job = `Deník ${stamp}`;
let jobId = "";

/** Zakázka rovnou ve fázi Realizace (stav se volí při založení), otevřená na celé stránce. */
async function createJobInExecution(page: Page) {
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(job);
  await pickCompany(page, dialog);
  await dialog.getByRole("button", { name: "Poptávka" }).click();
  await page.getByRole("option", { name: "Realizace" }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: job })).toBeVisible();
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await page
    .getByRole("row")
    .filter({ hasText: job })
    .locator('[data-attr="title"]')
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}/);
  jobId = new URL(page.url()).pathname.split("/").pop()!;
}

const openDiary = (page: Page) => page.goto(`/zakazky/${jobId}?tab=realizace&sub=denik`);

test("deník: pás dní, zápis dne s materiálem a jeho náklad v hlavičce", async ({ page }) => {
  test.setTimeout(120_000);
  await createJobInExecution(page);
  await openDiary(page);
  const view = page.getByTestId("record-view");
  await expect(view.getByTestId("diary-strip")).toBeVisible();
  const today = new Date().toISOString().slice(0, 10);
  await expect(view.getByTestId(`diary-day-${today}`)).toHaveAttribute("data-has-entry", "0");

  await view.getByRole("button", { name: /Zapsat dnešek/ }).click();
  const form = view.getByTestId("diary-form");
  await form.getByLabel("Provedené práce").fill("Betonáž základové desky, odvoz suti.");
  const addWorker = form.getByRole("button", { name: "Přidat pracovníka" });
  if (await addWorker.count()) await addWorker.click();
  await form.getByRole("button", { name: "Přidat materiál" }).click();
  await form.getByLabel("Název materiálu 1").fill("Beton C20/25");
  await form.getByLabel("Množství 1").fill("2");
  await form.getByLabel("Jednotka 1").fill("m3");
  await form.getByLabel("Cena za jednotku 1").fill("2 500");
  const addIncident = form.getByRole("button", { name: "Přidat nehodu" });
  if (await addIncident.count()) await addIncident.click();
  await form.getByRole("button", { name: "Vada", exact: true }).click();
  await form.getByLabel("Popis 1").fill("Prasklý překlad nad oknem");
  await form.getByRole("button", { name: "Uložit zápis" }).click();

  const entry = view.getByTestId("diary-entry");
  await expect(entry).toContainText("Betonáž základové desky");
  await expect(entry).toContainText("Beton C20/25");
  await expect(entry).toContainText("náklad zakázky");
  await expect(entry).toContainText("vada zakázky");
  await expect(view.getByTestId(`diary-day-${today}`)).toHaveAttribute("data-has-entry", "1");

  // materiál s cenou se hned projeví v nákladech v hlavičce (2 × 2 500 Kč)
  await expect(view.getByTestId("kpi-cost")).toContainText("5 000 Kč");

  // vada z deníku je vadou zakázky
  await view.getByRole("radio", { name: "Vady" }).click();
  await expect(view).toContainText("Prasklý překlad nad oknem");
});

test("deník: podpis zápisu prstem nebo myší a zámek po podpisu", async ({ page }) => {
  await openDiary(page);
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Podepsat", exact: true }).click();
  const sign = page.getByRole("dialog", { name: /Podpis zápisu/ });
  await sign.getByLabel("Podepisuje").fill("Ing. Novák");
  const canvas = sign.getByTestId("signature-canvas");
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 80);
  await page.mouse.down();
  await page.mouse.move(b.x + 80, b.y + 30, { steps: 6 });
  await page.mouse.move(b.x + 140, b.y + 110, { steps: 6 });
  await page.mouse.up();
  await sign.getByRole("button", { name: "Podepsat", exact: true }).click();
  await expect(page.getByText("Zápis je podepsaný.")).toBeVisible();
  const entry = view.getByTestId("diary-entry");
  await expect(entry).toContainText("Podepsáno: Ing. Novák");
  await expect(entry.getByRole("button", { name: "Upravit" })).toHaveCount(0);
});

test("tisk deníku: stránka bez navigace a bez cen", async ({ page }) => {
  await page.goto(`/tisk/denik/${jobId}`);
  const sheet = page.getByTestId("print-diary");
  await expect(sheet).toContainText("Stavební deník");
  await expect(sheet).toContainText("Betonáž základové desky");
  await expect(sheet).toContainText("Beton C20/25");
  await expect(sheet).not.toContainText("2 500");
});
