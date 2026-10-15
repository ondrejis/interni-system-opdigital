import { expect, test, type Page } from "@playwright/test";

/*
  Mobil (MOB, projekt „mobile“ v `playwright.mobil.config.ts`, 375×812, dotyk): Hledat po otevření, spodní lišta
  a Více, karta klienta a kontaktu s rychlými akcemi, tabulka jako karty, board obchodů s „Přesunout do fáze“,
  Moje úkoly (rychlé přidání, swipe), PWA (manifest, ikony, offline stránka, hlášení „jen ke čtení“), hustota řádků.
  Každý soubor si zakládá vlastní data (firma s telefonem, obchod s kontaktem). Pouští se samostatně:
  `cd apps/web && node --env-file=../../.env.local node_modules/@playwright/test/cli.js test -c playwright.mobil.config.ts`.
*/
test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 7);
// telefony jsou při každém běhu jiné (obchod hledá duplicitní kontakty podle telefonu a e-mailu)
const digits = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
const personPhone = `60${digits}`;
const firmPhone = `77${digits}`;
const firm = `Mobil Stavby ${stamp}`;
const dealFirm = `Mobil Obchod ${stamp}`;
const contactName = `Karel Mobilní${stamp}`;
let firmUrl = "";
let personUrl = "";

/** Tah prstem po prvku (skutečné dotykové události přes CDP; Playwright sám swipe neumí). */
async function swipe(page: Page, target: ReturnType<Page["locator"]>, dx: number) {
  const box = (await target.boundingBox())!;
  const y = box.y + box.height / 2;
  const x0 = box.x + box.width * 0.7; // mimo tlačítka na pravém okraji řádku
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  await touch("touchStart", x0);
  for (let i = 1; i <= 8; i++) await touch("touchMove", x0 + (dx * i) / 8);
  await touch("touchEnd", x0 + dx);
}

test("po otevření je Hledat: nedávné záznamy, klávesnice připravená, Zavřít", async ({ page }) => {
  await page.goto("/prehled");
  const input = page.getByTestId("palette-input");
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  // celá obrazovka, ne okno uprostřed
  const box = (await page.getByRole("dialog").boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(375);
  await page.getByRole("button", { name: "Zavřít" }).click();
  await expect(input).toBeHidden();
  // podruhé v téže relaci se samo neotevře
  await page.goto("/prehled");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("palette-input")).toBeHidden();
});

test("spodní lišta: Hledat, Klienti, Obchody, Moje úkoly, Více; cíle aspoň 44 px", async ({
  page,
}) => {
  await page.goto("/prehled?bez-hledani");
  const nav = page.getByTestId("bottom-nav");
  for (const label of ["Hledat", "Klienti", "Obchody", "Moje úkoly", "Více"])
    await expect(nav.getByText(label, { exact: true })).toBeVisible();
  const items = await nav.locator("a, button").all();
  for (const it of items) expect((await it.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("Více: ostatní sekce, Historie, Koš, Nastavení s velkými řádky", async ({ page }) => {
  await page.goto("/prehled?bez-hledani");
  await page.getByTestId("bottom-nav").getByRole("button", { name: "Více" }).click();
  const menu = page.getByTestId("more-menu");
  for (const label of ["Přehled", "Zakázky", "Historie", "Koš", "Nastavení"])
    await expect(menu.getByRole("link", { name: label, exact: true })).toBeVisible();
  for (const link of await menu.getByRole("link").all()) {
    if (await link.isVisible())
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await menu.getByRole("link", { name: "Koš", exact: true }).click();
  await expect(page).toHaveURL(/\/kos$/);
});

test("klient: karta s Zavolat, E-mail a Navigovat; hledání podle telefonu a volání na dvě ťuknutí", async ({
  page,
}) => {
  await page.goto("/kontakty/firmy/nova", { waitUntil: "networkidle" });
  await page.getByLabel(/Název \*/).fill(firm);
  await page.getByLabel("Ulice").fill("Americká 12");
  await page.getByLabel("Město").fill("Plzeň");
  await page.getByLabel("PSČ").fill("30100");
  await page.getByLabel("E-mail").fill(`info-${stamp}@mobil.example`);
  await page.getByLabel("Telefon").fill(firmPhone);
  await page.getByRole("button", { name: "Založit organizaci" }).click();
  await expect(page.getByTestId("record-view")).toBeVisible();
  firmUrl = new URL(page.url()).pathname;
  await page.getByTestId("client-mark").click();
  await expect(page.getByTestId("client-status")).toContainText("Lead");

  const card = page.getByTestId("mobile-client-card");
  await expect(card.getByTestId("mobile-call")).toHaveAttribute("href", /^tel:/);
  await expect(card.getByTestId("mobile-mail")).toHaveAttribute(
    "href",
    `mailto:info-${stamp}@mobil.example`,
  );
  await expect(card.getByTestId("mobile-navigate")).toHaveAttribute(
    "href",
    /google\.com\/maps.*Americk/,
  );
  for (const t of ["mobile-call", "mobile-mail", "mobile-navigate"])
    expect((await card.getByTestId(t).boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // hledání: 1. ťuknutí Hledat, napsat část telefonu, 2. ťuknutí na ikonu telefonu (tel:)
  await page.goto("/prehled?bez-hledani");
  await page.getByTestId("bottom-nav").getByRole("button", { name: "Hledat" }).click();
  await page.getByTestId("palette-input").fill(firm);
  const row = page.getByTestId("palette-item").filter({ hasText: firm }).first();
  await expect(row).toContainText(firmPhone);
  const call = row.getByRole("link", { name: /Zavolat/ });
  await expect(call).toHaveAttribute("href", /^tel:/);
  expect((await call.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("obchod s novým kontaktem; kontakt má Zavolat, SMS, WhatsApp a E-mail", async ({ page }) => {
  await page.goto("/obchody", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Nový obchod/ }).click();
  const dialog = page.getByRole("dialog");
  // dialog je spodní list přes celou šířku
  expect((await dialog.boundingBox())!.width).toBe(375);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000); // načtení výběrů firem a kontaktů nesmí přepsat vyplněné
  await dialog.getByLabel("Název obchodu").fill(`Web ${stamp}`);
  await dialog.getByPlaceholder("…nebo název nové firmy").fill(dealFirm);
  await dialog.getByPlaceholder("…nebo jméno").fill(contactName);
  await dialog.getByPlaceholder("E-mail").fill(`karel-${stamp}@mobil.example`);
  await dialog.getByPlaceholder("Telefon").fill(personPhone);
  await expect(dialog.getByPlaceholder("…nebo jméno")).toHaveValue(contactName);
  await dialog.getByRole("button", { name: /Založit obchod/ }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/prehled?bez-hledani");
  await page.getByTestId("bottom-nav").getByRole("button", { name: "Hledat" }).click();
  await page.getByTestId("palette-input").fill(contactName);
  await page.getByTestId("palette-item").filter({ hasText: contactName }).first().click();
  await expect(page.getByTestId("record-view")).toBeVisible();
  personUrl = new URL(page.url()).pathname;
  const bar = page.getByTestId("contact-action-bar");
  await expect(bar.getByTestId("mobile-call")).toHaveAttribute(
    "href",
    new RegExp(`^tel:(\\+?420)?${personPhone}$`),
  );
  await expect(bar.getByTestId("mobile-sms")).toHaveAttribute("href", /^sms:/);
  await expect(bar.getByTestId("mobile-whatsapp")).toHaveAttribute(
    "href",
    `https://wa.me/420${personPhone}`,
  );
  await expect(bar.getByTestId("mobile-mail")).toHaveAttribute(
    "href",
    `mailto:karel-${stamp}@mobil.example`,
  );
  for (const t of ["call", "sms", "whatsapp", "mail"])
    expect((await bar.getByTestId(`mobile-${t}`).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(personUrl).toContain("/kontakty/");
});

test("board obchodů: posuvné sloupce a Přesunout do fáze", async ({ page }) => {
  await page.goto("/obchody");
  const board = page.getByTestId("mobile-board");
  await expect(board).toBeVisible();
  const card = page.getByTestId("mobile-deal-card").filter({ hasText: `Web ${stamp}` });
  await expect(card).toBeVisible();
  const before = await card.locator("xpath=ancestor::*[@aria-label][1]").getAttribute("aria-label");
  await card.getByTestId("mobile-deal-menu").click();
  await page
    .getByRole("menuitem")
    .filter({ hasNotText: before ?? "—" })
    .first()
    .click();
  await expect
    .poll(async () =>
      page
        .getByTestId("mobile-deal-card")
        .filter({ hasText: `Web ${stamp}` })
        .locator("xpath=ancestor::*[@aria-label][1]")
        .getAttribute("aria-label"),
    )
    .not.toBe(before);
});

test("Moje úkoly: rychlé přidání a swipe doleva nabídne Odložit a Hotovo", async ({ page }) => {
  await page.goto("/ukoly");
  const title = `Zavolat Nováková ${stamp}`;
  await page.getByPlaceholder(/Přidat úkol/).fill(`${title} dnes`);
  await page.getByRole("button", { name: "Přidat", exact: true }).click();
  const row = page.getByTestId("swipe-row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await swipe(page, row, -150);
  await expect(row.getByTestId("swipe-snooze")).toBeVisible();
  await expect(row.getByTestId("swipe-done")).toBeVisible();
  await row.getByTestId("swipe-done").click();
  await expect(page.getByTestId("swipe-row").filter({ hasText: title })).toHaveCount(0);
});

test("k čemukoli jde založit úkol a poznámku (karta klienta)", async ({ page }) => {
  await page.goto(firmUrl);
  await expect(page.getByRole("button", { name: /Nový úkol/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Nová poznámka/ }).first()).toBeVisible();
});

test("široké tabulky jsou na telefonu karty a stránka se nehýbe do stran", async ({ page }) => {
  for (const p of [
    "/kontakty/firmy",
    "/kontakty/osoby",
    "/klienti",
    "/zakazky",
    "/obchody",
    "/ukoly",
  ]) {
    await page.goto(p);
    await expect(page.getByRole("heading").first()).toBeVisible();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over, `vodorovný přesah na ${p}`).toBeLessThanOrEqual(1);
  }
  await page.goto("/kontakty/firmy");
  await expect(page.getByTestId("card-list")).toBeVisible();
  await expect(page.getByTestId("data-table")).toHaveCount(0);
  // klienti: karty místo tabulky, klepnutí otevře kartu klienta
  await page.goto("/klienti");
  await expect(page.getByTestId("clients-cards")).toBeVisible();
  await expect(page.getByTestId("clients-table")).toHaveCount(0);
  await page.getByTestId("clients-search").fill(firm);
  await page.getByTestId("client-card").filter({ hasText: firm }).click();
  await expect(page).toHaveURL(new RegExp(`${firmUrl}$`));
});

test("hustota řádků: data-density z localStorage a proměnná výšky řádku", async ({ page }) => {
  await page.goto("/prehled?bez-hledani");
  await page.evaluate(() => localStorage.setItem("density", "compact"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--row-h"),
    ),
  ).toBe("28px");
  await page.evaluate(() => localStorage.setItem("density", "comfortable"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--row-h"),
    ),
  ).toBe("36px");
});

test("PWA: manifest OPSYS, ikony, offline stránka a service worker", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("OPSYS");
  expect(manifest.display).toBe("standalone");
  const purposes = manifest.icons.map((i: { purpose: string }) => i.purpose);
  expect(purposes).toContain("maskable");
  for (const icon of manifest.icons as { src: string }[]) {
    const res = await request.get(icon.src);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  }
  expect((await request.get("/pwa-icon/180")).status()).toBe(200);
  expect(JSON.stringify(manifest).toLowerCase()).not.toContain("rebar");
  const offline = await request.get("/offline.html");
  expect(offline.status()).toBe(200);
  expect(await offline.text()).toContain("Jen ke čtení");
  const sw = await (await request.get("/sw.js")).text();
  expect(sw).toContain("opsys-pages-v1");
  await page.goto("/prehled?bez-hledani");
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test("bez spojení: hlášení „jen ke čtení“ a odesílací tlačítka jsou neaktivní", async ({
  page,
  context,
}) => {
  await page.goto("/ukoly");
  await expect(page.getByTestId("bottom-nav")).toBeVisible();
  await context.setOffline(true);
  const banner = page.getByTestId("offline-banner");
  await expect(banner).toContainText("jen ke čtení");
  await expect(page.locator("html")).toHaveAttribute("data-offline", "true");
  await context.setOffline(false);
  await expect(banner).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-offline", "false");
});
