import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  addMonthsIso,
  addWorkdays,
  czechHolidays,
  diffDaysIso,
  formatClock,
  formatInstant,
  formatMinutes,
  isWorkday,
  isoWeekday,
  monthFundMinutes,
  monthRange,
  timeToMinutes,
  todayIso,
  weekStartIso,
  workingDays,
} from "./dates";

describe("data a pracovní dny", () => {
  it("přičítání dnů přes změnu času a přes konec roku", () => {
    expect(addDaysIso("2026-03-28", 2)).toBe("2026-03-30"); // přechod na letní čas
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDaysIso("2026-10-01", "2026-10-08")).toBe(7);
    expect(isoWeekday("2026-10-08")).toBe(4); // čtvrtek
    expect(isoWeekday("2026-10-11")).toBe(7);
    expect(weekStartIso("2026-10-11")).toBe("2026-10-05");
  });

  it("svátky včetně velikonočních (2026: Velký pátek 3. 4., pondělí 6. 4.)", () => {
    const h = czechHolidays(2026);
    expect(h.get("2026-04-03")).toBe("Velký pátek");
    expect(h.get("2026-04-06")).toBe("Velikonoční pondělí");
    expect(h.get("2026-10-28")).toBeDefined();
    expect(h.size).toBe(13);
    expect(czechHolidays(2025).get("2025-04-18")).toBe("Velký pátek");
  });

  it("pracovní den není víkend ani svátek; posun o pracovní dny je přeskakuje", () => {
    expect(isWorkday("2026-10-08")).toBe(true);
    expect(isWorkday("2026-10-10")).toBe(false);
    expect(isWorkday("2026-10-28")).toBe(false);
    expect(addWorkdays("2026-10-09", 1)).toBe("2026-10-12"); // pátek → pondělí
    expect(addWorkdays("2026-10-27", 1)).toBe("2026-10-29"); // přes svátek 28. 10.
    expect(addWorkdays("2026-10-12", -1)).toBe("2026-10-09");
    expect(addWorkdays("2026-10-10", 0)).toBe("2026-10-12");
    expect(workingDays("2026-10-26", "2026-10-30")).toHaveLength(4);
  });

  it("fond měsíce a formát minut", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02").to).toBe("2028-02-29");
    // říjen 2026: 22 pracovních dnů minus 28. 10. (středa) = 21
    expect(monthFundMinutes("2026-10", 8)).toBe(21 * 8 * 60);
    expect(monthFundMinutes("2026-10", 8, [1, 2, 3, 4, 5], 0.5)).toBe(21 * 4 * 60);
    expect(formatMinutes(450)).toBe("7:30 h");
    expect(formatMinutes(-90, false)).toBe("−1:30");
    expect(timeToMinutes("07:30")).toBe(450);
  });

  it("dnes se počítá v české zóně", () => {
    expect(todayIso("Europe/Prague", new Date("2026-06-30T22:30:00Z"))).toBe("2026-07-01");
    expect(todayIso("UTC", new Date("2026-06-30T22:30:00Z"))).toBe("2026-06-30");
  });
});

describe("měsíce", () => {
  it("posune datum o měsíce a zkrátí den na konec kratšího měsíce", () => {
    expect(addMonthsIso("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsIso("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsIso("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonthsIso("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonthsIso("2026-05-10", 12)).toBe("2027-05-10");
    expect(addMonthsIso("2026-12-31", 2)).toBe("2027-02-28");
  });
});

describe("časová zóna", () => {
  it("místní čas v Praze ↔ UTC přes letní i zimní čas", async () => {
    const { localParts, zonedToUtc } = await import("./dates");
    expect(zonedToUtc("2026-07-01", "07:00").toISOString()).toBe("2026-07-01T05:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "07:00").toISOString()).toBe("2026-12-01T06:00:00.000Z");
    expect(localParts(new Date("2026-07-01T05:00:00Z"))).toEqual({
      date: "2026-07-01",
      time: "07:00",
    });
    expect(localParts(new Date("2026-06-30T22:30:00Z"))).toEqual({
      date: "2026-07-01",
      time: "00:30",
    });
    // den přechodu na letní čas (29. 3. 2026): 01:30 je ještě zimní (UTC+1), 03:30 už letní (UTC+2)
    expect(zonedToUtc("2026-03-29", "01:30").toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(zonedToUtc("2026-03-29", "03:30").toISOString()).toBe("2026-03-29T01:30:00.000Z");
    // kruhová zkouška
    const t = zonedToUtc("2026-10-25", "08:15");
    expect(localParts(t)).toEqual({ date: "2026-10-25", time: "08:15" });
  });
});

describe("formatInstant a formatClock (stejný text na serveru i v prohlížeči)", () => {
  it("skládá krátký český text v české zóně včetně letního a zimního času", () => {
    expect(formatInstant("2026-10-08T12:30:00Z")).toBe("8. 10. 14:30"); // CEST
    expect(formatInstant("2026-01-08T12:30:00Z")).toBe("8. 1. 13:30"); // CET
    expect(formatInstant("2026-10-08T12:30:00Z", { year: true })).toBe("8. 10. 2026 14:30");
    expect(formatInstant("2026-10-08T12:30:00Z", { time: false, year: true })).toBe("8. 10. 2026");
    expect(formatInstant("2026-03-29T00:05:00Z")).toBe("29. 3. 01:05"); // půlnoc UTC je ještě v zimním čase
    expect(formatInstant("2026-10-08T22:30:00Z")).toBe("9. 10. 00:30"); // přes půlnoc místního dne
    expect(formatInstant("2026-10-08T12:30:00Z", { tz: "UTC" })).toBe("8. 10. 12:30");
    expect(formatClock("2026-10-08T07:05:00Z")).toBe("09:05");
  });

  it("neplatná nebo prázdná hodnota je pomlčka", () => {
    expect(formatInstant(null)).toBe("—");
    expect(formatInstant("")).toBe("—");
    expect(formatInstant("není datum")).toBe("—");
    expect(formatClock(undefined)).toBe("—");
  });

  it("nezávisí na časovém pásmu procesu (server v UTC, prohlížeč kdekoli)", () => {
    const before = process.env.TZ;
    try {
      const out = ["UTC", "Europe/Prague", "Pacific/Auckland", "America/Los_Angeles"].map((tz) => {
        process.env.TZ = tz;
        return formatInstant("2026-10-08T12:30:00Z");
      });
      expect(new Set(out)).toEqual(new Set(["8. 10. 14:30"]));
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});
