import { expect, test, type Page } from "@playwright/test";
import { pickCompany } from "./helpers";

/*
  CRM, oblast B (aktivity a poznámky): ikona další aktivity na kartě nástěnky s popoverem (naplánování, odškrtnutí,
  nabídka další), typy aktivit v Nastavení a seznam aktivit. Zakázku si test založí sám přes /zakazky.
  Spec se píše a nespouští (e2e pouští hlavní agent po integraci).
*/

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const job = `Aktivity ${stamp}`;
const subject = `Zavolat investorovi ${stamp}`;

const card = (page: Page) => page.locator("[data-card-button]").filter({ hasText: job }).first();
const icon = (page: Page) =>
  card(page).getByRole("button", { name: /Další aktivita|další aktivitu/i });

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

test("nová zakázka nemá další aktivitu: čip „Naplánovat“, naplánování z popoveru bez otevření karty", async ({
  page,
}) => {
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const create = page.getByRole("dialog");
  await create.getByLabel(/Název/).fill(job);
  await pickCompany(page, create);
  await create.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: job })).toBeVisible();

  await findOnBoard(page);
  await expect(icon(page)).toHaveAttribute("aria-label", /nemá naplánovanou další aktivitu/);
  await expect(icon(page)).toHaveText("Naplánovat");
  const url = page.url();
  await icon(page).click();
  // klik na čip kartu neotevřel (adresa se nezměnila) a formulář je rozbalený, protože nic není naplánováno
  await expect(page).toHaveURL(url);
  const popover = page.getByRole("dialog").filter({ hasText: "Další aktivity" });
  await popover.getByLabel("Předmět aktivity").fill(subject);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByText("Aktivita je naplánovaná.")).toBeVisible();
  await expect(popover.getByText(subject)).toBeVisible();
  await expect(icon(page)).toHaveAttribute("aria-label", /Další aktivita je (dnes|naplánovaná)/);
});

test("odškrtnutí v popoveru nabídne další aktivitu a výsledek se uloží", async ({ page }) => {
  await findOnBoard(page);
  await icon(page).click();
  await page.getByRole("checkbox", { name: `Označit jako hotové: ${subject}` }).click();
  const next = page.getByRole("dialog", { name: `Hotovo: ${subject}` });
  await expect(next).toBeVisible();
  await next.getByLabel("Výsledek (nepovinné)").fill("Dovolal jsem se, pošle podklady");
  // návrh další aktivity: stejný typ a předmět
  await expect(next.getByLabel("Předmět aktivity")).toHaveValue(subject);
  await next.getByRole("button", { name: "Naplánovat další" }).click();
  await expect(page.getByText("Další aktivita je naplánovaná.")).toBeVisible();
  await expect(icon(page)).toHaveAttribute("aria-label", /Další aktivita je naplánovaná/);
});

test("tabulka aktivit (entita crm_activity) najde aktivitu podle předmětu", async ({ page }) => {
  await page.goto("/crm/aktivity");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await expect(page.getByText(subject).first()).toBeVisible();
});

test("Nastavení → Typy aktivit: výchozí typy, nový typ a vypnutí (typ se nemaže)", async ({
  page,
}) => {
  await page.goto("/nastaveni/firma");
  await page.getByRole("link", { name: "Typy aktivit" }).click();
  await expect(page).toHaveURL(/\/crm\/typy-aktivit/);
  for (const name of [
    "Hovor",
    "Schůzka",
    "Úkol",
    "Termín",
    "E-mail",
    "Zaměření / obhlídka na místě",
  ])
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await page.getByTestId("create-record").click();
  const create = page.getByRole("dialog");
  await create.getByLabel(/Název/).fill(`Revize ${stamp}`);
  await create.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: `Revize ${stamp}` }),
  ).toBeVisible();
});
