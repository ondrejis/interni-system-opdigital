import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs } from "./roles";
import {
  PHONE,
  canUseDb,
  deleteTask,
  dropRunningClocks,
  insertTask,
  runningClocks,
  sql,
} from "./terminal-helpers";

/**
 * Denní práce řemeslníka v terminálu na telefonu (worker2, aby se nepletl s ostatními testy): příchod → splnění úkolu →
 * odchod, práce bez signálu (zápis čeká ve frontě a odešle se po návratu spojení), ztracená odpověď serveru (opakované
 * odeslání nevytvoří duplicitu) a konflikt s jiným zařízením (česká hláška, nic se tiše neztratí).
 * Ověření v databázi potřebuje `psql` a `DATABASE_URL` (jinak se test přeskočí).
 */
test.skip(!canUseDb(), "chybí psql nebo DATABASE_URL (ověření v databázi)");
test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const clock = (page: Page) => page.getByTestId("tile-dochazka.clock");
const indicator = (page: Page) => page.getByTestId("queue-indicator");

test.beforeEach(() => dropRunningClocks("worker2"));
test.afterEach(() => dropRunningClocks("worker2"));

test("příchod → úkol odškrtnout → odchod", async ({ browser }) => {
  const taskId = insertTask("worker2", `Kontrola lešení ${stamp}`);
  const { ctx, page } = await pageAs(browser, "worker2", { viewport: PHONE });
  const c = collectErrors(page);
  try {
    await visit(page, "/t", c);
    await clock(page).getByRole("button", { name: "Příchod" }).click();
    await expect(page.getByTestId("clock-state")).toContainText("Pracujete od");
    // zápis jde nejdřív do fronty v telefonu, na server dorazí vzápětí
    await expect.poll(() => runningClocks("worker2")).toBe(1);

    await visit(page, "/t/w/core.tasks", c);
    const row = page.getByRole("button", { name: `Splnit: Kontrola lešení ${stamp}` });
    await row.click();
    await expect(page.getByText("Úkol splněn.")).toBeVisible();
    await expect
      .poll(() => sql(`select done_at is not null from task where id = '${taskId}'`))
      .toBe("t");
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText(`Kontrola lešení ${stamp}`)).toHaveCount(0);

    await visit(page, "/t", c);
    await clock(page).getByRole("button", { name: "Odchod" }).click();
    await expect(clock(page).getByRole("button", { name: "Příchod" })).toBeVisible();
    await expect.poll(() => runningClocks("worker2")).toBe(0);
    expectClean(c, "denní práce");
  } finally {
    deleteTask(taskId);
    await ctx.close();
  }
});

test("bez signálu: příchod se uloží v telefonu, ukáže se „čeká na odeslání“ a po návratu spojení odejde právě jednou", async ({
  browser,
}) => {
  const { ctx, page } = await pageAs(browser, "worker2", { viewport: PHONE });
  const c = collectErrors(page);
  c.ignore(/Failed to fetch|net::ERR_INTERNET_DISCONNECTED|Load failed/);
  await visit(page, "/t", c);
  await expect(clock(page).getByRole("button", { name: "Příchod" })).toBeVisible();

  await ctx.setOffline(true);
  await clock(page).getByRole("button", { name: "Příchod" }).click();
  // zápis je v telefonu: viditelný stav, odznak i počítadlo, na serveru zatím nic
  await expect(page.getByTestId("clock-state")).toContainText("Pracujete od");
  await expect(clock(page).getByTestId("pending-badge")).toBeVisible();
  await expect(indicator(page)).toContainText("Čeká na odeslání: 1");
  expect(runningClocks("worker2")).toBe(0);

  await ctx.setOffline(false);
  await expect(indicator(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(clock(page).getByTestId("pending-badge")).toHaveCount(0);
  expect(runningClocks("worker2")).toBe(1);
  await expect(page.getByTestId("clock-state")).toContainText("Pracujete od");
  await ctx.close();
});

test("ztracená odpověď serveru: zápis odejde znovu, ale vznikne jen jednou", async ({
  browser,
}) => {
  const taskId = insertTask("worker2", `Úklid ${stamp}`);
  const { ctx, page } = await pageAs(browser, "worker2", { viewport: PHONE });
  const c = collectErrors(page);
  c.ignore(/Failed to fetch|net::ERR_|Load failed/);
  try {
    await visit(page, "/t/w/core.tasks", c);
    const before = Number(
      sql(`select count(*) from terminal_op where command = 'core.tasks.complete'`),
    );
    let lost = false;
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (
        !lost &&
        req.method() === "POST" &&
        (req.postData() ?? "").includes("core.tasks.complete")
      ) {
        lost = true;
        await route.fetch(); // server zápis provede
        await route.abort("connectionreset"); // ale odpověď se do telefonu nedostane
        return;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: `Splnit: Úklid ${stamp}` }).click();
    await expect.poll(() => lost).toBe(true);
    await expect(indicator(page)).toContainText("Čeká na odeslání");
    // fronta zápis zkusí znovu a server pozná, že už ho provedl
    await expect(indicator(page)).toHaveCount(0, { timeout: 30_000 });
    expect(sql(`select done_at is not null from task where id = '${taskId}'`)).toBe("t");
    const after = Number(
      sql(`select count(*) from terminal_op where command = 'core.tasks.complete'`),
    );
    expect(after - before, "zápis se provedl jednou").toBe(1);
    // bez konfliktu a bez čekajících zápisů
    await visit(page, "/t/vice", c);
    await expect(page.getByText("Všechno je odeslané.")).toBeVisible();
  } finally {
    deleteTask(taskId);
    await ctx.close();
  }
});

test("konflikt: příchod z druhého zařízení mezitím běží; zápis zůstane s českou hláškou, dokud ho člověk nezahodí", async ({
  browser,
}) => {
  const a = await pageAs(browser, "worker2", { viewport: PHONE });
  const b = await pageAs(browser, "worker2", { viewport: PHONE });
  const ca = collectErrors(a.page);
  ca.ignore(/Failed to fetch|net::ERR_|Load failed/);
  const cb = collectErrors(b.page);
  await visit(a.page, "/t", ca);
  await visit(b.page, "/t", cb);

  await a.ctx.setOffline(true);
  await clock(a.page).getByRole("button", { name: "Příchod" }).click();
  await expect(indicator(a.page)).toContainText("Čeká na odeslání: 1");

  // druhé zařízení se mezitím zapíše samo
  await clock(b.page).getByRole("button", { name: "Příchod" }).click();
  await expect(b.page.getByTestId("clock-state")).toContainText("Pracujete od");
  await expect.poll(() => runningClocks("worker2")).toBe(1);

  await a.ctx.setOffline(false);
  await expect(indicator(a.page)).toContainText("Konflikt: 1", { timeout: 30_000 });
  await visit(a.page, "/t/vice", ca);
  const item = a.page.getByTestId("queue-item");
  await expect(item).toHaveAttribute("data-state", "conflict");
  await expect(item).toContainText("Píchačka už běží");
  // nic se neztratilo ani nezdvojilo
  expect(runningClocks("worker2")).toBe(1);

  await item.getByRole("button", { name: "Zahodit" }).click();
  await item.getByRole("button", { name: "Opravdu zahodit" }).click();
  await expect(a.page.getByText("Všechno je odeslané.")).toBeVisible();
  expectClean(cb, "druhé zařízení");
  await a.ctx.close();
  await b.ctx.close();
});
