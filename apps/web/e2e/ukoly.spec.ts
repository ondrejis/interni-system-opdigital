import { expect, test, type Page } from "@playwright/test";

/*
  Moje úkoly (UKO-B): rychlé přidání s náhledem rozpoznaného, odškrtnutí, přesun termínu a dialog úkolu.
  Razítko je jen z písmen, aby ho parser rychlého zadání nebral jako datum nebo čas.
*/
test.describe.configure({ mode: "serial" });

const stamp = Array.from({ length: 6 }, () =>
  String.fromCharCode(97 + Math.floor(Math.random() * 26)),
).join("");

async function quickAdd(page: Page, text: string) {
  const input = page.getByTestId("quick-add-input");
  await input.fill(text);
  await expect(page.getByTestId("quick-preview")).toBeVisible();
  await page.getByTestId("quick-add").getByRole("button", { name: "Přidat", exact: true }).click();
  await expect(page.getByText("Přidáno:").first()).toBeVisible();
}

const row = (page: Page, title: string) => page.getByTestId("task-row").filter({ hasText: title });

test("rychlé přidání ukáže, co rozpoznalo, a uloží až po potvrzení", async ({ page }) => {
  await page.goto("/ukoly");
  const title = `Novákovi ${stamp}`;
  await page.getByTestId("quick-add-input").fill(`zavolat ${title} zítra 10:00`);

  const preview = page.getByTestId("quick-preview");
  await expect(preview).toBeVisible();
  await expect(page.getByTestId("quick-summary")).toContainText("Hovor");
  await expect(page.getByTestId("quick-summary")).toContainText("10:00");
  await expect(preview).toContainText("Rozpoznáno");
  // před potvrzením se nic neuložilo
  await page.getByRole("tab", { name: /Nadcházejících 7 dní/ }).click();
  await expect(row(page, title)).toHaveCount(0);

  await page.getByTestId("quick-add").getByRole("button", { name: "Přidat", exact: true }).click();
  await expect(page.getByText("Přidáno:").first()).toBeVisible();
  await expect(row(page, title)).toBeVisible();
  await expect(page.getByTestId("quick-add-input")).toHaveValue("");
});

test("odškrtnutí: úkol zmizí z pohledu Dnes a objeví se v Hotových", async ({ page }) => {
  await page.goto("/ukoly");
  const title = `Texty ${stamp}`;
  await quickAdd(page, `nahrát ${title} dnes`);
  await page.getByRole("tab", { name: /^Dnes/ }).click();
  await expect(row(page, title)).toBeVisible();

  await row(page, title).getByTestId("task-complete").click();
  await expect(
    page.getByText(`Hotovo: nahrát ${title}`.replace("nahrát", "Nahrát"), { exact: false }).first(),
  ).toBeVisible();
  await expect(row(page, title)).toHaveCount(0);

  await page.getByRole("tab", { name: "Hotové" }).click();
  await expect(row(page, title)).toBeVisible();
});

test("přesun termínu z řádku: z Dnes na zítra", async ({ page }) => {
  await page.goto("/ukoly");
  const title = `Pozvánka ${stamp}`;
  await quickAdd(page, `pozvat ${title} dnes`);
  await page.getByRole("tab", { name: /^Dnes/ }).click();
  await row(page, title).getByTestId("task-due").click();
  await page.getByTestId("due-tomorrow").click();
  await expect(page.getByText("Termín je změněný.")).toBeVisible();
  await expect(row(page, title)).toHaveCount(0);

  await page.getByRole("tab", { name: /Nadcházejících 7 dní/ }).click();
  await expect(row(page, title)).toBeVisible();
  await expect(row(page, title).getByTestId("task-due")).toContainText("Zítra");
});

test("dialog úkolu: název, priorita, podúkol a komentář", async ({ page }) => {
  await page.goto("/ukoly");
  const title = `Detail ${stamp}`;
  await quickAdd(page, `připravit ${title} dnes`);
  await page.getByRole("tab", { name: /^Dnes/ }).click();
  await row(page, title).getByTestId("task-title").click();

  const dialog = page.getByTestId("task-dialog");
  await expect(dialog).toBeVisible();
  const name = dialog.getByTestId("dialog-title");
  await name.fill(`${title} (upraveno)`);
  await name.blur();
  await expect(page.getByRole("dialog").getByText(`${title} (upraveno)`).first()).toBeVisible();

  await dialog.getByLabel("Priorita").selectOption("high");
  await expect(dialog.getByLabel("Priorita")).toHaveValue("high");

  await dialog.getByLabel("Nový podúkol").fill("Poslat podklady");
  await dialog.getByRole("button", { name: "Přidat", exact: true }).first().click();
  await expect(dialog.getByTestId("subtasks")).toContainText("Poslat podklady");

  await dialog.getByLabel("Nový komentář").fill("Díky @Patrik, mrkni na to");
  await dialog.getByTestId("comments").getByRole("button", { name: "Přidat" }).click();
  await expect(dialog.getByTestId("comments").locator("mark")).toHaveText("@Patrik");
});

test("Typy aktivit: výchozí typy jsou v seznamu a systémový typ nejde smazat", async ({ page }) => {
  await page.goto("/ukoly/typy");
  const list = page.getByTestId("type-list");
  await expect(list.getByTestId("type-row").filter({ hasText: "Hovor" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Systémový typ nejde smazat" }).first(),
  ).toBeDisabled();
});
