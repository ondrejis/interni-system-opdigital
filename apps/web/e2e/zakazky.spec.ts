import { expect, test } from "@playwright/test";
import { pickCompany } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const job = `Zakázka ${stamp}`;

test("rozpočet, náklady a změny na detailu zakázky", async ({ page }) => {
  test.setTimeout(90_000);
  // zakázka s firmou přes dialog
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

  // rozpočet: první oddíl a položka rovnou v tabulce (psaní, Tab a Enter jako v tabulkách aplikace)
  await view.getByRole("tab", { name: "Rozpočet" }).click();
  await view.getByRole("button", { name: "Přidat první oddíl" }).click();
  const grid = view.getByTestId("budget-grid");
  const cell = grid.getByRole("textbox");
  await expect(cell).toBeFocused(); // psát se smí, až když je buňka v úpravě
  await page.keyboard.type("Koupelna");
  await page.keyboard.press("Enter");
  await expect(grid).toContainText("Koupelna");
  await page.keyboard.type("Obklady");
  await page.keyboard.press("Tab"); // uloží položku a jde na Množství
  await expect(grid.getByRole("row", { name: /Obklady/ })).toBeVisible();
  for (const [col, value, key] of [
    ["qty", "10", "Tab"],
    ["cost", "600", "Tab"],
    ["price", "1000", "Enter"],
  ] as const) {
    // výběr buňky se po uložení předchozí přesouvá asynchronně; Enter před tím by otevřel jinou buňku
    await expect(grid.locator('[aria-selected="true"]')).toHaveAttribute(
      "id",
      new RegExp(`-${col}$`),
    );
    const input = grid.locator("input, textarea");
    await page.keyboard.press("Enter");
    await expect(input.first()).toBeFocused(); // psát se smí, až když je buňka v úpravě
    await page.keyboard.type(value);
    await page.keyboard.press(key);
    await expect(input).toHaveCount(0);
  }
  await expect(grid).toContainText("10 000");
  await expect(view.getByTestId("budget-stats")).toContainText("10 000 Kč");

  // ruční náklad se objeví v seznamu nákladů a v Přehledu nákladů (spárování na oddíl řeší naklady.spec.ts)
  await view.getByRole("tab", { name: "Náklady", exact: true }).click();
  await view.getByRole("radio", { name: "Náklady", exact: true }).click();
  await view.getByRole("button", { name: "Přidat náklad" }).click();
  const cost = page.getByRole("dialog", { name: "Přidat náklad" });
  await cost.getByRole("button", { name: "Vybrat datum" }).click();
  await page.locator("td[data-day] button").first().click();
  await cost.getByLabel("Za co náklad je").fill("Kontejner");
  await cost.getByLabel("Částka nákladu bez DPH").fill("2 500");
  await cost.getByRole("button", { name: "Přidat náklad" }).click();
  await expect(view.getByTestId("costs-tab")).toContainText("Kontejner");
  await expect(view.getByTestId("costs-tab")).toContainText("2 500 Kč");
  await view.getByRole("radio", { name: "Přehled nákladů" }).click();
  await expect(view.getByTestId("cost-overview")).toContainText("Skutečné náklady");
  await expect(view.getByTestId("cost-overview")).toContainText("2 500 Kč");

  // změna (ZBV): koncept → řádek → odeslání → schválení se projeví v seznamu změn
  await view.getByRole("tab", { name: "Změny" }).click();
  await view.getByRole("button", { name: "Nová změna" }).click();
  const editor = view.getByTestId("change-editor");
  await editor.getByLabel("Název změny").fill("Navíc podlahové topení");
  await editor.getByLabel("Název změny").blur();
  await editor.getByRole("button", { name: "Nová položka" }).click();
  const line = page.getByRole("dialog");
  await line.getByLabel("Název nové položky").fill("Podlahové topení");
  await line.getByLabel("Množství").fill("1");
  await line.getByLabel("Prodejní cena za jednotku").fill("3 000");
  await line.getByRole("button", { name: "Přidat řádek" }).click();
  await expect(editor.getByTestId("change-lines")).toContainText("Podlahové topení");
  await expect(editor.getByTestId("change-impact")).toContainText("3 000 Kč");
  await editor.getByRole("button", { name: "Odeslat ke schválení" }).click();
  await expect(editor.getByTestId("approval-panel")).toContainText("Čeká na schválení");
  await editor.getByRole("button", { name: "Schválit" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Schválit", exact: true }).click();
  await expect(editor.getByTestId("approval-panel")).toContainText("Schváleno a zamčeno");
  await editor.getByRole("button", { name: "Zpět na seznam změn" }).click();
  await expect(view.getByTestId("changes-list")).toContainText("Navíc podlahové topení");
  await expect(view.getByTestId("changes-list")).toContainText("Schváleno");
});

test("tým zakázky: přidání člena a odebrání", async ({ page }) => {
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: job });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  const view = page.getByTestId("record-view");
  // tým je karta v pravém panelu Přehledu (ne samostatná záložka)
  await expect(view.getByRole("tab", { name: "Tým" })).toHaveCount(0);
  const team = view.getByRole("region", { name: "Tým zakázky" });
  await team.getByRole("button", { name: "Přidat člena…" }).click();
  await page.getByRole("option").first().click();
  await team.getByLabel("Role v týmu").fill("mistr");
  await team.getByRole("button", { name: "Přidat", exact: true }).click();
  await expect(team.getByText("mistr")).toBeVisible();
  await view.getByRole("button", { name: /^Odebrat .* z týmu$/ }).click();
  await expect(view.getByRole("button", { name: "Změnit roli (mistr)" })).toBeHidden();
});
