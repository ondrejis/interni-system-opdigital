import { describe, expect, it } from "vitest";
import {
  CORE_NOTIFICATION_EVENTS,
  NotificationCatalogError,
  configureNotifications,
  resetNotifications,
  validateEventDefs,
} from "./catalog";
import { notificationsConfigSchema, type NotificationsConfig, type UserPrefs } from "./config";
import { renderBody, renderTitle, renderUrl } from "./render";
import { planDelivery, resolveEvent, type PlanContext } from "./rules";
import { countOf, plural } from "./text";
import { inQuietHours, nextDailyTime, quietEnd } from "./times";
import { defineNotificationEvent, type AnyEventDef } from "./types";
import { validateRule } from "./validate";

const TZ = "Europe/Prague";
const at = (iso: string) => new Date(iso);

const EVENT = defineNotificationEvent({
  key: "test.change",
  label: "Změna",
  description: "Test",
  group: "Test",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { team: "Tým" },
  recipients: ["team"],
  params: {
    number: { label: "Číslo", example: "Z-1" },
    amount: { label: "Částka", example: "10 000 Kč", sensitive: "money" },
  },
  template: {
    title: "{number}: schváleno {amount}",
    body: "Zakázka {number}\nČástka {amount}",
    url: "/zakazky/{entityId}",
  },
});

describe("tiché hodiny a denní časy", () => {
  const quiet = { enabled: true, start: "20:00", end: "06:00" };

  it("okno přes půlnoc", () => {
    expect(inQuietHours(at("2026-10-09T17:59:00Z"), quiet, TZ)).toBe(false); // 19:59 místně
    expect(inQuietHours(at("2026-10-09T18:00:00Z"), quiet, TZ)).toBe(true); // 20:00
    expect(inQuietHours(at("2026-10-10T03:59:00Z"), quiet, TZ)).toBe(true); // 05:59
    expect(inQuietHours(at("2026-10-10T04:00:00Z"), quiet, TZ)).toBe(false); // 06:00
    expect(inQuietHours(at("2026-10-09T18:00:00Z"), { ...quiet, enabled: false }, TZ)).toBe(false);
  });

  it("okno v rámci dne a konec tichých hodin", () => {
    const day = { enabled: true, start: "12:00", end: "13:00" };
    expect(inQuietHours(at("2026-10-09T10:30:00Z"), day, TZ)).toBe(true);
    expect(quietEnd(at("2026-10-09T10:30:00Z"), day, TZ)).toEqual(at("2026-10-09T11:00:00Z"));
    expect(quietEnd(at("2026-10-09T08:00:00Z"), day, TZ)).toEqual(at("2026-10-09T08:00:00Z"));
  });

  it("konec o půlnoci i po půlnoci míří na správné ráno", () => {
    expect(quietEnd(at("2026-10-09T18:30:00Z"), quiet, TZ)).toEqual(at("2026-10-10T04:00:00Z"));
    expect(quietEnd(at("2026-10-10T01:00:00Z"), quiet, TZ)).toEqual(at("2026-10-10T04:00:00Z"));
  });

  it("jarní změna času: noc je o hodinu kratší, ráno je pořád v 6:00 místního času", () => {
    // sobota 28. 3. 2026 22:00 SEČ → neděle 29. 3. 06:00 SELČ (UTC+2) = 04:00Z
    expect(quietEnd(at("2026-03-28T21:00:00Z"), quiet, TZ)).toEqual(at("2026-03-29T04:00:00Z"));
    // po změně času (03:30 SELČ = 01:30Z) jsou tiché hodiny pořád aktivní
    expect(inQuietHours(at("2026-03-29T01:30:00Z"), quiet, TZ)).toBe(true);
  });

  it("podzimní změna času: noc je o hodinu delší, ráno je pořád v 6:00 místního času", () => {
    // sobota 24. 10. 2026 22:00 SELČ (20:00Z) → neděle 25. 10. 06:00 SEČ (UTC+1) = 05:00Z
    expect(quietEnd(at("2026-10-24T20:00:00Z"), quiet, TZ)).toEqual(at("2026-10-25T05:00:00Z"));
    expect(inQuietHours(at("2026-10-25T04:30:00Z"), quiet, TZ)).toBe(true); // 05:30 SEČ
    expect(inQuietHours(at("2026-10-25T05:00:00Z"), quiet, TZ)).toBe(false); // 06:00 SEČ
  });

  it("denní časy shrnutí: nejbližší po okamžiku, přes půlnoc i změnu času", () => {
    const times = ["07:00", "16:00"];
    expect(nextDailyTime(at("2026-10-09T04:00:00Z"), times, TZ)).toEqual(
      at("2026-10-09T05:00:00Z"),
    ); // 06:00 → 07:00
    expect(nextDailyTime(at("2026-10-09T05:00:00Z"), times, TZ)).toEqual(
      at("2026-10-09T14:00:00Z"),
    ); // 07:00 → 16:00
    expect(nextDailyTime(at("2026-10-09T14:00:00Z"), times, TZ)).toEqual(
      at("2026-10-10T05:00:00Z"),
    ); // po 16:00 → zítra 07:00
    // v noci na neděli se změnou času je 07:00 už letní (05:00Z)
    expect(nextDailyTime(at("2026-03-28T21:00:00Z"), times, TZ)).toEqual(
      at("2026-03-29T05:00:00Z"),
    );
    // podzim: 07:00 zimní = 06:00Z
    expect(nextDailyTime(at("2026-10-24T21:00:00Z"), times, TZ)).toEqual(
      at("2026-10-25T06:00:00Z"),
    );
  });

  it("neexistující místní čas (02:30 při jarním skoku) se posune dopředu, ne do minulosti", () => {
    const next = nextDailyTime(at("2026-03-29T00:00:00Z"), ["02:30"], TZ);
    expect(next.getTime()).toBeGreaterThan(at("2026-03-29T00:00:00Z").getTime());
    expect(next.getTime()).toBeLessThanOrEqual(at("2026-03-29T02:00:00Z").getTime());
  });
});

describe("složení pravidel události", () => {
  it("pořadí vrstev: katalog → konfigurace klienta → úpravy správce", () => {
    const eff = resolveEvent(
      EVENT,
      { channels: { email: true }, severity: "urgent", recipients: ["team", "perm:x.y"] },
      { channels: { email: false, push: false }, title: "Vlastní: {number}" },
    );
    expect(eff.channels).toEqual({ push: false, bell: true, email: false });
    expect(eff.severity).toBe("urgent");
    expect(eff.recipients).toEqual(["team", "perm:x.y"]);
    expect(eff.title).toBe("Vlastní: {number}");
    expect(eff.body).toBe(EVENT.template.body);
    expect(eff.overridden).toEqual({ config: true, admin: true });
    expect(resolveEvent(EVENT).overridden).toEqual({ config: false, admin: false });
    // prázdný podtitulek ho vypne
    expect(resolveEvent(EVENT, undefined, { body: "" }).body).toBeUndefined();
  });

  it("kontrola úprav: neznámý příjemce a parametr", () => {
    expect(validateRule(EVENT, { recipients: ["team", "perm:a.b", "role:owner"] })).toEqual([]);
    expect(validateRule(EVENT, { recipients: ["nikdo"] })[0]).toMatch(/neexistuje/);
    expect(validateRule(EVENT, { title: "{number} {neznamy}" })[0]).toMatch(
      /neznámý parametr {neznamy}/,
    );
    expect(validateRule(EVENT, { body: "{entityId} {count}" })).toEqual([]);
  });
});

describe("rozhodnutí o doručení", () => {
  const config: NotificationsConfig = notificationsConfigSchema.parse({
    quietHours: { enabled: true, start: "20:00", end: "06:00" },
    digestTimes: ["07:00", "16:00"],
  });
  const ctx = (now: string, over: Partial<PlanContext> = {}): PlanContext => ({
    now: at(now),
    timezone: TZ,
    config,
    ...over,
  });
  const eff = (e: AnyEventDef = EVENT, c = {}) => resolveEvent(e, c);
  const day = "2026-10-09T09:00:00Z"; // 11:00 místně
  const night = "2026-10-09T21:00:00Z"; // 23:00 místně

  it("výchozí: okamžitě, zvoneček zapnutý", () => {
    const p = planDelivery(eff(), null, ctx(day));
    expect(p.bell).toBe(true);
    expect(p.email).toBe(false);
    expect(p.push).toEqual({ deliver: true, mode: "instant", releaseAt: at(day) });
  });

  it("tiché hodiny zdrží push do rána, zvoneček jde hned", () => {
    const p = planDelivery(eff(), null, ctx(night));
    expect(p.bell).toBe(true);
    expect(p.push).toEqual({ deliver: true, mode: "quiet", releaseAt: at("2026-10-10T04:00:00Z") });
  });

  it("naléhavé prosadí tiché hodiny i shrnutí", () => {
    const urgent = eff(EVENT, { severity: "urgent" });
    const prefs: UserPrefs = { events: { "test.change": { push: "digest" } } };
    expect(planDelivery(urgent, prefs, ctx(night)).push).toMatchObject({ mode: "instant" });
  });

  it("shrnutí místo okamžitých: push čeká na nejbližší čas shrnutí", () => {
    const prefs: UserPrefs = { events: { "test.change": { push: "digest" } } };
    expect(planDelivery(eff(), prefs, ctx(day)).push).toEqual({
      deliver: true,
      mode: "digest",
      releaseAt: at("2026-10-09T14:00:00Z"), // 16:00
    });
  });

  it("uživatel push vypne; povinná událost vypnutí ignoruje", () => {
    const prefs: UserPrefs = {
      events: { "test.change": { push: "off", bell: false, email: true } },
    };
    const off = planDelivery(eff(), prefs, ctx(day));
    expect(off.push).toEqual({ deliver: false, reason: "user_off" });
    expect(off.bell).toBe(false);
    expect(off.email).toBe(true);
    const mandatory = planDelivery(eff(EVENT, { mandatory: true }), prefs, ctx(day));
    expect(mandatory.push).toMatchObject({ deliver: true, mode: "instant" });
    expect(mandatory.bell).toBe(true);
    expect(mandatory.email).toBe(false);
  });

  it("událost s vypnutým výchozím pushem: důvod event_off, uživatel ho může zapnout", () => {
    const quiet = eff(EVENT, { channels: { push: false } });
    expect(planDelivery(quiet, null, ctx(day)).push).toEqual({
      deliver: false,
      reason: "event_off",
    });
    const prefs: UserPrefs = { events: { "test.change": { push: "instant" } } };
    expect(planDelivery(quiet, prefs, ctx(day)).push).toMatchObject({ deliver: true });
  });

  it("vlastní tiché hodiny uživatele mají přednost před klientem a správcem", () => {
    const prefs: UserPrefs = {
      events: {},
      quiet: { enabled: false, start: "20:00", end: "06:00" },
    };
    expect(planDelivery(eff(), prefs, ctx(night)).push).toMatchObject({ mode: "instant" });
    const adminQuiet = ctx(night, {
      rules: { quietHours: { enabled: false, start: "20:00", end: "06:00" } },
    });
    expect(planDelivery(eff(), null, adminQuiet).push).toMatchObject({ mode: "instant" });
  });

  it("zdržení kvůli sloučení bouřky (debounce) se přičte", () => {
    const debounced = { ...EVENT, debounceSeconds: 45 } as AnyEventDef;
    expect(planDelivery(eff(debounced), null, ctx(day)).push).toEqual({
      deliver: true,
      mode: "instant",
      releaseAt: at("2026-10-09T09:00:45Z"),
    });
  });
});

describe("skládání textu pro příjemce", () => {
  const values = { number: "Z-2026-014", amount: "52 000 Kč", entityId: "abc 1" };

  it("dosadí parametry", () => {
    expect(renderTitle("{number}: schváleno {amount}", values, new Set())).toBe(
      "Z-2026-014: schváleno 52 000 Kč",
    );
  });

  it("nedostupný parametr zmizí i s oddělovačem", () => {
    const f = new Set(["amount"]);
    expect(renderTitle("{number}: schváleno {amount}", values, f)).toBe("Z-2026-014: schváleno");
    expect(renderTitle("{number} · {amount}", values, f)).toBe("Z-2026-014");
    expect(renderTitle("{number} ({amount})", values, f)).toBe("Z-2026-014");
    expect(renderTitle("{number}, {amount}", values, f)).toBe("Z-2026-014");
    expect(renderTitle("Částka {amount}", values, f)).toBe("Částka");
  });

  it("chybějící hodnota se chová stejně jako nedostupná", () => {
    expect(renderTitle("{number}: {x}", { number: "Z-1", x: "" }, new Set())).toBe("Z-1");
    expect(renderTitle("{number}: {x}", { number: "Z-1" }, new Set())).toBe("Z-1");
  });

  it("podtitulek vynechá celý řádek s nedostupným parametrem", () => {
    expect(renderBody("Zakázka {number}\nČástka {amount}", values, new Set(["amount"]))).toBe(
      "Zakázka Z-2026-014",
    );
    expect(renderBody("Částka {amount}", values, new Set(["amount"]))).toBeNull();
    expect(renderBody(undefined, values, new Set())).toBeNull();
  });

  it("odkaz zakóduje hodnoty a nepustí cizí adresu", () => {
    expect(renderUrl("/zakazky/{entityId}", values)).toBe("/zakazky/abc%201");
    expect(renderUrl("/x/{number}", { number: "https://evil.example" })).toBe(
      "/x/https%3A%2F%2Fevil.example",
    );
    expect(renderUrl("//evil.example/{number}", values)).toBe("/inbox");
    expect(renderUrl("https://evil.example", values)).toBe("/inbox");
  });

  it("skloňování", () => {
    expect([1, 2, 5].map((n) => plural(n, "úkol", "úkoly", "úkolů"))).toEqual([
      "úkol",
      "úkoly",
      "úkolů",
    ]);
    expect(countOf(3, "úkol", "úkoly", "úkolů")).toBe("3 úkoly");
  });
});

describe("katalog událostí", () => {
  it("události jádra jsou platné", () => {
    expect(validateEventDefs(CORE_NOTIFICATION_EVENTS)).toEqual([]);
  });

  it("odhalí duplicitu, neznámý parametr v šabloně a příjemce mimo skupiny", () => {
    const bad = defineNotificationEvent({
      key: "bad.event",
      label: "x",
      description: "x",
      group: "x",
      severity: "normal",
      channels: {},
      audiences: { a: "A" },
      recipients: ["b"],
      params: { p: { label: "p", example: "p" } },
      template: { title: "{q}", url: "nope" },
    });
    const problems = validateEventDefs([bad, bad]);
    expect(problems.join("\n")).toMatch(/dvakrát/);
    expect(problems.join("\n")).toMatch(/neznámý parametr {q}/);
    expect(problems.join("\n")).toMatch(/odkaz musí začínat/);
    expect(problems.join("\n")).toMatch(/příjemce „b“/);
  });

  it("configureNotifications odmítne neznámou událost v konfiguraci klienta", () => {
    try {
      expect(() =>
        configureNotifications({
          events: [],
          config: notificationsConfigSchema.parse({
            events: { "neexistuje.udalost": { enabled: false } },
          }),
        }),
      ).toThrow(NotificationCatalogError);
      expect(() =>
        configureNotifications({
          events: [],
          config: notificationsConfigSchema.parse({
            events: { "task.assigned": { recipients: ["nikdo"] } },
          }),
        }),
      ).toThrow(/neexistuje/);
    } finally {
      resetNotifications();
    }
  });

  it("schéma konfigurace odmítne neplatné časy a překlepy", () => {
    expect(() =>
      notificationsConfigSchema.parse({
        quietHours: { enabled: true, start: "25:00", end: "06:00" },
      }),
    ).toThrow();
    expect(() =>
      notificationsConfigSchema.parse({ events: { "a.b": { enabld: false } } }),
    ).toThrow();
    expect(notificationsConfigSchema.parse({}).quietHours).toEqual({
      enabled: true,
      start: "20:00",
      end: "06:00",
    });
  });
});
