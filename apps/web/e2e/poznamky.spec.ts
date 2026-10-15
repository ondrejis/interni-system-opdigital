import { expect, test, type Page } from "@playwright/test";

/*
  Poznámky (UKO-N): editor Tiptap s autosavem 800 ms, připnutí, záložka u klienta, hledání, samostatné poznámky
  a konflikt dvou oken. Každý běh si založí vlastní firmu a texty (razítko), takže nezávisí na datech z dřívějška.
*/
test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const company = `Poznámková firma ${stamp} s.r.o.`;

const editor = (page: Page) => page.getByTestId("note-editor").last();
const status = (page: Page) => page.getByTestId("note-save-status").last();

/** Napíše text do editoru a počká, až autosave ohlásí „Uloženo“. */
async function write(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.type(text);
  await expect(status(page)).toHaveText("Uloženo", { timeout: 10_000 });
}

test("poznámka u klienta: psaní se samo uloží, přežije obnovení a jde upravit", async ({ page }) => {
  await page.goto("/kontakty/firmy");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(company);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: company })).toBeVisible();

  await page.getByRole("tab", { name: "Poznámky" }).click();
  await page.getByTestId("note-new").click();
  await expect(page.getByTestId("note-toolbar")).toBeVisible();
  // změna se uloží sama po 800 ms klidu, bez tlačítka Uložit
  await editor(page).click();
  await page.keyboard.type(`Úvodní schůzka ${stamp}`);
  await expect(status(page)).toHaveText(/Neuloženo|Ukládám|Uloženo/);
  await expect(status(page)).toHaveText("Uloženo", { timeout: 10_000 });
  await page.getByRole("button", { name: "Hotovo" }).click();
  const card = page.getByTestId("note-card").filter({ hasText: `Úvodní schůzka ${stamp}` });
  await expect(card).toBeVisible();

  // po obnovení stránky je poznámka na místě
  await page.reload();
  await page.getByRole("tab", { name: "Poznámky" }).click();
  await expect(page.getByTestId("note-card").filter({ hasText: `Úvodní schůzka ${stamp}` })).toBeVisible();

  // úprava: dopsaný text se uloží taky
  await page.getByRole("button", { name: "Upravit poznámku" }).click();
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" doplněno");
  await expect(status(page)).toHaveText("Uloženo", { timeout: 10_000 });
  await page.getByRole("button", { name: "Hotovo" }).click();
  await expect(page.getByTestId("note-card").first()).toContainText("doplněno");
});

test("formátování: nadpis, seznam a checklist se zachovají; nebezpečný text se jen zobrazí", async ({
  page,
}) => {
  const alerts: string[] = [];
  page.on("dialog", (d) => {
    alerts.push(d.message());
    void d.dismiss();
  });
  await page.goto("/poznamky/samostatne?nova=1");
  await editor(page).click();
  await page.getByRole("button", { name: "Nadpis 2" }).click();
  await page.keyboard.type(`Nadpis ${stamp}`);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Checklist" }).click();
  await page.keyboard.type("první úkol");
  await page.keyboard.press("Enter");
  await page.keyboard.type("druhý úkol");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("<img src=x onerror=alert(1)>");
  await expect(status(page)).toHaveText("Uloženo", { timeout: 10_000 });
  await page.getByRole("button", { name: "Hotovo" }).click();

  const card = page.getByTestId("note-card").filter({ hasText: `Nadpis ${stamp}` });
  await expect(card.locator("h2")).toHaveText(`Nadpis ${stamp}`);
  await expect(card.locator('ul[data-type="taskList"] li')).toHaveCount(2);
  // nebezpečný text je vidět jako text a nic se nespustilo ani nevykreslilo
  await expect(card).toContainText("<img src=x onerror=alert(1)>");
  await expect(card.locator("img")).toHaveCount(0);
  expect(alerts).toEqual([]);
});

test("připnutá poznámka je nahoře a hledání najde text bez diakritiky", async ({ page }) => {
  await page.goto("/poznamky/samostatne?nova=1");
  await write(page, `Žlutá ${stamp} starší`);
  await page.getByRole("button", { name: "Hotovo" }).click();
  await page.getByRole("button", { name: "Nová poznámka" }).click();
  await write(page, `Zelená ${stamp} novější`);
  await page.getByRole("button", { name: "Hotovo" }).click();

  const cards = page.getByTestId("note-card").filter({ hasText: stamp });
  await expect(cards.first()).toContainText("Zelená");
  await cards.filter({ hasText: "Žlutá" }).getByRole("button", { name: /Připnout/ }).click();
  await expect(cards.first()).toContainText("Žlutá");
  await expect(cards.first()).toHaveAttribute("data-pinned", "true");

  await page.getByLabel("Hledat v poznámkách").fill(`zluta ${stamp}`);
  await expect(page.getByTestId("note-card")).toHaveCount(1);
  await expect(page.getByTestId("note-card")).toContainText("Žlutá");
});

test("Cmd+K najde poznámku podle textu", async ({ page }) => {
  await page.goto("/prehled");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder(/Hledat|Najít/).first().fill(`zluta ${stamp}`);
  await expect(page.getByRole("dialog").getByText(/Žlutá/).first()).toBeVisible({ timeout: 10_000 });
});

test("dvě okna: starší okno nepřepíše novější text mlčky, nabídne rozhodnutí", async ({ browser, page }) => {
  await page.goto("/poznamky/samostatne?nova=1");
  await write(page, `Souběh ${stamp} základ`);
  await page.getByRole("button", { name: "Hotovo" }).click();

  const a = page;
  const b = await (await browser.newContext({ storageState: "e2e/.auth/user.json" })).newPage();
  for (const p of [a, b]) {
    await p.goto("/poznamky/samostatne");
    await p
      .getByTestId("note-card")
      .filter({ hasText: `Souběh ${stamp}` })
      .getByRole("button", { name: "Upravit poznámku" })
      .click();
  }
  await a.getByTestId("note-editor").click();
  await a.keyboard.press("ControlOrMeta+End");
  await a.keyboard.type(" z okna A");
  await expect(a.getByTestId("note-save-status")).toHaveText("Uloženo", { timeout: 10_000 });

  await b.getByTestId("note-editor").click();
  await b.keyboard.press("ControlOrMeta+End");
  await b.keyboard.type(" z okna B");
  await expect(b.getByTestId("note-conflict")).toBeVisible({ timeout: 10_000 });
  await b.getByRole("button", { name: "Načíst jejich verzi" }).click();
  await expect(b.getByTestId("note-editor")).toContainText("z okna A");
  await expect(b.getByTestId("note-editor")).not.toContainText("z okna B");
  await b.context().close();
});
