import { describe, expect, it } from "vitest";
import { localParts, zonedToUtc } from "@rebar/core/time";
import { expandEvent, overlap, type EventTimes } from "./recurrence";

const timed = (
  date: string,
  from: string,
  to: string,
  over: Partial<EventTimes> = {},
): EventTimes => ({
  startsAt: zonedToUtc(date, from),
  endsAt: zonedToUtc(date, to),
  allDay: false,
  recurrence: null,
  recurrenceUntil: null,
  ...over,
});
const dates = (o: { date: string }[]) => o.map((x) => x.date);

describe("neopakovaná událost", () => {
  it("jeden výskyt, jen když zasahuje do okna", () => {
    const ev = timed("2026-06-10", "09:00", "10:30");
    expect(dates(expandEvent(ev, "2026-06-01", "2026-06-30"))).toEqual(["2026-06-10"]);
    expect(expandEvent(ev, "2026-06-11", "2026-06-30")).toEqual([]);
    expect(dates(expandEvent(ev, "2026-06-10", "2026-06-10"))).toEqual(["2026-06-10"]);
  });

  it("událost přes půlnoc zasáhne i druhý den", () => {
    const ev: EventTimes = {
      startsAt: zonedToUtc("2026-06-10", "22:00"),
      endsAt: zonedToUtc("2026-06-11", "02:00"),
      allDay: false,
      recurrence: null,
      recurrenceUntil: null,
    };
    expect(expandEvent(ev, "2026-06-11", "2026-06-11")).toHaveLength(1);
    expect(expandEvent(ev, "2026-06-12", "2026-06-12")).toEqual([]);
  });

  it("celodenní událost trvá celé dny včetně posledního", () => {
    const ev: EventTimes = {
      startsAt: zonedToUtc("2026-06-10", "00:00"),
      endsAt: zonedToUtc("2026-06-13", "00:00"),
      allDay: true,
      recurrence: null,
      recurrenceUntil: null,
    };
    const [o] = expandEvent(ev, "2026-06-01", "2026-06-30");
    expect(o).toMatchObject({ date: "2026-06-10", endDate: "2026-06-12" });
    expect(expandEvent(ev, "2026-06-12", "2026-06-12")).toHaveLength(1);
    expect(expandEvent(ev, "2026-06-13", "2026-06-20")).toEqual([]);
  });
});

describe("opakování", () => {
  it("denně a každý pracovní den (přeskočí víkend)", () => {
    const daily = timed("2026-06-04", "08:00", "09:00", { recurrence: "daily" });
    expect(dates(expandEvent(daily, "2026-06-04", "2026-06-07"))).toEqual([
      "2026-06-04",
      "2026-06-05",
      "2026-06-06",
      "2026-06-07",
    ]);
    const wd = timed("2026-06-04", "08:00", "09:00", { recurrence: "weekdays" }); // čtvrtek
    expect(dates(expandEvent(wd, "2026-06-04", "2026-06-10"))).toEqual([
      "2026-06-04",
      "2026-06-05",
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
    ]);
  });

  it("týdně a měsíčně (31. v kratším měsíci připadne na poslední den)", () => {
    const weekly = timed("2026-06-01", "08:00", "09:00", { recurrence: "weekly" });
    expect(dates(expandEvent(weekly, "2026-06-01", "2026-06-30"))).toEqual([
      "2026-06-01",
      "2026-06-08",
      "2026-06-15",
      "2026-06-22",
      "2026-06-29",
    ]);
    const monthly = timed("2026-01-31", "08:00", "09:00", { recurrence: "monthly" });
    expect(dates(expandEvent(monthly, "2026-01-01", "2026-04-30"))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("platí do data „opakovat do“ včetně", () => {
    const ev = timed("2026-06-01", "08:00", "09:00", {
      recurrence: "daily",
      recurrenceUntil: "2026-06-03",
    });
    expect(dates(expandEvent(ev, "2026-05-01", "2026-12-31"))).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ]);
  });

  it("okno daleko za začátkem se spočítá rychle a správně", () => {
    const ev = timed("2020-01-06", "08:00", "09:00", { recurrence: "weekly" });
    const t = Date.now();
    const out = expandEvent(ev, "2026-10-01", "2026-10-31");
    expect(Date.now() - t).toBeLessThan(200);
    expect(dates(out)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    const daily = timed("2015-01-01", "08:00", "09:00", { recurrence: "daily" });
    expect(expandEvent(daily, "2026-10-01", "2026-10-03")).toHaveLength(3);
    const monthly = timed("2010-03-15", "08:00", "09:00", { recurrence: "monthly" });
    expect(dates(expandEvent(monthly, "2026-10-01", "2026-10-31"))).toEqual(["2026-10-15"]);
  });

  it("po změně letního času drží stejnou místní hodinu", () => {
    // poslední neděle v březnu 2026 je 29. 3.; týdenní událost každou neděli v 8:00
    const ev = timed("2026-03-22", "08:00", "09:00", { recurrence: "weekly" });
    const out = expandEvent(ev, "2026-03-22", "2026-03-29");
    expect(out).toHaveLength(2);
    expect(out.map((o) => localParts(o.start).time)).toEqual(["08:00", "08:00"]);
    expect(out[0]!.start.toISOString()).toBe("2026-03-22T07:00:00.000Z"); // zimní čas
    expect(out[1]!.start.toISOString()).toBe("2026-03-29T06:00:00.000Z"); // letní čas
  });

  it("opakovaná celodenní událost si drží délku", () => {
    const ev: EventTimes = {
      startsAt: zonedToUtc("2026-06-01", "00:00"),
      endsAt: zonedToUtc("2026-06-03", "00:00"),
      allDay: true,
      recurrence: "weekly",
      recurrenceUntil: null,
    };
    const out = expandEvent(ev, "2026-06-01", "2026-06-15");
    expect(out.map((o) => [o.date, o.endDate])).toEqual([
      ["2026-06-01", "2026-06-02"],
      ["2026-06-08", "2026-06-09"],
      ["2026-06-15", "2026-06-16"],
    ]);
    // okno, které začíná uprostřed vícedenního výskytu
    expect(dates(expandEvent(ev, "2026-06-09", "2026-06-09"))).toEqual(["2026-06-08"]);
  });
});

describe("překryv", () => {
  it("polootevřená období: návaznost není kolize", () => {
    const a = { start: new Date("2026-06-10T08:00:00Z"), end: new Date("2026-06-10T09:00:00Z") };
    const b = { start: new Date("2026-06-10T09:00:00Z"), end: new Date("2026-06-10T10:00:00Z") };
    const c = { start: new Date("2026-06-10T08:30:00Z"), end: new Date("2026-06-10T08:45:00Z") };
    expect(overlap(a, b)).toBe(false);
    expect(overlap(a, c)).toBe(true);
    expect(overlap(c, b)).toBe(false);
  });
});
