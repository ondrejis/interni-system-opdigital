import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const note = `Zdění ${Math.random().toString(36).slice(2, 8)}`;

test("píchačka: příchod a okamžitý odchod záznam nevytvoří", async ({ page }) => {
  await page.goto("/dochazka");
  const clock = page.getByTestId("clock-card");
  await clock.getByRole("button", { name: "Příchod" }).click();
  await expect(clock.getByText(/Pracujete od/)).toBeVisible();
  await expect(clock.getByRole("button", { name: "Přestávka" })).toBeVisible();
  await clock.getByRole("button", { name: "Odchod" }).click();
  await expect(page.getByText("Odchod hned po příchodu, záznam se nevytvořil.")).toBeVisible();
  await expect(clock.getByRole("button", { name: "Příchod" })).toBeVisible();
});

test("týdenní výkaz: zápis hodin, odeslání, schválení vedoucím", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/dochazka");
  await page
    .getByRole("button", { name: /^Zapsat docházku/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Zapsat docházku" });
  await dialog.getByRole("button", { name: "Počet hodin" }).click();
  await dialog.getByLabel("Počet hodin").fill("7,5");
  await dialog.getByLabel(/Poznámka/).fill(note);
  await dialog.getByRole("button", { name: "Uložit" }).click();
  const days = page.getByTestId("week-days");
  await expect(days.getByText(note)).toBeVisible();
  await expect(days.getByText("7:30").first()).toBeVisible();
  await expect(page.getByTestId("week-total")).toContainText("Celkem");

  await page.getByRole("button", { name: "Odeslat týden ke schválení" }).click();
  await expect(page.getByText("Týden odeslán ke schválení.")).toBeVisible();
  await expect(days.getByText("Ke schválení").first()).toBeVisible();

  await page.getByRole("link", { name: "Ke schválení" }).click();
  await expect(page).toHaveURL(/\/dochazka\/schvalovani$/);
  const approvals = page.getByTestId("approvals");
  await expect(approvals).toBeVisible();
  await approvals.getByRole("button", { name: "Schválit" }).first().click();
  await expect(page.getByText("Hotovo.")).toBeVisible();

  await page.getByRole("link", { name: "Můj týden" }).click();
  await expect(page.getByTestId("week-days").getByText("Schváleno").first()).toBeVisible();
});

test("měsíční přehled a seznam všech záznamů", async ({ page }) => {
  await page.goto("/dochazka/prehled");
  await expect(page.getByTestId("month-report")).toBeVisible();
  await expect(page.getByTestId("month-report")).toContainText("E2E Aplikace");
  await page.goto("/dochazka/zaznamy");
  await expect(page.getByRole("heading", { name: "Záznamy docházky" })).toBeVisible();
  await page.getByPlaceholder("Hledat…").fill(note);
  await expect(page.getByRole("row").filter({ hasText: note })).toBeVisible();
});
