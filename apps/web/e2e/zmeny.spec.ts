import { expect, test } from "@playwright/test";
import { pickCompany } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const job = `Změny ${stamp}`;

test("změna (ZBV): koncept, řádek s náhledem dopadu, odeslání a schválení ve frontě", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(job);
  await pickCompany(page, dialog);
  await dialog.getByRole("button", { name: "Poptávka" }).click();
  await page.getByRole("option", { name: "Realizace" }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name: job })).toBeVisible();

  await view.getByRole("tab", { name: "Změny" }).click();
  await expect(view.getByText("Zatím žádné změny")).toBeVisible();
  await view.getByRole("button", { name: "Nová změna" }).click();
  const editor = view.getByTestId("change-editor");
  await editor.getByLabel("Název změny").fill("Dodatečné rozvody");
  await editor.getByLabel("Důvod změny").fill("Požadavek investora");
  await editor.getByLabel("Důvod změny").blur();

  // náhled dopadu před uložením řádku
  await editor.getByRole("button", { name: "Nová položka" }).click();
  const line = page.getByRole("dialog");
  await line.getByLabel("Název nové položky").fill("Kabeláž");
  await line.getByLabel("Množství").fill("4");
  await line.getByLabel("Prodejní cena za jednotku").fill("1 500");
  await line.getByLabel("Nákladová cena za jednotku").fill("1 000");
  await expect(line.getByTestId("line-preview")).toContainText("6 000 Kč");
  await line.getByRole("button", { name: "Přidat řádek" }).click();
  await expect(editor.getByTestId("change-lines")).toContainText("Kabeláž");
  await expect(editor.getByTestId("change-impact")).toContainText("+6 000 Kč");

  // druhý řádek a jeho odebrání
  await editor.getByRole("button", { name: "Nová položka" }).click();
  await page.getByRole("dialog").getByLabel("Název nové položky").fill("Zásuvky");
  await page.getByRole("dialog").getByLabel("Množství").fill("2");
  await page.getByRole("dialog").getByLabel("Prodejní cena za jednotku").fill("500");
  await page.getByRole("dialog").getByRole("button", { name: "Přidat řádek" }).click();
  await expect(editor.getByTestId("change-impact")).toContainText("+7 000 Kč");
  await editor.getByRole("button", { name: "Odebrat řádek Zásuvky" }).click();
  await expect(editor.getByTestId("change-impact")).toContainText("+6 000 Kč");

  // odeslání ke schválení, rozhodnutí ve frontě
  await editor.getByRole("button", { name: "Odeslat ke schválení" }).click();
  await expect(editor.getByTestId("approval-panel")).toContainText("Čeká na schválení");
  await expect(editor.getByRole("button", { name: "Odeslat ke schválení" })).toBeHidden();

  await page.goto("/zakazky/schvalovani");
  const item = page
    .getByTestId("approval-item")
    .filter({ hasText: "Dodatečné rozvody" })
    .filter({ hasText: job });
  await expect(item).toContainText("6 000 Kč");
  await item.getByRole("button", { name: "Zamítnout" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Zamítnout" }).click();
  await expect(page.getByRole("dialog")).toContainText("Napište důvod zamítnutí");
  await page.getByLabel("Důvod zamítnutí").fill("Příliš drahé");
  await page.getByRole("dialog").getByRole("button", { name: "Zamítnout" }).click();
  await expect(item).toBeHidden();

  // zamítnutou změnu jde opravit a poslat znovu
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: job });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  await view.getByRole("tab", { name: "Změny" }).click();
  await view.getByRole("button", { name: /Dodatečné rozvody/ }).click();
  await expect(editor.getByTestId("approval-panel")).toContainText("Příliš drahé");
  await editor.getByRole("button", { name: "Odeslat ke schválení" }).click();
  // počká se na odeslání; navigace hned po kliknutí by požadavek přerušila a fronta by zůstala prázdná
  await expect(editor.getByTestId("approval-panel")).toContainText("Čeká na schválení");
  await page.goto("/zakazky/schvalovani");
  const again = page
    .getByTestId("approval-item")
    .filter({ hasText: "Dodatečné rozvody" })
    .filter({ hasText: job });
  await again.getByRole("button", { name: "Schválit" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Schválit" }).click();
  await expect(again).toBeHidden();
});

test("schválená změna je zamčená a vrátí se do konceptu jen na výslovný pokyn", async ({
  page,
}) => {
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: job });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  const view = page.getByTestId("record-view");
  await view.getByRole("tab", { name: "Změny" }).click();
  await expect(view.getByTestId("changes-list")).toContainText("Schváleno");
  await view.getByRole("button", { name: /Dodatečné rozvody/ }).click();
  const editor = view.getByTestId("change-editor");
  await expect(editor.getByTestId("approval-panel")).toContainText("Schváleno a zamčeno");
  await expect(editor.getByRole("button", { name: "Odeslat ke schválení" })).toBeHidden();
  await expect(editor.getByLabel("Název změny")).not.toBeEditable();

  await editor.getByRole("button", { name: "Vrátit do konceptu" }).click();
  await page.getByLabel("Důvod vrácení").fill("Oprava množství");
  await page.getByRole("dialog").getByRole("button", { name: "Vrátit do konceptu" }).click();
  await expect(editor.getByRole("button", { name: "Odeslat ke schválení" })).toBeVisible();
  await expect(editor.getByLabel("Název změny")).toBeEditable();
});

test("nastavení schvalování nabízí výchozí pravidla s limitem 50 000 Kč", async ({ page }) => {
  await page.goto("/nastaveni/schvalovani");
  await expect(page.getByRole("heading", { name: "Schvalování" }).first()).toBeVisible();
  const rules = page.getByTestId("rules-change");
  await expect(rules).toContainText("Od 0 Kč");
  await expect(rules).toContainText("Od 50 000 Kč");
  await expect(rules).toContainText("Schvalovatel bez limitu");
});
