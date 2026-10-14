import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const title = `Porada ${stamp}`;
const room = `Zasedačka ${stamp}`;

test("událost: vytvoření a zobrazení v měsíci, týdnu i agendě", async ({ page }) => {
  await page.goto("/kalendar");
  await page.getByRole("button", { name: "Nová událost" }).click();
  const dialog = page.getByRole("dialog", { name: "Nová událost" });
  await dialog.getByLabel("Název").fill(title);
  await dialog.getByLabel("Místo").fill("Plzeň, Hlavní 1");
  await dialog.getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByText("Událost vytvořena.")).toBeVisible();

  const chip = page.getByTestId("calendar-item").filter({ hasText: title });
  await expect(chip).toBeVisible();

  await page.getByRole("button", { name: "Týden", exact: true }).click();
  await expect(page.getByTestId("week-grid").getByText(title)).toBeVisible();
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(page.getByTestId("agenda")).toContainText(title);
  await expect(page.getByTestId("agenda")).toContainText("09:00–10:00");
  await page.getByRole("button", { name: "Měsíc", exact: true }).click();

  // detail a úprava: otevřít, změnit název, uložit
  await page.getByTestId("calendar-item").filter({ hasText: title }).click();
  const edit = page.getByRole("dialog", { name: "Událost" });
  await expect(edit.getByLabel("Název")).toHaveValue(title);
  await edit.getByLabel("Název").fill(`${title} (upraveno)`);
  await edit.getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByText("Událost uložena.")).toBeVisible();
  await expect(
    page.getByTestId("calendar-item").filter({ hasText: `${title} (upraveno)` }),
  ).toBeVisible();
});

test("zdroje: obsazenou zasedačku nejde rezervovat dvakrát", async ({ page }) => {
  await page.goto("/kalendar/zdroje");
  await page.getByTestId("create-record").click();
  const create = page.getByRole("dialog");
  await create.getByLabel(/Název/).fill(room);
  await create.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: room })).toBeVisible();

  for (const [first, name] of [
    [true, `S místností ${stamp}`],
    [false, `Kolize ${stamp}`],
  ] as const) {
    await page.goto("/kalendar");
    await page.getByRole("button", { name: "Nová událost" }).click();
    const dialog = page.getByRole("dialog", { name: "Nová událost" });
    await dialog.getByLabel("Název").fill(name);
    await dialog.getByRole("button", { name: /^Zdroj/ }).click();
    await page.getByRole("option", { name: room }).click();
    await dialog.getByRole("button", { name: "Uložit" }).click();
    if (first) await expect(page.getByText("Událost vytvořena.")).toBeVisible();
    else await expect(dialog.getByRole("alert")).toContainText("je v tomto čase obsazený");
  }
});

test("odběr: tajný odkaz vrací kalendář, nový odkaz starý zneplatní", async ({ page }) => {
  await page.goto("/kalendar");
  await page.getByRole("button", { name: "Odběr a import" }).click();
  const dialog = page.getByRole("dialog", { name: "Odběr a import kalendáře" });
  await dialog.getByRole("button", { name: /Vytvořit (nový )?odkaz/ }).click();
  const url = await dialog.getByLabel("Adresa odběru").inputValue();
  expect(url).toMatch(/\/api\/kalendar\/feed\/[A-Za-z0-9_-]{20,}\.ics$/);

  const res = await page.request.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const body = await res.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain(`SUMMARY:${title}`);

  await dialog.getByRole("button", { name: "Vytvořit nový odkaz" }).click();
  await expect(dialog.getByLabel("Adresa odběru")).not.toHaveValue(url);
  expect((await page.request.get(url)).status()).toBe(404);
  expect(
    (await page.request.get(`${new URL(url).origin}/api/kalendar/feed/nesmysl.ics`)).status(),
  ).toBe(404);
});

test("import: adresa z interní sítě se odmítne", async ({ page }) => {
  await page.goto("/kalendar");
  await page.getByRole("button", { name: "Odběr a import" }).click();
  const dialog = page.getByRole("dialog", { name: "Odběr a import kalendáře" });
  await dialog.getByLabel("Název kalendáře").fill("Interní");
  await dialog.getByLabel("Adresa kalendáře").fill("https://169.254.169.254/latest/meta-data");
  await dialog.getByRole("button", { name: "Připojit" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Tato adresa není povolená.");
  await dialog.getByLabel("Adresa kalendáře").fill("http://example.com/cal.ics");
  await dialog.getByRole("button", { name: "Připojit" }).click();
  await expect(dialog.getByRole("alert")).toContainText("https://");
});
