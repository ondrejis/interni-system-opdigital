import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean } from "./helpers";
import { pageAs } from "./roles";

/**
 * Nástěnky podle rolí: výchozí sady rolí se zobrazí jen své roli, mistr nevidí součty, na které nemá právo (ani když
 * widget pošle ručně), a cizí nástěnku neotevře.
 */
const MONEY = /\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?\s*(?:Kč|CZK)/;

async function evaluate(page: Page, widget: unknown) {
  return page.evaluate(async (w) => {
    const r = await fetch("/api/dashboards/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ widget: w, filters: { period: "all" } }),
    });
    return { status: r.status, text: await r.text() };
  }, widget);
}

test("kancelář vidí svou výchozí nástěnku a ta se načte bez chyb widgetů", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "office");
  const c = collectErrors(page);
  await page.goto("/");
  await page.getByTestId("dashboard-tab").filter({ hasText: "Kancelář" }).click();
  await expect(page.getByTestId("dashboard-title")).toContainText("Kancelář");
  await expect(page.getByTestId("widget-card").first()).toBeVisible();
  await expect(page.getByTestId("widget-status").first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("widget-error")).toHaveCount(0);
  expectClean(c, "nástěnka kanceláře");
  await ctx.close();
});

test("mistr: nástěnka bez cen; ruční widget se součtem cen vrátí chybu a žádné částky; cizí nástěnku neotevře", async ({
  browser,
}) => {
  const owner = await pageAs(browser, "owner");
  await owner.page.goto("/");
  const ownerBoardHref = await owner.page
    .getByTestId("dashboard-tab")
    .filter({ hasText: "Majitel" })
    .first()
    .getAttribute("href");
  await owner.ctx.close();
  expect(ownerBoardHref).toMatch(/board=/);

  const { ctx, page } = await pageAs(browser, "foreman1");
  const c = collectErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("dashboard-tab").filter({ hasText: "Majitel" })).toHaveCount(0);
  await page.getByTestId("dashboard-tab").filter({ hasText: "Mistr" }).click();
  await expect(page.getByTestId("widget-card").first()).toBeVisible();
  await expect(page.getByTestId("widget-list").first()).toBeVisible({ timeout: 25_000 });
  const body = (await page.getByTestId("dashboard").innerText()).replace(/\u00a0/g, " ");
  expect(body).not.toMatch(MONEY);

  const sum = await evaluate(page, {
    id: "w-rucni-test",
    type: "kpi",
    title: "Součet cen",
    w: 3,
    h: 1,
    source: { kind: "entity", entity: "job", agg: { fn: "sum", attr: "sumContract" } },
  });
  expect(sum.status).toBe(200);
  expect(JSON.parse(sum.text)).toMatchObject({ ok: false });
  expect(sum.text).not.toMatch(/"value":\s*\d{4,}/);
  const metric = await evaluate(page, {
    id: "w-metrika-test",
    type: "kpi",
    title: "Marže",
    w: 3,
    h: 1,
    source: { kind: "metric", metric: "zakazky.margin_total" },
  });
  expect(JSON.parse(metric.text)).toMatchObject({ ok: false, code: "forbidden" });

  // cizí nástěnka: otevře se klasický Přehled, ne Majitelova nástěnka
  await page.goto(ownerBoardHref!);
  await expect(page.getByTestId("dashboard-title")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Dobrý den/ })).toBeVisible();
  expectClean(c, "nástěnka mistra");
  await ctx.close();
});
