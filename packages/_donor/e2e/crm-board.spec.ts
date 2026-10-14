import { expect, test, type Page } from "@playwright/test";
import { pickCompany } from "./helpers";

/*
  CRM, oblast D: stránka /crm (nástěnka, přepínač pohledů, filtr vlastníka), karta a hlavička sloupce, detail zakázky
  v pop-upu (?record=), pás fází s kontrolou přesunu, výhra a prohra, sledující. Zakázku si test založí sám přes
  /zakazky (nezávisí na datech z dřívějších běhů). Spec se píše a nespouští (e2e pouští hlavní agent po integraci).
*/

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const job = `Nástěnka ${stamp}`;
let jobId = "";

const card = (page: Page) => page.locator("[data-card-button]").filter({ hasText: job }).first();
const dialog = (page: Page) => page.getByTestId("record-dialog");
const header = (page: Page) => page.getByTestId("deal-header");

/** Najde zakázku na nástěnce hledáním (nástěnka drží jen jednu stránku karet na sloupec). */
async function findOnBoard(page: Page) {
  await page.goto("/crm");
  // Karta je vidět už v nefiltrovaném výpisu. Hledání se pošle se zpožděním a po něm se nástěnka načte znovu (karty se na
  // chvíli vymění za kostru), takže se počká na odpověď na hledání; jinak by se otevřený popover nebo dialog pod rukama zavřel.
  const searched = page.waitForResponse(
    (r) => r.request().method() === "POST" && (r.request().postData() ?? "").includes(stamp),
  );
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await searched;
  await expect(card(page)).toBeVisible();
}

test("zakázka ve stavu Nová poptávka se ukáže na nástěnce s kartou a hlavičkou sloupce", async ({
  page,
}) => {
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const create = page.getByRole("dialog");
  await create.getByLabel(/Název/).fill(job);
  await pickCompany(page, create);
  await create.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: job })).toBeVisible();
  jobId = page.url().split("/").pop()!;

  await findOnBoard(page);
  const column = page.locator("section[data-stage]").filter({ has: card(page) });
  await expect(column).toContainText("Nová poptávka");
  await expect(column.getByTestId("column-extra")).toContainText("Vážená");
  // počítadlo je za všechny otevřené zakázky (ne za hledání), takže počet i tvar slova („1 zakázka“, „2 zakázky“, „5 zakázek“) závisí na datech
  await expect(page.getByTestId("deal-counter")).toHaveText(/^\d+ zakáz(ka|ky|ek)/);
  // cílové sloupce se ukážou až při tahu karty; zkratky W a L fungují nad zaostřenou kartou
  await card(page).focus();
  await page.keyboard.press("l");
  await expect(page.getByTestId("lose-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Zrušit" }).click();
  await expect(page.getByTestId("lose-dialog")).toBeHidden();
});

test("přepínač pohledů a filtr vlastníka jsou v adrese", async ({ page }) => {
  await page.goto("/crm");
  await page.getByTestId("view-prognoza").click();
  await expect(page).toHaveURL(/zobrazeni=prognoza/);
  await page.getByTestId("view-seznam").click();
  await expect(page).toHaveURL(/zobrazeni=seznam/);
  await page.getByTestId("view-nastenka").click();
  await expect(page).not.toHaveURL(/zobrazeni=/);
  await page.getByTestId("owner-filter").click();
  await page.getByRole("option", { name: "Já" }).click();
  await expect(page).toHaveURL(/vlastnik=me/);
  await page.reload();
  await expect(page.getByTestId("owner-filter")).toContainText("Já");
});

test("detail v pop-upu: odkaz, Esc a Zpět; název se upraví na místě", async ({ page }) => {
  await findOnBoard(page);
  await card(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`record=${jobId}`));
  await expect(header(page).getByTestId("deal-title")).toHaveText(job);
  await expect(page.getByTestId("deal-stage-strip")).toBeVisible();
  // záložky detailu jsou první pás; další (Aktivita, Poznámka, Hovor) patří panelu práce uvnitř Přehledu
  await expect(dialog(page).getByRole("tablist").first().getByRole("tab")).toHaveText([
    "Přehled",
    "Soubory",
  ]);

  // Název upravitelný na místě. Úprava se v pop-upu ukáže hned, ale další úprava smí začít až po uložení první (jinak by
  // poslala starý čas změny a server by ji odmítl jako souběžnou), proto se vždy počká na odpověď serveru.
  const saved = (title: string) =>
    page.waitForResponse(
      (r) =>
        r.request().method() === "POST" && (r.request().postData() ?? "").includes(`"${title}"`),
    );
  await header(page).getByTestId("deal-title").click();
  await page.getByLabel("Název zakázky").fill(`${job} upraveno`);
  const first = saved(`${job} upraveno`);
  await page.keyboard.press("Enter");
  await first;
  await expect(header(page).getByTestId("deal-title")).toHaveText(`${job} upraveno`);
  await header(page).getByTestId("deal-title").click();
  await page.getByLabel("Název zakázky").fill(job);
  const second = saved(job);
  await page.keyboard.press("Enter");
  await second;
  await expect(header(page).getByTestId("deal-title")).toHaveText(job);

  // Esc zavře pop-up a nástěnka (hledání) zůstane
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByPlaceholder("Hledat…")).toHaveValue(stamp);
  // Zpět otevřený pop-up zavře
  await card(page).click();
  await expect(dialog(page)).toBeVisible();
  await page.goBack();
  await expect(dialog(page)).toBeHidden();

  // přímý odkaz otevře pop-up rovnou
  await page.goto(`/crm?record=${jobId}`);
  await expect(dialog(page)).toBeVisible();
  await expect(header(page).getByTestId("deal-title")).toHaveText(job);
});

test("přesun do nabídky bez adresy stavby ukáže větu a pole k doplnění, ne jen toast", async ({
  page,
}) => {
  await page.goto(`/crm?record=${jobId}`);
  const strip = page.getByTestId("deal-stage-strip");
  await strip.getByRole("button", { name: /^Nabídka v přípravě/ }).click();
  const panel = page.getByTestId("transition-panel");
  await expect(panel).toContainText(/adresu stavby/i);
  await expect(panel.getByRole("button", { name: /^Přesunout do/ })).toBeDisabled();
  await panel.getByTestId("fix-address").getByRole("textbox").fill("Plzeň, Americká 10");
  await panel.getByTestId("fix-address").getByRole("textbox").press("Enter");
  const move = panel.getByRole("button", { name: /^Přesunout do/ });
  await expect(move).toBeEnabled();
  await move.click();
  await expect(panel).toBeHidden();
  await expect(strip.locator('li[data-state="current"]')).toContainText("Nabídka v přípravě");
});

test("sledování zakázky: počet se změní a sleduje se", async ({ page }) => {
  await page.goto(`/crm?record=${jobId}`);
  const button = page.getByTestId("followers-button");
  await expect(button).toContainText("0");
  await button.click();
  await page.getByTestId("follow-toggle").click();
  await expect(button).toContainText("1");
  await page.getByTestId("follow-toggle").click();
  await expect(button).toContainText("0");
});

test("výhra otevře potvrzení, prohra vyžaduje důvod a zakázku jde znovu otevřít", async ({
  page,
}) => {
  await page.goto(`/crm?record=${jobId}`);
  await header(page).getByTestId("deal-win").click();
  await expect(page.getByTestId("win-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Zrušit" }).click();

  await header(page).getByTestId("deal-lose").click();
  const lose = page.getByTestId("lose-dialog");
  await expect(lose.getByTestId("lose-confirm")).toBeDisabled();
  await lose.getByRole("button", { name: "Důvod prohry" }).click();
  await page.getByRole("option").first().click();
  await lose.getByLabel("Poznámka k prohře").fill("Test prohry");
  await lose.getByTestId("lose-confirm").click();
  await expect(header(page).getByTestId("deal-lost-chip")).toBeVisible();
  await expect(header(page)).toHaveAttribute("data-mode", "lost");

  await header(page).getByTestId("deal-reopen").click();
  await expect(header(page)).toHaveAttribute("data-mode", "open");
  await expect(header(page).getByTestId("deal-win")).toBeVisible();
});
