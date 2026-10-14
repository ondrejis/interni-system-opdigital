import { expect, test } from "@playwright/test";
import { pickCompany } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const job = `Investor ${stamp}`;
let shareUrl = "";

test("odkaz pro investora: vytvoření, veřejná stránka bez přihlášení a bez cen", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(job);
  await pickCompany(page, dialog);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name: job })).toBeVisible();

  const card = view.getByRole("region", { name: "Sdílení s investorem" });
  await card.getByRole("button", { name: "Nový odkaz" }).click();
  const create = page.getByRole("dialog", { name: "Nový odkaz pro investora" });
  await create.getByLabel("Pro koho (popisek)").fill("Investor E2E");
  await create.getByRole("button", { name: "Vytvořit odkaz" }).click();
  const url = page.getByTestId("share-url");
  await expect(url).toHaveValue(/\/investor\/[A-Za-z0-9_-]{32,}$/);
  shareUrl = await url.inputValue();
  await page.getByRole("dialog").getByRole("button", { name: "Hotovo" }).click();
  await expect(card.getByTestId("share-list")).toContainText("Investor E2E");
  await expect(card.getByTestId("share-list")).toContainText("Platí");

  // veřejná stránka: nový kontext bez přihlášení
  const anon = await browser.newContext();
  const pub = await anon.newPage();
  const res = await pub.goto(shareUrl);
  expect(res?.status()).toBe(200);
  await expect(pub.getByTestId("investor-title")).toHaveText(job);
  await expect(pub.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/);
  const text = await pub.locator("body").innerText();
  expect(text).not.toMatch(/Kč|Marže|Náklad|Smluvní cena/);
  await anon.close();
});

test("odkaz pro investora: náhled a zrušení", async ({ page, browser }) => {
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  await page
    .getByRole("row")
    .filter({ hasText: job })
    .locator('[data-attr="title"]')
    .getByRole("link")
    .click();
  const view = page.getByTestId("record-view");
  const card = view.getByRole("region", { name: "Sdílení s investorem" });

  // náhled „pohled investora“ jde jen přes přihlášení
  const popup = page.waitForEvent("popup");
  await card.getByRole("link", { name: /Náhled/ }).click();
  const preview = await popup;
  await expect(preview.getByTestId("investor-title")).toHaveText(job);
  await expect(preview.getByText(/Náhled: takto odkaz/)).toBeVisible();
  await preview.close();

  await card.getByRole("button", { name: /Zrušit odkaz/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Zrušit odkaz" }).click();
  await expect(card.getByTestId("share-list")).toContainText("Zrušen");

  const anon = await browser.newContext();
  const pub = await anon.newPage();
  const res = await pub.goto(shareUrl);
  expect(res?.status()).toBe(404);
  await anon.close();
});
