import { expect, test, type Locator, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";

/**
 * Procházka: sklad. Karta, příjemky (vážená průměrná cena), výdej na zakázku (nelze vydat víc, než je), převod mezi
 * umístěními, vratka, objednávka, inventura (napočítáno → rozdíl), položky pod minimem, náhled pohybů a shoda hodnoty
 * skladu s pohyby i s materiálem v ekonomice zakázky. Vše si test zakládá sám pod značkou `stamp`.
 */
const stamp = Math.random().toString(36).slice(2, 8);
const supplier = `Dodavatel ${stamp}`;
const jobTitle = `Sklad ${stamp}`;
const itemName = `Cement ${stamp}`;
const whA = `Sklad A ${stamp}`;
const whB = `Vozidlo B ${stamp}`;
const code = `CEM-${stamp}`.toUpperCase();

/** „1 234,50 Kč“ → haléře. */
const toMinor = (t: string) =>
  Math.round(Number(t.replace(/[^\d,-]/g, "").replace(",", ".")) * 100);

async function pick(page: Page, trigger: Locator, search: string) {
  await trigger.click();
  await page
    .getByPlaceholder(/Hledat|Kód nebo název/)
    .last()
    .fill(search);
  await page.getByRole("option").filter({ hasText: search }).first().click();
}

async function createRecord(
  page: Page,
  list: string,
  name: string,
  extra?: (d: Locator) => Promise<void>,
) {
  await page.goto(list);
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(name);
  if (extra) await extra(dialog);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name, exact: true }),
  ).toBeVisible();
}

const row = (page: Page) =>
  page
    .getByLabel("Hledat položku")
    .fill(stamp)
    .then(() => page.getByTestId("stock-row").filter({ hasText: itemName }));

test.describe.configure({ mode: "serial" });

test("příprava: dodavatel, zakázka, dvě umístění a karta s minimem", async ({ page }) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await createRecord(page, "/kontakty/firmy", supplier);
  await createRecord(page, "/zakazky", jobTitle, async (dialog) => {
    await dialog.getByRole("button", { name: "Vybrat…" }).click();
    await page.getByPlaceholder("Hledat…").last().fill(supplier);
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Poptávka" }).click();
    await page.getByRole("option", { name: "Realizace" }).click();
  });
  await createRecord(page, "/sklad/umisteni", whA);
  await createRecord(page, "/sklad/umisteni", whB);
  await page.goto("/sklad/karty");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Kód/).fill(code.toLowerCase());
  await dialog.getByLabel(/Název/).fill(itemName);
  await dialog.getByRole("button", { name: "ks", exact: true }).click();
  await page.getByRole("option", { name: "pytel" }).click();
  await dialog.getByRole("button", { name: /Další pole/ }).click();
  await dialog.getByLabel("Minimum").fill("10");
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: itemName }),
  ).toBeVisible();
  expectClean(c, "příprava");
});

test("dvě příjemky: vážená průměrná cena a hodnota zásob", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/sklad", c);
  const kpi = page.getByText("Hodnota zásob").locator("xpath=..");
  await expect(kpi).toContainText("Kč");
  const valueBefore = toMinor((await kpi.textContent()) ?? "");

  for (const [qty, price, total] of [
    ["20", "100", "2\\s000"],
    ["10", "130", "1\\s300"],
  ] as const) {
    await page.getByRole("button", { name: "Příjem", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Příjemka" });
    await pick(page, dialog.getByRole("button", { name: /^Umístění/ }), whA);
    await pick(page, dialog.getByRole("button", { name: /^Dodavatel/ }), supplier);
    await pick(page, dialog.getByRole("button", { name: /^Položka 1/ }), code);
    await dialog.getByLabel("Množství 1").fill(qty);
    await dialog.getByLabel("Cena za jednotku 1").fill(price);
    await dialog.getByRole("button", { name: /^Zaúčtovat/ }).click();
    await expect(
      page.getByText(new RegExp(`Zaúčtováno: PR-\\d{4}-\\d{4} · ${total}\\sKč`)),
    ).toBeVisible();
  }
  const r = await row(page);
  // (20 × 100 + 10 × 130) / 30 = 110 Kč
  await expect(r).toContainText("30 pytel");
  await expect(r).toContainText("110 Kč");
  await expect(r).toContainText("3 300 Kč");
  await page.getByLabel("Hledat položku").fill("");
  await expect
    .poll(async () => toMinor((await kpi.textContent()) ?? ""))
    .toBe(valueBefore + 330_000);
  expectClean(c, "příjemky");
});

test("výdej na zakázku: víc než skladem se odmítne, materiál v ekonomice zakázky sedí; pod minimem", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/sklad", c);
  await page.getByRole("button", { name: "Výdej", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Výdejka na zakázku" });
  await pick(page, dialog.getByRole("button", { name: /^Umístění/ }), whA);
  await pick(page, dialog.getByRole("button", { name: /^Zakázka/ }), jobTitle);
  await pick(page, dialog.getByRole("button", { name: /^Položka 1/ }), code);
  await dialog.getByLabel("Množství 1").fill("35");
  await dialog.getByRole("button", { name: /^Zaúčtovat/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("na umístění je jen 30");
  await dialog.getByLabel("Množství 1").fill("25");
  await dialog.getByRole("button", { name: /^Zaúčtovat/ }).click();
  // 25 × 110 Kč
  await expect(page.getByText(/Zaúčtováno: VY-\d{4}-\d{4} · 2\s750\sKč/)).toBeVisible();

  const r = await row(page);
  await expect(r).toContainText("5 pytel");
  await expect(r).toContainText("550 Kč"); // zbytek po průměrné ceně, hodnota se nepřepočítává
  await page.getByRole("button", { name: "Jen pod minimem" }).click();
  await expect(page.getByTestId("stock-row").filter({ hasText: itemName })).toBeVisible();
  await page.getByRole("button", { name: "Jen pod minimem" }).click();

  // zakázka: materiál celkem
  await visit(page, "/zakazky", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const jobRow = page.getByRole("row").filter({ hasText: jobTitle });
  await jobRow.hover();
  await jobRow.getByRole("button", { name: "Otevřít" }).click();
  const panel = page.getByTestId("record-view");
  await panel.getByRole("tab", { name: "Náklady", exact: true }).click();
  await panel.getByRole("radio", { name: "Materiál", exact: true }).click();
  await expect(panel).toContainText(itemName);
  await expect(panel).toContainText("Materiál celkem 2 750 Kč");
  expectClean(c, "výdej");
});

test("převod mezi umístěními a vratka ze zakázky", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/sklad", c);

  // převod: víc než je na zdrojovém umístění nejde
  await page.getByRole("button", { name: "Převod", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Převodka" });
  await pick(page, dialog.getByRole("button", { name: /^Umístění/ }), whA);
  await pick(page, dialog.getByRole("button", { name: /^Cílové umístění/ }), whB);
  await pick(page, dialog.getByRole("button", { name: /^Položka 1/ }), code);
  await dialog.getByLabel("Množství 1").fill("6");
  await dialog.getByRole("button", { name: /^Zaúčtovat/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("na umístění je jen 5");
  await dialog.getByLabel("Množství 1").fill("2");
  await dialog.getByRole("button", { name: /^Zaúčtovat/ }).click();
  await expect(page.getByText(/Zaúčtováno: PV-\d{4}-\d{4}/)).toBeVisible();
  let r = await row(page);
  await expect(r).toContainText("5 pytel"); // celkem se převodem nemění
  await expect(r).toContainText(`${whA} 3`);
  await expect(r).toContainText(`${whB} 2`);
  await expect(r).toContainText("550 Kč");

  // vratka 4 pytlů ze zakázky zpět na sklad A: zásoba 9, cena stále 110 Kč
  await page.getByLabel("Hledat položku").fill("");
  await page.getByRole("button", { name: "Vratka", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Vratka ze zakázky" });
  await pick(page, dialog.getByRole("button", { name: /^Umístění/ }), whA);
  await pick(page, dialog.getByRole("button", { name: /^Zakázka/ }), jobTitle);
  await pick(page, dialog.getByRole("button", { name: /^Položka 1/ }), code);
  await dialog.getByLabel("Množství 1").fill("4");
  await dialog.getByRole("button", { name: /^Zaúčtovat/ }).click();
  await expect(page.getByText(/Zaúčtováno: VR-\d{4}-\d{4}/)).toBeVisible();
  r = await row(page);
  await expect(r).toContainText("9 pytel");
  await expect(r).toContainText("110 Kč");
  await expect(r).toContainText("990 Kč");

  // materiál zakázky po vratce: 21 pytlů × 110 Kč = 2 310 Kč
  await visit(page, "/zakazky", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const jobRow = page.getByRole("row").filter({ hasText: jobTitle });
  await jobRow.hover();
  await jobRow.getByRole("button", { name: "Otevřít" }).click();
  const panel = page.getByTestId("record-view");
  await panel.getByRole("tab", { name: "Náklady", exact: true }).click();
  await panel.getByRole("radio", { name: "Materiál", exact: true }).click();
  await expect(panel).toContainText("Materiál celkem 2 310 Kč");
  expectClean(c, "převod a vratka");
});

test("karta ukazuje pohyby a stav po umístěních", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/sklad/karty", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const card = page.getByRole("row").filter({ hasText: itemName });
  await card.hover();
  await card.getByRole("button", { name: "Otevřít" }).click();
  const view = page.getByTestId("record-view");
  await view.getByRole("tab", { name: "Stav a pohyby" }).click();
  for (const t of ["Příjem", "Výdej", "Převod", "Vratka"]) await expect(view).toContainText(t);
  await expect(view).toContainText("Skladem");
  await expect(view).toContainText("9 pytel");
  expectClean(c, "karta");
});

test("inventura: napočítáno → rozdíl se zaúčtuje; objednávka a příjem zboží", async ({ page }) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await visit(page, "/sklad", c);
  await page.getByRole("button", { name: "Inventura", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nová inventura" });
  await pick(page, dialog.getByRole("button", { name: /^Umístění/ }), whA);
  await dialog.getByRole("button", { name: "Založit inventuru" }).click();
  await expect(page).toHaveURL(/\/sklad\/inventury\/[0-9a-f-]{36}$/);
  const view = page.getByTestId("record-view");
  await view.getByRole("tab", { name: "Počítání" }).click();
  // na umístění A je 7 pytlů (9 − 2 převedené); napočítáno 8 → přebytek +1
  const input = view.getByLabel(`Napočítáno ${itemName}`);
  await input.fill("8");
  await input.blur();
  await expect(view.getByTestId("count-row").filter({ hasText: itemName })).toContainText("+1");
  await view.getByRole("button", { name: "Uzavřít inventuru" }).click();
  await page
    .getByRole("dialog", { name: "Uzavřít inventuru" })
    .getByRole("button", { name: "Uzavřít inventuru" })
    .click();
  await expect(page.getByText(/Inventura uzavřena, rozdíly zaúčtovány: IN-/)).toBeVisible();

  await visit(page, "/sklad", c);
  const r = await row(page);
  await expect(r).toContainText("10 pytel");

  // objednávka 30 pytlů, příjem 12
  await page.getByLabel("Hledat položku").fill("");
  await page.getByRole("button", { name: "Objednávka", exact: true }).click();
  const order = page.getByRole("dialog", { name: "Nová objednávka" });
  await pick(page, order.getByRole("button", { name: /^Příjem do/ }), whA);
  await pick(page, order.getByRole("button", { name: /^Dodavatel/ }), supplier);
  await pick(page, order.getByRole("button", { name: /^Položka 1/ }), code);
  await order.getByLabel("Množství 1").fill("30");
  await order.getByRole("button", { name: "Vytvořit a odeslat" }).click();
  await expect(page).toHaveURL(/\/sklad\/objednavky\/[0-9a-f-]{36}$/);
  const ov = page.getByTestId("record-view");
  await expect(ov).toContainText("Objednáno");
  await ov.getByRole("button", { name: "Přijmout zboží" }).click();
  const receive = page.getByRole("dialog", { name: "Přijetí zboží" });
  await receive.getByLabel(`Přijato ${itemName}`).fill("12");
  await receive.getByRole("button", { name: "Zaúčtovat příjem" }).click();
  await expect(page.getByText(/Příjem zaúčtován: PR-/)).toBeVisible();
  await expect(ov).toContainText("Částečně přijato");
  expectClean(c, "inventura a objednávka");
});

test("přehled skladu: součet hodnot řádků odpovídá hodnotě zásob, doklady a umístění se otevřou", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/sklad", c);
  const kpi = page.getByText("Hodnota zásob").locator("xpath=..");
  const total = toMinor((await kpi.textContent()) ?? "");
  const rows = page.getByTestId("stock-row");
  await expect(rows.first()).toBeVisible();
  const values = await rows.evaluateAll((trs) =>
    trs.map((tr) => (tr.querySelectorAll("td")[6] as HTMLElement).innerText),
  );
  const sum = values.reduce((a, v) => a + toMinor(v), 0);
  // hodnota řádku = množství × průměrná cena zaokrouhlená na korunu: povolíme drobnou odchylku zaokrouhlení
  expect(Math.abs(sum - total)).toBeLessThanOrEqual(values.length * 50);

  for (const path of [
    "/sklad/doklady",
    "/sklad/objednavky",
    "/sklad/inventury",
    "/sklad/umisteni",
  ]) {
    await visit(page, path, c);
    await expect(page.locator("main")).toContainText(/\d|Žádn/);
  }
  await visit(page, "/sklad/doklady", c);
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: /PR-|VY-|PV-|VR-|IN-/ })
      .first(),
  ).toBeVisible();
  expectClean(c, "přehled skladu");
});
