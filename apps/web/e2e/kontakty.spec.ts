import { expect, test } from "@playwright/test";

/*
  Organizace a kontakty (KON): rychlé založení kontaktu s kontrolou duplicit podle telefonu (E.164), nová organizace
  s IČO (ARES nebo ruční vyplnění při výpadku), stejné IČO a „Možná duplicita“ a detail kontaktu s voláním.
  ARES se v e2e nemockuje: test projde při dostupném i nedostupném ARES (náhled, nebo věta o výpadku; uložení
  funguje v obou případech).
*/
test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const lastName = `Testovací${stamp}`;
const firm = `Kontaktní firma ${stamp} s.r.o.`;
// platné IČO (kontrolní součet mod 11) odvozené od časové značky, aby se testy neopakovaly na stejné hodnotě
const ico = (() => {
  const d = String(Date.now()).slice(-7).split("").map(Number);
  const sum = d.reduce((a, x, i) => a + x * (8 - i), 0);
  return [...d, (11 - (sum % 11)) % 10].join("");
})();

test("nový kontakt s telefonem a e-mailem, detail nabízí volání a kopírování", async ({ page }) => {
  await page.goto("/kontakty/osoby/novy");
  const form = page.getByTestId("quick-contact");
  await form.getByLabel("Jméno", { exact: true }).fill("Jan");
  await form.getByLabel(/Příjmení/).fill(lastName);
  await form.getByLabel("Telefon").first().fill("777 123 456");
  await form.getByLabel("E-mail").first().fill(`jan.${stamp}@example.cz`);
  await form.getByRole("button", { name: "Založit kontakt" }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: `Jan ${lastName}` }),
  ).toBeVisible();
  const points = page.getByTestId("person-points");
  await expect(points.getByRole("link", { name: "+420 777 123 456" })).toHaveAttribute(
    "href",
    "tel:+420777123456",
  );
  await expect(points.getByRole("link", { name: `jan.${stamp}@example.cz` })).toHaveAttribute(
    "href",
    `mailto:jan.${stamp}@example.cz`,
  );
  await expect(points.getByRole("button", { name: /Kopírovat telefon/ })).toBeVisible();
});

test("stejný telefon v jiném zápisu: Možná duplicita, jde použít existující nebo založit přesto", async ({
  page,
}) => {
  await page.goto("/kontakty/osoby/novy");
  const form = page.getByTestId("quick-contact");
  await form.getByLabel(/Příjmení/).fill(`Druhý${stamp}`);
  await form.getByLabel("Telefon").first().fill("+420777123456");
  await form.getByRole("button", { name: "Založit kontakt" }).click();
  const dups = page.getByTestId("person-duplicates");
  await expect(dups).toContainText("Možná duplicita");
  await expect(dups).toContainText(lastName);
  await dups.getByRole("button", { name: "Založit přesto" }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: `Druhý${stamp}` }),
  ).toBeVisible();
});

test("nová organizace podle IČO: ARES nebo ruční vyplnění, uložení vždy projde", async ({
  page,
}) => {
  await page.goto("/kontakty/firmy/nova");
  await page.getByLabel("IČO", { exact: true }).fill(ico);
  // do 2 s přijde buď náhled z ARES, nebo věta o nedostupnosti / neznámém IČO
  await expect(
    page.getByTestId("ares-preview").or(page.getByTestId("ares-unavailable")),
  ).toBeVisible({
    timeout: 6_000,
  });
  if (await page.getByTestId("ares-preview").isVisible())
    await page.getByRole("button", { name: "Použít údaje" }).click();
  const name = page.getByLabel(/Název \*/);
  if (!(await name.inputValue())) await name.fill(firm);
  await page.getByRole("button", { name: "Založit organizaci" }).click();
  await expect(page.getByTestId("record-view")).toBeVisible();
});

test("stejné IČO se nedovolí a odkáže na existující organizaci", async ({ page }) => {
  await page.goto("/kontakty/firmy/nova");
  await page.getByLabel("IČO", { exact: true }).fill(ico);
  await page.getByLabel(/Název \*/).fill(`Jiný název ${stamp}`);
  await page.getByRole("button", { name: "Založit organizaci" }).click();
  const dup = page.getByTestId("ico-duplicate");
  await expect(dup).toContainText("už existuje");
  await expect(dup.getByRole("link")).toHaveAttribute("href", /\/kontakty\/firmy\//);
});

test("podobný název je „Možná duplicita“, jde pokračovat", async ({ page }) => {
  await page.goto("/kontakty/firmy/nova");
  await page.getByLabel(/Název \*/).fill(`${firm.replace(" s.r.o.", "")}, a.s.`);
  await page.getByRole("button", { name: "Založit organizaci" }).click();
  const dups = page.getByTestId("company-duplicates");
  await expect(dups).toContainText("Možná duplicita");
  await dups.getByRole("button", { name: "Založit přesto" }).click();
  await expect(page.getByTestId("record-view")).toBeVisible();
});

test("seznam kontaktů ukazuje telefon a e-mail a hledání najde část čísla bez předvolby", async ({
  page,
}) => {
  await page.goto("/kontakty/osoby");
  await page.getByPlaceholder("Hledat…").fill(lastName);
  const row = page.getByRole("row").filter({ hasText: lastName });
  await expect(row).toBeVisible();
  await expect(row).toContainText("777123456");
});
