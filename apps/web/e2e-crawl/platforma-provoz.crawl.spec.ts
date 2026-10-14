import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs, type Role } from "./roles";

/**
 * Procházka: platforma. Přehled podle role, Inbox (upozornění, označit přečtené), Moje úkoly, Cmd+K (hledání bez diakritiky,
 * akce, nedávné), klávesové zkratky, Nastavení (Firma a vzhled jen náhled, e-maily bez SMTP, push bez VAPID, Zabezpečení,
 * Schvalování, Uživatelé) a role a oprávnění (vytvoření, matice, smazání). Nic z konfigurace firmy se neukládá.
 */
const stamp = Math.random().toString(36).slice(2, 8);

test.describe.configure({ mode: "serial" });

test("Přehled: každá role vidí svoje karty bez chyby", async ({ browser }) => {
  test.setTimeout(240_000);
  const roles: [Role, RegExp][] = [
    ["owner", /Vyžaduje pozornost/i],
    ["office", /Vyžaduje pozornost|Dobrý den/i],
    ["foreman1", /Dobrý den|Docházka/i],
    ["worker1", /Dobrý den|Docházka/i],
  ];
  for (const [role, text] of roles) {
    const { ctx, page } = await pageAs(browser, role);
    const c = collectErrors(page);
    await visit(page, "/", c);
    await expect(page.locator("main")).toContainText(text);
    // žádná dlaždice nevede na zakázanou stránku: každý odkaz z Přehledu se otevře
    const hrefs = await page
      .locator("main a[href^='/']")
      .evaluateAll((as) => [
        ...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!)),
      ]);
    for (const h of hrefs.filter((x) => !x.startsWith("/api") && !x.includes("#")).slice(0, 8))
      await visit(page, h, c);
    expectClean(c, `přehled ${role}`);
    await ctx.close();
  }
});

test("úkoly a Inbox: přidělený úkol přijde kolegovi jako upozornění, označení přečtených, splnění úkolu", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const owner = await pageAs(browser, "owner");
  const office = await pageAs(browser, "office");
  const co = collectErrors(owner.page);
  const cf = collectErrors(office.page);
  const mine = `Úkol pro sebe ${stamp}`;
  const theirs = `Úkol pro kancelář ${stamp}`;

  // majitel zadá dva úkoly na zakázku: sobě a kolegyni
  await visit(owner.page, "/zakazky", co);
  await owner.page.getByPlaceholder("Hledat…").fill("pekárny");
  const row = owner.page.getByRole("row").filter({ hasText: "Rekonstrukce provozu pekárny" });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  await owner.page.getByRole("tab", { name: /Úkoly/ }).click();
  await owner.page.getByLabel("Nový úkol").fill(mine);
  await owner.page.getByRole("button", { name: "Přidat", exact: true }).click();
  await expect(owner.page.getByText(mine)).toBeVisible();
  await owner.page.getByLabel("Nový úkol").fill(theirs);
  await owner.page.getByRole("button", { name: "Přidělit sobě" }).click();
  await owner.page.getByPlaceholder("Hledat…").last().fill("Marešová");
  await owner.page.getByRole("option", { name: /Lucie Marešová/ }).click();
  await owner.page.getByRole("button", { name: "Přidat", exact: true }).click();
  await expect(owner.page.getByText(theirs)).toBeVisible();

  // moje úkoly majitele: vidí jen vlastní, splnění ho odebere ze seznamu
  await visit(owner.page, "/ukoly", co);
  await expect(owner.page.getByText(mine)).toBeVisible();
  await expect(owner.page.getByText(theirs)).toHaveCount(0);
  await owner.page.getByRole("checkbox", { name: `Hotovo: ${mine}` }).click();
  await expect(owner.page.getByText(mine)).toHaveCount(0);

  // kolegyně: úkol v Moje úkoly, upozornění v Inboxu, odznak v menu
  await visit(office.page, "/inbox", cf);
  await expect(office.page.getByText(theirs).first()).toBeVisible();
  const unread = office.page.getByLabel("Nepřečteno");
  expect(await unread.count()).toBeGreaterThan(0);
  await office.page.getByRole("button", { name: "Označit vše jako přečtené" }).click();
  await expect(office.page.getByLabel("Nepřečteno")).toHaveCount(0);
  await office.page.reload();
  await expect(office.page.getByLabel("Nepřečteno")).toHaveCount(0);
  await expect(office.page.getByText(theirs).first()).toBeVisible(); // přečtené zůstává v seznamu
  await visit(office.page, "/ukoly", cf);
  await expect(office.page.getByText(theirs)).toBeVisible();
  await office.page.getByRole("checkbox", { name: `Hotovo: ${theirs}` }).click();
  await expect(office.page.getByText(theirs)).toHaveCount(0);

  expectClean(co, "majitel");
  expectClean(cf, "kancelář");
  await owner.ctx.close();
  await office.ctx.close();
});

async function palette(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  return page.getByPlaceholder(/Hledat zakázky/);
}

test("Cmd+K: hledání bez diakritiky, akce, nedávné; klávesové zkratky", async ({ page }) => {
  test.setTimeout(120_000);
  const c = collectErrors(page);
  await visit(page, "/", c);

  // „pekarny“ najde „pekárny“, výsledek se otevře
  let input = await palette(page);
  await input.fill("rekonstrukce provozu pekarny");
  await page
    .getByRole("option", { name: /Rekonstrukce provozu pekárny/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}/);

  // prázdné hledání: nedávné obsahuje právě otevřený záznam
  input = await palette(page);
  await expect(page.getByRole("option", { name: /pekárny/ }).first()).toBeVisible();
  // příkaz: napsat „inbox“ nabídne přechod, Enter ho provede
  await input.fill("inbox");
  await page.getByRole("option", { name: /Inbox/ }).first().click();
  await expect(page).toHaveURL(/\/inbox$/);
  // nesmyslný dotaz: srozumitelný prázdný stav, Escape zavře paletu
  input = await palette(page);
  await input.fill("zzzqqqxxx neexistuje");
  await expect(page.getByText(/Nic nenalezeno|Nic jsme nenašli/i).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();

  // zkratky: ? ukáže přehled, g i / g u přejdou, c otevře nový záznam, / hledá v seznamu
  await page.keyboard.press("?");
  const help = page.getByRole("dialog", { name: "Klávesové zkratky" });
  await expect(help).toBeVisible();
  await expect(help).toContainText("Přejít do Inboxu");
  await page.keyboard.press("Escape");
  await page.keyboard.press("g");
  await page.keyboard.press("u");
  await expect(page).toHaveURL(/\/ukoly$/);
  await page.keyboard.press("g");
  await page.keyboard.press("i");
  await expect(page).toHaveURL(/\/inbox$/);
  await visit(page, "/kontakty/firmy", c);
  await page.keyboard.press("c");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("/");
  await expect(page.getByPlaceholder("Hledat…").first()).toBeFocused();
  // psaní do pole zkratky nespouští
  await page.keyboard.type("gu");
  await expect(page).toHaveURL(/\/kontakty\/firmy/);
  expectClean(c, "paleta a zkratky");
});

test("Nastavení: firma (jen náhled), e-maily bez SMTP, push (s klíči VAPID i bez), zabezpečení, schvalování, uživatelé", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);

  await visit(page, "/nastaveni/firma", c);
  await expect(page.getByRole("heading", { name: "Firma a vzhled" })).toBeVisible();
  // náhled vzhledu reaguje na rozepsaný název, nic se neukládá
  const name = page.getByLabel("Název systému");
  const before = await name.inputValue();
  await name.fill(`Náhled ${stamp}`);
  await expect(page.getByText(`Náhled ${stamp}`).first()).toBeVisible();
  await name.fill(before);
  // špatná barva se odmítne
  await page
    .getByLabel(/^Barva/)
    .first()
    .fill("červená");
  await expect(page.getByText(/#RRGGBB/).first()).toBeVisible();
  await page.reload();

  await visit(page, "/nastaveni/email", c);
  await expect(page.getByRole("heading", { name: "Odesílání (SMTP)" })).toBeVisible();
  // bez nastaveného serveru nejde spojení ověřit ani poslat zkušební e-mail: tlačítka jsou vypnutá, ne chybová
  await expect(page.getByRole("button", { name: "Ověřit spojení" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Poslat zkušební e-mail" })).toBeDisabled();

  await visit(page, "/nastaveni/upozorneni", c);
  // bez klíčů VAPID stránka říká, že push není zapnutý; s klíči (compose v CI, `pnpm check:fresh:push`) ukáže zařízení
  const pushOff = page.getByTestId("push-disabled");
  const pushOn = page.getByRole("heading", { name: "Upozornění v tomto zařízení" });
  await expect(pushOff.or(pushOn)).toBeVisible();
  if (await pushOff.isVisible())
    await expect(page.locator("main")).toContainText(
      "Push upozornění tento systém zatím nemá zapnutá",
    );

  await visit(page, "/nastaveni/zabezpeceni", c);
  await expect(page.getByLabel("Pro zahájení zadejte heslo")).toBeVisible();
  // špatné heslo: srozumitelná hláška
  c.ignore(/status of (400|401)/);
  await page.getByLabel("Pro zahájení zadejte heslo").fill("špatné-heslo-12345");
  await page.getByRole("button", { name: "Nastavit ověření" }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();

  await visit(page, "/nastaveni/schvalovani", c);
  await expect(page.getByRole("heading", { name: "Schvalování" })).toBeVisible();
  await expect(page.locator("main")).toContainText("Změny (vícepráce a méněpráce)");

  await visit(page, "/nastaveni/uzivatele", c);
  await expect(page.getByRole("heading", { name: "Uživatelé" })).toBeVisible();
  await expect(page.locator("main")).toContainText("Tomáš Veselý");
  expectClean(c, "nastavení");
});

test("role a oprávnění: vytvoření, matice, uložení přežije obnovení, smazání", async ({ page }) => {
  test.setTimeout(180_000);
  const c = collectErrors(page);
  const role = `QA role ${stamp}`;
  await visit(page, "/nastaveni/role", c);
  await page.getByRole("button", { name: "Nová" }).click();
  await expect(async () => {
    await page.getByRole("dialog").getByLabel("Název role").fill(role);
    await page.getByRole("button", { name: "Vytvořit", exact: true }).click({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.locator("#role-name")).toHaveValue(role);

  // matice oprávnění: rozsah „Jen moje“ u zakázek a uložení
  const zakazky = page.getByRole("radiogroup", { name: /^Vidí zakázky/ });
  await zakazky.getByRole("radio", { name: "Jen moje" }).click();
  await expect(zakazky.getByRole("radio", { name: "Jen moje" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: "Uložit změny" }).click();
  await expect(page.getByText("Role uložena.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: new RegExp(role) }).click();
  await expect(
    page
      .getByRole("radiogroup", { name: /^Vidí zakázky/ })
      .getByRole("radio", { name: "Jen moje" }),
  ).toHaveAttribute("aria-checked", "true");

  // systémová role majitele je jen ke čtení
  await page.getByRole("button", { name: /^Majitel/ }).click();
  await expect(page.locator("#role-name")).toBeDisabled();

  // smazání vlastní role s potvrzením
  await page.getByRole("button", { name: new RegExp(role) }).click();
  await page.getByRole("button", { name: "Smazat roli" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat roli" }).click();
  await expect(page.getByRole("button", { name: new RegExp(role) })).toHaveCount(0);
  expectClean(c, "role");
});
