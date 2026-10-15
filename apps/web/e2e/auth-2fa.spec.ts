import { expect, test } from "@playwright/test";
import { totp } from "./totp";

/*
  Kostra e2e přihlášení s povinným 2FA (AS-07, C4). Napsáno, zatím neběželo (potřebuje build a třetího seedovaného
  uživatele). Test si nejdřív sám nastaví 2FA (uživatel ho po seedu nemá), pak ověří: důvěryhodné zařízení (kód se
  nevyžaduje), omezení pokusů 5 / 15 min, nastavení vzhledu a úvodní stránky po přihlášení.
  Potřebuje proměnné `E2E_2FA_EMAIL` a `E2E_2FA_PASSWORD` (globální nastavení založí třetí účet, viz ZADOSTI).
*/

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial" });

const email = process.env.E2E_2FA_EMAIL;
const password = process.env.E2E_2FA_PASSWORD;
test.skip(!email || !password, "chybí E2E_2FA_EMAIL / E2E_2FA_PASSWORD");

let secret = "";

test("první přihlášení: bez 2FA se dál nejde, po nastavení ano", async ({ page }) => {
  await page.goto("/prihlaseni");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Heslo").fill(password!);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/nastaveni\/zabezpeceni$/);
  await page.goto("/obchody");
  await expect(page).toHaveURL(/\/nastaveni\/zabezpeceni$/);

  await page.getByLabel("Pro zahájení zadejte heslo").fill(password!);
  await page.getByRole("button", { name: "Nastavit ověření" }).click();
  secret = (await page.locator("code").innerText()).trim();
  await expect(page.getByTestId("backup-codes").getByRole("listitem")).toHaveCount(10);
  await page.getByLabel("Kód z aplikace").fill(totp(secret));
  await page.getByRole("button", { name: "Potvrdit a zapnout" }).click();
  await expect(page).not.toHaveURL(/zabezpeceni/);
});

test("důvěryhodné zařízení: po zaškrtnutí se kód 30 dní nevyžaduje, správa v profilu", async ({
  page,
}) => {
  await page.goto("/prihlaseni");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Heslo").fill(password!);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/overeni$/);
  await page.getByLabel("Kód z aplikace pro ověření").fill(totp(secret, 30));
  await page.getByTestId("trust-device").click();
  await page.getByRole("button", { name: "Ověřit" }).click();
  await expect(page).not.toHaveURL(/overeni|prihlaseni/);

  await page.goto("/nastaveni/ucet");
  await expect(page.getByTestId("trusted-devices")).toContainText("Toto zařízení");

  // nové přihlášení se stejnými cookies: rovnou dovnitř, bez kódu
  await page.context().clearCookies({ name: /session_token/ });
  await page.goto("/prihlaseni");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Heslo").fill(password!);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).not.toHaveURL(/overeni|prihlaseni/);

  // zrušení důvěry: příště se kód vyžádá
  await page.goto("/nastaveni/ucet");
  await page.getByRole("button", { name: "Zrušit důvěru všude" }).click();
  await expect(page.getByTestId("trusted-devices")).toContainText("Žádné zařízení");
});

test("vzhled: úvodní stránka po přihlášení", async ({ page }) => {
  await page.goto("/prihlaseni");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Heslo").fill(password!);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await page.getByLabel("Kód z aplikace pro ověření").fill(totp(secret, -30));
  await page.getByRole("button", { name: "Ověřit" }).click();
  await page.goto("/nastaveni/vzhled");
  await page.getByRole("radio", { name: "Kompaktní" }).click();
  await page.getByRole("button", { name: "Uložit vzhled" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
});

test("šestý chybný pokus za 15 minut je zablokován", async ({ page }) => {
  await page.goto("/prihlaseni");
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("E-mail").fill(email!);
    await page.getByLabel("Heslo").fill("Špatné-heslo-12345");
    await page.getByRole("button", { name: "Přihlásit se" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "Nesprávný e-mail nebo heslo.",
    );
  }
  await page.getByLabel("Heslo").fill(password!);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Příliš mnoho");
});
