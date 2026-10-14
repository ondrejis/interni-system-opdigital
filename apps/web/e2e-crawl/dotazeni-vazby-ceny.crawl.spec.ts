import { expect, test } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { addFirstItem, createCompany, createJob, newStamp, openJob } from "./obchod-helpers";

/**
 * Dotažení po QA a UX (hermeticky, vlastní data): cena nabídky v seznamu i hlavičce, kompaktní hlavička zakázky,
 * blokace smazání firmy a zakázky s vazbami a česká odpověď na neplatné kódování adresy.
 */
test.describe.configure({ mode: "serial" });

const stamp = newStamp();
const company = `Dotažení firma ${stamp} s.r.o.`;
const jobTitle = `Dotažení nabídka ${stamp}`;

test("nabídka s rozpočtem: seznam i hlavička ukazují cenu nabídky, ne 0 Kč; hlavička je kompaktní", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const c = collectErrors(page);
  await createCompany(page, company);
  const view = await createJob(page, { title: jobTitle, company, phase: "Nabídka" });
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  await addFirstItem(page, view, {
    section: "Hrubá stavba",
    item: "Zdivo",
    qty: "10",
    cost: "600",
    price: "1000",
  });

  // hlavička: „Cena nabídky“ (smluvní cena vznikne výhrou)
  const kpi = view.getByTestId("kpi-contract");
  await expect(kpi).toContainText("Cena nabídky");
  await expect(kpi).toContainText(/10\s000\s?Kč/);
  // kompaktní hlavička: čtyři čísla v jednom řádku, dva řádky textu v kartě; celá hlavička s kartami nezabírá půl obrazovky
  const cards = await view.getByTestId("job-kpis").locator("[data-testid^=kpi-]").all();
  expect(cards).toHaveLength(4);
  const boxes = await Promise.all(cards.map((k) => k.boundingBox()));
  expect(new Set(boxes.map((b) => Math.round(b!.y))).size, "karty v jednom řádku").toBe(1);
  expect(boxes[0]!.height, "výška karty").toBeLessThanOrEqual(64);
  const header = await view.getByTestId("record-header").boundingBox();
  expect(header!.height, "výška hlavičky").toBeLessThanOrEqual(140);

  // seznam: sloupec ceny nese cenu nabídky stejně jako hlavička
  await openJob(page, jobTitle);
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(jobTitle);
  const row = page.getByRole("row").filter({ hasText: jobTitle });
  await expect(row.locator('[data-attr="sumContract"]')).toContainText(/10\s000\s?Kč/);
  expectClean(c, "cena nabídky");
});

test("smazání firmy a zakázky s vazbami: srozumitelná věta, nic se nesmaže; po uvolnění vazby jde", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const c = collectErrors(page);
  const deleteFromDetail = async () => {
    const view = page.getByTestId("record-view");
    await view.getByRole("button", { name: "Další akce" }).click();
    await page.getByRole("menuitem", { name: "Smazat" }).click();
  };
  const openCompany = async () => {
    await page.goto("/kontakty/firmy");
    await page.getByPlaceholder("Hledat…").fill(company);
    const row = page.getByRole("row").filter({ hasText: company });
    await row.hover();
    await row.getByRole("button", { name: "Otevřít" }).click();
    await expect(
      page.getByTestId("record-view").getByRole("heading", { name: company }),
    ).toBeVisible();
  };

  await openCompany();
  await deleteFromDetail();
  await expect(
    page.getByText("Firma má 1 zakázku; nejdřív je přesuňte nebo smažte."),
  ).toBeVisible();
  // firma zůstala
  await visit(page, "/kontakty/firmy", c);
  await page.getByPlaceholder("Hledat…").fill(company);
  await expect(page.getByRole("row").filter({ hasText: company })).toHaveCount(1);

  // zakázka bez dokladů jde smazat (vratně), potom i firma
  await openJob(page, jobTitle);
  await deleteFromDetail();
  await expect(page.getByText(`Smazáno: ${jobTitle}.`)).toBeVisible();
  await openCompany();
  await deleteFromDetail();
  await expect(page.getByText(`Smazáno: ${company}.`)).toBeVisible();
  expectClean(c, "blokace smazání");
});

test("neplatné kódování adresy: česká stránka s kódem 400, ne anglická chyba Next.js", async ({
  page,
}) => {
  const res = await page.goto("/zakazky/%E0%A4%A");
  expect(res?.status()).toBe(400);
  await expect(page.getByRole("heading", { name: "Neplatná adresa" })).toBeVisible();
  await expect(page.getByText("Bad Request")).toHaveCount(0);
  // běžné adresy s kódováním fungují dál
  await visit(page, "/zakazky?q=%C5%BE", collectErrors(page));
});
