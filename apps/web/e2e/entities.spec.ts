import { expect, test, type Locator, type Page } from "@playwright/test";
import { clickSubmenuItem } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const company = `Firma ${stamp} s.r.o.`;
const job = `Rekonstrukce ${stamp}`;
const shots = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const cell = (page: Page, text: string, attr: string) =>
  row(page, text).locator(`[data-attr="${attr}"]`);

/** Sloupec, který není ve výchozím zobrazení, zapne přes nabídku „Sloupce“ (když už je zapnutý, nechá ho). */
async function showColumn(page: Page, label: string) {
  await page.getByTestId("list-options").click();
  await page.getByRole("menuitem", { name: "Sloupce" }).click();
  const item = page.getByRole("menuitemcheckbox", { name: label });
  if ((await item.getAttribute("aria-checked")) !== "true") await clickSubmenuItem(page, item);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
}

test("vytvoření firmy a zakázky přes dialog (jen povinná pole, Cmd+Enter)", async ({ page }) => {
  await page.goto("/kontakty/firmy");
  await expect(page.getByRole("heading", { name: "Firmy" })).toBeVisible();
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(company);
  await dialog.getByLabel(/Název/).press("ControlOrMeta+Enter");
  // po vytvoření se otevře stránka záznamu
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: company }),
  ).toBeVisible();
  await page.goBack(); // zpět na seznam
  await page.getByPlaceholder("Hledat…").fill(stamp); // v naplněné databázi je nový záznam až na konci seznamu
  await expect(row(page, company)).toBeVisible();

  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  await dialog.getByLabel(/Název/).fill(job);
  await dialog.getByRole("button", { name: "Vybrat…" }).click();
  await page.getByPlaceholder("Hledat…").last().fill(stamp);
  await page.getByRole("option", { name: company }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: job })).toBeVisible();
  await shot(page, "01-record-page");
  await page.goBack(); // zpět na seznam
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(row(page, stamp)).toBeVisible();
});

test("inline editace: text, částka s validací, výběr stavu; změna přežije obnovení", async ({
  page,
}) => {
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(row(page, stamp)).toBeVisible();
  await expect(page.getByTestId("table-footer")).toContainText("1 záznam");
  await showColumn(page, "Původní smluvní cena");
  await showColumn(page, "Adresa stavby");

  // částka: špatný vstup ukáže chybu, správný se uloží a přepočítá součet
  const value = cell(page, stamp, "value");
  await value.dblclick();
  const input = value.getByRole("textbox");
  await input.fill("abc");
  await input.press("Enter");
  await expect(value.getByRole("alert")).toContainText("Zadejte částku");
  await input.fill("125 000");
  await input.press("Enter");
  await expect(value).toContainText("125 000 Kč");
  await expect(page.getByTestId("table-footer")).toContainText("125 000 Kč");

  // název: Esc zruší úpravu
  const title = cell(page, stamp, "title");
  await title.click({ position: { x: 3, y: 3 } }); // mimo odkaz s názvem, ten otevírá záznam
  await page.keyboard.press("Enter");
  await title.getByRole("textbox").fill("zahozeno");
  await page.keyboard.press("Escape");
  await expect(title).toContainText(job);

  // psaní do vybrané buňky přepíše hodnotu (první znak se neztratí), šipky se pohybují po tabulce
  await title.click({ position: { x: 3, y: 3 } });
  await page.keyboard.type("Zk");
  await expect(title.getByRole("textbox")).toHaveValue("Zk");
  await page.keyboard.press("Escape");
  await expect(title).toContainText(job);

  // stav: výběr z pipeline; fázi hlídají kontroly (do nabídky bez adresy stavby zakázka nejde)
  await expect(cell(page, stamp, "phase")).toContainText("Poptávka");
  await cell(page, stamp, "stage").dblclick();
  await page.getByRole("option", { name: "Nabídka v přípravě", exact: true }).click();
  await expect(page.getByText(/Doplňte adresu stavby/).first()).toBeVisible();
  await expect(cell(page, stamp, "stage")).toContainText("Nová poptávka");
  const address = cell(page, stamp, "address");
  await address.dblclick();
  await address.getByRole("textbox").fill("Plzeň, Nádražní 1");
  await address.getByRole("textbox").press("Enter");
  await expect(address).toContainText("Plzeň, Nádražní 1");
  await cell(page, stamp, "stage").dblclick();
  await page.getByRole("option", { name: "Nabídka v přípravě", exact: true }).click();
  await expect(cell(page, stamp, "stage")).toContainText("Nabídka v přípravě");
  await expect(cell(page, stamp, "phase")).toContainText("Nabídka");

  await page.reload();
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await showColumn(page, "Původní smluvní cena");
  await expect(cell(page, stamp, "value")).toContainText("125 000 Kč");
  await expect(cell(page, stamp, "stage")).toContainText("Nabídka v přípravě");
  await shot(page, "02-table");
});

test("filtr, uložený pohled, oblíbené v postranním panelu", async ({ page }) => {
  await page.goto("/zakazky");
  await page.getByTestId("add-filter").click();
  await page.getByRole("option", { name: "Název" }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Název" }).fill(stamp);
  await page.getByRole("button", { name: "Hotovo" }).click();
  await expect(page.getByTestId("filter-chip")).toContainText(stamp);
  await expect(page.getByTestId("table-footer")).toContainText("1 záznam");

  await page.getByTestId("list-options").click();
  await page.getByRole("menuitem", { name: "Uložit jako pohled…" }).click();
  await page.getByLabel("Název pohledu").fill(`Pohled ${stamp}`);
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.getByRole("tab", { name: `Pohled ${stamp}` })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // oblíbený pohled se objeví v postranním panelu a po obnovení se filtr vrátí
  await page.getByRole("button", { name: "Nastavení pohledu" }).click();
  await page.getByRole("menuitem", { name: "Přidat do oblíbených" }).click();
  await expect(page.getByRole("link", { name: new RegExp(`Pohled ${stamp}`) })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`Pohled ${stamp}`) }).click();
  await expect(page.getByTestId("filter-chip")).toContainText(stamp);
  await expect(page.getByTestId("table-footer")).toContainText("1 záznam");
});

test.describe("kanban", () => {
  // devět sloupců (fáze zakázky) se musí vejít vedle sebe, aby šlo táhnout mezi nimi bez posouvání
  test.use({ viewport: { width: 3200, height: 900 } });

  test("přesun karty mezi stavy se uloží, nepovolený přesun ukáže důvod", async ({ page }) => {
    await page.goto("/zakazky");
    await page.getByPlaceholder("Hledat…").fill(stamp);
    await page.getByRole("button", { name: "Kanban" }).click();
    const from = page.locator("[data-stage]").filter({ has: page.getByText(job) });
    await expect(from).toContainText("Nabídka");
    const card = page.locator(`[data-card-id]`).filter({ hasText: job });
    const drag = async (name: string) => {
      const target = page.getByRole("region", { name, exact: true });
      await card.hover(); // počká, až se rozložení ustálí
      await page.waitForTimeout(500); // dnd-kit potřebuje po zobrazení tabule chvíli na připojení posluchačů
      const a = (await card.boundingBox())!;
      await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 4 });
      const b = (await target.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + 80, { steps: 12 });
      // tabule se při tažení sama posouvá; cíl se přeměří a kurzor se k němu dotáhne, než se karta pustí
      await page.waitForTimeout(250);
      const c = (await target.boundingBox())!;
      await page.mouse.move(c.x + c.width / 2, c.y + 80, { steps: 3 });
      await page.waitForTimeout(150);
      await page.mouse.up();
      return target;
    };
    // Na vytíženém stroji (CI s jedním jádrem) se tah občas nezachytí (dnd-kit ještě nemá posluchače, místo tahu se označí text);
    // proto se tah zopakuje, dokud se neprojeví jeho výsledek.
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
      page.getByRole("region", { name: "Nabídka v přípravě", exact: true }).getByText(job),
    ).toBeVisible();
    await dragUntil("Příprava", (target) => target.getByText(job));
    await shot(page, "03-kanban");

    await page.reload();
    await page.getByPlaceholder("Hledat…").fill(stamp);
    await expect(page.getByRole("button", { name: "Tabulka" })).toBeVisible();
    await page.getByRole("button", { name: "Tabulka" }).click();
    await expect(cell(page, stamp, "stage")).toContainText("Příprava");
  });
});

test("hromadné akce: změna stavu se Zpět, export CSV, smazání se Zpět; řazení z nabídky", async ({
  page,
}) => {
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(row(page, stamp)).toBeVisible();

  // řazení z nabídky nastaví aria-sort na záhlaví
  await page.getByTestId("list-options").click();
  await page.getByRole("menuitem", { name: "Řazení" }).click();
  await clickSubmenuItem(page, page.getByRole("menuitem", { name: "Název" }));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: /Název/ })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );

  await row(page, stamp).getByRole("checkbox").click();
  const bar = page.getByRole("region", { name: "Hromadné akce" });
  await expect(bar).toContainText("Vybráno: 1");

  await bar.getByRole("button", { name: "Změnit stav" }).click();
  await page.getByRole("menuitem", { name: "Nabídka v přípravě", exact: true }).click();
  await expect(cell(page, stamp, "stage")).toContainText("Nabídka v přípravě");
  await page.getByRole("button", { name: "Zpět" }).click();
  await expect(cell(page, stamp, "stage")).toContainText("Příprava");
  await expect(page.getByRole("button", { name: "Zpět" })).toHaveCount(0); // starý toast zmizel

  const download = page.waitForEvent("download");
  await bar.getByRole("button", { name: "Exportovat" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^zakazky-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await (await import("node:fs/promises")).readFile((await file.path())!, "utf8");
  expect(csv).toContain(job);
  expect(csv.split("\r\n")[0]).toContain("Název");

  await bar.getByRole("button", { name: "Smazat" }).click();
  await expect(row(page, stamp)).toBeHidden();
  await page.getByRole("button", { name: "Zpět" }).click();
  await expect(row(page, stamp)).toBeVisible();
});

test("Cmd+K najde záznam bez diakritiky a otevře jeho stránku; ? ukáže zkratky", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Klávesové zkratky" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder(/Hledat zakázky/).fill(`rekonstrukce ${stamp}`);
  await page.getByRole("option", { name: new RegExp(job) }).click();
  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("record-view").getByRole("heading", { name: job })).toBeVisible();

  // nad otevřeným záznamem nabízí paleta kontextové akce
  await page.keyboard.press("ControlOrMeta+k");
  await expect(
    page
      .getByRole("group", { name: "Tento záznam" })
      .getByRole("option", { name: "Kopírovat odkaz na záznam" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("stránka záznamu: komentář, úkol a odkaz na firmu", async ({ page }) => {
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await row(page, stamp).hover();
  await row(page, stamp).getByRole("button", { name: "Otevřít" }).click();
  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}$/);

  // aktivita zakázky je přímo v Přehledu (záložka Aktivita se u zakázek nezobrazuje)
  await page.getByLabel("Nový komentář").fill("Vše domluveno s klientem.");
  await page.getByRole("button", { name: "Okomentovat" }).click();
  await expect(page.getByText("Vše domluveno s klientem.")).toBeVisible();
  // změny z inline editace jsou v historii s lidsky čitelnými hodnotami
  await expect(page.getByText("Realizace").first()).toBeVisible();

  await page.getByRole("tab", { name: /Úkoly/ }).click();
  await page.getByLabel("Nový úkol").fill("Objednat materiál");
  await page.getByRole("button", { name: "Přidat", exact: true }).click();
  await expect(page.getByText("Objednat materiál")).toBeVisible();
  await page.getByRole("checkbox", { name: /Hotovo: Objednat materiál/ }).click();

  await page.getByRole("tab", { name: "Přehled" }).click();
  await page
    .getByTestId("attributes-panel")
    .getByRole("link", { name: new RegExp(company) })
    .click();
  await expect(page).toHaveURL(/\/kontakty\/firmy\/[0-9a-f-]{36}$/);
  await shot(page, "04-record-page");
});

test("záznam, který uživatel nesmí vidět nebo neexistuje, se tváří jako nenalezený", async ({
  page,
}) => {
  const res = await page.goto("/zakazky/00000000-0000-4000-8000-000000000000");
  expect(res?.status()).toBe(200); // stránka se vykreslí, záznam ale hlásí „nenalezen“
  await expect(page.getByText("Záznam nenalezen")).toBeVisible();
  // stránka se streamuje (loading.tsx), proto je stav už 200; důležité je, že uživatel vidí českou „nenalezeno“
  await page.goto("/neexistuje/stranka");
  await expect(page.getByRole("heading", { name: "Stránka nenalezena" })).toBeVisible();
});
