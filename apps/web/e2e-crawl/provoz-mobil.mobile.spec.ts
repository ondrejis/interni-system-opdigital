import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs } from "./roles";

/**
 * Mobil (Pixel 7): práce v terénu. Montér si zapíše docházku na zakázku z telefonu, majitel přidá fotku přes spodní
 * navigaci: fotka se v prohlížeči zmenší, bez signálu čeká ve frontě a po návratu signálu se odešle. Pod značkou `stamp`.
 */
const stamp = Math.random().toString(36).slice(2, 8);
const JOB = "Dostavba skladové haly B";

/** Velká fotka (3200 × 2400 se šumem, několik MB), vytvořená v prohlížeči, ať test nepotřebuje soubor na disku. */
async function bigJpeg(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 3200;
    c.height = 2400;
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < 30_000; i++) {
      ctx.fillStyle = `hsl(${(i * 37) % 360} ${40 + (i % 60)}% ${20 + (i % 60)}%)`;
      ctx.fillRect((i * 97) % 3200, (i * 53) % 2400, 40 + (i % 90), 40 + (i % 70));
    }
    const blob: Blob = await new Promise((r) => c.toBlob((x) => r(x!), "image/jpeg", 0.98));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000)
      s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  return Buffer.from(b64, "base64");
}

test("mobil: mistr zapíše hodiny na zakázku a píchačku ovládá velkými tlačítky", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await pageAs(browser, "foreman2", { mobile: true }); // montér má v telefonu terminál (terminal-denni-prace);
  const c = collectErrors(page);
  await visit(page, "/dochazka", c);
  // dotykové plochy píchačky mají aspoň 40 px na výšku
  const clock = page.getByTestId("clock-card");
  const btn = clock.getByRole("button", { name: /^Příchod$|Odchod/ }).first();
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  // vodorovný posun stránky
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);

  // zápis: týdenní přehled je na telefonu pod sebou, den s volným místem v minulém týdnu (sobota)
  await page.getByRole("button", { name: "Předchozí týden" }).click();
  await expect(page.getByTestId("week-days").locator("[data-date]")).toHaveCount(7);
  const sat = await page
    .getByTestId("week-days")
    .locator("[data-date]")
    .nth(5)
    .getAttribute("data-date");
  const note = `Mobil ${stamp}`;
  await page
    .locator(`[data-date="${sat}"]`)
    .getByRole("button", { name: /^Zapsat docházku/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Zapsat docházku" });
  await dialog.getByRole("button", { name: "Počet hodin" }).click();
  await dialog.getByLabel("Počet hodin").fill("2");
  // zakázka z nabídky montéra (jen ty, kde je v týmu): první možnost
  await dialog.getByRole("button", { name: /^Zakázka/ }).click();
  await page.getByRole("option").first().click();
  await dialog.getByLabel(/Poznámka/).fill(note);
  await dialog.getByRole("button", { name: "Uložit" }).click();
  const entry = page
    .locator(`[data-date="${sat}"]`)
    .getByRole("button", { name: new RegExp(note) });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("2:00");
  // úklid vlastního rozpracovaného záznamu
  await entry.click();
  await page
    .getByRole("dialog", { name: "Upravit záznam" })
    .getByRole("button", { name: /Smazat/ })
    .click();
  await expect(page.locator(`[data-date="${sat}"]`).getByText(note)).toHaveCount(0);
  expectClean(c, "mobilní docházka");
  await ctx.close();
});

test("mobil: fotka ze spodní navigace se zmenší, bez signálu čeká ve frontě a po návratu signálu se odešle", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const c = collectErrors(page);
  // odpovědi, které při výpadku signálu vznikají samy (neúspěšné požadavky), nejsou chyba aplikace
  c.ignore(/ERR_INTERNET_DISCONNECTED|Failed to fetch|Load failed/);
  await visit(page, "/", c);
  const original = await bigJpeg(page);
  expect(original.length).toBeGreaterThan(1_000_000);

  await page.getByRole("button", { name: /^Foto/ }).click();
  const dialog = page.getByRole("dialog", { name: "Přidat fotky" });
  await dialog.getByRole("button", { name: /^Zakázka/ }).click();
  await page.getByPlaceholder("Hledat…").last().fill("Dostavba");
  await page.getByRole("option", { name: new RegExp(JOB) }).click();
  const fileName = `qa2-${stamp}.jpg`;
  await dialog.getByLabel("Vybrat z galerie").setInputFiles({
    name: fileName,
    mimeType: "image/jpeg",
    buffer: original,
  });
  await expect(dialog.getByRole("img", { name: "Fotka 1" })).toBeVisible();

  // bez signálu: fotka se uloží do zařízení a čeká
  await context.setOffline(true);
  await dialog.getByRole("button", { name: /^Odeslat/ }).click();
  await expect(page.getByText("Fotka se odesílá.")).toBeVisible();
  await page.getByRole("button", { name: /^Foto/ }).click();
  await expect(page.getByTestId("upload-pending")).toContainText("Čeká na odeslání: 1");

  // signál se vrátí: fronta se vyprázdní
  await context.setOffline(false);
  await expect(page.getByTestId("upload-pending")).toHaveCount(0, { timeout: 60_000 });
  await page.keyboard.press("Escape");

  // fotka je u zakázky a je výrazně menší než originál
  await visit(page, "/zakazky", c);
  await page.getByText(JOB).first().click();
  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await visit(page, `/zakazky/${id}?tab=soubory`, c);
  const item = page.locator("li").filter({ hasText: fileName });
  await expect(item).toBeVisible();
  const sizeText =
    (await item
      .getByText(/\d+(,\d)? (kB|MB|B)$/)
      .last()
      .textContent()) ?? "";
  const kb = /MB/.test(sizeText)
    ? parseFloat(sizeText.replace(",", ".")) * 1024
    : /kB/.test(sizeText)
      ? parseFloat(sizeText.replace(",", "."))
      : 0.5;
  expect(kb, `velikost po zmenšení: ${sizeText}`).toBeLessThan((original.length / 1024) * 0.5);
  expectClean(c, "fotka");
});
