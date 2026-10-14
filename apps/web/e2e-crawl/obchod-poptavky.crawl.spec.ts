import { expect, test } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";

/**
 * Schránka poptávek (CRM, oblast F): příjem veřejným webhookem s klíčem (i chybné vstupy, UTM, past na roboty),
 * kvalifikace v dialogu (firma, osoba, první aktivita, otevření zakázky na nástěnce), zamítnutí s důvodem, kanban se
 * stavy Nová / Kvalifikovaná / Zamítnutá. Klíč příjmu se ukáže jen jednou; test si vytvoří vlastní a po sobě ho zruší.
 */
test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
let secret = "";

test("příjem: klíč, webhook (platný i chybný vstup) a záznam příchozího požadavku", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  // chybné požadavky vrací 4xx záměrně; sbírač chyb se týká jen stránky, ne `request`
  await visit(page, "/poptavky/prijem", c);
  const create = page.getByRole("button", { name: "Vytvořit klíč" });
  await expect(async () => {
    await page.getByLabel("Název klíče").fill(`Web ${stamp}`);
    await expect(create).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await create.click();
  secret = (await page.getByTestId("intake-secret").innerText()).trim();
  expect(secret).toMatch(/^pq_/);

  const post = (auth: string | null, data: unknown) =>
    request.post("/api/intake/poptavky", {
      headers: auth ? { authorization: `Bearer ${auth}` } : {},
      data: data as Record<string, unknown>,
    });
  expect((await post(null, { name: "Nikdo" })).status()).toBe(401);
  expect((await post("pq_spatny", { name: "Nikdo" })).status()).toBe(401);
  const empty = await post(secret, {});
  expect(empty.status()).toBeGreaterThanOrEqual(400);
  expect(empty.status()).toBeLessThan(500);
  const garbage = await request.post("/api/intake/poptavky", {
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    data: "{nejde-json",
  });
  expect(garbage.status()).toBeGreaterThanOrEqual(400);
  expect(garbage.status()).toBeLessThan(500);

  const ok = await post(secret, {
    name: `Jan ${stamp}`,
    email: `jan-${stamp}@example.cz`,
    phone: "+420 777 123 456",
    company: `Příchozí ${stamp} s.r.o.`,
    message: "Poptávám rekonstrukci koupelny.",
    utm_source: "facebook",
    utm_medium: "cpc",
    utm_campaign: `jaro-${stamp}`,
  });
  expect(ok.status()).toBe(201);

  // past na roboty: vyplněné skryté pole se tváří jako úspěch, ale poptávka nevznikne
  const spam = await post(secret, {
    name: `Robot ${stamp}`,
    email: `robot-${stamp}@example.cz`,
    _hp: "http://spam.example",
  });
  expect(spam.status()).toBe(201);
  // příliš velké tělo se odmítne dřív, než se zpracuje
  const huge = await post(secret, { name: `Obr ${stamp}`, message: "x".repeat(60_000) });
  expect(huge.status()).toBe(413);

  await page.reload();
  await expect(page.getByTestId("intake-secret")).toBeHidden(); // klíč se podruhé nezobrazí
  await expect(page.getByText(`Web ${stamp}`)).toBeVisible();
  await expect(page.getByText("Přijato").first()).toBeVisible();
  await expect(page.getByText("Zahozeno (spam)").first()).toBeVisible();
  expectClean(c, "příjem poptávek");

  await visit(page, "/poptavky", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: `Příchozí ${stamp}` });
  await expect(row).toBeVisible();
  // poptávka dostala první stav pipeline a zdroj Web
  await expect(row).toContainText("Nová");
  expectClean(c, "seznam poptávek");
  // robot se do schránky nedostal
  await page.getByPlaceholder("Hledat…").fill(`Robot ${stamp}`);
  await expect(page.getByRole("row").filter({ hasText: `Robot ${stamp}` })).toHaveCount(0);
});

test("kvalifikace poptávky v dialogu: firma vznikne, poptávka je Kvalifikovaná a vede na zakázku na nástěnce", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/poptavky", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: `Příchozí ${stamp}` });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  await page.getByRole("button", { name: "Kvalifikovat", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Kvalifikovat poptávku" });
  // dialog nabídne založení nové firmy (a osoby) a první aktivitu „Zavolat zítra“
  await expect(dialog.getByText("Založit novou firmu")).toBeVisible();
  await expect(dialog.getByTestId("first-activity")).toBeVisible();
  await dialog.getByRole("button", { name: "Kvalifikovat", exact: true }).click();
  await expect(page).toHaveURL(/\/crm\?record=[0-9a-f-]{36}/);
  const jobId = new URL(page.url()).searchParams.get("record")!;
  expectClean(c, "kvalifikace");

  // firma z poptávky vznikla v kontaktech, zakázka je ve fázi Poptávka a odkazuje na poptávku
  await visit(page, `/zakazky/${jobId}`, c);
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name: new RegExp(`Příchozí ${stamp}`) })).toBeVisible();
  await expect(
    page
      .getByTestId("attributes-panel")
      .getByRole("link", { name: `Příchozí ${stamp} s.r.o.`, exact: true }),
  ).toBeVisible();
  // kanál a kampaň z UTM značek se přenesly ze schránky
  await expect(page.getByTestId("attributes-panel")).toContainText(`jaro-${stamp}`);

  await visit(page, "/poptavky", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const again = page.getByRole("row").filter({ hasText: `Příchozí ${stamp}` });
  await expect(again).toContainText("Kvalifikovaná");
  await again.hover();
  await again.getByRole("button", { name: "Otevřít" }).click();
  // podruhé už se kvalifikovat nedá a vede rovnou na zakázku
  await expect(page.getByRole("button", { name: "Kvalifikovat", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Otevřít zakázku/ }).click();
  await expect(page).toHaveURL(new RegExp(`/crm\\?record=${jobId}`));
  expectClean(c, "poptávka po kvalifikaci");
});

test("zamítnutí poptávky vyžaduje důvod a zamítnutá poptávka je v kanbanu ve sloupci Zamítnutá", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/poptavky", c);
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
  expectClean(c, "zamítnutí");

  // zamítnutou poptávku nejde kvalifikovat: tlačítko řekne proč
  await view.getByRole("button", { name: "Kvalifikovat", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Kvalifikovat poptávku" })
      .getByText("Zamítnutou poptávku nejde kvalifikovat."),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // kanban zobrazí stavy schránky a zamítnutou poptávku ve sloupci Zamítnutá
  await visit(page, "/poptavky", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await page.getByRole("button", { name: "Kanban" }).click();
  await expect(
    page.getByRole("region", { name: "Zamítnutá", exact: true }).getByText(`Drahá ${stamp}`),
  ).toBeVisible();
  expectClean(c, "kanban poptávek");
});

test("zrušení klíče příjmu: webhook s ním pak dostane 401", async ({ page, request }) => {
  const c = collectErrors(page);
  await visit(page, "/poptavky/prijem", c);
  const item = page.getByText(`Web ${stamp}`).first();
  await expect(item).toBeVisible();
  const scope = page
    .locator("li, tr, [data-testid]")
    .filter({ hasText: `Web ${stamp}` })
    .last();
  await scope.getByRole("button", { name: /Zrušit|Odvolat|Smazat|Vypnout/ }).click();
  const confirm = page.getByRole("dialog");
  if (await confirm.isVisible().catch(() => false))
    await confirm
      .getByRole("button", { name: /Zrušit klíč|Odvolat|Smazat|Vypnout|Ano/ })
      .last()
      .click();
  await expect(async () => {
    const res = await request.post("/api/intake/poptavky", {
      headers: { authorization: `Bearer ${secret}` },
      data: { name: `Po zrušení ${stamp}` },
    });
    expect(res.status()).toBe(401);
  }).toPass({ timeout: 15_000 });
  expectClean(c, "zrušení klíče");
});

test.describe("kanban poptávek", () => {
  // tři sloupce schránky (Nová, Kvalifikovaná, Zamítnutá) se vejdou vedle sebe
  test.use({ viewport: { width: 1600, height: 900 } });

  test("přetažení karty do Zamítnutá bez důvodu a do Kvalifikovaná bez převodu karta vrátí s větou proč", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const c = collectErrors(page);
    const title = `Kanban ${stamp}`;
    await visit(page, "/poptavky", c);
    await page.getByTestId("create-record").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Název/).fill(title);
    await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
    await expect(
      page.getByTestId("record-view").getByRole("heading", { name: title }),
    ).toBeVisible();

    await visit(page, "/poptavky", c);
    await page.getByPlaceholder("Hledat…").fill(title);
    await page.getByRole("button", { name: "Kanban" }).click();
    const card = page.locator("[data-card-id]").filter({ hasText: title });
    await expect(card).toBeVisible();
    const drag = async (name: string) => {
      const target = page.getByRole("region", { name, exact: true });
      await card.hover();
      await page.waitForTimeout(500);
      const a = (await card.boundingBox())!;
      await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 4 });
      const b = (await target.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + 80, { steps: 12 });
      await page.waitForTimeout(250);
      const t = (await target.boundingBox())!;
      await page.mouse.move(t.x + t.width / 2, t.y + 80, { steps: 3 });
      await page.waitForTimeout(150);
      await page.mouse.up();
    };
    const dragUntilAlert = async (name: string, text: RegExp) => {
      for (let attempt = 1; ; attempt++) {
        await drag(name);
        try {
          await expect(page.getByRole("alert").filter({ hasText: text })).toBeVisible({
            timeout: 4_000,
          });
          return;
        } catch (e) {
          if (attempt >= 4) throw e;
          await page.evaluate(() => window.getSelection()?.removeAllRanges());
        }
      }
    };
    // do Zamítnutá bez důvodu a do Kvalifikovaná bez převodu nejde: karta se vrátí a chyba řekne proč
    await dragUntilAlert("Zamítnutá", /důvod prohry/);
    await dragUntilAlert("Kvalifikovaná", /převodem na zakázku/);
    await expect(
      page.getByRole("region", { name: "Nová", exact: true }).getByText(title),
    ).toBeVisible();
    expectClean(c, "kanban poptávek");
  });
});
