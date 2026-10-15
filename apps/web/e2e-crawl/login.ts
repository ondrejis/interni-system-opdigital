import { expect, type Page } from "@playwright/test";
import { totp } from "../e2e/totp";

/**
 * Přihlásí uživatele. 2FA je v OPSYS povinné pro všechny, takže se při prvním přihlášení nastaví (QR kód se přeskočí,
 * přečte se tajemství a zadá kód); uživatel, který už 2FA má, se přes tuto funkci nepřihlásí (tajemství nezná).
 */
export async function loginOwner(page: Page, email: string, password: string) {
  await page.goto("/prihlaseni");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await page.waitForURL(/\/(prehled|nastaveni\/zabezpeceni)$/);
  if (page.url().endsWith("/nastaveni/zabezpeceni")) {
    await page.getByLabel("Pro zahájení zadejte heslo").fill(password);
    await page.getByRole("button", { name: "Nastavit ověření" }).click();
    const secret = (await page.locator("code").innerText()).trim();
    await page.getByLabel("Kód z aplikace").fill(totp(secret));
    await page.getByRole("button", { name: "Potvrdit a zapnout" }).click();
  }
  await expect(page).toHaveURL(/\/prehled$/);
}
