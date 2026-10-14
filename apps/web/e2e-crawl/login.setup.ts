import { expect, test as setup } from "@playwright/test";

/** Přihlásí vývojového majitele (2FA je v lokální databázi vypnuté) a uloží relaci pro ostatní testy. */
setup("přihlášení majitele", async ({ page }) => {
  const email = process.env.CRAWL_EMAIL ?? process.env.OWNER_EMAIL;
  const password = process.env.CRAWL_PASSWORD ?? process.env.OWNER_PASSWORD;
  if (!email || !password)
    throw new Error(
      "Chybí CRAWL_EMAIL/CRAWL_PASSWORD (nebo OWNER_EMAIL/OWNER_PASSWORD v .env.local).",
    );
  await page.goto("/prihlaseni");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.context().storageState({ path: "e2e-crawl/.auth/owner.json" });
});
