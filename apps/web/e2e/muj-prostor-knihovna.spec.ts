import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);

/*
  MPR-2: e-mailová knihovna (zakládání, hledání bez diakritiky, náhled, kopírování, Gmail) a přehled Soukromé (nová
  soukromá poznámka). Napsáno podle struktury UI; vyžaduje klienta `opsys` a přihlášeného vlastníka.
*/

test("nová položka knihovny, hledání bez diakritiky a náhled s proměnnými", async ({ page }) => {
  await page.goto("/muj-prostor/knihovna");
  await expect(page.getByTestId("library-page")).toBeVisible();
  await page.getByTestId("library-new").click();
  await page.getByTestId("edit-title").fill(`Žádost o podklady ${stamp}`);
  await page.getByTestId("edit-category").fill("Onboarding");
  await page.getByTestId("edit-subject").fill("Potřebujeme podklady pro {firma}");
  await page.getByTestId("edit-body").fill("Dobrý den {jmeno},\nposílejte prosím loga.");
  await page.getByTestId("var-odesilatel").click();
  await expect(page.getByTestId("edit-body")).toHaveValue(/\{odesilatel\}$/);
  await page.getByTestId("edit-save").click();

  await expect(page.getByTestId("detail-title")).toHaveText(`Žádost o podklady ${stamp}`);
  // bez vybraného kontaktu zůstanou proměnné jako zástupné symboly
  await expect(page.getByTestId("preview-body")).toContainText("{jmeno}");
  await expect(page.getByTestId("preview-subject")).toContainText("{firma}");

  // hledání bez diakritiky a velikosti písmen, i v textu
  await page.getByTestId("library-search").fill(`ZADOST ${stamp}`);
  await expect(page.getByTestId("library-row")).toHaveCount(1);
  await page.getByTestId("library-search").fill("posilejte LOGA");
  await expect(
    page.getByTestId("library-row").filter({ hasText: `Žádost o podklady ${stamp}` }),
  ).toHaveCount(1);
  await page.getByTestId("library-search").fill(`nic-takoveho-${stamp}`);
  await expect(page.getByTestId("library-row")).toHaveCount(0);
});

test("kopírování a otevření v Gmailu", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/muj-prostor/knihovna");
  await page.getByTestId("library-search").fill(stamp);
  await page.getByTestId("library-row").first().click();
  await page.getByTestId("copy-body").click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("Dobrý den {jmeno},");
  const popup = page.waitForEvent("popup");
  await page.getByTestId("open-gmail").click();
  expect((await popup).url()).toContain("mail.google.com/mail/");
});

test("duplikace a smazání položky", async ({ page }) => {
  await page.goto("/muj-prostor/knihovna");
  await page.getByTestId("library-search").fill(stamp);
  await page.getByTestId("library-row").first().click();
  await page.getByTestId("action-copy").click();
  await expect(page.getByTestId("edit-title")).toHaveValue(`Žádost o podklady ${stamp} (kopie)`);
  await page.getByTestId("edit-save").click();
  await expect(page.getByTestId("detail-title")).toHaveText(`Žádost o podklady ${stamp} (kopie)`);
  await page.getByTestId("action-delete").click();
  await page.getByRole("button", { name: "Smazat", exact: true }).last().click();
  await page.getByTestId("library-search").fill(stamp);
  await expect(page.getByTestId("library-row")).toHaveCount(1);
});

test("Soukromé: nová soukromá poznámka se objeví v přehledu", async ({ page }) => {
  await page.goto("/muj-prostor/soukrome");
  await expect(page.getByTestId("private-page")).toBeVisible();
  const create = page.getByTestId("new-private-note");
  test.skip(!(await create.isVisible()), "Modul poznámek není zapnutý.");
  await create.click();
  await page.getByTestId("note-title").fill(`Soukromá ${stamp}`);
  await page.getByTestId("note-text").fill("Jen pro mě.");
  await page.getByTestId("note-save").click();
  await page.goto("/muj-prostor/soukrome");
  const group = page.getByTestId("private-group").filter({ has: page.getByText("Poznámky") });
  await expect(
    group.getByTestId("private-row").filter({ hasText: `Soukromá ${stamp}` }),
  ).toBeVisible();
});
