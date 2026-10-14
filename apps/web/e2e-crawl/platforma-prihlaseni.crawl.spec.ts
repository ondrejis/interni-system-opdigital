import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { totp } from "../e2e/totp";
import { canReadMailLinks, latestMailUrl } from "./platforma-helpers";
import { collectErrors, expectClean, visit } from "./helpers";

/**
 * Procházka: účty a přihlášení. Pozvánka (UI majitele) → přijetí v anonymním kontextu → první přihlášení → nastavení 2FA
 * s TOTP → odhlášení a přihlášení kódem; špatné heslo a omezení pokusů; zapomenuté heslo → odkaz → nové heslo; vypršení
 * relace. Tajné odkazy se čtou z fronty e-mailů (viz `platforma-helpers.ts`); bez přístupu k databázi se test přeskočí.
 * Vše běží pod novým uživatelem se značkou `stamp` a rolí Mistr (kancelářské rozhraní; montér by po přihlášení skončil
 * v terminálu `/t`, to hlídá terminal-pristup), majitelův účet se nemění.
 */
const stamp = Math.random().toString(36).slice(2, 8);
const email = `qa2-${stamp}@test.example`;
const name = `Provozní Tester ${stamp}`;
const password = `Heslo-pro-test-${stamp}-1`;
const newPassword = `Nove-heslo-pro-test-${stamp}-2`;
const base = process.env.CRAWL_BASE_URL ?? "http://localhost:3100";

test.describe.configure({ mode: "serial" });

/** Anonymní kontext s vlastní „adresou“ (omezení pokusů je podle IP). */
const anon = (browser: Browser): Promise<BrowserContext> =>
  browser.newContext({
    baseURL: base,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${1 + Math.floor(Math.random() * 250)}` },
  });

async function poll<T>(fn: () => T | null, what: string, ms = 30_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Nedočkal jsem se: ${what}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

let secret = "";
/** Už použité kódy: server stejný kód podruhé nepřijme, takže se vezme vždy dosud nepoužitý z okolních oken. */
const used = new Set<string>();
function nextCode(): string {
  for (const off of [0, 30, -30]) {
    const code = totp(secret, off);
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
  throw new Error("Všechny platné kódy už byly použity, počkejte na další okno.");
}

test("pozvánka: majitel pozve, kolega ji přijme a přihlásí se", async ({ page, browser }) => {
  test.skip(
    !canReadMailLinks(),
    "Bez DATABASE_URL, APP_ENCRYPTION_KEY a psql nejde přečíst odkaz z fronty.",
  );
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await visit(page, "/nastaveni/uzivatele", c);
  await page.getByRole("button", { name: "Pozvat uživatele" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("E-mail").fill(email);
  await dialog.getByRole("button", { name: "Vyberte roli…" }).click();
  await page.getByRole("option", { name: /Mistr/ }).first().click();
  await dialog.getByRole("button", { name: "Odeslat pozvánku" }).click();
  const pending = page.locator("main li").filter({ hasText: email });
  await expect(pending).toBeVisible();

  const url = await poll(() => latestMailUrl(email, "invitation"), "e-mail s pozvánkou");
  const path = new URL(url).pathname;
  expect(path).toMatch(/^\/pozvanka\/[\w-]{20,}$/);

  const ctx = await anon(browser);
  const guest = await ctx.newPage();
  const cg = collectErrors(guest);
  await guest.goto(path);
  await expect(guest.locator("main")).toContainText(email);
  // krátké heslo se odmítne dřív, než se odešle
  await guest.getByLabel("Jméno a příjmení").fill(name);
  await guest.getByLabel("Heslo").fill("krátké");
  await guest.getByRole("button", { name: "Nastavit přístup" }).click();
  await expect(guest).toHaveURL(new RegExp(`${path}$`));
  await guest.getByLabel("Heslo").fill(password);
  await guest.getByRole("button", { name: "Nastavit přístup" }).click();
  await expect(guest).toHaveURL(/\/prihlaseni\?pozvanka=ok/);
  await expect(guest.locator("main")).toContainText(/Přístup je nastavený|pozvánk/i);

  // pozvánka je jednorázová
  await guest.goto(path);
  await expect(guest.locator("main")).toContainText(/neplatná|vypršela/i);

  // první přihlášení
  await guest.goto("/prihlaseni");
  await guest.getByLabel("E-mail").fill(email);
  await guest.getByLabel("Heslo").fill(password);
  await guest.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(guest).toHaveURL(/\/$/);
  await expect(guest.getByRole("button", { name: new RegExp(name) })).toBeVisible();
  expectClean(cg, "kolega");
  await ctx.storageState({ path: `e2e-crawl/.auth/qa2-${stamp}.json` });
  await ctx.close();

  // majitel vidí kolegu v seznamu uživatelů a pozvánka z čekajících zmizela
  await visit(page, "/nastaveni/uzivatele", c);
  await expect(page.locator("main").getByText(name).first()).toBeVisible();
  await expect(page.locator("main li").filter({ hasText: email })).toHaveCount(0);
  expectClean(c, "pozvánka");
});

test("2FA: nastavení s TOTP, odhlášení a přihlášení kódem, špatný kód", async ({ browser }) => {
  test.skip(!canReadMailLinks(), "Navazuje na pozvánku, která bez přístupu k frontě neproběhla.");
  test.setTimeout(180_000);
  const ctx = await browser.newContext({
    baseURL: base,
    storageState: `e2e-crawl/.auth/qa2-${stamp}.json`,
    extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${1 + Math.floor(Math.random() * 250)}` },
  });
  const page = await ctx.newPage();
  const c = collectErrors(page);
  c.ignore(/status of (400|401)/); // záměrně zadané špatné heslo a kód: prohlížeč o odmítnutém požadavku píše do konzole
  await visit(page, "/nastaveni/zabezpeceni", c);
  await page.getByLabel("Pro zahájení zadejte heslo").fill("špatné-heslo-12345");
  await page.getByRole("button", { name: "Nastavit ověření" }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await page.getByLabel("Pro zahájení zadejte heslo").fill(password);
  await page.getByRole("button", { name: "Nastavit ověření" }).click();
  secret = (await page.locator("code").innerText()).trim();
  await expect(page.getByTestId("backup-codes")).not.toBeEmpty();
  await page.getByLabel("Kód z aplikace").fill("000000");
  await page.getByRole("button", { name: "Potvrdit a zapnout" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Kód není správný");
  await page.getByLabel("Kód z aplikace").fill(nextCode());
  await page.getByRole("button", { name: "Potvrdit a zapnout" }).click();
  await expect(page).toHaveURL(/\/$/);

  // odhlášení a nové přihlášení: heslo samo nestačí
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.getByRole("menuitem", { name: "Odhlásit se" }).click();
  await expect(page).toHaveURL(/\/prihlaseni$/);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/overeni$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/overeni$|\/prihlaseni$/);
  await page.goto("/overeni");
  await page.getByLabel("Kód z aplikace pro ověření").fill("123456");
  await page.getByRole("button", { name: "Ověřit" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Kód není správný");
  await page.getByLabel("Kód z aplikace pro ověření").fill(nextCode());
  await page.getByRole("button", { name: "Ověřit" }).click();
  await expect(page).toHaveURL(/\/$/);
  expectClean(c, "2FA");
  await ctx.close();
});

test("zapomenuté heslo: odkaz z e-mailu nastaví nové heslo, staré přestane platit", async ({
  browser,
}) => {
  test.skip(!canReadMailLinks(), "Bez přístupu k frontě e-mailů nejde odkaz přečíst.");
  test.setTimeout(180_000);
  const ctx = await anon(browser);
  const page = await ctx.newPage();
  const c = collectErrors(page);
  c.ignore(/status of (400|401)/); // záměrně zadané staré heslo: prohlížeč o odmítnutém požadavku píše do konzole
  await visit(page, "/zapomenute-heslo", c);
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: /Poslat|Odeslat|odkaz/i }).click();
  await expect(page.locator("main")).toContainText(/Pokud|odkaz|e-mail/i);
  const url = await poll(() => latestMailUrl(email, "password-reset"), "e-mail s obnovou hesla");
  const u = new URL(url);
  await page.goto(`${u.pathname}${u.search}`);
  await page.getByLabel("Nové heslo").fill(newPassword);
  await page
    .getByRole("button", { name: /Nastavit|Uložit|heslo/i })
    .last()
    .click();
  await expect(page).toHaveURL(/\/prihlaseni\?heslo=ok/);

  // staré heslo už nejde, nové ano (a pak kód z aplikace)
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Nesprávný e-mail nebo heslo.");
  await page.getByLabel("Heslo").fill(newPassword);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/overeni$/);
  await page.getByLabel("Kód z aplikace pro ověření").fill(nextCode());
  await page.getByRole("button", { name: "Ověřit" }).click();
  await expect(page).toHaveURL(/\/$/);

  // vypršení relace: bez cookies je každá stránka přesměrována na přihlášení a po přihlášení se vrátí zpět
  await ctx.clearCookies();
  await page.goto("/ukoly");
  await expect(page).toHaveURL(/\/prihlaseni/);
  expectClean(c, "obnova hesla");
  await ctx.close();
});

test("přihlášení: špatné heslo, neznámý e-mail a omezení počtu pokusů", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await anon(browser);
  const page = await ctx.newPage();
  const c = collectErrors(page);
  c.ignore(/status of (401|429)/); // očekávané odpovědi na chybné pokusy
  await visit(page, "/prihlaseni", c);
  // prázdný formulář se neodešle
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/prihlaseni$/);

  const attempt = async (mail: string, pass: string) => {
    await page.getByLabel("E-mail").fill(mail);
    await page.getByLabel("Heslo").fill(pass);
    await page.getByRole("button", { name: "Přihlásit se" }).click();
  };
  await attempt("neznamy@test.example", "nejake-heslo-12345");
  await expect(page.locator("main").getByRole("alert")).toHaveText("Nesprávný e-mail nebo heslo.");
  // stejná hláška u známého e-mailu: nesmí prozradit, jestli účet existuje
  await attempt(email, "nejake-heslo-12345");
  await expect(page.locator("main").getByRole("alert")).toHaveText("Nesprávný e-mail nebo heslo.");
  // po opakovaných pokusech se přihlášení zdrží s vysvětlením (limit 8 za minutu z jedné adresy)
  for (let i = 0; i < 8; i++) {
    await attempt("neznamy@test.example", `spatne-heslo-${i}-12345`);
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
  }
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    /Příliš mnoho pokusů|dočasně zamčený/,
  );
  expectClean(c, "pokusy");
  await ctx.close();
});
