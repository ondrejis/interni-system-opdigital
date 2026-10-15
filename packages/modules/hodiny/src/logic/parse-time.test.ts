import { describe, expect, it } from "vitest";
import {
  MAX_DAY_MINUTES,
  formatDuration,
  parseCellDuration,
  parseDuration,
  type ParsedDuration,
} from "./parse-time";

const minutes = (text: string): number | string => {
  const r: ParsedDuration = parseDuration(text);
  return r.ok ? r.minutes : r.error;
};

describe("parseDuration: hodiny desetinně", () => {
  it.each([
    ["1,5", 90],
    ["1.5", 90],
    ["2", 120],
    ["0,25", 15],
    ["0.5", 30],
    ["8", 480],
    ["1,75", 105],
    ["0,33", 20], // 19,8 minuty se zaokrouhlí
    ["0", 0],
    ["24", MAX_DAY_MINUTES],
  ])("%s → %i min", (text, expected) => {
    expect(minutes(text)).toBe(expected);
  });
});

describe("parseDuration: h:mm", () => {
  it.each([
    ["1:30", 90],
    ["0:45", 45],
    ["8:00", 480],
    ["12:05", 725],
    ["0:00", 0],
    ["  1:30  ", 90],
  ])("%s → %i min", (text, expected) => {
    expect(minutes(text)).toBe(expected);
  });

  it("minuty nad 59 jsou chyba", () => {
    expect(minutes("1:75")).toMatch(/0 až 59/);
  });

  it("neúplné minuty (1:5) nejsou čas", () => {
    expect(minutes("1:5")).toMatch(/Zadejte čas/);
  });
});

describe("parseDuration: jednotky", () => {
  it.each([
    ["90m", 90],
    ["90 m", 90],
    ["45min", 45],
    ["45 min", 45],
    ["45 minut", 45],
    ["2h", 120],
    ["2 h", 120],
    ["2 hod", 120],
    ["2 hodiny", 120],
    ["1 hodina", 60],
    ["1,5h", 90],
    ["1.5 hod", 90],
    ["1h30", 90],
    ["1 h 30", 90],
    ["1h 30m", 90],
    ["1h30m", 90],
    ["1 h 30 min", 90],
    ["1 hod 30 min", 90],
    ["2H", 120],
    ["30M", 30],
  ])("%s → %i min", (text, expected) => {
    expect(minutes(text)).toBe(expected);
  });

  it("nezlomitelná mezera se bere jako mezera", () => {
    expect(minutes("1 h 30 min")).toBe(90);
  });
});

describe("parseDuration: chyby", () => {
  it("prázdný text", () => {
    expect(minutes("")).toMatch(/Zadejte čas/);
    expect(minutes("   ")).toMatch(/Zadejte čas/);
  });

  it("písmena, nesmysly a jednotka bez čísla", () => {
    for (const bad of ["abc", "h", "m", "1,5,5", "1:2:3", "1 hod 30 hod", "1/2", "1,"]) {
      const r = parseDuration(bad);
      expect(r.ok, bad).toBe(false);
    }
  });

  it("záporný čas", () => {
    expect(minutes("-1")).toMatch(/záporný/);
    expect(minutes("−2:00")).toMatch(/záporný/);
  });

  it("víc než 24 hodin: nápověda k minutám", () => {
    expect(minutes("90")).toMatch(/Nejvýš 24 hodin/);
    expect(minutes("25:00")).toMatch(/Nejvýš 24 hodin/);
    expect(minutes("1500m")).toMatch(/Nejvýš 24 hodin/);
  });
});

describe("parseCellDuration", () => {
  it("prázdná buňka znamená 0 (smazání)", () => {
    expect(parseCellDuration("")).toEqual({ ok: true, minutes: 0 });
    expect(parseCellDuration("  ")).toEqual({ ok: true, minutes: 0 });
  });

  it("jinak jako parseDuration", () => {
    expect(parseCellDuration("1,5")).toEqual({ ok: true, minutes: 90 });
    expect(parseCellDuration("x").ok).toBe(false);
  });
});

describe("formatDuration", () => {
  it("h:mm", () => {
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(725)).toBe("12:05");
    expect(formatDuration(-10)).toBe("0:00");
  });

  it("desetinně s čárkou", () => {
    expect(formatDuration(90, "decimal")).toBe("1,5");
    expect(formatDuration(60, "decimal")).toBe("1");
    expect(formatDuration(15, "decimal")).toBe("0,25");
    expect(formatDuration(20, "decimal")).toBe("0,33");
    expect(formatDuration(0, "decimal")).toBe("0");
  });

  it("výstup se dá zpět rozebrat (kromě zaokrouhlení desetin)", () => {
    for (const m of [1, 15, 45, 90, 125, 480, 1440]) {
      expect(minutes(formatDuration(m))).toBe(m);
    }
    expect(minutes(formatDuration(90, "decimal"))).toBe(90);
  });
});
