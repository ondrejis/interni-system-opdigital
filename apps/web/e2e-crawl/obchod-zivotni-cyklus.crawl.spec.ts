import { expect, test, type Locator } from "@playwright/test";
import { collectErrors, expectClean } from "./helpers";
import {
  addFirstItem,
  changePhase,
  createCompany,
  createJob,
  minorOf,
  newStamp,
  openJob,
} from "./obchod-helpers";

/**
 * Celá cesta jedné nové zakázky: poptávka → nabídka → příprava → realizace → předání → záruka → uzavřeno,
 * blokující kontroly přechodu, pozastavení a obnovení, prohra s důvodem, viditelnost záložek podle fáze
 * a čtyři čísla v hlavičce po každé změně.
 */
test.describe.configure({ mode: "serial" });

const stamp = newStamp();
const company = `Cyklus firma ${stamp} s.r.o.`;
const job = `Cyklus zakázka ${stamp}`;
const lostJob = `Cyklus prohra ${stamp}`;

const kpi = (view: Locator, id: "contract" | "cost" | "margin" | "invoiced") =>
  view.getByTestId(`kpi-${id}`);
const tabs = async (view: Locator) =>
  (await view.getByRole("tab").allInnerTexts()).map((t) => t.replace(/\s+\d+$/, "").trim());

test("poptávka: záložky, hlavní akce a blokující kontrola adresy stavby", async ({ page }) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await createCompany(page, company);
  const view = await createJob(page, { title: job, company });
  await expect(view.getByTestId("job-phase")).toHaveText("Poptávka");
  expect(await tabs(view)).toEqual(["Přehled", "Rozpočet", "Úkoly", "Soubory"]);
  await expect(view.getByTestId("job-primary-action")).toContainText("Vytvořit nabídku");
  await expect(kpi(view, "contract")).toContainText("0 Kč");

  // do nabídky bez adresy stavby nejde; dialog řekne proč a tlačítko je vypnuté
  await changePhase(page, view, "Nabídka", { expectBlocked: /Doplňte adresu stavby/ });

  // adresa se doplní přímo v panelu údajů a blokace zmizí
  const panel = page.getByTestId("attributes-panel");
  await panel.getByRole("button", { name: /Zobrazit prázdná pole/ }).click();
  await panel.getByRole("button", { name: "Upravit Adresa stavby" }).click();
  const input = panel.getByRole("textbox");
  await input.fill("Plzeň, Americká 10");
  await input.press("Enter");
  await expect(panel).toContainText("Americká 10");
  expectClean(c, "poptávka");
});

test("nabídka: rozpočet, nelze vyhrát bez odeslání, po odeslání vyhrát", async ({ page }) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  const view = await openJob(page, stamp);
  await view.getByTestId("job-primary-action").getByRole("button").click();
  await page.getByRole("dialog", { name: /Přesunout do fáze „Nabídka“/ }).waitFor();
  await page
    .getByRole("dialog", { name: /Přesunout do fáze „Nabídka“/ })
    .getByRole("button", { name: "Přesunout" })
    .click();
  await expect(page.getByText("Zakázka je ve fázi „Nabídka“.")).toBeVisible();
  await expect(view.getByTestId("job-phase")).toHaveText("Nabídka");
  await expect(view.getByTestId("job-primary-action")).toContainText("Zakázka vyhrána");

  await view.getByRole("tab", { name: "Rozpočet" }).click();
  // prázdná nabídka: 10 ks po 1 000 Kč prodej, 600 Kč náklad = 10 000 / 6 000
  await addFirstItem(page, view, {
    section: "Hrubá stavba",
    item: "Zdivo",
    qty: "10",
    cost: "600",
    price: "1000",
  });
  await expect(view.getByTestId("budget-stats")).toContainText("10 000 Kč");
  await expect(view.getByTestId("budget-stats")).toContainText("6 000 Kč");
  await expect(view.getByTestId("budget-vat")).toContainText("12 100 Kč");
  // v nabídce hlavička ukazuje cenu nabídky (smluvní cena vznikne až výhrou), ne 0 Kč
  await expect(kpi(view, "contract")).toContainText("Cena nabídky");
  await expect(kpi(view, "contract")).toContainText("10 000 Kč");

  // neodeslanou nabídku nejde vyhrát
  await changePhase(page, view, "Příprava", { expectBlocked: /nebyla odeslána zákazníkovi/ });

  await view.getByRole("button", { name: "Odeslat nabídku" }).click();
  await expect(page.getByText("Nabídka je označená jako odeslaná zákazníkovi.")).toBeVisible();

  // vyhráno: nabídka se zamkne, zkopíruje do realizace a cena nabídky je původní smluvní cena
  await changePhase(page, view, "Příprava");
  await expect(view.getByTestId("job-phase")).toHaveText("Příprava");
  await expect(kpi(view, "contract")).toContainText("10 000 Kč");
  await expect(kpi(view, "cost")).toContainText("z plánu 6 000 Kč");
  expectClean(c, "nabídka");
});

test("příprava → realizace: osm záložek, pozastavení a obnovení, hlavička drží čísla", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  const view = await openJob(page, stamp);
  await expect(view.getByTestId("job-primary-action")).toContainText("Zahájit realizaci");
  // realizace se bez data zahájení a vedoucího nezahájí; dialog vypíše, co chybí
  await changePhase(page, view, "Realizace", {
    expectBlocked: /datum zahájení[\s\S]*vedoucího nebo přidejte člena týmu/,
  });
  const panel = page.getByTestId("attributes-panel");
  await panel.getByRole("button", { name: /Zobrazit prázdná pole/ }).click();
  await panel.getByRole("button", { name: "Upravit Zahájení" }).click();
  await page.locator("td[data-day] button").first().click();
  await panel.getByRole("button", { name: "Upravit Odpovědný" }).click();
  await page.getByRole("option").first().click();
  await expect(panel.getByRole("button", { name: "Upravit Zahájení" })).not.toContainText(
    "Vyplnit",
  );
  await expect(panel.getByRole("button", { name: "Upravit Odpovědný" })).not.toContainText(
    "Vyplnit",
  );
  await changePhase(page, view, "Realizace");
  await expect(view.getByTestId("job-phase")).toHaveText("Realizace");
  expect(await tabs(view)).toEqual([
    "Přehled",
    "Rozpočet",
    "Změny",
    "Náklady",
    "Fakturace",
    "Realizace",
    "Úkoly",
    "Soubory",
  ]);
  await expect(kpi(view, "contract")).toContainText("10 000 Kč");
  for (const t of ["Rozpočet", "Změny", "Náklady", "Fakturace", "Realizace", "Úkoly", "Soubory"]) {
    await view.getByRole("tab", { name: t, exact: true }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Něco se nepovedlo")).toHaveCount(0);
  }
  await view.getByRole("tab", { name: "Přehled", exact: true }).click();

  // původní smluvní cena je od zahájení realizace zamčená
  await view
    .getByTestId("attributes-panel")
    .getByRole("button", { name: "Upravit Původní smluvní cena" })
    .click();
  const price = view.getByTestId("attributes-panel").getByRole("textbox");
  await price.fill("1");
  await price.press("Enter");
  await expect(
    page.getByText(/Původní smluvní cena je od zahájení realizace zamčená/),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(kpi(view, "contract")).toContainText("10 000 Kč");

  // pozastavení a obnovení do původní fáze
  await changePhase(page, view, "Pozastaveno");
  await expect(view.getByTestId("job-phase")).toHaveText("Pozastaveno");
  await expect(view.getByTestId("job-primary-action")).toContainText("Obnovit zakázku");
  await view.getByTestId("job-primary-action").getByRole("button").click();
  const resume = page.getByRole("dialog", { name: /Přesunout do fáze „Realizace“/ });
  await resume.getByRole("button", { name: "Přesunout" }).click();
  await expect(view.getByTestId("job-phase")).toHaveText("Realizace");
  await expect(kpi(view, "contract")).toContainText("10 000 Kč");
  expectClean(c, "realizace");
});

test("předání, záruka a uzavření; uzavřená zakázka je zamčená a jde znovu otevřít", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  const view = await openJob(page, stamp);
  await changePhase(page, view, "Předání");
  await expect(view.getByTestId("job-phase")).toHaveText("Předání");

  // do záruky nejde bez délky záruky a podepsaného předávacího protokolu (kontroly řeknou obě věci)
  await changePhase(page, view, "Záruka", {
    expectBlocked: /délku záruky[\s\S]*podepsaný předávací protokol/,
  });
  const panel = page.getByTestId("attributes-panel");
  await panel.getByRole("button", { name: /Zobrazit prázdná pole/ }).click();
  await panel.getByRole("button", { name: "Upravit Délka záruky (měsíce)" }).click();
  await panel.getByRole("textbox").fill("12");
  await panel.getByRole("textbox").press("Enter");
  await expect(panel.getByRole("button", { name: "Upravit Délka záruky (měsíce)" })).toContainText(
    "12",
  );
  await view.getByRole("tab", { name: "Realizace", exact: true }).click();
  await view.getByRole("radio", { name: "Předání", exact: true }).click();
  await view.getByRole("button", { name: "Podepsat" }).click();
  const sign = page.getByRole("dialog", { name: /Podpis protokolu/ });
  await sign.getByLabel("Za zákazníka přebírá").fill("Jan Investor");
  const canvas = sign.locator("canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 60, { steps: 6 });
  await page.mouse.move(box.x + 140, box.y + 30, { steps: 6 });
  await page.mouse.up();
  await sign.getByRole("button", { name: "Podepsat a uzavřít" }).click();
  await expect(sign).toBeHidden();
  await view.getByRole("tab", { name: "Přehled", exact: true }).click();
  await changePhase(page, view, "Záruka");
  await expect(view.getByTestId("job-phase")).toHaveText("Záruka");
  await changePhase(page, view, "Uzavřeno");
  await expect(view.getByTestId("job-phase")).toHaveText("Uzavřeno");
  await expect(view.getByTestId("job-primary-action").getByRole("button")).toHaveCount(0);
  expect(minorOf(await kpi(view, "contract").innerText())).toBe(10_000_00);

  // uzavřená zakázka se dá znovu otevřít jen do záruky
  await changePhase(page, view, "Záruka");
  await expect(view.getByTestId("job-phase")).toHaveText("Záruka");
  expectClean(c, "záruka a uzavření");
});

test("prohra zakázky vyžaduje důvod; prohranou jde obnovit do poptávky", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await createJob(page, { title: lostJob, company });
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Změnit fázi" }).click();
  await page
    .getByRole("dialog", { name: "Změnit fázi zakázky" })
    .getByRole("button", { name: /Prohráno/ })
    .click();
  const dialog = page.getByRole("dialog", { name: /Přesunout do fáze „Prohráno“/ });
  await expect(dialog.getByRole("button", { name: "Přesunout" })).toBeDisabled();
  await dialog.getByLabel("Důvod prohry").click();
  const reason = page.getByRole("option").first();
  const reasonText = (await reason.innerText()).trim();
  await reason.click();
  await dialog.getByRole("button", { name: "Přesunout" }).click();
  await expect(view.getByTestId("job-phase")).toHaveText("Prohráno");
  await expect(view.getByTestId("attributes-panel")).toContainText(reasonText);
  await expect(view.getByTestId("job-primary-action")).toContainText("Obnovit poptávku");
  await changePhase(page, view, "Poptávka");
  await expect(view.getByTestId("job-phase")).toHaveText("Poptávka");
  expectClean(c, "prohra zakázky");
});
