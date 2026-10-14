import { expect, test, type Page } from "@playwright/test";
import { pickCompany } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const job = `Realizace ${stamp}`;
const shot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS)
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/${name}.png` });
};

async function openJob(page: Page) {
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: job });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  return page.getByTestId("record-view");
}

test("zakázka a harmonogram: fáze, přetažení v Ganttu, návaznost", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(job);
  await pickCompany(page, dialog);
  // záložka Realizace se ukáže od přípravy, proto zakázka vzniká rovnou ve fázi Realizace
  await dialog.getByRole("button", { name: "Poptávka" }).click();
  await page.getByRole("option", { name: "Realizace" }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name: job })).toBeVisible();

  await view.getByRole("tab", { name: "Realizace" }).click();
  await view.getByRole("radio", { name: "Harmonogram" }).click();
  await view.getByRole("button", { name: "Přidat první fázi" }).click();
  await page.getByLabel("Název fáze").fill("Bourání");
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(view.getByTestId("gantt")).toBeVisible();
  const bar = view.locator("[data-phase]").first();
  await expect(bar).toHaveAttribute("aria-label", /Bourání/);
  const before = await bar.getAttribute("aria-label");

  // přetažení pruhu o několik dní doprava (kolem 3 × 26 px)
  await bar.scrollIntoViewIfNeeded();
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2 + 110, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(view.locator("[data-phase]").first()).not.toHaveAttribute("aria-label", before!);

  // druhá fáze navazuje na první
  await view.getByRole("button", { name: "Přidat fázi" }).click();
  await page.getByLabel("Název fáze").fill("Instalace");
  await page.getByRole("button", { name: "Nenavazuje" }).click();
  await page.getByRole("option", { name: "Bourání" }).click();
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(view.locator("[data-phase]")).toHaveCount(2);
  await expect(view.getByText("%").first()).toBeVisible();
  await shot(page, "07-gantt");
});

test("stavební deník: zápis se uloží a ukáže v seznamu", async ({ page }) => {
  const view = await openJob(page);
  await view.getByRole("tab", { name: "Realizace" }).click();
  await view.getByRole("radio", { name: "Deník" }).click();
  await view.getByRole("button", { name: /Zapsat dnešek/ }).click();
  await view.getByLabel("Provedené práce").fill("Vybourána stará koupelna, odvoz suti.");
  await view.getByRole("button", { name: "Uložit zápis" }).click();
  await expect(view.getByTestId("diary-entry")).toContainText("Vybourána stará koupelna");
});

test("předávací protokol: vytvoření a podpis prstem/myší, po podpisu je uzavřený", async ({
  page,
}) => {
  const view = await openJob(page);
  await view.getByRole("tab", { name: "Realizace" }).click();
  await view.getByRole("radio", { name: "Předání" }).click();
  await view.getByRole("button", { name: "Nový předávací protokol" }).click();
  await view.getByRole("button", { name: "Uložit protokol" }).click();
  const list = view.getByTestId("handover-list");
  await expect(list).toContainText("PP-");
  await expect(list).toContainText("Koncept");

  await view.getByRole("button", { name: "Podepsat", exact: true }).click();
  const sign = page.getByRole("dialog", { name: /Podpis protokolu/ });
  await sign.getByLabel("Za zákazníka přebírá").fill("Pan Novák");
  const canvas = sign.getByTestId("signature-canvas");
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 80);
  await page.mouse.down();
  await page.mouse.move(b.x + 80, b.y + 30, { steps: 6 });
  await page.mouse.move(b.x + 140, b.y + 110, { steps: 6 });
  await page.mouse.up();
  await sign.getByRole("button", { name: "Podepsat a uzavřít" }).click();
  await expect(page.getByText("Protokol je podepsaný.")).toBeVisible();
  await expect(list).toContainText("Podepsáno");
  await expect(list.getByRole("img", { name: /Podpis/ })).toBeVisible();
});

test("vady zakázky a přehled realizace", async ({ page }) => {
  const view = await openJob(page);
  await view.getByRole("tab", { name: "Realizace" }).click();
  await view.getByRole("radio", { name: "Vady" }).click();
  await view.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog").last();
  await dialog.getByLabel(/Název/).fill(`Prasklá spára ${stamp}`);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: `Prasklá spára ${stamp}` }),
  ).toBeVisible();

  await page.goto("/realizace");
  const table = page.getByTestId("overview-table");
  await expect(table.getByRole("row").filter({ hasText: job })).toBeVisible();
  await page.goto("/realizace/vady");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(page.getByRole("row").filter({ hasText: `Prasklá spára ${stamp}` })).toBeVisible();
});
