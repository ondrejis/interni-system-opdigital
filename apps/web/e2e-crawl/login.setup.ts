import { test as setup } from "@playwright/test";
import { loginOwner } from "./login";

/** Přihlásí majitele (při prvním přihlášení nastaví povinné 2FA) a uloží relaci pro ostatní testy. */
setup("přihlášení majitele", async ({ page }) => {
  const email = process.env.CRAWL_EMAIL ?? process.env.OWNER_EMAIL;
  const password = process.env.CRAWL_PASSWORD ?? process.env.OWNER_PASSWORD;
  if (!email || !password)
    throw new Error(
      "Chybí CRAWL_EMAIL/CRAWL_PASSWORD (nebo OWNER_EMAIL/OWNER_PASSWORD v .env.local).",
    );
  await loginOwner(page, email, password);
  await page.context().storageState({ path: "e2e-crawl/.auth/owner.json" });
});
