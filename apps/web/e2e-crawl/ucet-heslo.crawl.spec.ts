import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { test } from "@playwright/test";
import { totp } from "../e2e/totp";
import { canReadMailLinks, latestMailUrl } from "./platforma-helpers";
import { collectErrors, expectClean, visit } from "./helpers";

/**
 * Procházka: Můj účet. Hermeticky pod vlastním uživatelem (role Partner: kancelářské rozhraní bez správy): majitel ho pozve, uživatel si změní profil, heslo (špatné
 * současné heslo, stejné heslo, nesouhlasící potvrzení, ostatní zařízení se odhlásí), odhlásí ostatní zařízení, zapne 2FA
 * a vygeneruje nové záložní kódy; majitel mu pak v Uživatelích vytvoří odkaz pro nové heslo a odhlásí ho všude.
 * Heslo demo uživatelů ani majitele se nemění. Odkazy z pozvánky se čtou z fronty e-mailů (viz `platforma-helpers.ts`).
 */
const stamp = Math.random().toString(36).slice(2, 8);
const email = `ucet-${stamp}@test.example`;
const name = `Účet Tester ${stamp}`;
const newName = `Nový Tester ${stamp}`;
const pw1 = `Heslo-pro-test-${stamp}-1`;
const pw2 = `Nove-heslo-pro-test-${stamp}-2`;
const pw3 = `Treti-heslo-pro-test-${stamp}-3`;
const base = process.env.CRAWL_BASE_URL ?? "http://localhost:3100";

test.describe.configure({ mode: "serial" });

const fakeIp = () => `198.51.100.${1 + Math.floor(Math.random() * 250)}`;

/** Čistý kontext („zařízení“) s vlastní adresou, protože omezení pokusů je podle IP. */
const device = (browser: Browser): Promise<BrowserContext> =>
  browser.newContext({
    baseURL: base,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "x-forwarded-for": fakeIp() },
  });

async function signIn(
  browser: Browser,
  password: string,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await device(browser);
  const page = await ctx.newPage();
  await page.goto("/prihlaseni");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  return { ctx, page };
}

async function signedIn(browser: Browser, password: string) {
  const d = await signIn(browser, password);
  await expect(d.page).toHaveURL(/\/($|\?)/);
  return d;
}

/** Odhlásí zařízení a zavře ho (zavřený kontext by jinak nechal v databázi platnou relaci a pletl počty zařízení). */
async function leave(d: { ctx: BrowserContext; page: Page }) {
  await d.page.request.post("/api/auth/sign-out", {
    headers: { origin: base, "content-type": "application/json" },
    data: {},
  });
  await d.ctx.close();
}

const alert = (page: Page): Locator => page.locator("main").getByRole("alert");
const passwordFields = (page: Page) => ({
  current: page.getByLabel("Současné heslo"),
  next: page.getByLabel("Nové heslo", { exact: true }),
  again: page.getByLabel("Potvrzení nového hesla"),
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

test("pozvánka: majitel pozve uživatele a ten se poprvé přihlásí", async ({ page, browser }) => {
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
  await page
    .getByRole("option", { name: /Partner/ })
    .first()
    .click();
  await dialog.getByRole("button", { name: "Odeslat pozvánku" }).click();
  await expect(page.locator("main li").filter({ hasText: email })).toBeVisible();

  const url = await poll(() => latestMailUrl(email, "invitation"), "e-mail s pozvánkou");
  const guest = await device(browser);
  const gp = await guest.newPage();
  await gp.goto(new URL(url).pathname);
  await gp.getByLabel("Jméno a příjmení").fill(name);
  await gp.getByLabel("Heslo").fill(pw1);
  await gp.getByRole("button", { name: "Nastavit přístup" }).click();
  await expect(gp).toHaveURL(/\/prihlaseni\?pozvanka=ok/);
  await guest.close();
  expectClean(c, "pozvánka");
});

test("Můj účet: dostupný z nabídky uživatele i z Nastavení, profil se uloží a promítne", async ({
  browser,
}) => {
  test.skip(!canReadMailLinks(), "Navazuje na pozvánku, která bez přístupu k frontě neproběhla.");
  test.setTimeout(180_000);
  const { ctx, page } = await signedIn(browser, pw1);
  const c = collectErrors(page);

  // z nabídky uživatele (na počítači i v mobilním menu je to stejná nabídka)
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.getByRole("menuitem", { name: "Můj účet" }).click();
  await expect(page).toHaveURL(/\/nastaveni\/ucet$/);
  await expect(page.getByRole("heading", { name: "Můj účet", level: 2 })).toBeVisible();
  // mistr nevidí správcovské části Nastavení, ale Můj účet ano
  const nav = page.getByRole("navigation", { name: "Oddíly nastavení" });
  await expect(nav.getByRole("link", { name: "Můj účet" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Uživatelé" })).toHaveCount(0);
  await visit(page, "/nastaveni/ucet", c);

  // e-mail se sám nemění
  await expect(page.getByLabel("E-mail (přihlašovací jméno)")).toBeDisabled();
  await expect(page.locator("main")).toContainText("požádejte správce uživatelů");

  // neplatný telefon se odmítne srozumitelnou větou
  c.ignore(/status of 4\d\d/);
  await page.getByLabel("Telefon").fill("abc");
  await page.getByRole("button", { name: "Uložit profil" }).click();
  await expect(page.getByText("Telefon zadejte třeba ve tvaru")).toBeVisible();

  await page.getByLabel("Jméno a příjmení").fill(newName);
  await page.getByLabel("Telefon").fill("+420 777 123 456");
  await page.getByRole("button", { name: "Uložit profil" }).click();
  await expect(page.getByText("Profil uložen.")).toBeVisible();
  // změna jména je hned vidět v bočním panelu i po obnovení
  await expect(page.getByRole("button", { name: new RegExp(newName) })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Jméno a příjmení")).toHaveValue(newName);
  await expect(page.getByLabel("Telefon")).toHaveValue("+420 777 123 456");
  expectClean(c, "profil");
  await leave({ ctx, page });

  // majitel vidí nové jméno v seznamu uživatelů
  const owner = await browser.newContext({
    baseURL: base,
    storageState: "e2e-crawl/.auth/owner.json",
    extraHTTPHeaders: { "x-forwarded-for": fakeIp() },
  });
  const op = await owner.newPage();
  const co = collectErrors(op);
  await visit(op, "/nastaveni/uzivatele", co);
  await expect(op.locator("main").getByText(newName).first()).toBeVisible();
  await owner.close();
});

test("změna hesla: chyby, odhlášení ostatních zařízení a přihlášení novým heslem", async ({
  browser,
}) => {
  test.skip(!canReadMailLinks(), "Navazuje na pozvánku, která bez přístupu k frontě neproběhla.");
  test.setTimeout(240_000);
  const phone = await signedIn(browser, pw1); // druhé zařízení
  const here = await signedIn(browser, pw1);
  const page = here.page;
  const c = collectErrors(page);
  c.ignore(/status of 4\d\d/); // záměrně odmítnuté pokusy
  await visit(page, "/nastaveni/ucet", c);

  // dvě zařízení, jedno z nich je „toto“
  const sessions = page.getByTestId("sessions");
  await expect(sessions.locator("li")).toHaveCount(2);
  await expect(sessions.getByText("Toto zařízení", { exact: true })).toHaveCount(1);
  await expect(sessions.locator("li[data-current=true]")).toContainText(
    /Chrom|neznámý|Edge|Safari/,
  );

  const f = passwordFields(page);
  const submit = page.getByRole("button", { name: "Změnit heslo" });
  await expect(submit).toBeDisabled();

  // příliš krátké heslo a nesouhlasící potvrzení tlačítko nepustí
  await f.current.fill(pw1);
  await f.next.fill("krátké");
  await f.again.fill("krátké");
  await expect(page.getByText("Alespoň 12 znaků")).toBeVisible();
  await expect(submit).toBeDisabled();
  await f.next.fill(pw2);
  await f.again.fill(pw2 + "x");
  await expect(page.getByText("Hesla se neshodují.")).toBeVisible();
  await expect(submit).toBeDisabled();

  // špatné současné heslo
  await f.current.fill("tohle-neni-heslo-12345");
  await f.again.fill(pw2);
  await submit.click();
  await expect(alert(page)).toHaveText("Současné heslo není správné.");

  // stejné jako staré
  await f.current.fill(pw1);
  await f.next.fill(pw1);
  await f.again.fill(pw1);
  await submit.click();
  await expect(alert(page)).toHaveText("Nové heslo musí být jiné než současné.");

  // správná změna
  await f.next.fill(pw2);
  await f.again.fill(pw2);
  await submit.click();
  await expect(page.getByText(/Heslo bylo změněno\./)).toBeVisible();
  await expect(f.current).toHaveValue("");
  // toto zařízení zůstalo přihlášené, druhé je odhlášené
  await page.reload();
  await expect(page).toHaveURL(/\/nastaveni\/ucet$/);
  await expect(sessions.locator("li")).toHaveCount(1);
  await phone.page.goto("/ukoly");
  await expect(phone.page).toHaveURL(/\/prihlaseni/);
  await phone.ctx.close();

  // staré heslo už nejde, nové ano
  const oldTry = await signIn(browser, pw1);
  await expect(oldTry.page.locator("main").getByRole("alert")).toHaveText(
    "Nesprávný e-mail nebo heslo.",
  );
  await oldTry.ctx.close();
  const fresh = await signedIn(browser, pw2);
  await expect(fresh.page.getByRole("button", { name: new RegExp(newName) })).toBeVisible();
  await leave(fresh);
  expectClean(c, "změna hesla");

  // odhlásit všechna ostatní: ponechá toto zařízení
  const tablet = await signedIn(browser, pw2);
  await visit(page, "/nastaveni/ucet", c);
  await expect(sessions.locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Odhlásit všechna ostatní zařízení" }).click();
  await expect(page.getByText("Ostatní zařízení byla odhlášena.")).toBeVisible();
  await expect(sessions.locator("li")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Odhlásit všechna ostatní zařízení" }),
  ).toBeDisabled();
  await tablet.page.goto("/ukoly");
  await expect(tablet.page).toHaveURL(/\/prihlaseni/);
  await tablet.ctx.close(); // relaci už server zrušil

  // odhlásit jedno zařízení (cizí)
  const laptop = await signedIn(browser, pw2);
  await page.reload();
  await expect(sessions.locator("li")).toHaveCount(2);
  await sessions
    .locator("li:not([data-current=true])")
    .getByRole("button", { name: "Odhlásit toto zařízení" })
    .click();
  await expect(page.getByText("Zařízení bylo odhlášeno.")).toBeVisible();
  await expect(sessions.locator("li")).toHaveCount(1);
  await laptop.page.goto("/ukoly");
  await expect(laptop.page).toHaveURL(/\/prihlaseni/);
  await laptop.ctx.close();

  // odhlásit sebe
  await sessions
    .locator("li[data-current=true]")
    .getByRole("button", { name: "Odhlásit se" })
    .click();
  await expect(page).toHaveURL(/\/prihlaseni$/);
  expectClean(c, "zařízení");
  await here.ctx.close();
});

test("2FA: zapnutí, nové záložní kódy po zadání hesla, vypnutí", async ({ browser }) => {
  test.skip(!canReadMailLinks(), "Navazuje na pozvánku, která bez přístupu k frontě neproběhla.");
  test.setTimeout(240_000);
  const { ctx, page } = await signedIn(browser, pw2);
  const c = collectErrors(page);
  c.ignore(/status of 4\d\d/);
  await visit(page, "/nastaveni/ucet", c);

  // z Můj účet vede odkaz na správu dvoufázového ověření
  await page.getByRole("link", { name: "Spravovat dvoufázové ověření" }).click();
  await expect(page).toHaveURL(/\/nastaveni\/zabezpeceni$/);

  await page.getByLabel("Pro zahájení zadejte heslo").fill(pw2);
  await page.getByRole("button", { name: "Nastavit ověření" }).click();
  const secret = (await page.locator("code").innerText()).trim();
  await expect(page.getByTestId("backup-codes")).toBeVisible();
  const oldCodes = (await page.getByTestId("backup-codes").locator("li").allInnerTexts()).map((t) =>
    t.trim(),
  );
  expect(oldCodes.length).toBeGreaterThan(5);
  await page.getByLabel("Kód z aplikace").fill(totp(secret));
  await page.getByRole("button", { name: "Potvrdit a zapnout" }).click();
  await expect(page).toHaveURL(/\/$/);

  await visit(page, "/nastaveni/zabezpeceni", c);
  await expect(page.locator("main")).toContainText("Zapnuto");

  // nové kódy vyžadují heslo
  await page.getByLabel("Pro vytvoření nových kódů zadejte heslo").fill("tohle-neni-heslo-12345");
  await page.getByRole("button", { name: "Vytvořit nové kódy" }).click();
  await expect(alert(page)).toContainText("Nesprávné heslo");
  await page.getByLabel("Pro vytvoření nových kódů zadejte heslo").fill(pw2);
  await page.getByRole("button", { name: "Vytvořit nové kódy" }).click();
  await expect(page.getByTestId("new-backup-codes")).toBeVisible();
  const fresh = (await page.getByTestId("new-backup-codes").locator("li").allInnerTexts()).map(
    (t) => t.trim(),
  );
  expect(fresh).toHaveLength(oldCodes.length);
  expect(fresh.some((k) => oldCodes.includes(k))).toBe(false);
  await expect(page.locator("main")).toContainText("Dosavadní záložní kódy přestaly platit");
  await ctx.close();

  // starý záložní kód už nejde, nový ano
  const old = await signIn(browser, pw2);
  await expect(old.page).toHaveURL(/\/overeni$/);
  await old.page.getByRole("button", { name: /záložní kód/i }).click();
  await old.page.getByLabel(/záložní kód/i).fill(oldCodes[0]!);
  await old.page.getByRole("button", { name: "Ověřit" }).click();
  await expect(old.page.locator("main").getByRole("alert")).toContainText(
    "Záložní kód není správný",
  );
  await old.page.getByLabel(/záložní kód/i).fill(fresh[0]!);
  await old.page.getByRole("button", { name: "Ověřit" }).click();
  await expect(old.page).toHaveURL(/\/$/);

  // role mistr 2FA nevyžaduje, takže ho jde vypnout (s heslem)
  await old.page.goto("/nastaveni/zabezpeceni");
  await old.page.getByLabel("Pro vypnutí zadejte heslo").fill(pw2);
  await old.page.getByRole("button", { name: "Vypnout ověření" }).click();
  await expect(old.page.getByText("Zapnout dvoufázové ověření")).toBeVisible();
  expectClean(c, "2FA");
  await old.ctx.close();
});

test("správce: odkaz pro nové heslo a odhlášení všude", async ({ page, browser }) => {
  test.skip(!canReadMailLinks(), "Navazuje na pozvánku, která bez přístupu k frontě neproběhla.");
  test.setTimeout(240_000);
  const user = await signedIn(browser, pw2); // přihlášené zařízení uživatele
  const c = collectErrors(page);
  await visit(page, "/nastaveni/uzivatele", c);
  const row = page.getByRole("row").filter({ hasText: email });
  await row.getByRole("button", { name: /^Akce:/ }).click();
  await page.getByRole("menuitem", { name: "Poslat odkaz pro nové heslo" }).click();

  // bez SMTP správce dostane jednorázový odkaz (nikdy heslo); s SMTP odejde e-mail
  const dialog = page.getByRole("dialog", { name: "Odkaz pro nové heslo" });
  let path: string;
  const linkShown = await dialog
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (linkShown) {
    await expect(dialog).toContainText("Heslo si zvolí sám");
    const url = await dialog.getByLabel("Odkaz pro nastavení hesla").inputValue();
    expect(new URL(url).pathname).toBe("/obnova-hesla");
    path = `${new URL(url).pathname}${new URL(url).search}`;
    await dialog.getByRole("button", { name: "Hotovo" }).click();
    await expect(dialog).toHaveCount(0);
  } else {
    const url = await poll(() => latestMailUrl(email, "password-reset"), "e-mail s obnovou hesla");
    path = `${new URL(url).pathname}${new URL(url).search}`;
  }

  const guest = await device(browser);
  const gp = await guest.newPage();
  const cg = collectErrors(gp);
  await gp.goto(path);
  await gp.getByLabel("Nové heslo").fill(pw3);
  await gp.getByRole("button", { name: /Nastavit heslo/ }).click();
  await expect(gp).toHaveURL(/\/prihlaseni\?heslo=ok/);
  // uživatel byl odhlášen na svém zařízení
  await user.page.goto("/ukoly");
  await expect(user.page).toHaveURL(/\/prihlaseni/);
  await user.ctx.close();
  // odkaz je jednorázový
  cg.ignore(/status of 4\d\d/); // záměrně použitý odkaz podruhé
  await gp.goto(path);
  await gp.getByLabel("Nové heslo").fill(`${pw3}-jine`);
  await gp.getByRole("button", { name: /Nastavit heslo/ }).click();
  await expect(gp.locator("main").getByRole("alert")).toContainText("Odkaz je neplatný");
  await guest.close();

  // Odhlásit všude (s potvrzením)
  const again = await signedIn(browser, pw3);
  await row.getByRole("button", { name: /^Akce:/ }).click();
  await page.getByRole("menuitem", { name: "Odhlásit všude" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Odhlásit všude" }).click();
  await expect(page.getByText("Uživatel odhlášen ze všech zařízení.")).toBeVisible();
  await again.page.goto("/ukoly");
  await expect(again.page).toHaveURL(/\/prihlaseni/);
  await again.ctx.close();
  expectClean(c, "správce");
  expectClean(cg, "uživatel");
});
