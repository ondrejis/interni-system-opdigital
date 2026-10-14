import { expect, test, type Locator, type Page } from "@playwright/test";
import { collectErrors, expectClean } from "./helpers";
import {
  addFirstItem,
  createCompany,
  createJob,
  minorOf,
  newStamp,
  openJob,
  typeInto,
} from "./obchod-helpers";

/**
 * Změny (ZBV): koncept, řádky všech tří typů (nová položka, změna množství, odebrání), náhled dopadu, odeslání,
 * schválení ve frontě „Ke schválení“, propsání do rozpočtu realizace (původní hodnoty zůstanou), smluvní cena
 * v hlavičce, vrácení do konceptu, samoschvalování a „Nová změna z řádku“.
 *
 * Výchozí rozpočet realizace: Beton 10 × 600 / 1 000 (prodej 10 000, náklad 6 000), Výkop 5 × 200 / 300
 * (prodej 1 500, náklad 1 000). Smluvní cena 11 500 Kč, plán nákladu 7 000 Kč.
 */
test.describe.configure({ mode: "serial" });

const stamp = newStamp();
const company = `Změny firma ${stamp} s.r.o.`;
const job = `Změny zakázka ${stamp}`;

const kpi = (view: Locator, id: "contract" | "cost" | "margin" | "invoiced") =>
  view.getByTestId(`kpi-${id}`);

async function openChanges(page: Page) {
  const view = await openJob(page, stamp);
  await view.getByRole("tab", { name: "Změny", exact: true }).click();
  return view;
}

async function addLine(
  page: Page,
  editor: Locator,
  kind: "Nová položka" | "Změna množství" | "Odebrat položku",
) {
  await editor.getByRole("button", { name: kind }).click();
  return page.getByRole("dialog");
}

test("příprava: zakázka v realizaci s rozpočtem a smluvní cenou 11 500 Kč", async ({ page }) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await createCompany(page, company);
  const view = await createJob(page, {
    title: job,
    company,
    phase: "Realizace",
    value: "11 500",
  });
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  await addFirstItem(page, view, {
    section: "Základy",
    item: "Beton",
    qty: "10",
    cost: "600",
    price: "1000",
  });
  const grid = view.getByTestId("budget-grid");
  const section = grid.getByRole("row", { name: /Základy/ }).first();
  await section.hover();
  await section.getByRole("button", { name: "Další akce" }).click();
  await page.getByRole("menuitem", { name: "Přidat položku" }).click();
  await expect(grid.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("Výkop");
  await page.keyboard.press("Tab");
  await expect(grid.getByRole("row", { name: /Výkop/ })).toBeVisible();
  await typeInto(page, "qty", "5", "Tab");
  await typeInto(page, "cost", "200", "Tab");
  await typeInto(page, "price", "300", "Enter");
  await expect(view.getByTestId("budget-stats")).toContainText("11 500 Kč");
  await expect(kpi(view, "contract")).toContainText("11 500 Kč");
  await expect(kpi(view, "cost")).toContainText("z plánu 7 000 Kč");
  expectClean(c, "příprava změn");
});

test("změna: tři typy řádků s náhledem dopadu, odeslání a schválení; propsání do rozpočtu a hlavičky", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  const view = await openChanges(page);
  await expect(view.getByText("Zatím žádné změny")).toBeVisible();
  await view.getByRole("button", { name: "Nová změna" }).click();
  const editor = view.getByTestId("change-editor");
  await editor.getByLabel("Název změny").fill("Rozšíření základů");
  await editor.getByLabel("Důvod změny").fill("Požadavek investora");
  await editor.getByLabel("Důvod změny").blur();

  // 1) změna množství: Beton 10 → 12 = +2 000 Kč prodej, +1 200 Kč náklad
  let dlg = await addLine(page, editor, "Změna množství");
  await dlg.getByLabel("Položka rozpočtu").click();
  await page.getByRole("option", { name: /Beton/ }).click();
  await dlg.getByLabel("Množství", { exact: true }).fill("12");
  await expect(dlg.getByTestId("line-preview")).toContainText("+2 000 Kč");
  await expect(dlg.getByTestId("line-preview")).toContainText("1 200 Kč");
  await dlg.getByRole("button", { name: "Přidat řádek" }).click();
  await expect(editor.getByTestId("change-impact")).toContainText("+2 000 Kč");

  // 2) nová položka: Drenáž 2 × 800 / 500 = +1 600 Kč prodej, +1 000 Kč náklad
  dlg = await addLine(page, editor, "Nová položka");
  await dlg.getByLabel("Název nové položky").fill("Drenáž");
  await dlg.getByLabel("Množství", { exact: true }).fill("2");
  await dlg.getByLabel("Prodejní cena za jednotku").fill("800");
  await dlg.getByLabel("Nákladová cena za jednotku").fill("500");
  await expect(dlg.getByTestId("line-preview")).toContainText("+1 600 Kč");
  await dlg.getByRole("button", { name: "Přidat řádek" }).click();
  await expect(editor.getByTestId("change-impact")).toContainText("+3 600 Kč");

  // 3) odebrání položky: Výkop = −1 500 Kč prodej, −1 000 Kč náklad
  dlg = await addLine(page, editor, "Odebrat položku");
  await dlg.getByLabel("Položka rozpočtu").click();
  await page.getByRole("option", { name: /Výkop/ }).click();
  await expect(dlg.getByTestId("line-preview")).toContainText("1 500 Kč");
  await dlg.getByRole("button", { name: "Přidat řádek" }).click();
  // celkový dopad: +2 000 + 1 600 − 1 500 = +2 100 Kč
  await expect(editor.getByTestId("change-impact")).toContainText("+2 100 Kč");
  await expect(editor.getByTestId("change-lines")).toContainText("Beton");
  await expect(editor.getByTestId("change-lines")).toContainText("Drenáž");
  await expect(editor.getByTestId("change-lines")).toContainText("Výkop");
  expectClean(c, "řádky změny");

  // odeslání ke schválení (osoba nad limitem 50 000 Kč není potřeba; 2 100 Kč schválí vlastník hned nebo čeká)
  await editor.getByRole("button", { name: "Odeslat ke schválení" }).click();
  const panel = editor.getByTestId("approval-panel");
  await expect(panel).toContainText(/Čeká na schválení|Schváleno a zamčeno/);
  const approvedAtOnce = (await panel.innerText()).includes("Schváleno a zamčeno");
  if (!approvedAtOnce) {
    await expect(panel).toContainText("Čeká na schválení");
    await editor.getByRole("button", { name: "Schválit" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Schválit", exact: true }).click();
  }
  await expect(panel).toContainText("Schváleno a zamčeno");
  // zamčená změna se nedá upravit
  await expect(editor.getByLabel("Název změny")).not.toBeEditable();
  expectClean(c, "schválení změny");

  // hlavička: smluvní cena 11 500 + 2 100 = 13 600, plán nákladu 7 000 + 1 200 = 8 200
  await expect(kpi(view, "contract")).toContainText("13 600 Kč");
  await expect(kpi(view, "cost")).toContainText("z plánu 8 200 Kč");
  // rozpočet realizace: Beton 12, nová položka Drenáž, Výkop vynulovaný; původní hodnoty zůstaly
  await view.getByRole("tab", { name: "Rozpočet", exact: true }).click();
  const stats = view.getByTestId("budget-stats");
  await expect(stats).toContainText("13 600 Kč");
  await expect(stats).toContainText("původně 11 500 Kč");
  const grid = view.getByTestId("budget-grid");
  await expect(grid.getByRole("row", { name: /Drenáž/ })).toBeVisible();
  await expect(grid.getByRole("row", { name: /Beton/ })).toContainText("pův. 10");
  expect(minorOf(await stats.innerText())).toBe(13_600_00);
  expectClean(c, "propsání do rozpočtu");
});

test("seznam změn ukazuje součty a schválenou změnu; Přehled zakázky je shrnuje", async ({
  page,
}) => {
  const c = collectErrors(page);
  const view = await openChanges(page);
  const list = view.getByTestId("changes-list");
  await expect(list).toContainText("Rozšíření základů");
  await expect(list).toContainText("Schváleno");
  await expect(list).toContainText("2 100 Kč");
  await view.getByRole("tab", { name: "Přehled", exact: true }).click();
  await expect(view.getByTestId("overview-changes")).toContainText("2 100 Kč");
  expectClean(c, "seznam změn");
});

test("schválenou změnu jde vrátit do konceptu: rozpočet i smluvní cena se vrátí, pak jde znovu schválit", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  const view = await openChanges(page);
  await view.getByRole("button", { name: /Rozšíření základů/ }).click();
  const editor = view.getByTestId("change-editor");
  await editor.getByRole("button", { name: "Vrátit do konceptu" }).click();
  await page.getByLabel("Důvod vrácení").fill("Oprava množství");
  await page.getByRole("dialog").getByRole("button", { name: "Vrátit do konceptu" }).click();
  await expect(editor.getByRole("button", { name: "Odeslat ke schválení" })).toBeVisible();
  await expect(editor.getByLabel("Název změny")).toBeEditable();
  // smluvní cena bez neschválené změny
  await expect(kpi(view, "contract")).toContainText("11 500 Kč");
  await view.getByRole("tab", { name: "Rozpočet", exact: true }).click();
  await expect(view.getByTestId("budget-stats")).toContainText("11 500 Kč");

  // znovu schválit
  await view.getByRole("tab", { name: "Změny", exact: true }).click();
  await view.getByRole("button", { name: /Rozšíření základů/ }).click();
  await editor.getByRole("button", { name: "Odeslat ke schválení" }).click();
  await expect(editor.getByTestId("approval-panel")).toContainText(
    /Čeká na schválení|Schváleno a zamčeno/,
  );
  if (
    !(await editor
      .getByTestId("approval-panel")
      .innerText()
      .then((t) => t.includes("Schváleno a zamčeno")))
  ) {
    await editor.getByRole("button", { name: "Schválit" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Schválit", exact: true }).click();
  }
  await expect(editor.getByTestId("approval-panel")).toContainText("Schváleno a zamčeno");
  await expect(kpi(view, "contract")).toContainText("13 600 Kč");
  await view.getByRole("tab", { name: "Rozpočet", exact: true }).click();
  await expect(view.getByTestId("budget-stats")).toContainText("13 600 Kč");
  expectClean(c, "vrácení do konceptu");
});

test("nová změna z řádku rozpočtu; zamítnutí s důvodem ve frontě a oprava", async ({ page }) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  const view = await openJob(page, stamp);
  await view.getByRole("tab", { name: "Rozpočet", exact: true }).click();
  const grid = view.getByTestId("budget-grid");
  const row = grid.getByRole("row", { name: /Beton/ });
  await row.hover();
  await row.getByRole("button", { name: "Další akce" }).click();
  await page.getByRole("menuitem", { name: "Nová změna z řádku" }).click();
  // změna se založí s řádkem pro Beton a rovnou se otevře její editor v záložce Změny
  const editor = view.getByTestId("change-editor");
  await expect(editor).toBeVisible();
  await expect(view.getByRole("tab", { name: "Změny", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(editor.getByTestId("change-lines")).toContainText("Beton");
  await editor.getByRole("button", { name: "Upravit řádek Beton" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Množství", { exact: true }).fill("15");
  await dlg.getByRole("button", { name: "Uložit" }).click();
  await expect(dlg).toBeHidden(); // dokud je dialog otevřený, jde fokus do něj a psaní do editoru by se ztratilo
  await editor.getByLabel("Název změny").fill("Další beton");
  // záměrně bez opuštění pole: název napsaný těsně před odesláním se musí uložit dřív, než se změna zamkne
  // +3 × 1 000 (12 → 15) = +3 000 Kč
  await expect(editor.getByTestId("change-impact")).toContainText("+3 000 Kč");
  await editor.getByRole("button", { name: "Odeslat ke schválení" }).click();
  await expect(editor.getByTestId("approval-panel")).toContainText(
    /Čeká na schválení|Schváleno a zamčeno/,
  );
  const approvedAtOnce = (await editor.getByTestId("approval-panel").innerText()).includes(
    "Schváleno a zamčeno",
  );
  if (!approvedAtOnce) {
    await page.goto("/zakazky/schvalovani");
    const item = page
      .getByTestId("approval-item")
      .filter({ hasText: "Další beton" })
      .filter({ hasText: stamp });
    await expect(item).toContainText("3 000 Kč");
    await item.getByRole("button", { name: "Zamítnout" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Zamítnout" }).click();
    await expect(page.getByRole("dialog")).toContainText("Napište důvod zamítnutí");
    await page.getByLabel("Důvod zamítnutí").fill("Zatím ne");
    await page.getByRole("dialog").getByRole("button", { name: "Zamítnout" }).click();
    await expect(item).toBeHidden();
  }
  expectClean(c, "nová změna z řádku");
});
