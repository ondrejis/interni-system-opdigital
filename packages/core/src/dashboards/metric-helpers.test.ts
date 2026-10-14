import { describe, expect, it } from "vitest";
import {
  capRangeToToday,
  choiceParam,
  clampLimit,
  dayRangeInstants,
  defaultForwardRange,
  numberChoiceParam,
  pct1,
} from "./metric-helpers";

describe("dayRangeInstants", () => {
  it("hranice dne je půlnoc v české zóně (zima +1, léto +2)", () => {
    const r = dayRangeInstants({ from: "2026-01-10", to: "2026-01-10" });
    expect(r.start.toISOString()).toBe("2026-01-09T23:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-01-10T23:00:00.000Z");
    const s = dayRangeInstants({ from: "2026-07-01", to: "2026-07-01" });
    expect(s.start.toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("jarní přechod na letní čas: den má 23 hodin, konec je pořád půlnoc", () => {
    const r = dayRangeInstants({ from: "2026-03-29", to: "2026-03-29" });
    expect((r.end.getTime() - r.start.getTime()) / 3_600_000).toBe(23);
    expect(r.end.toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });

  it("podzimní přechod: den má 25 hodin", () => {
    const r = dayRangeInstants({ from: "2026-10-25", to: "2026-10-25" });
    expect((r.end.getTime() - r.start.getTime()) / 3_600_000).toBe(25);
  });

  it("období přes přechod na sebe navazuje bez mezery", () => {
    const a = dayRangeInstants({ from: "2026-03-28", to: "2026-03-29" });
    const b = dayRangeInstants({ from: "2026-03-30", to: "2026-03-30" });
    expect(a.end.getTime()).toBe(b.start.getTime());
  });
});

describe("capRangeToToday", () => {
  it("zkrátí konec na dnešek", () => {
    expect(capRangeToToday({ from: "2026-10-01", to: "2026-10-31" }, "2026-10-09")).toEqual({
      from: "2026-10-01",
      to: "2026-10-09",
    });
  });
  it("budoucí období nemá nic", () => {
    expect(capRangeToToday({ from: "2026-11-01", to: "2026-11-30" }, "2026-10-09")).toBeNull();
  });
  it("minulé období nechá", () => {
    const r = { from: "2026-09-01", to: "2026-09-30" };
    expect(capRangeToToday(r, "2026-10-09")).toEqual(r);
  });
});

describe("defaultForwardRange", () => {
  it("měsíce: šest měsíců od současného", () => {
    expect(defaultForwardRange("2026-10-09", "month")).toEqual({
      from: "2026-10-01",
      to: "2027-03-31",
    });
  });
  it("týdny: dvanáct týdnů od pondělí", () => {
    const r = defaultForwardRange("2026-10-09", "week");
    expect(r.from).toBe("2026-10-05");
    expect(r.to).toBe("2026-12-27");
  });
  it("dny: třicet dní od dneška", () => {
    expect(defaultForwardRange("2026-10-09", "day")).toEqual({
      from: "2026-10-09",
      to: "2026-11-07",
    });
  });
  it("čtvrtletí a roky", () => {
    expect(defaultForwardRange("2026-10-09", "quarter")).toEqual({
      from: "2026-10-01",
      to: "2027-09-30",
    });
    expect(defaultForwardRange("2026-10-09", "year")).toEqual({
      from: "2026-01-01",
      to: "2028-12-31",
    });
  });
});

describe("parametry a čísla", () => {
  it("choiceParam bere jen povolené hodnoty", () => {
    expect(choiceParam({ by: "job" }, "by", ["person", "job"] as const, "person")).toBe("job");
    expect(choiceParam({ by: "'; drop table" }, "by", ["person", "job"] as const, "person")).toBe(
      "person",
    );
    expect(choiceParam({ by: 1 }, "by", ["person", "job"] as const, "person")).toBe("person");
    expect(choiceParam({}, "by", ["person", "job"] as const, "person")).toBe("person");
  });
  it("numberChoiceParam akceptuje číslo i řetězec z výběru, jinak výchozí", () => {
    expect(numberChoiceParam({ days: "14" }, "days", [7, 14, 30], 7)).toBe(14);
    expect(numberChoiceParam({ days: 30 }, "days", [7, 14, 30], 7)).toBe(30);
    expect(numberChoiceParam({ days: "999" }, "days", [7, 14, 30], 7)).toBe(7);
  });
  it("clampLimit drží 1 až 100", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(500)).toBe(100);
    expect(clampLimit(12.9)).toBe(12);
    expect(clampLimit(Number.NaN)).toBe(12);
  });
  it("pct1 zaokrouhlí na desetinu a nedělí nulou", () => {
    expect(pct1(1, 3)).toBe(33.3);
    expect(pct1(5, 0)).toBeNull();
    expect(pct1(-1, 4)).toBe(-25);
  });
});
