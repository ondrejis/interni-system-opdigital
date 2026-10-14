import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs } from "./roles";

/**
 * Procházka: kalendář. Měsíc, týden, agenda, vrstvy modulů, vytvoření, úprava a zrušení události, opakování,
 * účastníci (událost se objeví i kolegovi), zdroje a kolize rezervací, připomenutí, odběr ICS (token, obsah, obnova)
 * a import cizího kalendáře (bezpečnostní odmítnutí adres). Vše pod značkou `stamp`.
 */
const stamp = Math.random().toString(36).slice(2, 8);
const title = `Porada ${stamp}`;
const room = `Zasedačka ${stamp}`;
const attendeeTitle = `S kolegou ${stamp}`;

test.describe.configure({ mode: "serial" });

const chips = (page: Page, t: string) => page.getByTestId("calendar-item").filter({ hasText: t });

/** Vypne všechny vrstvy modulů (v demo datech jich je dost na to, aby schovaly vlastní události za „+ N další“). */
async function onlyOwnEvents(page: Page) {
  const layers = page.getByRole("button", { pressed: true }).filter({
    has: page.locator("span"),
    hasText: /Konec záruky|Fáze zakázek|Splatnosti|Absence|Dodávky|Rezervace strojů|STK/,
  });
  for (let n = await layers.count(); n > 0; n = await layers.count()) await layers.first().click();
}

async function newEvent(page: Page, name: string) {
  await page.getByRole("button", { name: "Nová událost", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nová událost" });
  await dialog.getByLabel("Název").fill(name);
  return dialog;
}

test("stránky: měsíc, týden, agenda, vrstvy a události z modulů se otevřou", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/kalendar", c);
  await expect(page.getByTestId("month-grid")).toBeVisible();
  // v demo datech jsou vrstvy modulů; vypnutí vrstvy schová její položky a zapnutí je vrátí
  const layer = page.getByRole("button", { name: "Fáze zakázek" });
  await expect(layer).toHaveAttribute("aria-pressed", "true");
  const before = await page.getByTestId("calendar-item").count();
  await layer.click();
  await expect(layer).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.getByTestId("calendar-item").count()).toBeLessThan(before);
  await layer.click();
  await expect(layer).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.getByTestId("calendar-item").count()).toBe(before);

  await page.getByRole("button", { name: "Další", exact: true }).click();
  await page.getByRole("button", { name: "Předchozí", exact: true }).click();
  await page.getByRole("button", { name: "Týden", exact: true }).click();
  await expect(page.getByTestId("week-grid")).toBeVisible();
  await page.getByRole("button", { name: "Další", exact: true }).click();
  await page.getByRole("button", { name: "Dnes", exact: true }).click();
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(page.getByTestId("agenda")).toBeVisible();
  await page.getByRole("button", { name: "Měsíc", exact: true }).click();
  // „Všichni“ ukáže kalendáře celé firmy (majitel smí)
  await page.getByRole("button", { name: "Všichni", exact: true }).click();
  await expect(page.getByRole("button", { name: "Všichni", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Všichni", exact: true }).click();
  for (const p of ["/kalendar/udalosti", "/kalendar/zdroje"]) await visit(page, p, c);
  expectClean(c, "stránky kalendáře");
});

test("událost: týdenní opakování se objeví v dalších měsících, úprava, připomenutí", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/kalendar", c);
  await onlyOwnEvents(page);
  const dialog = await newEvent(page, title);
  await dialog.getByLabel("Místo").fill("Plzeň, Hlavní 1");
  // brzy ráno: měsíční buňka ukáže jen první tři položky podle času, události z dřívějších (přerušených) běhů mají 9:00
  await dialog.locator("#ev-start-time").fill("05:00");
  await dialog.locator("#ev-end-time").fill("06:00");
  await dialog.getByRole("button", { name: /^Opakování/ }).click();
  await page.getByRole("option", { name: "Každý týden" }).click();
  await dialog.getByRole("button", { name: /^Připomenutí/ }).click();
  await page.getByRole("option", { name: "15 minut předem" }).click();
  await dialog.getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByText("Událost vytvořena.")).toBeVisible();
  await expect(chips(page, title).first()).toBeVisible();

  // mřížka měsíce má 4 až 6 týdnů, tedy 4 až 6 výskytů, v dalším také
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Další", exact: true }).click();
    await expect.poll(() => chips(page, title).count()).toBeGreaterThanOrEqual(4);
    await expect.poll(() => chips(page, title).count()).toBeLessThanOrEqual(6);
  }
  await page.getByRole("button", { name: "Dnes", exact: true }).click();

  // týden a agenda ukazují dobu
  await page.getByRole("button", { name: "Týden", exact: true }).click();
  await expect(page.getByTestId("week-grid").getByText(title).first()).toBeVisible();
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(page.getByTestId("agenda")).toContainText(title);
  await expect(page.getByTestId("agenda")).toContainText("05:00–06:00");
  await page.getByRole("button", { name: "Měsíc", exact: true }).click();

  // detail: hodnoty se uložily (opakování, připomenutí), změna konce před začátek se odmítne
  await chips(page, title).first().click();
  const edit = page.getByRole("dialog", { name: "Událost" });
  await expect(edit.getByLabel("Název")).toHaveValue(title);
  await expect(edit.getByRole("button", { name: /^Opakování/ })).toContainText("Každý týden");
  await expect(edit.getByRole("button", { name: /^Připomenutí/ })).toContainText("15 minut");
  await edit.locator("#ev-end-time").fill("04:00");
  await edit.getByRole("button", { name: "Uložit" }).click();
  await expect(edit.getByRole("alert")).toBeVisible();
  await edit.locator("#ev-end-time").fill("07:30");
  await edit.getByLabel("Název").fill(`${title} (upraveno)`);
  await edit.getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByText("Událost uložena.")).toBeVisible();
  await expect(chips(page, `${title} (upraveno)`).first()).toBeVisible();
  await expect(chips(page, `${title} (upraveno)`).first()).toBeVisible();
  expectClean(c, "událost");
});

test("účastník: událost se objeví v kalendáři kolegy a má upozornění", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/kalendar", c);
  const dialog = await newEvent(page, attendeeTitle);
  await dialog.getByRole("button", { name: /^Účastníci/ }).click();
  await page.getByPlaceholder("Hledat…").last().fill("Zeman");
  await page.getByRole("option", { name: /Radek Zeman/ }).click();
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByText("Událost vytvořena.")).toBeVisible();

  const office = await pageAs(browser, "foreman2"); // montér (role jen pro terminál) kalendář v kanceláři nemá
  const co = collectErrors(office.page);
  await visit(office.page, "/kalendar", co);
  await onlyOwnEvents(office.page);
  // měsíční mřížka řadí vlastní události dřív než pozvané a zbytek schová za „+ N další“; agenda ukáže všechno
  await office.page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(chips(office.page, attendeeTitle).first()).toBeVisible();
  // kolega událost vidí, ale nesmí ji upravit ani zrušit (jen čtení)
  await chips(office.page, attendeeTitle).first().click();
  const view = office.page.getByRole("dialog", { name: "Událost" });
  await expect(view.getByRole("button", { name: "Zrušit událost" })).toHaveCount(0);
  await expect(view.getByRole("button", { name: "Uložit" })).toHaveCount(0);
  await view.getByRole("button", { name: "Zavřít", exact: true }).last().click();
  expectClean(co, "kolega");
  await office.ctx.close();
  expectClean(c, "účastník");
});

test("zdroje: obsazený zdroj nejde rezervovat dvakrát, navazující čas ano", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/kalendar/zdroje", c);
  await page.getByTestId("create-record").click();
  const create = page.getByRole("dialog");
  await create.getByLabel(/Název/).fill(room);
  await create.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: room })).toBeVisible();

  const book = async (name: string, start?: string, end?: string) => {
    await visit(page, "/kalendar", c);
    const dialog = await newEvent(page, name);
    await dialog.getByRole("button", { name: /^Zdroj/ }).click();
    await page.getByRole("option", { name: room }).click();
    if (start) await dialog.locator("#ev-start-time").fill(start);
    if (end) await dialog.locator("#ev-end-time").fill(end);
    await dialog.getByRole("button", { name: "Uložit" }).click();
    return dialog;
  };
  await book(`S místností ${stamp}`);
  await expect(page.getByText("Událost vytvořena.")).toBeVisible();
  const clash = await book(`Kolize ${stamp}`, "09:30", "10:30");
  await expect(clash.getByRole("alert")).toContainText("je v tomto čase obsazený");
  await clash.getByLabel("Název").fill(`Navazuje ${stamp}`);
  await clash.locator("#ev-start-time").fill("10:00");
  await clash.locator("#ev-end-time").fill("11:00");
  await clash.getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByText("Událost vytvořena.")).toBeVisible();
  expectClean(c, "zdroje");
});

test("odběr: tajný odkaz vrací kalendář s událostí i opakováním, nový odkaz starý zneplatní", async ({
  page,
}) => {
  const c = collectErrors(page);
  await visit(page, "/kalendar", c);
  await page.getByRole("button", { name: "Odběr a import" }).click();
  const dialog = page.getByRole("dialog", { name: "Odběr a import kalendáře" });
  await dialog.getByRole("button", { name: /Vytvořit (nový )?odkaz/ }).click();
  const url = await dialog.getByLabel("Adresa odběru").inputValue();
  expect(url).toMatch(/\/api\/kalendar\/feed\/[A-Za-z0-9_-]{20,}\.ics$/);

  const res = await page.request.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const body = (await res.text()).replace(/\r\n /g, "");
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain(`SUMMARY:${title} (upraveno)`);
  expect(body).toContain("RRULE:FREQ=WEEKLY");
  expect(body).toContain("TZID=Europe/Prague");
  expect(body).toContain(`SUMMARY:S místností ${stamp}`);
  expect(body).toContain("BEGIN:VALARM"); // připomenutí 15 minut předem

  await dialog.getByRole("button", { name: "Vytvořit nový odkaz" }).click();
  await expect(dialog.getByLabel("Adresa odběru")).not.toHaveValue(url);
  expect((await page.request.get(url)).status()).toBe(404);
  expect(
    (await page.request.get(`${new URL(url).origin}/api/kalendar/feed/nesmysl.ics`)).status(),
  ).toBe(404);
  expectClean(c, "odběr");
});

test("import: neplatné, lokální a nezabezpečené adresy se odmítnou", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/kalendar", c);
  await page.getByRole("button", { name: "Odběr a import" }).click();
  const dialog = page.getByRole("dialog", { name: "Odběr a import kalendáře" });
  await dialog.getByLabel("Název kalendáře").fill(`Interní ${stamp}`);
  const bad: [string, RegExp][] = [
    ["https://169.254.169.254/latest/meta-data", /Tato adresa není povolená/],
    ["https://127.0.0.1/cal.ics", /Tato adresa není povolená/],
    ["https://localhost/cal.ics", /Tato adresa není povolená/],
    ["https://[::1]/cal.ics", /Tato adresa není povolená/],
    ["http://example.com/cal.ics", /https:\/\//],
    ["ftp://example.com/cal.ics", /https:\/\/|adres/i],
    ["není adresa", /adres/i],
  ];
  for (const [url, msg] of bad) {
    await dialog.getByLabel("Adresa kalendáře").fill(url);
    await dialog.getByRole("button", { name: "Připojit" }).click();
    await expect(dialog.getByRole("alert"), url).toContainText(msg);
  }
  await expect(dialog.getByTestId("imports")).toHaveCount(0);
  expectClean(c, "import");
});

test("zrušení události: opakovaná se zruší celá a zmizí z kalendáře", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/kalendar", c);
  await onlyOwnEvents(page);
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  for (const name of [
    `${title} (upraveno)`,
    attendeeTitle,
    `S místností ${stamp}`,
    `Navazuje ${stamp}`,
  ]) {
    // událost může být až na dalším řádku/dni; otevřeme první výskyt
    await chips(page, name).first().click();
    await page
      .getByRole("dialog", { name: "Událost" })
      .getByRole("button", { name: "Zrušit událost" })
      .click();
    // potvrzení dialogem (ne nativním `confirm`)
    const confirm = page.getByRole("dialog", { name: "Zrušit událost", exact: true });
    await expect(confirm).toContainText("Opakovaná událost se zruší celá.");
    await confirm.getByRole("button", { name: "Zrušit událost" }).click();
    await expect(page.getByText("Událost zrušena.").last()).toBeVisible();
    await expect(chips(page, name)).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Týden", exact: true }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Další", exact: true }).click();
    await expect(chips(page, title)).toHaveCount(0);
  }
  expectClean(c, "zrušení");
});
