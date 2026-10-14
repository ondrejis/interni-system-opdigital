import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs } from "./roles";

/**
 * Procházka: Nastavení → Pravidla upozornění (správce). Majitel vypne událost, přepíše text a příjemce, změní kanály,
 * uloží, po načtení ověří, že úprava zůstala, a vrátí výchozí stav. Kancelář, mistr ani montér stránku nevidí.
 * Závěr testu vždy uklidí (úprava správce je sdílené nastavení celé instance).
 */
test.describe.configure({ mode: "serial" });

const KEY = "task.assigned";
const rule = (page: Page) => page.getByTestId(`rule-${KEY}`);

test("pravidla: vypnutí události, vlastní text a příjemci, kanály, návrat výchozích", async ({
  browser,
}) => {
  const { ctx, page } = await pageAs(browser, "owner", { viewport: { width: 1280, height: 900 } });
  const c = collectErrors(page);
  try {
    await visit(page, "/nastaveni/pravidla-upozorneni", c);
    await expect(
      page.getByRole("heading", { name: "Pravidla upozornění", level: 2 }),
    ).toBeVisible();
    await expect(page.getByTestId("rules-list")).toBeVisible();
    await expect(page.getByTestId("delivery-stats")).toBeVisible();
    // katalog obsahuje události jádra i modulů
    for (const key of ["task.assigned", "invoice.overdue", "stroje.deadline", "kalendar.reminder"])
      await expect(page.getByTestId(`rule-${key}`)).toBeVisible();

    // úprava textu a kanálů
    await rule(page).getByRole("button", { name: "Upravit" }).click();
    const editor = page.getByTestId(`rule-editor-${KEY}`);
    await editor.getByLabel("Titulek", { exact: true }).fill("Nový úkol: {title}");
    await expect(page.getByTestId(`rule-preview-${KEY}`)).toContainText(
      "Nový úkol: Objednat sádrokarton",
    );
    await editor.getByRole("checkbox", { name: /^E-mail/ }).click();
    await editor.getByRole("checkbox", { name: /^Povinná událost/ }).click();
    await page.getByRole("button", { name: "Uložit pravidla" }).first().click();
    await expect(page.getByText("Pravidla upozornění jsou uložená.")).toBeVisible();
    expectClean(c, "uložení pravidel");

    await visit(page, "/nastaveni/pravidla-upozorneni", c);
    await expect(rule(page).getByText("Povinné")).toBeVisible();
    await expect(rule(page).getByText("Upraveno")).toBeVisible();
    await rule(page).getByRole("button", { name: "Upravit" }).click();
    await expect(
      page.getByTestId(`rule-editor-${KEY}`).getByLabel("Titulek", { exact: true }),
    ).toHaveValue("Nový úkol: {title}");

    // povinná událost nejde vypnout uživateli: u kanceláře je přepínač zamčený
    const office = await pageAs(browser, "office");
    await visit(office.page, "/nastaveni/upozorneni", collectErrors(office.page));
    await expect(office.page.getByTestId(`pref-${KEY}`).getByText("Povinné")).toBeVisible();
    await expect(
      office.page.getByTestId(`pref-${KEY}`).getByRole("radio", { name: "Ne", exact: true }),
    ).toBeDisabled();
    await office.ctx.close();

    // vypnutá událost zmizí z předvoleb
    await rule(page)
      .getByRole("checkbox", { name: /^Událost zapnuta/ })
      .click();
    await page.getByRole("button", { name: "Uložit pravidla" }).first().click();
    await expect(page.getByText("Pravidla upozornění jsou uložená.")).toBeVisible();
    const office2 = await pageAs(browser, "office");
    await visit(office2.page, "/nastaveni/upozorneni", collectErrors(office2.page));
    await expect(office2.page.getByTestId(`pref-${KEY}`)).toHaveCount(0);
    await office2.ctx.close();

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .exclude("nextjs-portal")
      .analyze();
    expect(axe.violations.filter((v) => ["critical", "serious"].includes(v.impact ?? ""))).toEqual(
      [],
    );
  } finally {
    // úklid: zrušit všechny úpravy události
    await visit(page, "/nastaveni/pravidla-upozorneni", c).catch(() => undefined);
    const edit = rule(page).getByRole("button", { name: "Upravit" });
    if (await edit.count()) {
      await edit.click();
      const resetAll = page.getByRole("button", { name: /Zrušit všechny úpravy této události/ });
      if (await resetAll.count()) {
        await resetAll.click();
        await page.getByRole("button", { name: "Uložit pravidla" }).first().click();
        await expect(page.getByText("Pravidla upozornění jsou uložená.")).toBeVisible();
      }
    }
    await ctx.close();
  }
});

test("stránka pravidel je jen pro správce", async ({ browser }) => {
  for (const role of ["office", "foreman1"] as const) {
    const { ctx, page } = await pageAs(browser, role);
    await page.goto("/nastaveni/pravidla-upozorneni");
    await expect(page.getByText("Stránka nenalezena").first()).toBeVisible();
    await ctx.close();
  }
});

test("mobil: pravidla se vejdou na šířku telefonu", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "owner", { mobile: true });
  const c = collectErrors(page);
  await visit(page, "/nastaveni/pravidla-upozorneni", c);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await ctx.close();
});
