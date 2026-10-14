import { expect, test, type Locator, type Page } from "@playwright/test";
import { collectErrors, expectClean } from "./helpers";
import {
  addFirstItem,
  changePhase,
  createCompany,
  createJob,
  newStamp,
  openJob,
} from "./obchod-helpers";

/**
 * Fakturace zakázky od zálohy po uvolnění zádržného s ručně spočítanými částkami.
 *
 * Zakázka: smluvní cena 100 000 Kč bez DPH (Beton 10 × 10 000 Kč), DPH 21 %, zádržné 5 %.
 *  1. záloha 20 % = 20 000 Kč (s DPH 24 200), uhrazená;
 *  2. soupis č. 1: 4 z 10 ks = 40 000 Kč, zádržné 2 000 → dílčí faktura 38 000 Kč bez DPH (s DPH 45 980);
 *  3. konečná faktura: 100 000 − 40 000 dříve − 20 000 záloha − 3 000 zádržné (5 % ze zbylých 60 000) = 37 000 Kč;
 *  4. uvolnění zádržného 2 000 + 3 000 = 5 000 Kč;
 *  celkem 20 000 + 38 000 + 37 000 + 5 000 = 100 000 Kč = smluvní cena.
 */
test.describe.configure({ mode: "serial" });

const stamp = newStamp();
const company = `Fakturace firma ${stamp} s.r.o.`;
const job = `Fakturace zakázka ${stamp}`;
const urls: Record<string, string> = {};

const summary = (view: Locator) => view.getByTestId("job-invoice-summary");

async function openBilling(page: Page, sub: "Faktury" | "Soupisy prací") {
  const view = await openJob(page, stamp);
  await view.getByRole("tab", { name: "Fakturace", exact: true }).click();
  await view.getByRole("radio", { name: sub, exact: true }).click();
  return view;
}

/** Na stránce konceptu faktury: vystaví doklad a vrátí jeho číslo. */
async function issue(page: Page, prefix: string): Promise<string> {
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Vystavit", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Vystavit doklad" })
    .getByRole("button", { name: "Vystavit", exact: true })
    .click();
  const toast = page.getByText(new RegExp(`Vystaveno: ${prefix}-\\d{4}-\\d{4}`));
  await expect(toast).toBeVisible();
  return ((await toast.innerText()).match(/[A-Z]+-\d{4}-\d{4}/) ?? [""])[0]!;
}

/** Zapíše úhradu celé zbývající částky na stránce vystavené faktury. */
async function payInFull(page: Page) {
  const view = page.getByTestId("record-view");
  await view.getByRole("tab", { name: "Platby" }).click();
  await view.getByRole("button", { name: "Doplnit celou zbývající částku" }).click();
  await view.getByRole("button", { name: "Zapsat úhradu" }).click();
  await expect(view.getByText("Uhrazeno", { exact: true })).toBeVisible();
}

async function totalsOf(page: Page) {
  const view = page.getByTestId("record-view");
  await view.getByRole("tab", { name: "Položky" }).click();
  return view.getByTestId("invoice-totals");
}

test("příprava: zakázka v přípravě s cenou 100 000 Kč, zádržným 5 % a rozpočtem", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await createCompany(page, company);
  const view = await createJob(page, {
    title: job,
    company,
    phase: "Příprava",
    value: "100 000",
    retention: "5",
    address: "Plzeň, Fakturační 1",
  });
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  await addFirstItem(page, view, {
    section: "Hrubá stavba",
    item: "Beton",
    qty: "10",
    cost: "6000",
    price: "10000",
  });
  await expect(view.getByTestId("budget-stats")).toContainText("100 000 Kč");
  expectClean(c, "příprava fakturace");
});

test("záloha 20 %: koncept 24 200 Kč s DPH, vystavení, úhrada; přehled fakturace", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  const view = await openBilling(page, "Faktury");
  await expect(summary(view).getByTestId("stat-contract")).toContainText("100 000 Kč");
  await expect(summary(view).getByTestId("stat-remaining")).toContainText("100 000 Kč");
  await view.getByRole("button", { name: "Zálohová faktura" }).click();
  await page.getByLabel("Kolik procent smluvní ceny").fill("20");
  await page.getByRole("button", { name: "Vytvořit koncept" }).click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}$/);
  urls.advance = new URL(page.url()).pathname;
  const totals = await totalsOf(page);
  await expect(totals).toContainText("24 200 Kč"); // 20 000 + 21 %
  urls.advanceNo = await issue(page, "ZF");
  await payInFull(page);
  expectClean(c, "záloha");

  const again = await openBilling(page, "Faktury");
  await expect(summary(again).getByTestId("stat-invoiced")).toContainText("20 000 Kč");
  await expect(summary(again).getByTestId("stat-paid")).toContainText("20 000 Kč");
  await expect(summary(again).getByTestId("stat-remaining")).toContainText("80 000 Kč");
});

test("realizace: soupis prací 4 z 10 ks → schválení → dílčí faktura se zádržným", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  let view = await openJob(page, stamp);
  // zahájení realizace: datum zahájení a odpovědná osoba
  const panel = page.getByTestId("attributes-panel");
  await panel.getByRole("button", { name: /Zobrazit prázdná pole/ }).click();
  await panel.getByRole("button", { name: "Upravit Zahájení" }).click();
  await page.locator("td[data-day] button").first().click();
  await panel.getByRole("button", { name: "Upravit Odpovědný" }).click();
  await page.getByRole("option").first().click();
  await changePhase(page, view, "Realizace");

  view = await openBilling(page, "Soupisy prací");
  await view.getByRole("button", { name: "Nový soupis" }).first().click();
  const dlg = page.getByRole("dialog", { name: "Nový soupis provedených prací" });
  await dlg.getByRole("button", { name: "Založit soupis" }).click();
  const editor = view.getByTestId("statement-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("Provedeno za období: Beton").fill("4");
  await editor.getByLabel("Provedeno za období: Beton").blur();
  await expect(editor.getByTestId("statement-totals")).toContainText("40 000 Kč");
  await editor.getByRole("button", { name: "Odeslat ke schválení" }).click();
  await expect(editor.getByText("Čeká na schválení")).toBeVisible();
  expectClean(c, "soupis");
});

test("dílčí faktura ze soupisu: 40 000 − zádržné 2 000 = 38 000 Kč bez DPH (45 980 s DPH), vystavení a úhrada", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  const view = await openBilling(page, "Soupisy prací");
  const list = view.getByTestId("statements-list");
  await expect(list).toContainText("Soupis č. 1");
  await list.getByText("Soupis č. 1").click();
  const editor = view.getByTestId("statement-editor");
  // soupis čeká na schválení; vlastník s právem schvalovat bez limitu ho schválí
  await editor.getByRole("button", { name: "Schválit", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Schválit", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Vytvořit dílčí fakturu" })).toBeVisible();
  await expect(editor.getByTestId("statement-totals")).toContainText("40 000 Kč");
  await editor.getByRole("button", { name: "Vytvořit dílčí fakturu" }).click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}$/);
  const totals = await totalsOf(page);
  const body = page.getByTestId("record-view");
  await expect(body.getByLabel("Popis položky 1")).toHaveValue(/Beton/);
  await expect(body.getByTestId("retention-row").first()).toContainText("2 000 Kč");
  await expect(totals).toContainText("38 000 Kč");
  await expect(totals).toContainText("45 980 Kč");
  urls.partialNo = await issue(page, "FV");
  await payInFull(page);
  expectClean(c, "dílčí faktura");

  const again = await openBilling(page, "Faktury");
  await expect(summary(again).getByTestId("stat-invoiced")).toContainText("58 000 Kč"); // 20 000 + 38 000
  await expect(summary(again).getByTestId("stat-retention-held")).toContainText("2 000 Kč");
});

test("konečná faktura: 100 000 − 40 000 − záloha 20 000 − zádržné 3 000 = 37 000 Kč; po ní jde jen uvolnění zádržného", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  const view = await openBilling(page, "Faktury");
  await view.getByRole("button", { name: "Konečná faktura" }).click();
  const dlg = page.getByRole("dialog", { name: "Konečná faktura" });
  const settlement = dlg.getByTestId("final-settlement");
  await expect(settlement).toContainText("100 000 Kč"); // smluvní cena
  await expect(settlement).toContainText("40 000 Kč"); // dříve fakturované plnění
  await expect(settlement).toContainText("20 000 Kč"); // záloha
  await expect(settlement).toContainText("3 000 Kč"); // zádržné z 60 000
  await expect(settlement).toContainText("37 000 Kč"); // k fakturaci
  await expect(settlement).toContainText("44 770 Kč"); // 37 000 × 1,21
  await dlg.getByRole("button", { name: "Vytvořit koncept" }).click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}$/);
  const totals = await totalsOf(page);
  await expect(totals).toContainText("37 000 Kč");
  urls.finalNo = await issue(page, "FV");
  await payInFull(page);
  expectClean(c, "konečná faktura");

  const again = await openBilling(page, "Faktury");
  await expect(summary(again).getByTestId("stat-invoiced")).toContainText("95 000 Kč");
  await expect(summary(again).getByTestId("stat-retention-held")).toContainText("5 000 Kč");
  // konečná faktura je vystavená, další už se nenabízí
  await expect(again.getByRole("button", { name: "Konečná faktura" })).toHaveCount(0);
});

test("předání a uvolnění zádržného: 5 000 Kč bez DPH (6 050 s DPH); celkem vyfakturováno 100 000 Kč", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  const view = await openJob(page, stamp);
  await changePhase(page, view, "Předání");
  // dokud je drženo zádržné, zakázku nejde uzavřít (uzavření hlídá zádržné)
  await changePhase(page, view, "Uzavřeno", { expectBlocked: /zádržn/i });
  await view.getByRole("tab", { name: "Fakturace", exact: true }).click();
  await view.getByRole("radio", { name: "Faktury", exact: true }).click();
  await expect(summary(view).getByTestId("stat-retention-held")).toContainText("5 000 Kč");
  await view.getByRole("button", { name: "Uvolnit zádržné" }).click();
  const dlg = page.getByRole("dialog", { name: "Uvolnění zádržného" });
  await expect(dlg).toContainText("5 000 Kč");
  await dlg.getByRole("button", { name: "Vytvořit koncept" }).click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}$/);
  const totals = await totalsOf(page);
  await expect(totals).toContainText("5 000 Kč");
  await expect(totals).toContainText("6 050 Kč");
  urls.releaseNo = await issue(page, "FV");
  const pdf = await page.request.get(
    `${new URL(page.url()).pathname.replace("/fakturace/", "/api/fakturace/")}/pdf`,
  );
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await payInFull(page);
  expectClean(c, "uvolnění zádržného");

  const again = await openBilling(page, "Faktury");
  await expect(summary(again).getByTestId("stat-invoiced")).toContainText("100 000 Kč");
  await expect(summary(again).getByTestId("stat-paid")).toContainText("100 000 Kč");
  await expect(summary(again).getByTestId("stat-remaining")).toContainText("0 Kč");
  await expect(summary(again).getByTestId("stat-retention-released")).toContainText("5 000 Kč");
  // hlavička zakázky drží stejná čísla: fakturováno i uhrazeno 100 000 Kč
  await expect(again.getByTestId("kpi-invoiced")).toContainText("100 000 Kč");
  await expect(again.getByTestId("kpi-invoiced")).toContainText("uhrazeno 100 000 Kč");
});

test("vystavená faktura je zamčená; dobropis ji stornuje a přehled zakázky se přepočítá", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  await page.goto("/fakturace");
  await page.getByPlaceholder("Hledat…").fill(urls.releaseNo!);
  const row = page.getByRole("row").filter({ hasText: urls.releaseNo! });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}$/);
  const view = page.getByTestId("record-view");
  // zamčený doklad: důvod a žádné pole k úpravě
  await view.getByRole("tab", { name: "Položky" }).click();
  await expect(view.getByTestId("lock-reason")).toContainText("zamčená");
  await expect(view.getByLabel("Popis položky 1")).toBeHidden();

  await view.getByRole("button", { name: "Dobropis" }).click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}$/);
  await expect(view.getByRole("heading", { name: /Dobropis k FV-/ })).toBeVisible();
  const totals = await totalsOf(page);
  await expect(totals).toContainText("5 000 Kč");
  await issue(page, "DB");
  await expect(
    page
      .getByTestId("record-view")
      .getByText(/DB-\d{4}-\d{4}/)
      .first(),
  ).toBeVisible();
  expectClean(c, "dobropis");

  // původní doklad ukazuje storno; fakturace zakázky se sníží o dobropis (−5 000 Kč bez DPH)
  await page.goto("/fakturace");
  await page.getByPlaceholder("Hledat…").fill(urls.releaseNo!);
  const orig = page
    .getByRole("row")
    .filter({ hasText: urls.releaseNo! })
    .filter({ hasNotText: "Dobropis k" });
  await orig.hover();
  await orig.getByRole("button", { name: "Otevřít" }).click();
  await expect(
    page.getByTestId("record-view").getByText(/Stornováno dobropisem DB-/),
  ).toBeVisible();
  const billing = await openBilling(page, "Faktury");
  await expect(summary(billing).getByTestId("stat-invoiced")).toContainText("95 000 Kč");
  await expect(billing.getByTestId("kpi-invoiced")).toContainText("95 000 Kč");
});

test("zakázka s přenesenou daňovou povinností: faktura bez DPH s textem § 92a", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  const title = `Fakturace PDP ${stamp}`;
  const view = await createJob(page, {
    title,
    company,
    phase: "Realizace",
    value: "50 000",
    vatMode: "Přenesená daňová povinnost",
    address: "Plzeň, PDP 1",
  });
  await view.getByRole("tab", { name: "Fakturace", exact: true }).click();
  await view.getByRole("radio", { name: "Faktury", exact: true }).click();
  await expect(view.getByTestId("vat-mode-chip")).toBeVisible();
  await view.getByRole("button", { name: "Zálohová faktura" }).click();
  await page.getByRole("radio", { name: "Pevná částka" }).click();
  await page.getByLabel("Částka bez DPH").fill("10 000");
  await page.getByRole("button", { name: "Vytvořit koncept" }).click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}$/);
  const totals = await totalsOf(page);
  // bez DPH: celková částka je základ
  await expect(totals).toContainText("10 000 Kč");
  await expect(totals).not.toContainText("12 100 Kč");
  await expect(
    page.getByTestId("record-view").getByText(/Daň odvede zákazník \(§ 92a/),
  ).toBeVisible();
  // odběratel bez DIČ: vystavení řekne proč (ne obecné „Něco se nepovedlo“)
  const invoiceUrl = page.url();
  await page
    .getByTestId("record-view")
    .getByRole("button", { name: "Vystavit", exact: true })
    .click();
  const issueDlg = page.getByRole("dialog", { name: "Vystavit doklad" });
  await issueDlg.getByRole("button", { name: "Vystavit", exact: true }).click();
  await expect(issueDlg.getByRole("alert")).toContainText("odběratel DIČ");
  await page.keyboard.press("Escape");

  // DIČ se doplní v kontaktu a faktura jde vystavit
  await page.goto("/kontakty/firmy");
  await page.getByPlaceholder("Hledat…").fill(company);
  const row = page.getByRole("row").filter({ hasText: company });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  const panel = page.getByTestId("attributes-panel");
  await panel.getByRole("button", { name: /Zobrazit prázdná pole/ }).click();
  await panel.getByRole("button", { name: "Upravit DIČ" }).click();
  await panel.getByRole("textbox").fill("CZ12345678");
  await panel.getByRole("textbox").press("Enter");
  await expect(panel.getByRole("button", { name: "Upravit DIČ" })).toContainText("CZ12345678");
  await page.goto(invoiceUrl);
  await issue(page, "ZF");
  expectClean(c, "PDP");
});
