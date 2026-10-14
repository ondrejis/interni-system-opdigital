import { expect, test } from "@playwright/test";
import { pageAs } from "./roles";

/**
 * Service worker: příjem a zobrazení push upozornění. Skutečné doručení přes push službu (FCM, Apple) v automatizovaném
 * prohlížeči nejde (odběr skončí chybou „Registration failed – permission denied“), proto se zpráva doručí protokolem
 * DevTools (`ServiceWorker.deliverPushMessage`): service worker dostane skutečnou událost `push` a zobrazí skutečné
 * upozornění, které test přečte přes `registration.getNotifications()`. Funguje jen v plném Chromiu (`channel: "chromium"`);
 * headless shell upozornění neumí. Odběr přes push službu a doručení na iOS/Android zůstává ruční zkouškou
 * (docs/NOTIFICATIONS.md §12).
 */
test.use({ channel: "chromium" });

const origin = process.env.CRAWL_BASE_URL ?? "http://localhost:3100";

test("push: zobrazení, nahrazení stejným tagem, akce Odložit, záloha bez dat", async ({
  browser,
}) => {
  const { ctx, page } = await pageAs(browser, "foreman1");
  await ctx.grantPermissions(["notifications"], { origin });
  await page.goto("/nastaveni/upozorneni");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  const cdp = await ctx.newCDPSession(page);
  const registrations: { registrationId: string; scopeURL: string }[] = [];
  cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => registrations.push(...e.registrations));
  await cdp.send("ServiceWorker.enable");
  await expect
    .poll(() => registrations.find((r) => r.scopeURL.startsWith(origin))?.registrationId)
    .toBeTruthy();
  const registrationId = registrations.find((r) => r.scopeURL.startsWith(origin))!.registrationId;

  const deliver = (data: unknown) =>
    cdp.send("ServiceWorker.deliverPushMessage", {
      origin,
      registrationId,
      data: typeof data === "string" ? data : JSON.stringify(data),
    });
  const shown = () =>
    page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      return (await reg!.getNotifications()).map((n) => ({
        title: n.title,
        body: n.body,
        tag: n.tag,
        data: n.data as { url: string; nid: string | null },
        actions:
          (n as Notification & { actions?: { action: string }[] }).actions?.map((a) => a.action) ??
          [],
        requireInteraction: n.requireInteraction,
      }));
    });
  const clear = () =>
    page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      for (const n of await reg!.getNotifications()) n.close();
    });
  await clear();

  // běžné upozornění s odkazem a id
  await deliver({
    title: "Z-2026-014: změna harmonogramu",
    body: "Hrubá stavba",
    url: "/zakazky/abc",
    tag: "job.schedule:abc",
    nid: "0191a000-0000-7000-8000-000000000001",
    badge: 3,
  });
  await expect.poll(async () => (await shown()).length).toBe(1);
  let n = (await shown())[0]!;
  expect(n).toMatchObject({
    title: "Z-2026-014: změna harmonogramu",
    body: "Hrubá stavba",
    tag: "job.schedule:abc",
  });
  expect(n.data).toEqual({
    url: "/zakazky/abc",
    nid: "0191a000-0000-7000-8000-000000000001",
    tag: "job.schedule:abc",
  });
  expect(n.actions).toEqual(["open"]);

  // stejný tag nahradí staré upozornění (sloučené změny se neskládají na sebe)
  await deliver({
    title: "Z-2026-014: změna harmonogramu (20×)",
    url: "/zakazky/abc",
    tag: "job.schedule:abc",
    nid: "0191a000-0000-7000-8000-000000000001",
  });
  await expect
    .poll(async () => (await shown())[0]?.title)
    .toBe("Z-2026-014: změna harmonogramu (20×)");
  expect(await shown()).toHaveLength(1);

  // naléhavé s možností odložit: akce a požadavek na interakci; cizí adresa v odkazu se nahradí kořenem
  await deliver({
    title: "STK vozidla za 3 dny",
    url: "https://evil.example/phish",
    tag: "stroje.deadline:x",
    nid: "0191a000-0000-7000-8000-000000000002",
    urgent: true,
    snooze: true,
  });
  await expect.poll(async () => (await shown()).length).toBe(2);
  n = (await shown()).find((x) => x.tag === "stroje.deadline:x")!;
  expect(n.actions).toEqual(["open", "snooze"]);
  expect(n.requireInteraction).toBe(true);
  expect(n.data.url).toBe("/");

  // záloha: push bez dat, a push s nečitelným obsahem, se pořád zobrazí (Chrome to vyžaduje)
  await clear();
  await deliver("{rozbity json");
  await expect.poll(async () => (await shown()).length).toBe(1);
  expect((await shown())[0]).toMatchObject({ title: "Nové upozornění" });
  expect((await shown())[0]!.data.url).toBe("/inbox");
  await ctx.close();
});
