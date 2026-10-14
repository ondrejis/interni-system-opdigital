import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs } from "./roles";

/**
 * Nastavení → Nástěnky a Nastavení → Exporty: stránky se otevřou bez chyby, mají popisky a projdou kontrolou axe,
 * na telefonu (375 px) se nic neposouvá do strany, plán exportu jde založit, upravit, zastavit, odhlásit se z něj
 * (odkaz z e-mailu `?plan=`) a smazat, nastavení CSV se uloží a vrátí. Co test vytvoří, si sám uklidí.
 */
const BLOCKING = new Set(["critical", "serious"]);

async function axe(page: Page, label: string) {
  const res = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("nextjs-portal")
    .analyze();
  return res.violations
    .filter((v) => BLOCKING.has(v.impact ?? ""))
    .map(
      (v) =>
        `${label}: ${v.id} (${v.impact}) ${v.help}: ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    );
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Oddíly nastavení" });

/** Stránka se na šířku nerozjede (žádný vodorovný posuv celé stránky). */
async function noHorizontalScroll(page: Page, label: string) {
  const over = await page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll<HTMLElement>("main *, [class*='scrollbar-thin'] *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .filter(
        (el) => !el.closest(".scrollbar-none, nextjs-portal, [data-radix-popper-content-wrapper]"),
      )
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    return { scroll: doc.scrollWidth - window.innerWidth, wide };
  });
  expect(
    over.scroll,
    `${label}: stránka je širší než obrazovka (${over.wide.join(" | ")})`,
  ).toBeLessThanOrEqual(0);
}

test("obě stránky jsou v menu, otevřou se bez chyby a projdou axe", async ({ page }) => {
  const c = collectErrors(page);
  const found: string[] = [];

  await visit(page, "/nastaveni/nastenky", c);
  await expect(page.getByRole("heading", { name: "Nástěnky", exact: true })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Nástěnky" })).toBeVisible();
  await expect(page.getByText("Výchozí nástěnky podle rolí")).toBeVisible();
  await expect(
    page.getByTestId("role-defaults").or(page.getByText("V systému zatím nejsou žádné role.")),
  ).toBeVisible();
  await expect(page.getByLabel("Načítám nástěnky")).toHaveCount(0);
  found.push(...(await axe(page, "/nastaveni/nastenky")));

  await visit(page, "/nastaveni/exporty", c);
  await expect(page.getByRole("heading", { name: "Exporty", exact: true })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Exporty" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Moje exporty" })).toHaveAttribute(
    "data-state",
    "active",
  );
  // majitel vidí všechny záložky
  for (const t of ["Šablony", "Plány", "Historie všech", "Nastavení"])
    await expect(page.getByRole("tab", { name: t })).toBeVisible();
  await expect(
    page.getByTestId("my-exports").or(page.getByText("Zatím žádné exporty")),
  ).toBeVisible();
  found.push(...(await axe(page, "/nastaveni/exporty moje")));

  for (const [tab, marker] of [
    ["Šablony", page.getByTestId("export-templates").or(page.getByText("Zatím žádné šablony"))],
    ["Plány", page.getByTestId("export-schedules").or(page.getByText("Zatím žádné plány"))],
    [
      "Historie všech",
      page.getByTestId("export-history").or(page.getByText("Zatím nikdo nic neexportoval")),
    ],
    ["Nastavení", page.getByRole("radiogroup", { name: "Oddělovač CSV" })],
  ] as const) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(marker).toBeVisible();
    found.push(...(await axe(page, `/nastaveni/exporty ${tab}`)));
  }
  expect(found, "kritické a vážné nálezy přístupnosti").toEqual([]);
  expectClean(c, "nástěnky a exporty");
});

test("záložka je v adrese a po obnovení stránky zůstane", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/nastaveni/exporty?tab=sablony", c);
  await expect(page.getByRole("tab", { name: "Šablony" })).toHaveAttribute("data-state", "active");
  await page.getByRole("tab", { name: "Nastavení" }).click();
  await expect(page).toHaveURL(/tab=nastaveni/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "Nastavení" })).toHaveAttribute(
    "data-state",
    "active",
  );
  // záložka, kterou uživatel nesmí vidět, se nahradí první dostupnou
  await visit(page, "/nastaveni/exporty?tab=neexistuje", c);
  await expect(page.getByRole("tab", { name: "Moje exporty" })).toHaveAttribute(
    "data-state",
    "active",
  );
  expectClean(c, "záložky v adrese");
});

test("plán exportu: založit, upravit, zastavit, odhlásit se z odkazu a smazat", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await visit(page, "/nastaveni/exporty?tab=plany", c);
  const dialog = page.getByRole("dialog");
  const name = `Crawl plán ${Date.now().toString(36)}`;

  await expect(page.getByRole("button", { name: "Nový plán" }).first()).toBeEnabled();
  await page.getByRole("button", { name: "Nový plán" }).first().click();
  await expect(dialog.getByRole("heading", { name: "Nový plán" })).toBeVisible();

  // klientská kontrola: bez názvu a typu dat se plán neodešle
  await dialog.getByRole("button", { name: "Vytvořit plán" }).click();
  await expect(dialog.getByText("Vyplňte název plánu.")).toBeVisible();

  await dialog.getByLabel("Název plánu").fill(name);
  await dialog.getByRole("button", { name: "Typ dat" }).click();
  await page
    .getByRole("option", { name: /^Zakázky/ })
    .first()
    .click();
  await dialog.getByRole("radio", { name: "XLSX" }).click();
  await dialog.getByRole("radio", { name: "Týdně" }).click();
  await expect(dialog.getByRole("button", { name: /^Den v týdnu/ })).toBeVisible();
  await dialog.getByLabel("Čas spuštění").fill("07:00");
  // příjemce (já) je předvybraný
  await expect(
    dialog.getByRole("list", { name: "Vybraní příjemci" }).getByRole("listitem"),
  ).toHaveCount(1);
  await dialog.getByRole("button", { name: "Vytvořit plán" }).click();
  await expect(dialog).toBeHidden();

  const table = page.getByTestId("export-schedules");
  const row = table.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Každé pondělí v 7:00");
  await expect(row).toContainText("Zapnuto");
  const id = (await row.getAttribute("id"))!.replace("plan-", "");

  // úprava: měsíčně, poslední den v měsíci
  await row.getByRole("button", { name: `Akce: ${name}` }).click();
  await page.getByRole("menuitem", { name: "Upravit" }).click();
  await dialog.getByRole("radio", { name: "Měsíčně" }).click();
  await dialog.getByRole("button", { name: /^Den v měsíci/ }).click();
  await page.getByRole("option", { name: "Poslední den v měsíci" }).click();
  await dialog.getByRole("button", { name: "Uložit plán" }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText("Poslední den v měsíci v 7:00");

  // zastavení a znovuzapnutí
  await row.getByRole("button", { name: `Akce: ${name}` }).click();
  await page.getByRole("menuitem", { name: "Zastavit" }).click();
  await expect(row).toContainText("Zastaveno");
  await row.getByRole("button", { name: `Akce: ${name}` }).click();
  await page.getByRole("menuitem", { name: "Znovu zapnout" }).click();
  await expect(row).toContainText("Zapnuto");

  // odkaz z e-mailu: plán se zvýrazní a nabídne odhlášení
  await visit(page, `/nastaveni/exporty?plan=${id}`, c);
  await expect(page.getByRole("tab", { name: "Plány" })).toHaveAttribute("data-state", "active");
  await expect(page.getByText(`Plán „${name}“`)).toBeVisible();
  await page.getByRole("button", { name: "Odhlásit se z tohoto plánu" }).first().click();
  await dialog.getByRole("button", { name: "Odhlásit se", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Odhlásit se z tohoto plánu" })).toHaveCount(0);

  // neexistující plán z odkazu
  await visit(page, "/nastaveni/exporty?plan=00000000-0000-4000-8000-000000000000", c);
  await expect(page.getByText("Plán z odkazu se nenašel")).toBeVisible();

  // úklid
  await visit(page, "/nastaveni/exporty?tab=plany", c);
  const again = page.getByTestId("export-schedules").getByRole("row").filter({ hasText: name });
  await again.getByRole("button", { name: `Akce: ${name}` }).click();
  await page.getByRole("menuitem", { name: "Smazat" }).click();
  await dialog.getByRole("button", { name: "Smazat plán" }).click();
  await expect(again).toHaveCount(0);
  expectClean(c, "plán exportu");
});

test("nastavení exportů: oddělovač CSV se uloží a vrátí na výchozí", async ({ page }) => {
  const c = collectErrors(page);
  await visit(page, "/nastaveni/exporty?tab=nastaveni", c);
  const group = page.getByRole("radiogroup", { name: "Oddělovač CSV" });
  await expect(group).toBeVisible();
  await group.getByLabel(/^Čárka/).check();
  await page.getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByText("Teď se používá:")).toContainText("čárka");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(group.getByLabel(/^Čárka/)).toBeChecked();
  await group.getByLabel(/^Výchozí/).check();
  await page.getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByRole("button", { name: "Uložit" })).toBeDisabled();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(group.getByLabel(/^Výchozí/)).toBeChecked();
  expectClean(c, "nastavení exportů");
});

test("nástěnky: akce na řádku (přejmenovat, sdílet, výchozí pro roli) a zrušení", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await visit(page, "/nastaveni/nastenky", c);
  const table = page.getByTestId("boards-table");
  if (!(await table.isVisible().catch(() => false))) {
    await expect(page.getByText("Zatím žádné nástěnky")).toBeVisible();
    test.info().annotations.push({
      type: "poznámka",
      description: "V databázi nejsou žádné nástěnky, akce nejdou vyzkoušet.",
    });
    return;
  }
  const first = table.getByRole("row").nth(1);
  const label = (await first.getByRole("button", { name: /^Akce: / }).getAttribute("aria-label"))!;
  const dialog = page.getByRole("dialog");

  // přejmenování: tlačítko Uložit je vypnuté, dokud se název nezmění
  await first.getByRole("button", { name: label }).click();
  await page.getByRole("menuitem", { name: "Přejmenovat" }).click();
  await expect(dialog.getByRole("button", { name: "Uložit" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // sdílení: dialog se otevře s rolemi a hledáním uživatelů, zavře se bez uložení
  await first.getByRole("button", { name: label }).click();
  await page.getByRole("menuitem", { name: "Sdílet" }).click();
  await expect(dialog.getByRole("heading", { name: "Sdílení nástěnky" })).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Role" })).toBeVisible();
  await dialog.getByRole("button", { name: "Zrušit" }).click();
  await expect(dialog).toBeHidden();

  // výchozí pro roli
  await first.getByRole("button", { name: label }).click();
  await page.getByRole("menuitem", { name: "Nastavit jako výchozí pro roli" }).click();
  await expect(dialog.getByRole("heading", { name: "Výchozí nástěnka pro roli" })).toBeVisible();
  await dialog.getByRole("button", { name: "Zrušit" }).click();

  // smazání jen potvrzovacím dialogem, ruším
  await first.getByRole("button", { name: label }).click();
  await page.getByRole("menuitem", { name: "Smazat" }).click();
  await expect(dialog.getByRole("heading", { name: "Smazat nástěnku" })).toBeVisible();
  await dialog.getByRole("button", { name: "Zrušit" }).click();
  await expect(dialog).toBeHidden();
  expectClean(c, "akce nástěnek");
});

test("telefon 375 px: žádný vodorovný posuv stránky, tabulky se mění v karty", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const c = collectErrors(page);
  await visit(page, "/nastaveni/nastenky", c);
  await expect(page.getByLabel("Načítám nástěnky")).toHaveCount(0);
  await noHorizontalScroll(page, "nástěnky");
  for (const tab of ["moje", "sablony", "plany", "historie", "nastaveni"]) {
    await visit(page, `/nastaveni/exporty?tab=${tab}`, c);
    await expect(page.getByRole("status", { name: /^Načítám/ })).toHaveCount(0);
    await noHorizontalScroll(page, `exporty ${tab}`);
  }
  // dialog nového plánu se vejde na obrazovku
  await visit(page, "/nastaveni/exporty?tab=plany", c);
  await page.getByRole("button", { name: "Nový plán" }).first().click();
  const box = await page.getByRole("dialog").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expectClean(c, "telefon");
});

test("kancelář: Exporty má, záložky správce a Nástěnky ne", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "office", { viewport: { width: 1280, height: 800 } });
  const c = collectErrors(page);
  await visit(page, "/nastaveni/exporty", c);
  await expect(page.getByRole("tab", { name: "Moje exporty" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Šablony" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Historie všech" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Nastavení" })).toHaveCount(0);
  await expect(nav(page).getByRole("link", { name: "Exporty" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Nástěnky" })).toHaveCount(0);
  // záložka, na kterou kancelář nemá právo, se z adresy nenačte
  await page.goto("/nastaveni/exporty?tab=historie", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "Moje exporty" })).toHaveAttribute(
    "data-state",
    "active",
  );
  // Nástěnky vyžadují dashboards.manage: stránka neexistuje
  await page.goto("/nastaveni/nastenky", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Stránka nenalezena" })).toBeVisible();
  await ctx.close();
});
