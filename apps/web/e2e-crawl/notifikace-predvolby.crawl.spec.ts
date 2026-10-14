import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs } from "./roles";

/**
 * Procházka: Nastavení → Upozornění (uživatel). Pod kancelářským uživatelem projde předvolby událostí (uložení,
 * obnovení po načtení, návrat), tiché hodiny, zařízení a zkušební upozornění. Zkušební upozornění jde frontou a odesílá
 * ho worker (`pnpm worker`); když neběží nebo prohlížeč neumí odběr u push služby (headless bez přístupu k FCM), test
 * ověří aspoň stav „zařazeno / čeká“ a skutečné doručení se zdokumentuje jako neověřené (docs/NOTIFICATIONS.md §12).
 * Skutečný příjem v service workeru pokrývá `notifikace-sw.crawl.spec.ts`.
 */
// plný Chromium: headless shell neumí povolení oznámení (Notification.permission je vždy „denied“)
test.use({ channel: "chromium" });
test.describe.configure({ mode: "serial" });

let setup: { close: () => Promise<void> } | undefined;
test.afterAll(async () => void (await setup?.close()));

const row = (page: Page, key: string) => page.getByTestId(`pref-${key}`);

async function seg(page: Page, key: string, label: string) {
  await row(page, key).getByRole("radio", { name: label }).click();
}

test("předvolby: zobrazení, uložení, obnovení po načtení, návrat výchozích hodnot", async ({
  browser,
}) => {
  const { ctx, page } = await pageAs(browser, "office", { viewport: { width: 1280, height: 900 } });
  setup = ctx;
  const c = collectErrors(page);
  await visit(page, "/nastaveni/upozorneni", c);
  await expect(page.getByRole("heading", { name: "Upozornění", level: 2 })).toBeVisible();
  for (const h of ["Co chci dostávat", "Tiché hodiny a shrnutí", "Poslední doručení"])
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  // zařízení: bez klíčů VAPID (čistá instance, CI) systém push nezapíná a stránka to říká místo seznamu zařízení;
  // s klíči (vývoj, ostrý provoz) je seznam „Moje zařízení“
  const pushOff = page.getByTestId("push-disabled");
  const devices = page.getByRole("heading", { name: "Moje zařízení" });
  await expect(pushOff.or(devices)).toBeVisible();
  if (await pushOff.isVisible()) {
    await expect(pushOff).toContainText("Zvoneček v aplikaci");
    await expect(devices).toHaveCount(0);
  }
  await expect(page.getByTestId("prefs-matrix")).toBeVisible();

  // události z modulů jsou v katalogu (kancelář vidí zakázky i faktury)
  await expect(row(page, "task.assigned")).toBeVisible();
  await expect(page.getByTestId(/^pref-invoice\.overdue$/)).toBeVisible();

  // změna: úkoly jen ve shrnutí, e-mail zapnout, zvoneček u komentářů vypnout
  await seg(page, "task.assigned", "Shrnutí");
  await row(page, "task.assigned")
    .getByRole("checkbox", { name: /^E-mail/ })
    .click();
  await row(page, "comment.mention")
    .getByRole("checkbox", { name: /^Zvoneček/ })
    .click();
  // tiché hodiny: vlastní okno
  await page.getByLabel("Od", { exact: true }).fill("21:30");
  await page.getByLabel("Do", { exact: true }).fill("05:30");
  await page.getByRole("button", { name: "Uložit předvolby" }).first().click();
  await expect(page.getByText("Předvolby upozornění jsou uložené.")).toBeVisible();
  expectClean(c, "uložení předvoleb");

  await visit(page, "/nastaveni/upozorneni", c);
  await expect(row(page, "task.assigned").getByRole("radio", { name: "Shrnutí" })).toBeChecked();
  await expect(row(page, "task.assigned").getByRole("checkbox", { name: /^E-mail/ })).toBeChecked();
  await expect(
    row(page, "comment.mention").getByRole("checkbox", { name: /^Zvoneček/ }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Od", { exact: true })).toHaveValue("21:30");

  // návrat: výchozí hodnoty se přestanou ukládat
  await seg(page, "task.assigned", "Ihned");
  await row(page, "task.assigned")
    .getByRole("checkbox", { name: /^E-mail/ })
    .click();
  await row(page, "comment.mention")
    .getByRole("checkbox", { name: /^Zvoneček/ })
    .click();
  await page.getByRole("button", { name: /Vrátit výchozí nastavení firmy/ }).click();
  await page.getByRole("button", { name: "Uložit předvolby" }).first().click();
  await expect(page.getByText("Předvolby upozornění jsou uložené.")).toBeVisible();
  await visit(page, "/nastaveni/upozorneni", c);
  await expect(row(page, "task.assigned").getByRole("radio", { name: "Ihned" })).toBeChecked();
  await expect(page.getByLabel("Od", { exact: true })).toHaveValue("20:00");

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .exclude("nextjs-portal")
    .analyze();
  expect(axe.violations.filter((v) => ["critical", "serious"].includes(v.impact ?? ""))).toEqual(
    [],
  );
  await ctx.close();
  setup = undefined;
});

test("zařízení a zkušební upozornění (zapnutí, fronta, odhlášení zařízení)", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const { ctx, page } = await pageAs(browser, "foreman1", {
    viewport: { width: 1280, height: 900 },
  });
  setup = ctx;
  await ctx.grantPermissions(["notifications"], {
    origin: process.env.CRAWL_BASE_URL ?? "http://localhost:3100",
  });
  const c = collectErrors(page);
  // headless Chromium bez přístupu k push službě hlásí chybu registrace; to není chyba aplikace
  c.ignore(/push service|Registration failed|AbortError/i);
  await visit(page, "/nastaveni/upozorneni", c);
  // bez klíčů VAPID (čistá instance, CI) je push vypnutý na straně serveru a není co zapínat; zvoneček a předvolby
  // pokrývá předchozí test, zde se jen zdokumentuje, že zařízení nešlo ověřit
  const pushOff = page.getByTestId("push-disabled");
  await expect(pushOff.or(page.getByTestId("push-state"))).toBeVisible();
  if (await pushOff.isVisible()) {
    test.info().annotations.push({
      type: "nelze ověřit",
      description:
        "Server nemá VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, push upozornění v zařízení jsou vypnutá.",
    });
    await ctx.close();
    setup = undefined;
    return;
  }
  await expect(page.getByTestId("push-state")).toBeVisible();
  await expect(
    page.getByTestId("devices-empty").or(page.getByTestId("devices-list")),
  ).toBeVisible();

  await page.getByRole("button", { name: "Zapnout v tomto zařízení" }).click();
  const on = page.getByText("V tomto zařízení: zapnuto");
  const failed = page.getByRole("alert").filter({ hasText: /\S/ }).first();
  await expect(on.or(failed)).toBeVisible({ timeout: 30_000 });
  if (await failed.isVisible()) {
    test.info().annotations.push({
      type: "nelze ověřit",
      description: `Prohlížeč v testu nezískal odběr u push služby: ${await failed.innerText()}`,
    });
    await ctx.close();
    setup = undefined;
    return;
  }
  await expect(page.getByTestId("devices-list").getByText("Toto zařízení")).toBeVisible();

  await page.getByRole("button", { name: "Pošli mi zkušební upozornění" }).click();
  await expect(page.getByText(/Zařazeno do fronty|Odesláno na|Neodesláno/)).toBeVisible({
    timeout: 10_000,
  });
  // worker (pokud běží) zprávu odešle; jinak zůstane ve frontě a stránka to řekne
  await expect(page.getByText(/Odesláno na \d|stále čeká ve frontě|Neodesláno/)).toBeVisible({
    timeout: 45_000,
  });

  await page.getByRole("button", { name: "Vypnout v tomto zařízení" }).click();
  await expect(page.getByText("V tomto zařízení: vypnuto")).toBeVisible();
  expectClean(c, "zařízení");
  await ctx.close();
  setup = undefined;
});

test("mobil: stránka se vejde na šířku telefonu a nemá vodorovné posouvání", async ({
  browser,
}) => {
  const { ctx, page } = await pageAs(browser, "worker1", { mobile: true });
  setup = ctx;
  const c = collectErrors(page);
  await visit(page, "/nastaveni/upozorneni", c);
  await expect(page.getByRole("heading", { name: "Upozornění", level: 2 })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await ctx.close();
  setup = undefined;
});
