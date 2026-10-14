import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";

/**
 * Procházka: realizace. Harmonogram (fáze, návaznost, milník, přepnutí Gantt/seznam, přiblížení, klávesy, tažení pruhu),
 * stavební deník (počasí, pracovníci z docházky, materiál s cenou → náklad zakázky, fotky, nehoda/vada, podpis, tisk),
 * předávací protokol s podpisem a vady. Zakázku si test zakládá sám (`stamp`), docházku montéra z demo uživatelů.
 */
const stamp = Math.random().toString(36).slice(2, 8);
const job = `Realizace ${stamp}`;
const company = `Investor ${stamp}`;
let jobId = "";

test.describe.configure({ mode: "serial" });

/** 1×1 PNG, aby šlo vyzkoušet nahrání fotky bez souboru na disku. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function drawSignature(page: Page, canvasTestId = "signature-canvas") {
  const canvas = page.getByTestId(canvasTestId);
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 80);
  await page.mouse.down();
  await page.mouse.move(b.x + 80, b.y + 30, { steps: 6 });
  await page.mouse.move(b.x + 140, b.y + 110, { steps: 6 });
  await page.mouse.up();
}

/** „12 345,50 Kč“ → haléře. */
const toMinor = (t: string) =>
  Math.round(Number(t.replace(/[^\d,-]/g, "").replace(",", ".")) * 100);

const open = (page: Page, sub: string) => page.goto(`/zakazky/${jobId}?tab=realizace&sub=${sub}`);

test("příprava: investor a zakázka ve fázi Realizace", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/kontakty/firmy", c);
  await page.getByTestId("create-record").click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(company);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: company }),
  ).toBeVisible();
  await visit(page, "/zakazky", c);
  await page.getByTestId("create-record").click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(job);
  await dialog.getByRole("button", { name: "Vybrat…" }).click();
  await page.getByPlaceholder("Hledat…").last().fill(company);
  await page.getByRole("option").first().click();
  await dialog.getByRole("button", { name: "Poptávka" }).click();
  await page.getByRole("option", { name: "Realizace" }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: job })).toBeVisible();
  await visit(page, "/zakazky", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await page
    .getByRole("row")
    .filter({ hasText: job })
    .locator('[data-attr="title"]')
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}/);
  jobId = new URL(page.url()).pathname.split("/").pop()!;
  expectClean(c, "příprava");
});

test("harmonogram: fáze, návaznost, milník, seznam/Gantt, přiblížení, klávesy a tažení", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  await open(page, "harmonogram");
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Přidat první fázi" }).click();
  await page.getByLabel("Název fáze").fill("Bourání");
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  const bars = view.locator("[data-phase]");
  await expect(bars).toHaveCount(1);

  // druhá fáze navazuje na první: začíná po jejím konci
  await view.getByRole("button", { name: "Přidat fázi" }).click();
  await page.getByLabel("Název fáze").fill("Instalace");
  await page.getByRole("button", { name: "Nenavazuje" }).click();
  await page.getByRole("option", { name: "Bourání" }).click();
  await page.getByRole("button", { name: /^Po fázi/ }).click();
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(bars).toHaveCount(2);

  // milník
  await view.getByRole("button", { name: "Přidat milník" }).click();
  await page.getByLabel("Název fáze").fill("Kontrolní den");
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(bars).toHaveCount(3);
  await expect(bars.filter({ hasText: "" }).nth(2)).toHaveAttribute("aria-label", /milník/);

  // prázdný název se odmítne hláškou, nezavře dialog
  await view.getByRole("button", { name: "Přidat fázi" }).click();
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/název/i).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // přiblížení a „Dnes“
  const zoom = view.getByRole("group", { name: "Přiblížení" });
  for (const name of ["Týden", "Čtvrtletí", "Měsíc"]) {
    await zoom.getByRole("button", { name }).click();
    await expect(zoom.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
  }
  await view.getByRole("button", { name: "Dnes", exact: true }).click();

  // klávesy: šipka vpravo posune fázi o pracovní den, Shift + šipka mění konec, šipka dolů přejde na další
  const first = bars.first();
  await first.focus();
  const label0 = await first.getAttribute("aria-label");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => bars.first().getAttribute("aria-label")).not.toBe(label0);
  const label1 = await bars.first().getAttribute("aria-label");
  await bars.first().focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => bars.first().getAttribute("aria-label")).not.toBe(label1);
  await bars.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(bars.nth(1)).toBeFocused();
  // Enter otevře detail fáze, dokončení na 100 % ukáže „Hotovo“
  await page.keyboard.press("Enter");
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByLabel("Název fáze")).toHaveValue("Instalace");
  await dlg.getByRole("button", { name: "Hotovo" }).click();
  await dlg.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(bars.nth(1)).toHaveAttribute("aria-label", /100 %/);

  // tažení pruhu o několik dní doprava
  const bar = bars.first();
  await bar.scrollIntoViewIfNeeded();
  const before = await bar.getAttribute("aria-label");
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => bars.first().getAttribute("aria-label")).not.toBe(before);

  // seznam: stejné fáze, postup a úprava přímo v seznamu
  await view.getByRole("button", { name: "Seznam", exact: true }).click();
  const list = view.getByTestId("phase-list");
  await expect(list).toContainText("Bourání");
  await expect(list).toContainText("Instalace");
  await expect(list).toContainText("Kontrolní den");
  await view.getByRole("button", { name: "Gantt", exact: true }).click();
  await expect(view.getByTestId("gantt")).toBeVisible();

  // smazání fáze s potvrzením
  await bars.nth(2).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: /Smazat/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /^Smazat/ })
    .last()
    .click();
  await expect(bars).toHaveCount(2);
  expectClean(c, "harmonogram");
});

test("deník: docházka, počasí ručně, materiál s cenou, fotka, nehoda; náklad zakázky sedí", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);

  // docházka na tuto zakázku: 3 hodiny dnes (zakázku vidí majitel; montér ji nemá v týmu)
  await visit(page, "/dochazka", c);
  const today = new Date().toLocaleDateString("sv-SE");
  const cell = page.locator(`[data-date="${today}"]`);
  await cell.getByRole("button", { name: /^Zapsat docházku/ }).click();
  const wd = page.getByRole("dialog", { name: "Zapsat docházku" });
  await wd.getByRole("button", { name: "Počet hodin" }).click();
  await wd.getByLabel("Počet hodin").fill("3");
  await wd.getByRole("button", { name: /^Zakázka/ }).click();
  await page.getByPlaceholder("Hledat…").last().fill(stamp);
  await page.getByRole("option", { name: new RegExp(job) }).click();
  await wd.getByLabel(/Poznámka/).fill(`Deník ${stamp}`);
  await wd.getByRole("button", { name: "Uložit" }).click();
  await expect(cell.getByText(`Deník ${stamp}`)).toBeVisible();

  await open(page, "denik");
  const view = page.getByTestId("record-view");
  await expect(view.getByTestId("diary-strip")).toBeVisible();
  await view.getByRole("button", { name: /Zapsat dnešek/ }).click();
  const form = view.getByTestId("diary-form");
  // pracovník s hodinami se předvyplní z docházky
  await expect(form.getByTestId("diary-workers").getByRole("listitem")).toHaveCount(1);
  await expect(form.getByLabel(/^Hodiny: /)).toHaveValue(/3/);
  // počasí: načtení z veřejné služby může selhat, ruční volba funguje vždy
  await form.getByRole("button", { name: "Počasí ručně" }).click();
  await page.getByRole("option", { name: "Déšť", exact: true }).click();
  await form.getByLabel("Teplota °C").fill("12");
  await form.getByLabel("Provedené práce").fill("Betonáž základové desky, odvoz suti.");
  await form.getByRole("button", { name: "Přidat materiál" }).click();
  await form.getByLabel("Název materiálu 1").fill("Beton C20/25");
  await form.getByLabel("Množství 1").fill("2");
  await form.getByLabel("Jednotka 1").fill("m3");
  await form.getByLabel("Cena za jednotku 1").fill("2 500");
  const addIncident = form.getByRole("button", { name: "Přidat nehodu" });
  if (await addIncident.count()) await addIncident.click();
  await form.getByRole("button", { name: "Vada", exact: true }).click();
  await form.getByLabel("Popis 1").fill(`Prasklý překlad ${stamp}`);
  // fotka (zmenší se v prohlížeči a nahraje na zakázku)
  await form.getByTestId("diary-photo-input").setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(form.getByTestId("diary-photos").getByRole("img").first()).toBeVisible();
  await form.getByRole("button", { name: "Uložit zápis" }).click();

  const entry = view.getByTestId("diary-entry");
  await expect(entry).toContainText("Betonáž základové desky");
  await expect(entry).toContainText("Déšť");
  await expect(entry).toContainText("Beton C20/25");
  await expect(entry).toContainText("vada zakázky");

  // náklad zakázky = materiál z deníku (2 × 2 500 Kč) + práce z docházky (řádek „Práce: … (3:00 h)“)
  await view.getByRole("tab", { name: "Náklady", exact: true }).click();
  await view.getByRole("radio", { name: "Náklady", exact: true }).click();
  const labour = view.getByText(/^Práce: .* \(3:00 h\)$/).first();
  await expect(labour).toBeVisible();
  const labourMinor = toMinor(
    (await labour.locator("xpath=ancestor::tr[1]").getByText(/Kč$/).last().textContent()) ?? "",
  );
  expect(labourMinor).toBeGreaterThan(0);
  const header = view.getByTestId("kpi-cost");
  await expect(header).toContainText(/Kč/);
  expect(toMinor((await header.textContent()) ?? "")).toBe(500_000 + labourMinor);

  // vada z deníku je vadou zakázky
  await open(page, "vady");
  await expect(page.getByTestId("record-view")).toContainText(`Prasklý překlad ${stamp}`);
  expectClean(c, "deník");
});

test("deník: podpis zápisu, zámek po podpisu a tisk bez cen", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await open(page, "denik");
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Podepsat", exact: true }).click();
  const sign = page.getByRole("dialog", { name: /Podpis zápisu/ });
  await sign.getByLabel("Podepisuje").fill("Ing. Novák");
  await drawSignature(page);
  await sign.getByRole("button", { name: "Podepsat", exact: true }).click();
  await expect(page.getByText("Zápis je podepsaný.")).toBeVisible();
  const entry = view.getByTestId("diary-entry");
  await expect(entry).toContainText("Podepsáno: Ing. Novák");
  await expect(entry.getByRole("button", { name: "Upravit" })).toHaveCount(0);

  await visit(page, `/tisk/denik/${jobId}`, c);
  const sheet = page.getByTestId("print-diary");
  await expect(sheet).toContainText("Stavební deník");
  await expect(sheet).toContainText("Betonáž základové desky");
  await expect(sheet).toContainText("Beton C20/25");
  await expect(sheet).not.toContainText("2 500");
  expectClean(c, "podpis a tisk");
});

test("předávací protokol s podpisem a vady zakázky", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await open(page, "predani");
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Nový předávací protokol" }).click();
  await view.getByRole("button", { name: "Uložit protokol" }).click();
  const list = view.getByTestId("handover-list");
  await expect(list).toContainText("PP-");
  await expect(list).toContainText("Koncept");
  await view.getByRole("button", { name: "Podepsat", exact: true }).click();
  const sign = page.getByRole("dialog", { name: /Podpis protokolu/ });
  await sign.getByLabel("Za zákazníka přebírá").fill("Pan Novák");
  await drawSignature(page);
  await sign.getByRole("button", { name: "Podepsat a uzavřít" }).click();
  await expect(page.getByText("Protokol je podepsaný.")).toBeVisible();
  await expect(list).toContainText("Podepsáno");
  await expect(list.getByRole("img", { name: /Podpis/ })).toBeVisible();

  await open(page, "vady");
  await view.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog").last();
  await dialog.getByLabel(/Název/).fill(`Prasklá spára ${stamp}`);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: `Prasklá spára ${stamp}` }),
  ).toBeVisible();

  await visit(page, "/realizace", c);
  await expect(
    page.getByTestId("overview-table").getByRole("row").filter({ hasText: job }),
  ).toBeVisible();
  await visit(page, "/realizace/vady", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(page.getByRole("row").filter({ hasText: `Prasklá spára ${stamp}` })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: `Prasklý překlad ${stamp}` })).toBeVisible();
  expectClean(c, "předání a vady");
});
