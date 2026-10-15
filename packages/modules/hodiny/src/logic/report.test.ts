import { describe, expect, it } from "vitest";
import { dayTotals, groupHours, periodOf, shiftAnchor, type HourFact } from "./report";

describe("periodOf", () => {
  it("týden od pondělí do neděle", () => {
    expect(periodOf("week", "2026-10-14")).toEqual({
      kind: "week",
      from: "2026-10-12",
      to: "2026-10-18",
    });
    expect(periodOf("week", "2026-10-18").from).toBe("2026-10-12");
    expect(periodOf("week", "2026-10-12").from).toBe("2026-10-12");
  });

  it("měsíc od prvního do posledního dne (i přestupný únor)", () => {
    expect(periodOf("month", "2026-10-14")).toEqual({
      kind: "month",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(periodOf("month", "2028-02-10").to).toBe("2028-02-29");
  });

  it("týden přes konec roku", () => {
    expect(periodOf("week", "2026-12-31")).toMatchObject({ from: "2026-12-28", to: "2027-01-03" });
  });
});

describe("shiftAnchor", () => {
  it("týdny", () => {
    expect(shiftAnchor("week", "2026-10-14", 1)).toBe("2026-10-19");
    expect(shiftAnchor("week", "2026-10-14", -1)).toBe("2026-10-05");
  });

  it("měsíce jdou přes hranici roku", () => {
    expect(shiftAnchor("month", "2026-12-15", 1)).toBe("2027-01-01");
    expect(shiftAnchor("month", "2026-01-31", -1)).toBe("2025-12-01");
  });
});

const facts: HourFact[] = [
  { userId: "o", jobId: "A", date: "2026-10-12", minutes: 60 },
  { userId: "o", jobId: "B", date: "2026-10-12", minutes: 120 },
  { userId: "p", jobId: "A", date: "2026-10-13", minutes: 240 },
  { userId: "o", jobId: "A", date: "2026-10-14", minutes: 30 },
];

describe("groupHours", () => {
  it("podle zakázky: zakázky od největší, v nich osoby", () => {
    const g = groupHours(facts, "job");
    expect(g.map((r) => [r.id, r.minutes])).toEqual([
      ["A", 330],
      ["B", 120],
    ]);
    expect(g[0]!.parts).toEqual([
      { id: "p", minutes: 240 },
      { id: "o", minutes: 90 },
    ]);
  });

  it("podle osoby: osoby od největší, v nich zakázky", () => {
    const g = groupHours(facts, "person");
    expect(g.map((r) => [r.id, r.minutes])).toEqual([
      ["p", 240],
      ["o", 210],
    ]);
    expect(g[1]!.parts).toEqual([
      { id: "B", minutes: 120 },
      { id: "A", minutes: 90 },
    ]);
  });

  it("výsledek nezávisí na pořadí vstupu", () => {
    expect(groupHours([...facts].reverse(), "job")).toEqual(groupHours(facts, "job"));
  });

  it("prázdný vstup", () => {
    expect(groupHours([], "job")).toEqual([]);
  });
});

describe("dayTotals", () => {
  it("každý den období, i prázdný", () => {
    const t = dayTotals(periodOf("week", "2026-10-12"), facts);
    expect(t).toHaveLength(7);
    expect(t[0]).toEqual({ date: "2026-10-12", minutes: 180 });
    expect(t[1]).toEqual({ date: "2026-10-13", minutes: 240 });
    expect(t[3]).toEqual({ date: "2026-10-15", minutes: 0 });
  });
});
