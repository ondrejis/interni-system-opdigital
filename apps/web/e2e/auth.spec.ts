import { expect, test } from "@playwright/test";
import { totp } from "./totp";

// tyto testy běží nepřihlášené
test.use({ storageState: { cookies: [], origins: [] } });

test.describe.configure({ mode: "serial" });

test("přihlášení majitele s povinným 2FA: nastavení, odhlášení, nové přihlášení kódem", async ({
  page,
}) => {
  const email = process.env.E2E_EMAIL!;
  const password = process.env.E2E_PASSWORD!;

  // špatné heslo
  await page.goto("/prihlaseni");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill("špatné-heslo-12345");
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Nesprávný e-mail nebo heslo.");

  // správné heslo → role vyžaduje 2FA, ostatní části systému jsou zavřené
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/nastaveni\/zabezpeceni$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/nastaveni\/zabezpeceni$/);

  // nastavení 2FA: heslo → QR a záložní kódy → potvrzení kódem
  await page.getByLabel("Pro zahájení zadejte heslo").fill(password);
  await page.getByRole("button", { name: "Nastavit ověření" }).click();
  const secret = (await page.locator("code").innerText()).trim();
  await expect(page.getByTestId("backup-codes")).not.toBeEmpty();
  await page.getByLabel("Kód z aplikace").fill("000000");
  await page.getByRole("button", { name: "Potvrdit a zapnout" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Kód není správný");
  await page.getByLabel("Kód z aplikace").fill(totp(secret));
  await page.getByRole("button", { name: "Potvrdit a zapnout" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("whoami")).toContainText("E2E Majitel");
  await expect(page.getByTestId("modules").getByRole("listitem").first()).toBeVisible();

  // odhlášení a nové přihlášení: heslo samo nestačí
  await page.getByRole("button", { name: /E2E Majitel/ }).click();
  await page.getByRole("menuitem", { name: "Odhlásit se" }).click();
  await expect(page).toHaveURL(/\/prihlaseni$/);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/overeni$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/overeni$|\/prihlaseni$/); // bez druhého faktoru se dovnitř nedostane

  await page.goto("/overeni");
  await page.getByLabel("Kód z aplikace pro ověření").fill("123456");
  await page.getByRole("button", { name: "Ověřit" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Kód není správný");
  await page.getByLabel("Kód z aplikace pro ověření").fill(totp(secret, 30)); // kód dalšího okna (jednou použitý kód z minulého kroku se neopakuje)
  await page.getByRole("button", { name: "Ověřit" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("whoami")).toContainText("E2E Majitel");
});
