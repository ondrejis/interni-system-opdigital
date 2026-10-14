import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
let secret = "";

test("příjem poptávek: klíč se ukáže jednou, webhook založí poptávku, špatný klíč dostane 401", async ({
  page,
  request,
}) => {
  await page.goto("/poptavky/prijem");
  // na pomalém stroji se pole vyplní dřív, než React stránku „oživí“ (pak stav pole zůstane prázdný a tlačítko vypnuté): opakovat
  const create = page.getByRole("button", { name: "Vytvořit klíč" });
  await expect(async () => {
    await page.getByLabel("Název klíče").fill(`Web ${stamp}`);
    await expect(create).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await create.click();
  secret = (await page.getByTestId("intake-secret").innerText()).trim();
  expect(secret).toMatch(/^pq_/);

  const bad = await request.post("/api/intake/poptavky", {
    headers: { authorization: "Bearer pq_spatny" },
    data: { name: "Nikdo" },
  });
  expect(bad.status()).toBe(401);

  const res = await request.post("/api/intake/poptavky", {
    headers: { authorization: `Bearer ${secret}` },
    data: {
      name: `Jan ${stamp}`,
      email: `jan-${stamp}@example.cz`,
      company: `Příchozí ${stamp} s.r.o.`,
      message: "Poptávám rekonstrukci koupelny.",
    },
  });
  expect(res.status()).toBe(201);

  // klíč už po obnovení zobrazit nejde, v seznamu je jen jeho začátek; příchozí požadavek je v záznamu
  await page.reload();
  await expect(page.getByTestId("intake-secret")).toBeHidden();
  await expect(page.getByText(`Web ${stamp}`)).toBeVisible();
  await expect(page.getByText("Přijato").first()).toBeVisible();

  await page.goto("/poptavky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(page.getByRole("row").filter({ hasText: `Příchozí ${stamp}` })).toBeVisible();
});

test("kvalifikace poptávky v dialogu jedním krokem a otevření zakázky na nástěnce", async ({
  page,
}) => {
  await page.goto("/poptavky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: `Příchozí ${stamp}` });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  await page.getByRole("button", { name: "Kvalifikovat", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Kvalifikovat poptávku" });
  await dialog.getByRole("button", { name: "Kvalifikovat", exact: true }).click();
  await expect(page).toHaveURL(/\/crm\?record=[0-9a-f-]{36}/);
  const jobId = new URL(page.url()).searchParams.get("record")!;

  await page.goto(`/zakazky/${jobId}`);
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: new RegExp(`Příchozí ${stamp}`) }),
  ).toBeVisible();
  // firma z poptávky vznikla v kontaktech
  await expect(
    page
      .getByTestId("attributes-panel")
      .getByRole("link", { name: `Příchozí ${stamp} s.r.o.`, exact: true }),
  ).toBeVisible();

  // poptávka je kvalifikovaná a jde z ní otevřít zakázka; podruhé už se kvalifikovat nedá
  await page.goto("/poptavky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(page.getByRole("row").filter({ hasText: `Příchozí ${stamp}` })).toContainText(
    "Kvalifikovaná",
  );
});

test("zamítnutí poptávky vyžaduje důvod z číselníku", async ({ page }) => {
  await page.goto("/poptavky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(`Drahá ${stamp}`);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name: `Drahá ${stamp}` })).toBeVisible();

  await view.getByRole("button", { name: "Zamítnout", exact: true }).click();
  const lost = page.getByRole("dialog", { name: "Zamítnout poptávku" });
  await expect(lost.getByRole("button", { name: "Zamítnout", exact: true })).toBeDisabled();
  await lost.getByRole("button", { name: "Důvod zamítnutí" }).click();
  await page.getByRole("option", { name: "Cena" }).click();
  await lost.getByRole("button", { name: "Zamítnout", exact: true }).click();
  await expect(page.getByText("Poptávka je zamítnutá.")).toBeVisible();
  await expect(view.getByRole("button", { name: "Změnit stav" })).toContainText("Zamítnutá");
});
