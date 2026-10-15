import { expect, test } from "@playwright/test";

/*
  Klienti (KLI): nová organizace se stane klientem (Lead), změna stavu s důvodem u Bývalého, „klient od“ po prvním
  přechodu na Aktivní, seznam klientů (výchozí bez bývalých, přepínač „Všichni, včetně bývalých“, seskupení podle
  stavu), kontext klienta upravený na místě a skrytí záložek bez dat. Napsáno, pouští se samostatně: `pnpm --filter web e2e klienti`.
*/
test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const firm = `Klientská firma ${stamp}`;
let cardUrl = "";

test("nová organizace není klient, „Označit jako klienta“ ji udělá Leadem", async ({ page }) => {
  await page.goto("/kontakty/firmy/nova");
  await page.getByLabel(/Název \*/).fill(firm);
  await page.getByRole("button", { name: "Založit organizaci" }).click();
  await expect(page.getByTestId("record-view")).toBeVisible();
  cardUrl = new URL(page.url()).pathname;
  const band = page.getByTestId("client-header-band");
  await expect(band).toContainText("Není klient");
  await band.getByTestId("client-mark").click();
  await expect(page.getByTestId("client-status")).toContainText("Lead");
});

test("Aktivní uloží „klient od“, Bývalý chce důvod a zobrazí ho v hlavičce", async ({ page }) => {
  await page.goto(cardUrl);
  await page.getByTestId("client-status").click();
  await page.getByRole("radio", { name: "Aktivní" }).click();
  await page.getByTestId("status-confirm").click();
  await expect(page.getByTestId("client-status")).toContainText("Aktivní");
  await expect(page.getByTestId("client-since")).toContainText("Klient od");

  await page.getByTestId("client-status").click();
  await page.getByRole("radio", { name: "Bývalý" }).click();
  await expect(page.getByTestId("status-confirm")).toBeDisabled(); // bez důvodu nejde
  await page.getByTestId("status-reason").fill("Přešli ke konkurenci");
  await page.getByTestId("status-confirm").click();
  await expect(page.getByTestId("client-status")).toContainText("Bývalý");
  await expect(page.getByTestId("client-end-reason")).toContainText("Přešli ke konkurenci");
});

test("seznam klientů: bývalý je skrytý, přepínač ho ukáže, seskupení podle stavu", async ({
  page,
}) => {
  await page.goto("/klienti");
  const table = page.getByTestId("clients-table");
  await expect(page.getByTestId("clients-page")).toBeVisible();
  await page.getByTestId("clients-search").fill(firm);
  await expect(page.getByTestId("client-row").filter({ hasText: firm })).toHaveCount(0);
  await page.getByTestId("clients-include-former").click();
  await expect(table.getByTestId("client-row").filter({ hasText: firm })).toBeVisible();
  await page.getByRole("radio", { name: "Podle stavu" }).click();
  await expect(page.getByTestId("clients-group-former")).toContainText(firm);
  await table.getByTestId("client-row").filter({ hasText: firm }).click();
  await expect(page).toHaveURL(new RegExp(cardUrl));
});

test("kontext se ukládá na místě a po obnovení zůstane; prázdné záložky se skryjí", async ({
  page,
}) => {
  await page.goto(`${cardUrl}?tab=kontext`);
  const who = page.getByTestId("context-decisionMaker");
  await who.fill("Jana Nováková, jednatelka");
  await expect(page.getByTestId("context-state")).toContainText("Uloženo", { timeout: 5_000 });
  await page.reload();
  await page.getByRole("tab", { name: "Kontext" }).click();
  await expect(page.getByTestId("context-decisionMaker")).toHaveValue("Jana Nováková, jednatelka");
  // klient bez zakázek, obchodů a plateb: tyto záložky karta neukazuje; Přehled a Kontext ano
  await expect(page.getByRole("tab", { name: "Zakázky" })).toBeHidden();
  await expect(page.getByRole("tab", { name: "Obchody" })).toBeHidden();
  await expect(page.getByRole("tab", { name: "Přehled" })).toBeVisible();
});
