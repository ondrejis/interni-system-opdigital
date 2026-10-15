import { expect, test as setup } from "@playwright/test";
import { totp } from "./totp";

/** Jednou přihlásí druhého majitele (včetně povinného 2FA) a uloží relaci pro ostatní testy. */
setup("přihlášení majitele pro testy aplikace", async ({ page }) => {
  const email = process.env.E2E_APP_EMAIL!;
  const password = process.env.E2E_APP_PASSWORD!;
  await page.goto("/prihlaseni");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/nastaveni\/zabezpeceni$/);
  await page.getByLabel("Pro zahájení zadejte heslo").fill(password);
  await page.getByRole("button", { name: "Nastavit ověření" }).click();
  const secret = (await page.locator("code").innerText()).trim();
  await page.getByLabel("Kód z aplikace").fill(totp(secret));
  await page.getByRole("button", { name: "Potvrdit a zapnout" }).click();
  await expect(page).toHaveURL(/\/(prehled)?$/);
  await page.context().storageState({ path: "e2e/.auth/kalendar.json" });
});
