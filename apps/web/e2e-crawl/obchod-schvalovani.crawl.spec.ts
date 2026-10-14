import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean } from "./helpers";
import { createCompany, createJob, newStamp, openJob } from "./obchod-helpers";
import { pageAs } from "./roles";

/**
 * Schvalování: výchozí pravidla (do 50 000 Kč schvaluje držitel `zakazky.approve`, nad tím jen `zakazky.approve_all`),
 * samoschvalování je zakázané, fronta „Ke schválení“, zamítnutí vyžaduje důvod, schválený doklad je zamčený.
 * Žadatelem je demo uživatel „Kancelář“ (limit 50 000 Kč), schvaluje majitel.
 */
test.describe.configure({ mode: "serial" });

const stamp = newStamp();
const company = `Schvalování firma ${stamp} s.r.o.`;
const job = `Schvalování zakázka ${stamp}`;

/** V editoru změny doplní jednu novou položku (1 ks za `price` Kč) a změnu odešle ke schválení. */
async function submitChange(page: Page, title: string, price: string) {
  const view = page.getByTestId("record-view");
  await view.getByRole("tab", { name: "Změny", exact: true }).click();
  await view.getByRole("button", { name: "Nová změna" }).click();
  const editor = view.getByTestId("change-editor");
  await editor.getByLabel("Název změny").fill(title);
  await editor.getByLabel("Název změny").blur();
  await editor.getByRole("button", { name: "Nová položka" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Název nové položky").fill(`Položka ${title}`);
  await dlg.getByLabel("Množství", { exact: true }).fill("1");
  await dlg.getByLabel("Prodejní cena za jednotku").fill(price);
  await dlg.getByRole("button", { name: "Přidat řádek" }).click();
  await expect(editor.getByTestId("change-lines")).toContainText(`Položka ${title}`);
  await editor.getByRole("button", { name: "Odeslat ke schválení" }).click();
  await expect(editor.getByTestId("approval-panel")).toContainText("Čeká na schválení");
  return editor;
}

test("příprava: majitel založí zakázku v realizaci a určí Kancelář jako odpovědnou", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await createCompany(page, company);
  const view = await createJob(page, { title: job, company, phase: "Realizace", value: "100 000" });
  const panel = view.getByTestId("attributes-panel");
  await panel.getByRole("button", { name: /Zobrazit prázdná pole/ }).click();
  await panel.getByRole("button", { name: "Upravit Odpovědný" }).click();
  await page.getByRole("option", { name: "Lucie Marešová" }).click();
  await expect(panel.getByRole("button", { name: "Upravit Odpovědný" })).toContainText(
    "Lucie Marešová",
  );
  expectClean(c, "příprava schvalování");
});

test("kancelář: změna nad limitem 50 000 Kč čeká na majitele a kancelář ji schválit nesmí", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await pageAs(browser, "office");
  try {
    const c = collectErrors(page);
    const view = await openJob(page, stamp);
    const editor = await submitChange(page, "Velká změna", "60 000");
    // vlastní doklad nad limitem: žádné tlačítko Schválit
    await expect(editor.getByRole("button", { name: "Schválit", exact: true })).toHaveCount(0);
    await expect(view.getByTestId("kpi-contract")).toContainText("100 000 Kč"); // zatím neschváleno
    expectClean(c, "kancelář: velká změna");
  } finally {
    await ctx.close();
  }
});

test("kancelář: vlastní změna pod limitem čeká na jiného schvalovatele (samoschvalování zakázáno)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await pageAs(browser, "office");
  try {
    const c = collectErrors(page);
    await openJob(page, stamp);
    const editor = await submitChange(page, "Malá změna", "10 000");
    await expect(editor.getByRole("button", { name: "Schválit", exact: true })).toHaveCount(0);
    // fronta Ke schválení: vlastní žádosti kancelář vidí, ale rozhodnout o nich nemůže
    await page.goto("/zakazky/schvalovani");
    const item = page
      .getByTestId("approval-item")
      .filter({ hasText: "Malá změna" })
      .filter({ hasText: stamp });
    await expect(item).toBeVisible();
    await expect(item.getByRole("button", { name: "Schválit" })).toHaveCount(0);
    expectClean(c, "kancelář: malá změna");
  } finally {
    await ctx.close();
  }
});

test("majitel: ve frontě rozhodne o obou; zamítnutí vyžaduje důvod, schválení promítne částku do smluvní ceny", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  await page.goto("/zakazky/schvalovani");
  const big = page
    .getByTestId("approval-item")
    .filter({ hasText: "Velká změna" })
    .filter({ hasText: stamp });
  const small = page
    .getByTestId("approval-item")
    .filter({ hasText: "Malá změna" })
    .filter({ hasText: stamp });
  await expect(big).toContainText("60 000 Kč");
  await expect(small).toContainText("10 000 Kč");

  // zamítnutí bez důvodu nejde
  await small.getByRole("button", { name: "Zamítnout" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Zamítnout" }).click();
  await expect(page.getByRole("dialog")).toContainText("Napište důvod zamítnutí");
  await page.getByLabel("Důvod zamítnutí").fill("Zatím ne");
  await page.getByRole("dialog").getByRole("button", { name: "Zamítnout" }).click();
  await expect(small).toBeHidden();

  // velkou změnu schválí majitel (bez limitu)
  await big.getByRole("button", { name: "Schválit" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Schválit" }).click();
  await expect(big).toBeHidden();
  // vyřízené: obě rozhodnutí jsou v historii s výsledkem
  await page.getByRole("radio", { name: "Vyřízené" }).click();
  const done = page.getByTestId("approval-item");
  await expect(done.filter({ hasText: "Velká změna" }).filter({ hasText: stamp })).toContainText(
    /Schváleno/,
  );
  await expect(done.filter({ hasText: "Malá změna" }).filter({ hasText: stamp })).toContainText(
    /Zamítnuto/,
  );
  expectClean(c, "majitel rozhoduje");

  const view = await openJob(page, stamp);
  await expect(view.getByTestId("kpi-contract")).toContainText("160 000 Kč"); // 100 000 + 60 000
  await view.getByRole("tab", { name: "Změny", exact: true }).click();
  const list = view.getByTestId("changes-list");
  await expect(list).toContainText("Velká změna");
  await expect(list).toContainText("Schváleno");
  await expect(list).toContainText("Zamítnuto");
  // schválená změna je zamčená (nejde ji upravit, jen vrátit do konceptu)
  await view.getByRole("button", { name: /Velká změna/ }).click();
  const editor = view.getByTestId("change-editor");
  await expect(editor.getByTestId("approval-panel")).toContainText("Schváleno a zamčeno");
  await expect(editor.getByLabel("Název změny")).not.toBeEditable();
  await expect(editor.getByRole("button", { name: "Odeslat ke schválení" })).toBeHidden();
  expectClean(c, "schválená změna");
});

test("kancelář: schválená změna je zamčená a kancelář ji nemůže upravit", async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page } = await pageAs(browser, "office");
  try {
    const c = collectErrors(page);
    const view = await openJob(page, stamp);
    await view.getByRole("tab", { name: "Změny", exact: true }).click();
    await view.getByRole("button", { name: /Velká změna/ }).click();
    const editor = view.getByTestId("change-editor");
    await expect(editor.getByTestId("approval-panel")).toContainText("Schváleno a zamčeno");
    await expect(editor.getByLabel("Název změny")).not.toBeEditable();
    expectClean(c, "kancelář: zamčená změna");
  } finally {
    await ctx.close();
  }
});
