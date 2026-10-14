import { describe, expect, it } from "vitest";
import { validateEventDefs } from "@rebar/core/notifications";
import { clockRunText, expectedToWork, forgottenClockStage } from "./notice-rules";
import { dochazkaNotifications } from "./notifications";

const at = (iso: string) => new Date(iso);

describe("události docházky", () => {
  it("definice jsou platné", () => {
    expect(validateEventDefs(dochazkaNotifications)).toEqual([]);
  });

  it("zapomenutý odchod je naléhavý, jednou za den a s odložením; upozornění pro vedoucí běžné", () => {
    const keys = new Map(dochazkaNotifications.map((e) => [e.key, e]));
    expect(keys.get("dochazka.forgot_clock_out")).toMatchObject({
      severity: "urgent",
      dedupe: "day",
      snooze: true,
      scheduled: true,
    });
    expect(keys.get("dochazka.missing_clock_in")).toMatchObject({
      severity: "normal",
      dedupe: "day",
      snooze: true,
    });
    expect(keys.get("dochazka.forgot_clock_out_team")?.severity).toBe("normal");
  });
});

describe("zapomenutý odchod: rozhodnutí", () => {
  it("píchačka z předchozího dne se hlásí od rána, ale až po 10 h (noční směna ne)", () => {
    // pondělí 2. 3. 2026 v 7:00 CET: příchod v neděli 22:00 = 9 h → ještě ne, příchod v 18:00 = 13 h → ano
    const now = at("2026-03-02T06:00:00Z");
    expect(forgottenClockStage(at("2026-03-01T21:00:00Z"), now)).toBeNull();
    expect(forgottenClockStage(at("2026-03-01T17:00:00Z"), now)).toBe("carried");
  });

  it("v noci a před šestou se nehlásí nic (naléhavé upozornění obchází tiché hodiny)", () => {
    const start = at("2026-03-01T17:00:00Z");
    expect(forgottenClockStage(start, at("2026-03-01T23:30:00Z"))).toBeNull(); // 0:30 místního času
    expect(forgottenClockStage(start, at("2026-03-02T04:30:00Z"))).toBeNull(); // 5:30
    expect(forgottenClockStage(start, at("2026-03-02T05:00:00Z"))).toBe("carried"); // 6:00
    expect(forgottenClockStage(start, at("2026-03-02T21:00:00Z"))).toBeNull(); // 22:00
  });

  it("v jednom dni: po 12 h, nebo po 19:00 (a aspoň 6 h); večerní směna od 17:00 ne", () => {
    const day = (h: string) => at(`2026-05-12T${h}:00Z`); // CEST = UTC + 2
    expect(forgottenClockStage(day("04:00"), day("14:00"))).toBeNull(); // 6:00 → 16:00, 10 h
    expect(forgottenClockStage(day("04:00"), day("16:00"))).toBe("long"); // 12 h
    expect(forgottenClockStage(day("08:00"), day("17:00"))).toBe("evening"); // 10:00 → 19:00 (9 h)
    expect(forgottenClockStage(day("08:00"), day("16:59"))).toBeNull(); // 18:59
    expect(forgottenClockStage(day("15:00"), day("17:30"))).toBeNull(); // směna od 17:00, po 19:00 jen 2,5 h
  });

  it("jaro 2026 (29. 3.): den má 23 h, počítá se skutečný čas, ne rozdíl hodin na hodinkách", () => {
    // příchod 1:00 CET (= 00:00 UTC); poledne na hodinkách = 13 h, ale skutečně uplynulo 12 h až ve 14:00 CEST
    const start = at("2026-03-29T00:00:00Z");
    expect(forgottenClockStage(start, at("2026-03-29T11:59:00Z"))).toBeNull(); // 13:59 CEST, 11 h 59 min
    expect(forgottenClockStage(start, at("2026-03-29T12:00:00Z"))).toBe("long"); // 14:00 CEST, 12 h
  });

  it("podzim 2026 (25. 10.): den má 25 h, 12 h uplyne o hodinu později než na hodinkách", () => {
    // příchod 2:30 CEST (= 00:30 UTC), ve 13:30 CET je na hodinkách 11 h, skutečně 12 h
    const start = at("2026-10-25T00:30:00Z");
    expect(forgottenClockStage(start, at("2026-10-25T12:29:00Z"))).toBeNull();
    expect(forgottenClockStage(start, at("2026-10-25T12:30:00Z"))).toBe("long");
  });

  it("„dnes“ se určuje v pražském čase, ne v UTC", () => {
    // příchod 28. 3. ve 20:00 CET je ráno 29. 3. (7:00 CEST) „z předchozího dne“
    const start = at("2026-03-28T19:00:00Z");
    const next = at("2026-03-29T05:00:00Z"); // 7:00 CEST, 10 h od příchodu
    expect(forgottenClockStage(start, next)).toBe("carried");
    // 23:30 UTC 29. 3. je v Praze už 30. 3. 1:30 → mimo okno
    expect(forgottenClockStage(start, at("2026-03-29T23:30:00Z"))).toBeNull();
  });

  it("texty: dnes / datum a skutečně uplynulý čas", () => {
    const now = at("2026-03-29T12:00:00Z");
    expect(clockRunText(at("2026-03-29T00:00:00Z"), now)).toEqual({
      since: "dnes v 1:00",
      running: "12:00 h",
    });
    expect(clockRunText(at("2026-03-28T05:15:00Z"), now)).toEqual({
      since: "28. 3. 2026 v 6:15",
      running: "30:45 h",
    });
  });
});

describe("chybějící příchod: kdo má pracovat", () => {
  const people = [
    { userId: "a", employmentType: "hpp", startDate: null },
    { userId: "b", employmentType: "external", startDate: null },
    { userId: "c", employmentType: "dpp", startDate: "2026-04-01" },
    { userId: "d", employmentType: "hpp", startDate: "2026-03-01" },
    { userId: "e", employmentType: "osvc", startDate: null },
  ];

  it("vynechá externisty, ty, kdo ještě nenastoupili, a ty, kdo mají dnes záznam nebo běžící píchačku", () => {
    expect(expectedToWork(people, "2026-03-30", new Set(["e"]))).toEqual(["a", "d"]);
    expect(expectedToWork(people, "2026-04-01", new Set())).toEqual(["a", "c", "d", "e"]);
  });
});
