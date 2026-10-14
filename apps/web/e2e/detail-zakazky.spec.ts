import { expect, test, type Page } from "@playwright/test";
import { pickCompany } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const execJob = `Detail ${stamp}`;
const inquiryJob = `Poptávka detail ${stamp}`;
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

test("hlavička: fáze, zákazník, čtyři čísla a hlavní akce podle fáze", async ({ page }) => {
  test.setTimeout(120_000);
  execId = await createJob(page, execJob, "Realizace");
  const header = page.getByTestId("job-header");
  await expect(header).toBeVisible();
  await expect(header.getByTestId("job-phase")).toHaveText("Realizace");
  const kpis = page.getByTestId("job-kpis");
  await expect(kpis.getByTestId("kpi-contract")).toContainText("Smluvní cena");
  await expect(kpis.getByTestId("kpi-cost")).toContainText("Náklady");
  await expect(kpis.getByTestId("kpi-margin")).toContainText("Marže");
  await expect(kpis.getByTestId("kpi-invoiced")).toContainText("Fakturováno / uhrazeno");

  // hlavní akce ve fázi Realizace je předání; dialog ukáže, co přechod případně blokuje
  await header
    .getByTestId("job-primary-action")
    .getByRole("button", { name: "Předat zakázku" })
    .click();
  const dialog = page.getByRole("dialog", { name: /Přesunout do fáze „Předání“/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Zrušit" }).click();
});

test("záložky: nejvýš osm, deník v Realizaci, tým a sdílení v Přehledu", async ({ page }) => {
  await page.goto(`/zakazky/${execId}`);
  const tabs = page.getByRole("tablist").first().getByRole("tab");
  await expect(tabs.first()).toBeVisible();
  const names = (await tabs.allInnerTexts()).map((t) => t.trim());
  expect(names.length).toBeLessThanOrEqual(8);
  for (const n of [
    "Přehled",
    "Rozpočet",
    "Změny",
    "Náklady",
    "Fakturace",
    "Realizace",
    "Úkoly",
    "Soubory",
  ])
    expect(names).toContain(n);
  expect(names).not.toContain("Tým");
  expect(names).not.toContain("Ekonomika");
  expect(names).not.toContain("Aktivita");

  // Přehled: karty, tým a sdílení v pravém panelu, aktivita přímo v Přehledu
  const view = page.getByTestId("record-view");
  await expect(view.getByTestId("overview-card-last-diary")).toBeVisible();
  await expect(view.getByTestId("overview-card-open-defects")).toBeVisible();
  await expect(view.getByRole("region", { name: "Tým zakázky" })).toBeVisible();
  await expect(view.getByRole("region", { name: "Sdílení s investorem" })).toBeVisible();
  await expect(view.getByTestId("overview-activity")).toBeVisible();
  await expect(view.getByTestId("overview-tasks")).toBeVisible();
});

test("adresa: aktivní záložka a podzáložka přežijí sdílení odkazu a obnovení stránky", async ({
  page,
}) => {
  await page.goto(`/zakazky/${execId}?tab=realizace&sub=denik`);
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("radio", { name: "Deník" })).toBeChecked();

  await view.getByRole("radio", { name: "Vady" }).click();
  await expect(page).toHaveURL(/tab=realizace&sub=vady/);
  await page.reload();
  await expect(page.getByTestId("record-view").getByRole("radio", { name: "Vady" })).toBeChecked();

  // karta „Otevřít deník“ na Přehledu přepne záložku i adresu
  await page.getByTestId("record-view").getByRole("tab", { name: "Přehled" }).click();
  await expect(page).not.toHaveURL(/tab=/);
  await page
    .getByTestId("overview-card-last-diary")
    .getByRole("button", { name: "Otevřít deník" })
    .click();
  await expect(page).toHaveURL(/tab=realizace&sub=denik/);
});

test("záložky se skrývají podle fáze: poptávka nemá změny, náklady, fakturaci ani realizaci", async ({
  page,
}) => {
  inquiryId = await createJob(page, inquiryJob);
  await page.goto(`/zakazky/${inquiryId}`);
  const tabs = page.getByRole("tablist").first().getByRole("tab");
  await expect(tabs.first()).toBeVisible();
  const names = (await tabs.allInnerTexts()).map((t) => t.trim());
  expect(names).toContain("Rozpočet");
  expect(names).toContain("Soubory");
  for (const n of ["Změny", "Náklady", "Fakturace", "Realizace"]) expect(names).not.toContain(n);
  // žádná záložka skrytých skupin se nesmí objevit samostatně (Faktury, Materiál, Stroje…)
  expect(names).toEqual(["Přehled", "Rozpočet", "Úkoly", "Soubory"]);
  await expect(page.getByTestId("job-phase")).toHaveText("Poptávka");
});

test.describe("telefon", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("kompaktní hlavička, posuvné záložky a stránka se nerozjíždí do šířky", async ({ page }) => {
    await page.goto(`/zakazky/${execId}`);
    await expect(page.getByTestId("job-header")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // deník jde zapsat: formulář i tlačítko Uložit jsou na telefonu dosažitelné
    await page.goto(`/zakazky/${execId}?tab=realizace&sub=denik`);
    await page.getByRole("button", { name: /Zapsat dnešek/ }).click();
    await expect(page.getByTestId("diary-form")).toBeVisible();
    await expect(page.getByRole("button", { name: "Vyfotit", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Uložit zápis" })).toBeVisible();
  });
});
