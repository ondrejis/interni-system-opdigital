import { expect, test } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs } from "./roles";

/**
 * Regrese: Nastavení → Upozornění se musí hydratovat bez chyby (React #418) bez ohledu na časové pásmo prohlížeče.
 * Server běží v Europe/Prague (TZ v kontejneru), prohlížeč uživatele i CI runneru v jiném pásmu (UTC). Protokol doručení
 * a seznam zařízení vypisují časy; kdyby se formátovaly pásmem stroje, text ze serveru a z prohlížeče by se lišil.
 * Plný význam má proti serveru S klíči VAPID (`pnpm check:fresh:push`, v CI kontejner): pak se vykreslí i větev „push
 * zapnutý“ (stav zařízení z prohlížeče, seznam zařízení). Bez klíčů test ověří aspoň protokol doručení.
 */
test.use({ channel: "chromium" });

for (const timezoneId of ["UTC", "Pacific/Auckland", "America/Los_Angeles"]) {
  test(`upozornění se hydratují bez chyby a časy jsou české (prohlížeč v ${timezoneId})`, async ({
    browser,
  }) => {
    const { ctx, page } = await pageAs(browser, "office", {
      viewport: { width: 1280, height: 900 },
      timezoneId,
    });
    try {
      const c = collectErrors(page);
      await visit(page, "/nastaveni/upozorneni", c);
      // jedna z větví zařízení se vykreslila (push vypnutý na serveru, nebo zapnutý a seznam načtený po připojení)
      await expect(
        page.getByTestId("push-disabled").or(page.getByTestId("push-state")),
      ).toBeVisible();
      // protokol doručení má řádky (demo data) a čas v české zóně: stejný text bez ohledu na pásmo prohlížeče
      const first = page.getByTestId("deliveries-list").locator("li").first();
      await expect(first).toBeVisible();
      const iso = await first.evaluate((li) => li.getAttribute("data-created-at"));
      expect(iso, "řádek protokolu nese čas vzniku v ISO (data-created-at)").toBeTruthy();
      const expected = await page.evaluate(
        (v) =>
          new Intl.DateTimeFormat("cs-CZ", {
            timeZone: "Europe/Prague",
            day: "numeric",
            month: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
            .formatToParts(new Date(v!))
            .filter((p) => ["day", "month", "hour", "minute"].includes(p.type))
            .map((p) => Number(p.value)),
        iso,
      );
      const [d, m, h, min] = expected as number[];
      await expect(first.getByTestId("delivery-when")).toHaveText(
        `${d}. ${m}. ${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
      );
      // nic nebylo vynuceno potlačením varování hydratace: po načtení znovu bez chyb
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => undefined);
      expectClean(c, `/nastaveni/upozorneni po obnovení (${timezoneId})`);
    } finally {
      await ctx.close();
    }
  });
}
