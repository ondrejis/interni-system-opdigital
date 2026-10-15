import { expect, test, type Page } from "@playwright/test";
import { createCompany } from "./helpers";

/*
  Šablony e-mailů (SAB): založení šablony, editor s vloženou proměnnou a živým náhledem, „E-mail ze šablony“ z organizace
  (náhled s daty, Otevřít v Gmailu se správně zakódovanou adresou, Kopírovat, počítadlo použití, zápis aktivity).
  Gmail se v testu neotvírá (`window.open` je podvržené a zachytí adresu); z OPSYS se nic neodesílá.
*/

test.describe.configure({ mode: "serial" });
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const stamp = Math.random().toString(36).slice(2, 8);
const firm = `Žďárská stavební ${stamp} s.r.o.`;
const tpl = `Follow-up ${stamp}`;

/** Zachytí adresy, které aplikace otevírá přes `window.open` (Gmail). */
async function captureOpen(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    window.open = ((url?: string | URL) => {
      w.__opened.push(String(url));
      return null;
    }) as typeof window.open;
  });
}
const opened = (page: Page) =>
  page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

test("založení šablony a úprava textu s proměnnou a živým náhledem", async ({ page }) => {
  await page.goto("/sablony-emailu");
  await expect(page.getByRole("heading", { name: "Šablony e-mailů" })).toBeVisible();
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(tpl);
  await dialog.getByLabel(/Název/).press("ControlOrMeta+Enter");
  await expect(page.getByTestId("record-view").getByRole("heading", { name: tpl })).toBeVisible();

  await page.getByRole("tab", { name: "Text e-mailu" }).click();
  const editor = page.getByTestId("template-editor");
  await editor.getByLabel("Předmět").fill("Nabídka pro ");
  await editor.getByTestId("variable-palette").locator('[data-var="firma"]').click();
  await expect(editor.getByLabel("Předmět")).toHaveValue("Nabídka pro {firma}");

  await editor
    .getByLabel("Text e-mailu")
    .fill("Dobrý den {jmeno},\n\nposílám nabídku.\n\n{odesilatel}\n{preklep}");
  // živý náhled: bez vybraného záznamu zůstanou proměnné, překlep se hlásí
  await expect(page.getByTestId("editor-preview-subject")).toContainText("{firma}");
  await expect(page.getByTestId("editor-unknown")).toContainText("{preklep}");

  await editor
    .getByLabel("Text e-mailu")
    .fill("Dobrý den {jmeno},\n\nposílám nabídku.\n\n{odesilatel}");
  await editor.getByTestId("save-content").click();
  await expect(page.getByText("Šablona uložena.")).toBeVisible();
  await expect(editor.getByTestId("save-content")).toBeDisabled();

  // vyzkoušení na vybrané organizaci
  await createCompany(page.context(), firm);
  await editor.getByRole("button", { name: "Organizace" }).click();
  await editor.getByLabel("Hledat záznam pro náhled").fill(stamp);
  await editor.locator("[data-pick]").first().click();
  await expect(page.getByTestId("editor-preview-subject")).toContainText(firm);
  await expect(page.getByTestId("editor-missing")).toContainText("{jmeno}");
});

test("E-mail ze šablony z organizace: náhled, Gmail URL, kopie, počítadlo a zápis aktivity", async ({
  page,
}) => {
  await page.goto("/kontakty/firmy");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await page.getByRole("row").filter({ hasText: firm }).first().click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: firm })).toBeVisible();

  const open = page
    .getByRole("button", { name: "E-mail ze šablony" })
    .or(page.getByRole("menuitem", { name: "E-mail ze šablony" }));
  await open.first().click();
  const dlg = page.getByTestId("email-from-template");
  await dlg.getByLabel("Hledat šablonu").fill(stamp);
  await dlg.locator(`[data-template="${tpl}"]`).click();

  await expect(dlg.getByTestId("preview-subject")).toHaveText(`Nabídka pro ${firm}`);
  await expect(dlg.getByTestId("preview-missing")).toContainText("{jmeno}");

  await captureOpen(page);
  await dlg.getByTestId("open-gmail").click();
  const [url] = await opened(page);
  const u = new URL(url!);
  expect(u.hostname).toBe("mail.google.com");
  expect(u.searchParams.get("view")).toBe("cm");
  expect(u.searchParams.get("su")).toBe(`Nabídka pro ${firm}`);
  expect(url).toContain("%C5%BD%C4%8F%C3%A1rsk%C3%A1"); // „Žďárská“ jako UTF-8

  // po otevření v Gmailu nabídka zápisu aktivity jedním klikem
  await dlg.getByTestId("log-activity").click();
  await expect(dlg.getByTestId("log-done")).toBeVisible();

  await dlg.getByTestId("copy-body").click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("posílám nabídku.");
  await expect(dlg.getByTestId("preview-body")).toContainText("posílám nabídku.");
});

test("počítadlo použití v seznamu šablon se zvýšilo o jedno (otevření a kopie v jednom dialogu)", async ({
  page,
}) => {
  await page.goto("/sablony-emailu");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: tpl });
  await expect(row.locator('[data-attr="usageCount"]')).toHaveText("1");
});
