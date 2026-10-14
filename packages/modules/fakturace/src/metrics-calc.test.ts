import { describe, expect, it } from "vitest";
import { alignToBuckets, remainingMinor } from "./metrics-calc";

describe("alignToBuckets", () => {
  it("doplní prázdné měsíce nulou a sečte duplicitní klíče", () => {
    const a = alignToBuckets(
      { from: "2026-09-01", to: "2026-11-30" },
      "month",
      [
        { key: "2026-09-01", value: 100 },
        { key: "2026-09-01", value: 50 },
        { key: "2026-11-01", value: 7 },
      ],
      [{ key: "2026-10-01", value: 3 }],
    );
    expect(a.categories.map((c) => c.key)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
    expect(a.categories[1]!.label).toBe("říjen 2026");
    expect(a.values).toEqual([
      [150, 0, 7],
      [0, 3, 0],
    ]);
  });

  it("týdny přes jarní přechod na letní čas: každý týden právě jednou, začíná pondělím", () => {
    const a = alignToBuckets({ from: "2026-03-23", to: "2026-04-12" }, "week", []);
    expect(a.categories.map((c) => c.key)).toEqual(["2026-03-23", "2026-03-30", "2026-04-06"]);
  });

  it("týdny přes podzimní přechod", () => {
    const a = alignToBuckets({ from: "2026-10-19", to: "2026-11-01" }, "week", []);
    expect(a.categories.map((c) => c.key)).toEqual(["2026-10-19", "2026-10-26"]);
  });

  it("řádek mimo období se zahodí", () => {
    const a = alignToBuckets({ from: "2026-10-01", to: "2026-10-31" }, "month", [
      { key: "2026-08-01", value: 99 },
    ]);
    expect(a.values).toEqual([[0]]);
  });

  it("dlouhé období se zkrátí na 60 košů", () => {
    const a = alignToBuckets({ from: "2020-01-01", to: "2030-12-31" }, "month", []);
    expect(a.categories).toHaveLength(60);
  });
});

describe("remainingMinor", () => {
  it("zbývá uhradit, přeplatek je nula", () => {
    expect(remainingMinor(1000, 400)).toBe(600);
    expect(remainingMinor(1000, 1200)).toBe(0);
  });
});
