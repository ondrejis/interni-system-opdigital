import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createCompany } from "./helpers";

test.describe.configure({ mode: "serial" });

/*
  Reklama (REK-B): seznam účtů, detail účtu s kampaněmi za období, detail kampaně se sadami, reklamami, náhledem
  kreativy a rozdílem leadů Meta × OPSYS, změna vlastníka účtu na klienta a záložka „Reklama“ na kartě klienta,
  ruční Obnovit a mobilní karty. Meta se v e2e nevolá: účet, kampaň, sada, reklama a denní statistiky se zapíšou přímo
  do databáze přes `psql` (adresa `DATABASE_MIGRATE_URL` z prostředí nebo z `.env.local`); bez nich se testy přeskočí.
*/

const stamp = Math.random().toString(36).slice(2, 8);
const ids = {
  account: randomUUID(),
  campaign: randomUUID(),
  adSet: randomUUID(),
  ad: randomUUID(),
};
const accountName = `E2E účet ${stamp}`;
const campaignName = `E2E kampaň ${stamp}`;

function databaseUrl(): string | null {
  if (process.env.DATABASE_MIGRATE_URL) return process.env.DATABASE_MIGRATE_URL;
  const file = path.resolve(import.meta.dirname, "../../../.env.local");
  if (!existsSync(file)) return null;
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith("DATABASE_MIGRATE_URL="));
  return line ? line.slice("DATABASE_MIGRATE_URL=".length).trim() : null;
}

function sql(statement: string): void {
  const url = databaseUrl();
  if (!url) throw new Error("Chybí DATABASE_MIGRATE_URL");
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", "-c", statement], { stdio: "pipe" });
}

let seeded = false;

test.beforeAll(() => {
  try {
    const day = (offset: number) => `(current_date - ${offset})`;
    const insight = (level: string, objectId: string, offset: number) =>
      `('${randomUUID()}', ${day(offset)}, '${level}', '${objectId}', 150000, 10000, 200, 5)`;
    const rows = [0, 1].flatMap((o) => [
      insight("campaign", ids.campaign, o),
      insight("adset", ids.adSet, o),
      insight("ad", ids.ad, o),
    ]);
    sql(`
      insert into ad_account (id, meta_id, name, currency, timezone, owner_kind, active, last_sync_at)
        values ('${ids.account}', 'e2e_act_${stamp}', '${accountName}', 'CZK', 'Europe/Prague', 'agency', true, now());
      insert into ad_campaign (id, account_id, meta_id, name, objective, status)
        values ('${ids.campaign}', '${ids.account}', 'e2e_cmp_${stamp}', '${campaignName}', 'OUTCOME_LEADS', 'ACTIVE');
      insert into ad_set (id, campaign_id, meta_id, name, status)
        values ('${ids.adSet}', '${ids.campaign}', 'e2e_set_${stamp}', 'E2E sada ${stamp}', 'ACTIVE');
      insert into ad (id, ad_set_id, meta_id, name, status, creative_url)
        values ('${ids.ad}', '${ids.adSet}', 'e2e_ad_${stamp}', 'E2E reklama ${stamp}', 'ACTIVE', 'https://example.invalid/kreativa.png');
      insert into ad_insight_daily (id, date, level, object_id, spend_minor, impressions, clicks, leads) values
        ${rows.join(",\n        ")};
    `);
    seeded = true;
  } catch {
    seeded = false;
  }
});

test.afterAll(() => {
  if (!seeded) return;
  sql(`
    delete from ad_insight_daily where object_id in ('${ids.campaign}', '${ids.adSet}', '${ids.ad}');
    delete from ad where id = '${ids.ad}';
    delete from ad_set where id = '${ids.adSet}';
    delete from ad_campaign where id = '${ids.campaign}';
    delete from ad_account where id = '${ids.account}';
  `);
});

test("Reklama: položka v navigaci otevře seznam účtů", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Reklama", exact: true }).first().click();
  await expect(page).toHaveURL(/\/reklama$/);
  await expect(page.getByRole("heading", { name: "Reklamní účty", level: 1 })).toBeVisible();
  await expect(page.getByTestId("accounts-summary")).toBeVisible();
});

test("seznam účtů: vlastník, útrata za měsíc a stav synchronizace", async ({ page }) => {
  test.skip(!seeded, "bez psql a DATABASE_MIGRATE_URL nejdou nasypat data Meta");
  await page.goto("/reklama");
  const row = page.getByTestId("account-row").filter({ hasText: accountName });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("owner-chip")).toContainText("OP Digital");
  await expect(row.getByTestId("sync-badge")).toHaveAttribute("data-state", "ok");
  await expect(row).toContainText(/\d/); // útrata tento měsíc
  await expect(row.getByTestId("owner-edit")).toBeVisible();
});

test("detail účtu: kampaně za období, součty a přepínání období", async ({ page }) => {
  test.skip(!seeded, "bez dat Meta");
  await page.goto("/reklama");
  await page
    .getByTestId("account-row")
    .filter({ hasText: accountName })
    .getByTestId("account-link")
    .click();
  const perf = page.getByTestId("account-performance");
  await expect(perf).toBeVisible();
  await expect(page.getByTestId("kpi-spend")).toContainText(/3\s000\s(Kč)/);
  await expect(page.getByTestId("kpi-leads-meta")).toContainText("10");
  // Meta napočítala 10 leadů, do OPSYS nedorazil žádný: ztracené leady jsou vidět textem
  await expect(page.getByTestId("kpi-leads-opsys").getByTestId("lost-chip")).toContainText(
    /−10 ztraceno/,
  );
  const table = page.getByTestId("campaigns-table");
  await expect(table.getByRole("link", { name: campaignName })).toBeVisible();
  await expect(page.getByTestId("campaigns-table-total")).toContainText("Celkem");
  await expect(page.getByTestId("daily-charts")).toBeVisible();

  const before = await page.getByTestId("period-text").textContent();
  await page.getByRole("radio", { name: "7 dní" }).click();
  await expect(page.getByTestId("period-text")).not.toHaveText(before ?? "");
  await page.getByRole("radio", { name: "Vlastní" }).click();
  await expect(page.getByTestId("period-custom")).toBeVisible();
  await page.getByRole("radio", { name: "30 dní" }).click();
  await expect(page.getByTestId("period-custom")).toHaveCount(0);
});

test("detail kampaně: sady, reklamy, náhled kreativy a rozdíl leadů", async ({ page }) => {
  test.skip(!seeded, "bez dat Meta");
  await page.goto(`/reklama/kampane/${ids.campaign}`);
  const perf = page.getByTestId("campaign-performance");
  await expect(perf).toBeVisible();
  await expect(perf.getByText("Část leadů se cestou ztratila")).toBeVisible();
  const sets = page.getByTestId("adsets-table");
  await expect(sets.getByText(`E2E sada ${stamp}`)).toBeVisible();
  await expect(sets.getByText(`E2E reklama ${stamp}`)).toBeVisible();
  await sets.getByTestId("creative-thumb").click();
  const dialog = page.getByTestId("creative-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: /Náhled reklamy/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("leads-empty")).toBeVisible();
  await expect(page.getByTestId("campaign-side")).toContainText(accountName);
});

test("přiřazení kampaně zakázce: bez marketingové zakázky klienta nabídne prázdný výběr", async ({
  page,
}) => {
  test.skip(!seeded, "bez dat Meta");
  await page.goto(`/reklama/kampane/${ids.campaign}`);
  await expect(page.getByTestId("job-assign")).toContainText("Nepřiřazeno");
  await page.getByTestId("job-pick").click();
  await expect(page.getByPlaceholder("Hledat marketingovou zakázku…")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("vlastník účtu: změna na klienta a záložka Reklama na kartě klienta", async ({
  page,
  context,
}) => {
  test.skip(!seeded, "bez dat Meta");
  const company = await createCompany(context, `Reklama klient ${stamp} s.r.o.`);
  await page.goto(`/reklama/${ids.account}`);
  await page.getByTestId("account-side").getByTestId("owner-edit").click();
  const dialog = page.getByTestId("owner-dialog");
  await dialog.getByRole("radio", { name: "Klient" }).click();
  // klient je povinný: bez něj nejde uložit
  await expect(dialog.getByTestId("owner-save")).toBeDisabled();
  await dialog.getByRole("button", { name: "Klient", exact: true }).click();
  await page.getByPlaceholder("Hledat firmu…").fill(company);
  await page.getByRole("option", { name: company }).click();
  await dialog.getByTestId("owner-save").click();
  const chip = page.getByTestId("account-side").getByTestId("owner-chip");
  await expect(chip).toHaveAttribute("data-owner", "client");
  await chip.getByRole("link", { name: company }).click();

  // karta klienta: záložka Reklama s kampaní klientova účtu
  await page.getByRole("tab", { name: /Reklama/ }).click();
  const tab = page.getByTestId("ads-tab");
  await expect(tab).toBeVisible();
  await expect(
    tab.getByTestId("ads-campaigns-table").getByRole("link", { name: campaignName }),
  ).toBeVisible();
  await expect(tab.getByTestId("ads-monthly")).toBeVisible();
  await expect(tab.getByTestId("client-accounts")).toContainText(accountName);
});

test("Obnovit bez napojené Meta ukáže srozumitelnou chybu", async ({ page }) => {
  await page.goto("/reklama");
  await expect(page.getByTestId("accounts-summary")).not.toHaveText("Načítám…");
  const notConnected = await page.getByText("Meta zatím není napojená").isVisible();
  test.skip(!notConnected, "Meta je v této instanci napojená, ruční obnova by volala skutečné API");
  await page.getByTestId("sync-button").click();
  await expect(page.getByRole("alert").filter({ hasText: /Meta není napojená/ })).toBeVisible();
});

test("mobil: účty jsou karty, ne tabulka", async ({ page }) => {
  test.skip(!seeded, "bez dat Meta");
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/reklama");
  await expect(page.getByTestId("accounts-table")).toBeHidden();
  await expect(page.getByTestId("account-card").filter({ hasText: accountName })).toBeVisible();
  await page.goto(`/reklama/kampane/${ids.campaign}`);
  await expect(page.getByTestId("adsets-table-cards")).toBeVisible();
});
