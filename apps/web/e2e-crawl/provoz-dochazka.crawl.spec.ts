import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs } from "./roles";

/**
 * Procházka: docházka. Píchačka (příchod, přestávka, odchod, nepovolené kombinace), ruční zápis, absence, týdenní přehled,
 * odeslání a schválení (mistr schvaluje montéra, kancelář), měsíční přehled s náklady a shoda s ekonomikou zakázky.
 * Data si test vytváří sám (poznámka se značkou `stamp`) a po sobě je maže, takže ho jde pouštět opakovaně.
 * Spoléhá jen na demo data (uživatelé a zakázky podle `clients/demo/seed`).
 */
const stamp = Math.random().toString(36).slice(2, 8);

/** Otevře dialog zápisu pro den (podle data v řádku týdne) a vyplní ho. */
async function writeEntry(
  page: Page,
  opts: { date: string; hours: string; note: string; kind?: string; job?: string },
) {
  await page
    .locator(`[data-date="${opts.date}"]`)
    .getByRole("button", { name: /^Zapsat docházku/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Zapsat docházku" });
  if (opts.kind) {
    await dialog.getByRole("button", { name: /^Druh/ }).click();
    await page.getByRole("option", { name: opts.kind, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Počet hodin" }).click();
  await dialog.getByLabel("Počet hodin").fill(opts.hours);
  if (opts.job) {
    await dialog.getByRole("button", { name: /^Zakázka/ }).click();
    await page.getByPlaceholder("Hledat…").last().fill(opts.job);
    await page.getByRole("option", { name: new RegExp(opts.job) }).click();
  }
  await dialog.getByLabel(/Poznámka/).fill(opts.note);
  await dialog.getByRole("button", { name: "Uložit" }).click();
  return dialog;
}

test("píchačka: příchod, přestávka, odchod, jedna píchačka najednou", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/dochazka", c);
  const clock = page.getByTestId("clock-card");
  // zbylá píchačka z dřívějšího pokusu nesmí test rozbít
  if (await clock.getByRole("button", { name: "Odchod" }).isVisible()) {
    await clock.getByRole("button", { name: "Odchod" }).click();
    await expect(clock.getByRole("button", { name: "Příchod" })).toBeVisible();
  }
  await clock.getByRole("button", { name: "Příchod" }).click();
  await expect(clock.getByText(/Pracujete od/)).toBeVisible();
  // běží: příchod už se nabízet nesmí (jen přestávka a odchod)
  await expect(clock.getByRole("button", { name: "Příchod" })).toHaveCount(0);
  await expect(clock.getByTestId("clock-timer")).toHaveText(/^0:00:0\d$/);

  await clock.getByRole("button", { name: "Přestávka" }).click();
  await expect(clock.getByText("Přestávka", { exact: true })).toBeVisible();
  await expect(clock.getByRole("button", { name: "Konec přestávky" })).toBeVisible();
  await clock.getByRole("button", { name: "Konec přestávky" }).click();
  await expect(clock.getByRole("button", { name: "Přestávka", exact: true })).toBeVisible();

  // píchačka na druhé záložce: příchod se odmítne srozumitelnou hláškou, ne chybou serveru
  const second = await page.context().newPage();
  const c2 = collectErrors(second);
  await visit(second, "/dochazka", c2);
  await expect(
    second.getByTestId("clock-card").getByRole("button", { name: "Odchod" }),
  ).toBeVisible();
  await second.close();

  await clock.getByRole("button", { name: "Odchod" }).click();
  await expect(page.getByText("Odchod hned po příchodu, záznam se nevytvořil.")).toBeVisible();
  await expect(clock.getByRole("button", { name: "Příchod" })).toBeVisible();
  await expect(clock.getByTestId("clock-timer")).toHaveText("0:00:00");
  expectClean(c, "píchačka");
});

test("ruční zápis: kontrola vstupů, součty týdne, úprava, smazání, absence", async ({ page }) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await visit(page, "/dochazka", c);
  const days = page.getByTestId("week-days");
  // pracovní den týdne s volným místem: pátek minulého týdne je vždy v minulosti a má 24 h volné
  await page.getByRole("button", { name: "Předchozí týden" }).click();
  const total = page.getByTestId("week-total");
  const parse = async () => {
    const t = (await total.textContent()) ?? "";
    const m = /Celkem (\d+):(\d+) h/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  await expect(total).toContainText("Celkem");
  const before = await parse();
  const friday = await days.locator("[data-date]").nth(4).getAttribute("data-date");
  const note = `Zdění ${stamp}`;

  // nulové hodiny a konec před začátkem se odmítnou hláškou v dialogu
  await page
    .locator(`[data-date="${friday}"]`)
    .getByRole("button", { name: /^Zapsat docházku/ })
    .click();
  let dialog = page.getByRole("dialog", { name: "Zapsat docházku" });
  await dialog.getByRole("button", { name: "Počet hodin" }).click();
  await dialog.getByLabel("Počet hodin").fill("0");
  await dialog.getByRole("button", { name: "Uložit" }).click();
  await expect(dialog.getByRole("alert")).toContainText(/odpracovanou dobu/);
  await dialog.getByRole("button", { name: "Od – do" }).click();
  await dialog.getByLabel("Od", { exact: true }).fill("15:00");
  await dialog.getByLabel("Do", { exact: true }).fill("14:00");
  await dialog.getByRole("button", { name: "Uložit" }).click();
  await expect(dialog.getByRole("alert")).toContainText(/Konec musí být po začátku/);
  // víc než 24 hodin v jednom dni
  await dialog.getByRole("button", { name: "Počet hodin" }).click();
  await dialog.getByLabel("Počet hodin").fill("25");
  await dialog.getByRole("button", { name: "Uložit" }).click();
  await expect(dialog.getByRole("alert")).toContainText(/nejvýše 24/);
  await dialog.getByRole("button", { name: "Zrušit" }).click();

  // od–do s přestávkou: 7:00–15:30 mínus 30 min = 8:00 h
  await page
    .locator(`[data-date="${friday}"]`)
    .getByRole("button", { name: /^Zapsat docházku/ })
    .click();
  dialog = page.getByRole("dialog", { name: "Zapsat docházku" });
  await dialog.getByLabel(/Poznámka/).fill(note);
  await dialog.getByRole("button", { name: "Uložit" }).click();
  const cell = page.locator(`[data-date="${friday}"]`);
  await expect(cell.getByText(note)).toBeVisible();
  await expect(cell.getByText("07:00–15:30 (−30 min)")).toBeVisible();
  await expect(cell.getByText("8:00").first()).toBeVisible();
  await expect.poll(parse).toBe(before + 8 * 60);

  // úprava na 7,5 hodiny
  await cell.getByRole("button", { name: new RegExp(note) }).click();
  dialog = page.getByRole("dialog", { name: "Upravit záznam" });
  await dialog.getByRole("button", { name: "Počet hodin" }).click();
  await dialog.getByLabel("Počet hodin").fill("7,5");
  await dialog.getByRole("button", { name: "Uložit" }).click();
  await expect.poll(parse).toBe(before + 7.5 * 60);
  await expect(cell.getByText("7:30").first()).toBeVisible();

  // dovolená: absence nemá zakázku a hodiny se počítají do týdne
  const absNote = `Dovolená ${stamp}`;
  await writeEntry(page, { date: friday!, hours: "4", note: absNote, kind: "Dovolená" });
  await expect(cell.getByText(absNote)).toBeVisible();
  await expect.poll(parse).toBe(before + 7.5 * 60 + 4 * 60);

  // smazání obou záznamů vrátí součet
  for (const n of [absNote, note]) {
    await cell.getByRole("button", { name: new RegExp(n) }).click();
    await page
      .getByRole("dialog", { name: "Upravit záznam" })
      .getByRole("button", { name: /Smazat/ })
      .click();
    await expect(cell.getByText(n)).toHaveCount(0);
  }
  await expect.poll(parse).toBe(before);
  expectClean(c, "ruční zápis");
});

test("týden: přechod mezi týdny a návrat na tento týden", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/dochazka", c);
  const label = page.getByTestId("week-label");
  const now = await label.textContent();
  await page.getByRole("button", { name: "Další týden" }).click();
  await expect(label).not.toHaveText(now!);
  await page.getByRole("button", { name: "Předchozí týden" }).click();
  await page.getByRole("button", { name: "Předchozí týden" }).click();
  await expect(label).not.toHaveText(now!);
  await page.getByRole("button", { name: "Tento týden" }).click();
  await expect(label).toHaveText(now!);
  expectClean(c, "přechod týdnů");
});

/** „12 345,50 Kč“ → haléře. */
const toMinor = (t: string) =>
  Math.round(Number(t.replace(/[^\d,-]/g, "").replace(",", ".")) * 100);

test("mistr zapíše hodiny na zakázku → kancelář vrátí → oprava → kancelář schválí → náklad sedí v přehledu i v ekonomice zakázky", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  // montér (role jen pro terminál) týdenní výkaz v kancelářském rozhraní nemá; stejný postup dělá mistr Radek Zeman
  const JOB = "Zateplení bytového domu Nad Parkem 14";
  const note = `Montáž ${stamp}`;
  // víkendový den v minulosti (bez demo záznamů, bez kolize s otevřeným měsícem); podle značky se střídá, ať se nehromadí 24 h
  const pick = parseInt(stamp.slice(0, 2), 36) % 4;

  /** Přejde o týden (u `pick >= 2` o dva) zpět a počká na načtení týdne. */
  const back = async (page: Page) => {
    for (let i = 0; i < (pick >= 2 ? 2 : 1); i++)
      await page.getByRole("button", { name: "Předchozí týden" }).click();
    await expect(page.getByTestId("week-days").locator("[data-date]")).toHaveCount(7);
  };
  const worker = await pageAs(browser, "foreman2");
  const foreman = await pageAs(browser, "office");
  const owner = await pageAs(browser, "owner");
  const cw = collectErrors(worker.page);
  const cf = collectErrors(foreman.page);
  const co = collectErrors(owner.page);
  try {
    // tohle je jeho týden; víkend minulého nebo předminulého týdne
    await visit(worker.page, "/dochazka", cw);
    await back(worker.page);
    const dates = await worker.page
      .getByTestId("week-days")
      .locator("[data-date]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-date")!));
    const date = dates[5 + (pick % 2)]!; // sobota/neděle
    const week = await worker.page.getByTestId("week-label").textContent();
    const month = date.slice(0, 7);

    // náklad práce montéra v měsíčním přehledu před zápisem (zadávané hodiny jsou 1:00, sazba z karty zaměstnance)
    const monthCost = async () => {
      await visit(owner.page, "/dochazka/prehled", co);
      const [y, m] = month.split("-").map(Number);
      const now = new Date();
      const back = (now.getFullYear() - y!) * 12 + (now.getMonth() + 1 - m!);
      for (let i = 0; i < back; i++)
        await owner.page.getByRole("button", { name: "Předchozí měsíc" }).click();
      const row = owner.page.getByTestId("month-report").getByRole("row", { name: /Radek Zeman/ });
      await expect(row).toBeVisible();
      return toMinor((await row.getByTestId("month-cost").textContent()) ?? "");
    };
    const costBefore = await monthCost();

    await writeEntry(worker.page, { date, hours: "1", note, job: JOB });
    const cell = worker.page.locator(`[data-date="${date}"]`);
    const entry = cell.getByRole("button", { name: new RegExp(note) });
    await expect(entry).toBeVisible();
    await expect(entry).toContainText(JOB);
    await expect(entry.getByText("Rozpracováno")).toBeVisible();
    await worker.page.getByRole("button", { name: "Odeslat týden ke schválení" }).click();
    await expect(worker.page.getByText("Týden odeslán ke schválení.")).toBeVisible();
    await expect(entry.getByText("Ke schválení")).toBeVisible();
    // (mistr s právem schvalovat smí upravit i odeslaný záznam, proto se tu neuzamčení netestuje)

    // kancelář: fronta schvalování, vrácení s důvodem
    await visit(foreman.page, "/dochazka/schvalovani", cf);
    const item = foreman.page
      .getByTestId("approvals")
      .getByRole("listitem")
      .filter({ hasText: "Radek Zeman" })
      .filter({ hasText: week!.split(" – ")[0]! });
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: /Radek Zeman/ }).click();
    await expect(item.getByText(note)).toBeVisible();
    await item.getByLabel(/Důvod vrácení/).fill(`Doplnit hodiny ${stamp}`);
    await item.getByRole("button", { name: "Vrátit k opravě" }).click();
    await expect(foreman.page.getByText("Hotovo.")).toBeVisible();
    await expect(item).toHaveCount(0);

    // zapisující vidí důvod, záznam opraví na 1,5 h a znovu odešle
    await worker.page.reload();
    await back(worker.page);
    await expect(entry.getByText(`Vráceno: Doplnit hodiny ${stamp}`)).toBeVisible();
    await entry.click();
    const dlg = worker.page.getByRole("dialog", { name: "Upravit záznam" });
    await dlg.getByLabel("Počet hodin").fill("1,5");
    await dlg.getByRole("button", { name: "Uložit" }).click();
    await expect(entry.getByText("1:30").first()).toBeVisible();
    await expect(entry.getByText("Rozpracováno")).toBeVisible();
    await worker.page.getByRole("button", { name: "Odeslat týden ke schválení" }).click();
    await expect(worker.page.getByText("Týden odeslán ke schválení.")).toBeVisible();

    // kancelář schválí
    await foreman.page.reload();
    const item2 = foreman.page
      .getByTestId("approvals")
      .getByRole("listitem")
      .filter({ hasText: "Radek Zeman" })
      .filter({ hasText: week!.split(" – ")[0]! });
    await item2.getByRole("button", { name: "Schválit" }).click();
    await expect(foreman.page.getByText("Hotovo.")).toBeVisible();
    await expect(item2).toHaveCount(0);

    await worker.page.reload();
    await back(worker.page);
    await expect(entry.getByText("Schváleno")).toBeVisible();

    // měsíční přehled: náklad práce vzrostl o 1,5 h × 480 Kč = 720 Kč (sazba mistra z karty zaměstnance)
    expect((await monthCost()) - costBefore).toBe(72_000);

    // ekonomika zakázky: řádek práce se stejnou dobou a částkou
    await visit(owner.page, "/zakazky", co);
    const href = await owner.page
      .getByRole("row")
      .filter({ hasText: JOB })
      .first()
      .locator("a[href^='/zakazky/']")
      .first()
      .getAttribute("href");
    await visit(owner.page, `${href}?tab=naklady`, co);
    await owner.page.getByRole("radio", { name: "Náklady", exact: true }).click();
    const line = owner.page.getByText("Práce: Radek Zeman (1:30 h)").first();
    await expect(line).toBeVisible();
    await expect(line.locator("xpath=ancestor::*[self::tr or self::li][1]")).toContainText(
      "720 Kč",
    );
    expectClean(cw, "montér");
    expectClean(cf, "mistr");
    expectClean(co, "majitel");
  } finally {
    await worker.ctx.close();
    await foreman.ctx.close();
    await owner.ctx.close();
  }
});

test("měsíční přehled: kancelář vidí náklady, mistr ne; CSV, přepínání měsíců, nastavení a všechny záznamy", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await visit(page, "/dochazka/prehled", c);
  const table = page.getByTestId("month-report");
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Náklad práce" })).toBeVisible();
  // v demo datech je v tomto i předchozím měsíci docházka všech šesti lidí: součet řádků = součet přehledu
  await page.getByRole("button", { name: "Předchozí měsíc" }).click();
  await expect(table.getByRole("row", { name: /Pavel Kratochvíl/ })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Stáhnout CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^dochazka-\d{4}-\d{2}\.csv$/);
  // měsíc bez docházky (daleko v minulosti) ukáže prázdný stav místo chyby
  for (let i = 0; i < 40; i++) await page.getByRole("button", { name: "Předchozí měsíc" }).click();
  await expect(page.getByText("V tomto měsíci není žádná docházka")).toBeVisible();

  await visit(page, "/dochazka/nastaveni", c);
  await expect(page.getByLabel("Hodin v pracovním dni")).toHaveValue("8");
  await expect(page.getByLabel("Výchozí náklad hodiny (Kč)")).toBeVisible();
  // nic se neukládá: jen se ověří, že pole reagují
  await page.getByLabel("Hodin v pracovním dni").fill("7,5");
  await page.getByLabel("Hodin v pracovním dni").fill("8");

  await visit(page, "/dochazka/zaznamy", c);
  await expect(page.getByRole("heading", { name: "Záznamy docházky" })).toBeVisible();
  await page.getByPlaceholder("Hledat…").fill("zdenek-neexistuje");
  await expect(page.getByText(/Nic nenalezeno|Žádné záznamy|0 záznamů/i).first()).toBeVisible();

  // kancelář: přehled s náklady; mistr: přehled za svůj tým bez částek
  const office = await pageAs(browser, "office");
  const co = collectErrors(office.page);
  await visit(office.page, "/dochazka/prehled", co);
  await expect(
    office.page.getByTestId("month-report").getByRole("columnheader", { name: "Náklad práce" }),
  ).toBeVisible();
  const foreman = await pageAs(browser, "foreman1");
  const cf = collectErrors(foreman.page);
  await visit(foreman.page, "/dochazka/prehled", cf);
  await expect(foreman.page.getByTestId("month-report")).toBeVisible();
  await expect(
    foreman.page.getByTestId("month-report").getByRole("columnheader", { name: "Náklad práce" }),
  ).toHaveCount(0);
  await expect(
    foreman.page
      .getByRole("navigation", { name: "Oddíly docházky" })
      .getByRole("link", { name: "Nastavení" }),
  ).toHaveCount(0);
  expectClean(co, "kancelář");
  expectClean(cf, "mistr");
  await office.ctx.close();
  await foreman.ctx.close();
  expectClean(c, "přehled a nastavení");
});
