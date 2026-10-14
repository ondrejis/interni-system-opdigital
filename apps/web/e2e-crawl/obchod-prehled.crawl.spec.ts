import { expect, test } from "@playwright/test";
import { collectErrors, expectClean } from "./helpers";
import { addFirstItem, createCompany, createJob, newStamp, openJob } from "./obchod-helpers";

/**
 * Přehled zakázky (karty, tým, aktivita s komentářem), Úkoly, Soubory (nahrání, náhled, smazání) a veřejná stránka
 * pro investora: vytvoření odkazu, otevření v anonymním kontextu (bez cen a bez indexace), náhled a zrušení.
 */
test.describe.configure({ mode: "serial" });

const stamp = newStamp();
const company = `Přehled firma ${stamp} s.r.o.`;
const job = `Přehled zakázka ${stamp}`;
let shareUrl = "";

test("příprava: zakázka v realizaci s rozpočtem (ceny, které se na veřejné stránce nesmí objevit)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await createCompany(page, company);
  const view = await createJob(page, {
    title: job,
    company,
    phase: "Realizace",
    value: "98 765",
    address: "Plzeň, Investorská 7",
  });
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  await addFirstItem(page, view, {
    section: "Hrubá stavba",
    item: "Zdivo",
    qty: "10",
    cost: "600",
    price: "9876,5",
  });
  expectClean(c, "příprava přehledu");
});

test("Přehled: tým (přidání, změna role, odebrání), komentář a aktivita", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  const view = await openJob(page, stamp);
  // karty Přehledu: stav fakturace, nejbližší úkoly, aktivita, údaje
  await expect(view.getByTestId("overview-activity")).toBeVisible();
  await expect(view.getByTestId("attributes-panel")).toContainText("98 765 Kč");

  const team = view.getByRole("region", { name: "Tým zakázky" });
  await team.getByRole("button", { name: "Přidat člena…" }).click();
  await page.getByRole("option").first().click();
  await team.getByLabel("Role v týmu").fill("mistr");
  await team.getByRole("button", { name: "Přidat", exact: true }).click();
  await expect(team.getByText("mistr")).toBeVisible();
  await view.getByRole("button", { name: /^Odebrat .* z týmu$/ }).click();
  await expect(view.getByRole("button", { name: "Změnit roli (mistr)" })).toBeHidden();

  await view.getByLabel("Nový komentář").fill(`Domluveno s investorem ${stamp}.`);
  await view.getByRole("button", { name: "Okomentovat" }).click();
  await expect(view.getByTestId("overview-activity")).toContainText(
    `Domluveno s investorem ${stamp}.`,
  );
  // změny údajů jsou v aktivitě lidsky čitelné (s názvem pole)
  await expect(view.getByTestId("overview-activity")).toContainText("Rozpočet");
  expectClean(c, "Přehled");
});

test("Úkoly a Soubory: úkol se splní, soubor se nahraje, zobrazí a smaže", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  const view = await openJob(page, stamp);
  await view.getByRole("tab", { name: /Úkoly/ }).click();
  await view.getByLabel("Nový úkol").fill(`Objednat materiál ${stamp}`);
  await view.getByRole("button", { name: "Přidat", exact: true }).click();
  await expect(view.getByText(`Objednat materiál ${stamp}`)).toBeVisible();
  await view
    .getByRole("checkbox", { name: new RegExp(`Hotovo: Objednat materiál ${stamp}`) })
    .click();
  await expect(
    view.getByRole("checkbox", { name: new RegExp(`Hotovo: Objednat materiál ${stamp}`) }),
  ).toBeChecked();

  await view.getByRole("tab", { name: "Soubory" }).click();
  const name = `poznamka-${stamp}.txt`;
  await view.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(`Zkušební soubor ${stamp}`),
  });
  const item = view.getByRole("listitem").filter({ hasText: name });
  await expect(item).toBeVisible();
  // stažení vrací obsah souboru
  await item.hover();
  const href = await item.getByRole("link", { name: `Stáhnout ${name}` }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe(`Zkušební soubor ${stamp}`);
  await item.getByRole("button", { name: `Odebrat ${name}` }).click();
  await expect(item).toBeHidden();
  expectClean(c, "Úkoly a Soubory");
});

test("odkaz pro investora: veřejná stránka bez ukazatelů cen, náhled a zrušení", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  const view = await openJob(page, stamp);
  const card = view.getByRole("region", { name: "Sdílení s investorem" });
  await card.getByRole("button", { name: "Nový odkaz" }).click();
  const create = page.getByRole("dialog", { name: "Nový odkaz pro investora" });
  await create.getByLabel("Pro koho (popisek)").fill(`Investor ${stamp}`);
  await create.getByRole("button", { name: "Vytvořit odkaz" }).click();
  const url = page.getByTestId("share-url");
  await expect(url).toHaveValue(/\/investor\/[A-Za-z0-9_-]{32,}$/);
  shareUrl = await url.inputValue();
  await page.getByRole("dialog").getByRole("button", { name: "Hotovo" }).click();
  await expect(card.getByTestId("share-list")).toContainText(`Investor ${stamp}`);
  await expect(card.getByTestId("share-list")).toContainText("Platí");

  // veřejná stránka: nový kontext bez přihlášení a bez cookies
  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const pub = await anon.newPage();
  const errors = collectErrors(pub);
  const res = await pub.goto(shareUrl);
  expect(res?.status()).toBe(200);
  await expect(pub.getByTestId("investor-title")).toHaveText(job);
  await expect(pub.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/);
  const text = await pub.locator("body").innerText();
  // žádné ceny ani marže, ani konkrétní částky z rozpočtu a hodnoty zakázky
  expect(text).not.toMatch(/Kč|Marže|Náklad|Smluvní cena|98\s?765|9\s?876/);
  expect(await pub.content()).not.toMatch(/98\s?765|9876/);
  expectClean(errors, "veřejná stránka investora");
  // pozměněný token se nepřijme (404 do sbírače chyb nepatří)
  const bad = await pub.goto(shareUrl.replace(/.$/, (ch) => (ch === "a" ? "b" : "a")));
  expect(bad?.status()).toBe(404);
  await anon.close();

  // náhled pro přihlášené a zrušení odkazu
  const popup = page.waitForEvent("popup");
  await card.getByRole("link", { name: /Náhled/ }).click();
  const preview = await popup;
  await expect(preview.getByTestId("investor-title")).toHaveText(job);
  await preview.close();
  await card.getByRole("button", { name: /Zrušit odkaz/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Zrušit odkaz" }).click();
  await expect(card.getByTestId("share-list")).toContainText("Zrušen");

  const anon2 = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const pub2 = await anon2.newPage();
  const gone = await pub2.goto(shareUrl);
  expect(gone?.status()).toBe(404);
  await anon2.close();
  expectClean(c, "odkaz pro investora");
});
