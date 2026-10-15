import { expect, test, type Page } from "@playwright/test";
import { ensureCompany } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const jobTitle = `Hodiny web ${stamp}`;

/** Pondělí aktuálního týdne (stejně jako výchozí týden stránky Hodiny, v české zóně). */
const monday = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Prague" }));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

async function cellFor(page: Page, dayIndex: number) {
  const row = page.locator("[data-job]").filter({ hasText: jobTitle });
  return row.locator("input").nth(dayIndex);
}

test("založení zakázky pro hodiny", async ({ page, context }) => {
  const company = await ensureCompany(context);
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(jobTitle);
  await dialog.getByRole("button", { name: "Vybrat…" }).click();
  await page.getByPlaceholder("Hledat…").last().fill(company);
  await page.getByRole("option", { name: company }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: jobTitle }),
  ).toBeVisible();
});

test("týdenní výkaz: zakázka do mřížky, čas 1,5 a 1:30, součty, vymazání", async ({ page }) => {
  await page.goto("/hodiny");
  await expect(page.getByTestId("week-label")).toBeVisible();

  // přidání zakázky do výkazu
  await page.getByRole("combobox", { name: "Zakázka" }).click();
  await page.getByPlaceholder("Hledat zakázku…").fill(stamp);
  await page.getByRole("option", { name: new RegExp(jobTitle) }).click();
  await expect(page.locator("[data-job]").filter({ hasText: jobTitle })).toBeVisible();

  const mon = await cellFor(page, 0);
  await mon.fill("1,5");
  await mon.press("Enter");
  await expect(mon).toHaveValue("1:30");

  const tue = await cellFor(page, 1);
  await tue.fill("1:30");
  await tue.press("Enter");
  await expect(tue).toHaveValue("1:30");
  await expect(page.getByTestId("week-total")).toContainText("3:00");

  // neplatný zápis ukáže chybu a nic nezmění
  const wed = await cellFor(page, 2);
  await wed.fill("abc");
  await wed.press("Enter");
  await expect(page.getByTestId("grid-error")).toContainText("Zadejte čas");
  await wed.fill("");
  await wed.press("Enter");
  await expect(page.getByTestId("grid-error")).toHaveCount(0);

  // po obnovení stránky zůstává
  await page.reload();
  await expect(page.getByTestId("week-total")).toContainText("3:00");

  // vymazání buňky
  const mon2 = await cellFor(page, 0);
  await mon2.fill("");
  await mon2.press("Enter");
  await expect(page.getByTestId("week-total")).toContainText("1:30");
});

test("navigace po týdnech", async ({ page }) => {
  await page.goto("/hodiny");
  const label = await page.getByTestId("week-label").innerText();
  await page.getByRole("button", { name: "Předchozí týden" }).click();
  await expect(page.getByTestId("week-label")).not.toHaveText(label);
  await expect(page.getByTestId("week-total")).toContainText("0:00");
  await page.getByRole("button", { name: "Tento týden" }).click();
  await expect(page.getByTestId("week-label")).toHaveText(label);
});

test("dialog Zapsat čas (paleta) a záznam v týdnu", async ({ page }) => {
  await page.goto("/hodiny?zapsat=1");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Zakázka" }).click();
  await page.getByPlaceholder("Hledat zakázku…").fill(stamp);
  await page.getByRole("option", { name: new RegExp(jobTitle) }).click();
  await dialog.getByLabel("Den").fill(monday());
  await dialog.getByLabel("Čas").fill("45m");
  await expect(dialog.getByText("= 0:45 h")).toBeVisible();
  await dialog.getByLabel("Poznámka").fill("schůzka s klientem");
  await dialog.getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByTestId("week-entries")).toContainText("schůzka s klientem");
  await expect(page.getByTestId("week-total")).toContainText("2:15");
});

test("přehledy: moje hodiny podle zakázky, týden i měsíc", async ({ page }) => {
  await page.goto("/hodiny/prehled");
  await expect(page.getByTestId("report-total")).toContainText("2:15");
  await expect(page.getByTestId("report-rows")).toContainText(jobTitle);
  await page.getByRole("radio", { name: "Měsíc" }).click();
  await expect(page.getByTestId("report-total")).toBeVisible();
});

test("záložka Hodiny u zakázky: odpracováno a zapsání času", async ({ page }) => {
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await page.getByRole("row").filter({ hasText: jobTitle }).first().click();
  await page.getByRole("tab", { name: "Hodiny" }).click();
  await expect(page.getByTestId("job-worked")).toContainText("2:15 h");
  await page.getByRole("button", { name: "Zapsat čas" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Čas").fill("0,5");
  await dialog.getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByTestId("job-worked")).toContainText("2:45 h");
});
