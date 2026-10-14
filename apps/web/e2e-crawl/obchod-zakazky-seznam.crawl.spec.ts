import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { clickSubmenuItem, collectErrors, expectClean, visit } from "./helpers";
import { createCompany, createJob, newStamp, readZipEntry, type NewJob } from "./obchod-helpers";

/**
 * Seznam zakázek: výchozí pohledy, vytvoření zakázky v každé fázi (záložky podle fáze), kanban (přetažení,
 * zamítnutí s důvodem), hromadné akce, export CSV a XLSX, vlastní filtr a uložený pohled.
 */
test.describe.configure({ mode: "serial" });

const stamp = newStamp();
const company = `Seznam firma ${stamp} s.r.o.`;
const title = (p: string) => `Seznam ${p} ${stamp}`;

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const cell = (page: Page, text: string, attr: string) =>
  row(page, text).locator(`[data-attr="${attr}"]`);
const tabs = async (view: Locator) =>
  (await view.getByRole("tab").allInnerTexts()).map((t) => t.replace(/\s+\d+$/, "").trim());

/** Záložky podle fáze (viditelnost řídí `detail/visibility.ts`). */
const EXPECTED_TABS: Record<string, string[]> = {
  Poptávka: ["Přehled", "Rozpočet", "Úkoly", "Soubory"],
  Nabídka: ["Přehled", "Rozpočet", "Úkoly", "Soubory"],
  Příprava: ["Přehled", "Rozpočet", "Náklady", "Fakturace", "Realizace", "Úkoly", "Soubory"],
  Realizace: [
    "Přehled",
    "Rozpočet",
    "Změny",
    "Náklady",
    "Fakturace",
    "Realizace",
    "Úkoly",
    "Soubory",
  ],
  Předání: [
    "Přehled",
    "Rozpočet",
    "Změny",
    "Náklady",
    "Fakturace",
    "Realizace",
    "Úkoly",
    "Soubory",
  ],
  Záruka: ["Přehled", "Rozpočet", "Změny", "Náklady", "Fakturace", "Realizace", "Úkoly", "Soubory"],
};

test("výchozí pohledy seznamu se otevřou a drží součet v patičce", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/zakazky", c);
  for (const name of [
    "Všechny",
    "Zakázky s problémem",
    "Moje zakázky",
    "Nabídky čekající na odpověď",
    "V realizaci",
    "Po termínu",
    "V záruce",
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("table-footer")).toContainText(/záznam|záznamů|záznamy|Σ/);
    expectClean(c, `pohled ${name}`);
  }
  // pohled „V realizaci“ ukazuje jen zakázky ve fázi Realizace
  await page.getByRole("tab", { name: "V realizaci", exact: true }).click();
  await expect(page.getByTestId("table-footer")).toContainText(/\d+ záznam/);
  // seznam se po přepnutí pohledu chvíli překresluje, proto se čeká, až jsou všechny řádky z nového pohledu
  await expect
    .poll(
      async () =>
        (await page.locator('[role=row] [data-attr="phase"]').allInnerTexts())
          .map((t) => t.trim())
          .filter((t) => t !== "Fáze" && t !== "Realizace").length,
      { timeout: 15_000 },
    )
    .toBe(0);
  expect(await page.locator('[role=row] [data-attr="phase"]').count()).toBeGreaterThan(1);
  // pohled „V záruce“ ukazuje jen zakázky ve fázi Záruka
  await page.getByRole("tab", { name: "V záruce", exact: true }).click();
  await expect(page.getByTestId("table-footer")).toBeVisible();
  expectClean(c, "pohledy");
});

test("zakázku jde založit v každé fázi a záložky odpovídají fázi", async ({ page }) => {
  test.setTimeout(300_000);
  const c = collectErrors(page);
  await createCompany(page, company);
  for (const phase of [
    "Poptávka",
    "Nabídka",
    "Příprava",
    "Realizace",
    "Předání",
    "Záruka",
  ] as const) {
    const job: NewJob = {
      title: title(phase),
      company,
      phase,
      address: "Plzeň, Testovací 1",
    };
    const view = await createJob(page, job);
    await expect(view.getByTestId("job-phase")).toHaveText(phase);
    expect(await tabs(view), `záložky ve fázi ${phase}`).toEqual(EXPECTED_TABS[phase]);
    for (const t of EXPECTED_TABS[phase]!) {
      await view.getByRole("tab", { name: t, exact: true }).click();
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("Něco se nepovedlo")).toHaveCount(0);
    }
    expectClean(c, `zakázka ve fázi ${phase}`);
  }
});

test("hledání, filtr podle fáze, uložený pohled a řazení", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/zakazky", c);
  await page.getByPlaceholder("Hledat…").fill(stamp.toUpperCase());
  await expect(page.getByTestId("table-footer")).toContainText("6 záznamů");
  // filtr: fáze je Realizace
  await page.getByTestId("add-filter").click();
  await page.getByPlaceholder("Hledat podmínku…").fill("Fáze");
  await page.getByRole("option", { name: "Fáze", exact: true }).click();
  await page.getByRole("button", { name: "Vyberte…" }).click();
  await page.getByRole("option", { name: "Realizace", exact: true }).click();
  await page.getByRole("button", { name: "Hotovo" }).click();
  await expect(page.getByTestId("table-footer")).toContainText("1 záznam");
  await expect(row(page, title("Realizace"))).toBeVisible();
  await page.getByTestId("list-options").click();
  await page.getByRole("menuitem", { name: "Uložit jako pohled…" }).click();
  await page.getByLabel("Název pohledu").fill(`Pohled zakázek ${stamp}`);
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.getByRole("tab", { name: `Pohled zakázek ${stamp}` })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Nastavení pohledu" }).click();
  await page.getByRole("menuitem", { name: "Smazat pohled" }).click();
  await page
    .getByRole("dialog", { name: "Smazat pohled" })
    .getByRole("button", { name: "Smazat" })
    .click();
  await expect(page.getByRole("tab", { name: `Pohled zakázek ${stamp}` })).toHaveCount(0);
  expectClean(c, "filtr a pohled");
});

test("hromadné akce: změna stavu se Zpět, export CSV a XLSX, smazání se Zpět", async ({ page }) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await visit(page, "/zakazky", c);
  await page.getByPlaceholder("Hledat…").fill(title("Poptávka"));
  await expect(row(page, title("Poptávka"))).toBeVisible();
  await row(page, title("Poptávka")).getByRole("checkbox").click();
  const bar = page.getByRole("region", { name: "Hromadné akce" });
  await expect(bar).toContainText("Vybráno: 1");

  // změna stavu na Nabídka (adresa je vyplněná) a Zpět
  await bar.getByRole("button", { name: "Změnit stav" }).click();
  await page.getByRole("menuitem", { name: "Nabídka v přípravě", exact: true }).click();
  await expect(cell(page, title("Poptávka"), "stage")).toContainText("Nabídka v přípravě");
  await page.getByRole("button", { name: "Zpět" }).click();
  await expect(cell(page, title("Poptávka"), "stage")).toContainText("Nová poptávka");

  // export CSV
  const csvDl = page.waitForEvent("download");
  await bar.getByRole("button", { name: "Exportovat" }).click();
  const csvFile = await csvDl;
  expect(csvFile.suggestedFilename()).toMatch(/^zakazky-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile((await csvFile.path())!, "utf8");
  expect(csv).toContain(title("Poptávka"));
  expect(csv.split("\r\n")[0]).toContain("Název");

  // export celé filtrované sady (menu Export) do XLSX: platný zip s našimi řádky
  await page.getByTestId("list-options").click();
  await page.getByTestId("export-menu").click();
  const dl = page.waitForEvent("download");
  await clickSubmenuItem(page, page.getByRole("menuitem", { name: "Excel (XLSX)" }));
  const f = await dl;
  expect(f.suggestedFilename()).toMatch(/^zakazky-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const xlsxPath = (await f.path())!;
  expect((await readFile(xlsxPath)).subarray(0, 2).toString()).toBe("PK");
  const sheet = readZipEntry(await readFile(xlsxPath), "xl/worksheets/sheet1.xml") ?? "";
  expect(sheet).toContain(title("Poptávka"));

  await bar.getByRole("button", { name: "Smazat" }).click();
  await expect(row(page, title("Poptávka"))).toBeHidden();
  await page.getByRole("button", { name: "Zpět" }).click();
  await expect(row(page, title("Poptávka"))).toBeVisible();
  expectClean(c, "hromadné akce");
});

test.describe("kanban", () => {
  // devět sloupců (fáze zakázky) se musí vejít vedle sebe, aby šlo táhnout mezi nimi bez posouvání
  test.use({ viewport: { width: 3200, height: 900 } });

  test("přetažení karty mezi fázemi se uloží, nepovolený přesun ukáže důvod", async ({ page }) => {
    test.setTimeout(180_000);
    const c = collectErrors(page);
    await visit(page, "/zakazky", c);
    await page.getByPlaceholder("Hledat…").fill(title("Nabídka"));
    await page.getByRole("button", { name: "Kanban" }).click();
    const card = page.locator("[data-card-id]").filter({ hasText: title("Nabídka") });
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
      return target;
    };
    const dragUntil = async (name: string, done: (target: Locator) => Locator) => {
      for (let attempt = 1; ; attempt++) {
        const target = await drag(name);
        try {
          await expect(done(target)).toBeVisible({ timeout: 4_000 });
          return target;
        } catch (e) {
          if (attempt >= 4) throw e;
          await page.evaluate(() => window.getSelection()?.removeAllRanges());
        }
      }
    };
    // z nabídky rovnou do realizace nejde: karta se vrátí a chyba řekne proč
    await dragUntil("Realizace", () =>
      page.getByRole("alert").filter({ hasText: /nejde přejít do fáze/ }),
    );
    await expect(
      page
        .getByRole("region", { name: "Nabídka v přípravě", exact: true })
        .getByText(title("Nabídka")),
    ).toBeVisible();
    // do přípravy jde (nabídka je prázdná, takže se odeslání nevyžaduje)
    await dragUntil("Příprava", (target) => target.getByText(title("Nabídka")));
    expectClean(c, "kanban");

    await page.reload();
    await page.getByPlaceholder("Hledat…").fill(title("Nabídka"));
    await page.getByRole("button", { name: "Tabulka" }).click();
    await expect(cell(page, title("Nabídka"), "phase")).toContainText("Příprava");
  });
});
