import { expect, test, type Page } from "@playwright/test";
import { ensureCompany } from "./helpers";

/*
  ZAK-B: šablona → zakázka s úkoly → změna fáze (dotaz na otevřené úkoly) → seznam a board → dokončení.
  Testy si šablonu i firmu zakládají samy (nezávisí na seedu ani na zbytcích z dřívějších běhů).
*/
test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const templateName = `Šablona ${stamp}`;
let jobUrl = "";

async function pickCompany(page: Page, name: string) {
  await page.getByRole("button", { name: /^Klient/ }).click();
  await page.getByPlaceholder("Najít klienta…").fill(name);
  await page.getByRole("option", { name }).click();
}

test("šablona zakázky: editor fází, úkolů a plateb se uloží", async ({ page }) => {
  await page.goto("/zakazky/sablony");
  await page.getByTestId("new-template").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Název šablony").fill(templateName);
  await dialog.getByTestId("new-template-submit").click();

  const editor = page.getByTestId("template-editor");
  await expect(editor.getByRole("heading", { name: /Fáze/ })).toBeVisible();
  await editor.getByTestId("tpl-add-phase").click();
  await editor.getByTestId("tpl-add-phase").click();
  await editor.getByLabel("Název fáze 1").fill("Fáze A");
  await editor.getByLabel("Název fáze 2").fill("Fáze B");

  await editor.getByTestId("tpl-add-task").first().click();
  await editor.getByLabel("Název úkolu 1").fill("Sehnat podklady");
  await editor.getByLabel("Termín úkolu 1 ve dnech od startu").fill("3");
  await editor.getByLabel("Odhad úkolu 1 v minutách").fill("90");

  await editor.getByTestId("tpl-add-payment").click();
  await editor.getByLabel("Popis platby 1").fill("Záloha");
  await editor.getByLabel("Částka platby 1").fill("5000");

  await editor.getByTestId("tpl-save").click();
  await expect(page.getByText("Šablona je uložená.")).toBeVisible();
  await expect(editor.getByTestId("tpl-save")).toBeDisabled();

  // chybné údaje blokují uložení
  await editor.getByLabel("Název úkolu 1").fill("");
  await expect(editor.getByText("Každý úkol potřebuje název.")).toBeVisible();
  await expect(editor.getByTestId("tpl-save")).toBeDisabled();
  await editor.getByLabel("Název úkolu 1").fill("Sehnat podklady");
});

test("nová zakázka ze šablony má fáze a úkoly v první fázi", async ({ page, context }) => {
  const company = await ensureCompany(context);
  await page.goto("/zakazky/sablony");
  await page
    .getByTestId("template-row")
    .filter({ hasText: templateName })
    .getByTestId("job-from-template")
    .click();
  const dialog = page.getByTestId("create-job-dialog");
  await pickCompany(page, company);
  await expect(dialog.getByLabel("Název")).toHaveValue(new RegExp(company));
  await dialog.getByLabel("Název").fill(`Zakázka ${stamp}`);
  await dialog.getByTestId("create-job-submit").click();

  const header = page.getByTestId("job-header");
  await expect(header.getByTestId("job-code")).toHaveText(/^Z-\d{4}-\d{3}$/);
  jobUrl = page.url();
  const strip = header.getByTestId("job-phase-strip");
  await expect(strip.getByRole("img", { name: /^Fáze A/ })).toBeVisible();
  await expect(strip.getByRole("button", { name: "Fáze B" })).toBeVisible();

  await page.getByRole("tab", { name: "Úkoly" }).click();
  const first = page.getByTestId("task-group").first();
  await expect(first).toContainText("Fáze A");
  await expect(first.getByTestId("task-row")).toContainText("Sehnat podklady");
});

test("klik na další fázi se zeptá na otevřené úkoly a dokončí je", async ({ page }) => {
  await page.goto(jobUrl);
  const strip = page.getByTestId("job-phase-strip");
  await strip.getByRole("button", { name: "Fáze B" }).click();
  const ask = page.getByTestId("phase-tasks-dialog");
  await expect(ask).toContainText(/otevřen/);
  await ask.getByTestId("phase-complete-tasks").click();
  await expect(page.getByText(/Zakázka je ve fázi „Fáze B“/)).toBeVisible();
  await expect(strip.getByRole("img", { name: /^Fáze B, aktuální fáze/ })).toBeVisible();

  await page.getByRole("tab", { name: "Úkoly" }).click();
  await page.getByLabel("Zobrazit hotové úkoly").click();
  await expect(page.getByTestId("task-row").filter({ hasText: "Sehnat podklady" })).toBeVisible();
});

test("zakázka je v seznamu i na boardu", async ({ page }) => {
  await page.goto("/zakazky");
  await page.getByLabel("Hledat zakázku").fill(stamp);
  const row = page.getByTestId("job-row").filter({ hasText: `Zakázka ${stamp}` });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Fáze B");

  await page.goto("/zakazky?pohled=stav");
  await expect(
    page.getByTestId("board-card").filter({ hasText: `Zakázka ${stamp}` }),
  ).toBeVisible();

  await page.goto("/zakazky/faze?typ=web");
  await expect(page.getByTestId("job-board")).toHaveAttribute("data-by", "phase");
});

test("dokončení zakázky: dialog s upozorněním a uzavření", async ({ page }) => {
  await page.goto(jobUrl);
  await page.getByTestId("record-view").getByRole("button", { name: "Dokončit zakázku" }).click();
  const dialog = page.getByTestId("complete-form");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("complete-confirm").click();
  await expect(page.getByTestId("job-closed")).toBeVisible();
  await expect(page.getByTestId("job-header")).toHaveAttribute("data-status", "done");
});

test("klávesa C na seznamu otevře Novou zakázku", async ({ page }) => {
  await page.goto("/zakazky");
  await page.getByRole("heading", { name: "Zakázky" }).click();
  await page.keyboard.press("c");
  await expect(page.getByTestId("create-job-dialog")).toBeVisible();
});
