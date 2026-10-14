import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const shots = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

test("role: vytvoření, matice oprávnění, uložení přežije obnovení", async ({ page }) => {
  await page.goto("/nastaveni");
  await expect(page).toHaveURL(/\/nastaveni\/firma$/); // první dostupný oddíl
  await page.getByRole("link", { name: "Role a oprávnění" }).click();

  await page.getByRole("button", { name: "Nová" }).click();
  // dialog se při pomalém vykreslení ještě překresluje (tlačítko „není stabilní“): vyplnit a potvrdit znovu, dokud to nepřejde
  await expect(async () => {
    await page.getByRole("dialog").getByLabel("Název role").fill(`Skladník ${stamp}`);
    await page.getByRole("button", { name: "Vytvořit", exact: true }).click({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.locator("#role-name")).toHaveValue(`Skladník ${stamp}`);

  const zakazkyRead = page.getByRole("radiogroup", { name: /^Vidí zakázky/ });
  await zakazkyRead.getByRole("radio", { name: "Jen moje" }).click();
  await expect(zakazkyRead.getByRole("radio", { name: "Jen moje" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: "Uložit změny" }).click();
  await expect(page.getByText("Role uložena.")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: new RegExp(`Skladník ${stamp}`) }).click();
  await expect(
    page
      .getByRole("radiogroup", { name: /^Vidí zakázky/ })
      .getByRole("radio", { name: "Jen moje" }),
  ).toHaveAttribute("aria-checked", "true");

  // systémová role (majitel) je jen ke čtení
  await page.getByRole("button", { name: /^Majitel/ }).click();
  await expect(page.locator("#role-name")).toBeDisabled();
  await shot(page, "05-roles");
});

test("uživatelé: pozvánka se zobrazí mezi čekajícími a jde zrušit", async ({ page }) => {
  const email = `pozvany-${stamp}@test.example`;
  await page.goto("/nastaveni/uzivatele");
  await expect(page.getByRole("heading", { name: "Uživatelé" })).toBeVisible();
  await page.getByRole("button", { name: "Pozvat uživatele" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("E-mail").fill(email);
  await dialog.getByRole("button", { name: "Vyberte roli…" }).click();
  await page.getByRole("option", { name: new RegExp(`Skladník ${stamp}`) }).click();
  await dialog.getByRole("button", { name: "Odeslat pozvánku" }).click();
  const pending = page.locator("main li").filter({ hasText: email });
  await expect(pending).toBeVisible();
  await shot(page, "06-users");

  await pending.getByRole("button", { name: "Zrušit" }).click();
  await expect(pending).toBeHidden();
});

test("vzhled: název systému se promítne do aplikace a vrátí zpět", async ({ page }) => {
  await page.goto("/nastaveni/firma");
  await page.getByLabel("Název systému").fill(`Moje firma ${stamp}`);
  await page.getByRole("button", { name: "Uložit vzhled" }).click();
  await expect(page.getByText("Vzhled uložen.")).toBeVisible();
  await expect(page.getByRole("link", { name: `Moje firma ${stamp}` })).toBeVisible();

  await page.getByLabel("Název systému").fill("");
  await page.getByRole("button", { name: "Uložit vzhled" }).click();
  await expect(page.getByRole("link", { name: "Demo firma s.r.o." })).toBeVisible();

  // údaje o firmě: špatné IČO se odmítne srozumitelnou hláškou
  await page.getByLabel("IČO").fill("123");
  await page.getByRole("button", { name: "Uložit údaje" }).click();
  await expect(page.getByText("IČO má 8 číslic.")).toBeVisible();
});
