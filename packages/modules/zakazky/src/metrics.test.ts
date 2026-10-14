import { describe, expect, it } from "vitest";
import { marginOf, unbilledOf, weightedMarginPct, dashboardMetrics } from "./metrics";

describe("ekonomika zakázek v metrikách", () => {
  it("marže je smluvní cena minus náklady, nevyfakturováno nikdy záporné", () => {
    const e = { contractMinor: 1_000_000, costMinor: 700_000, invoicedMinor: 1_200_000 };
    expect(marginOf(e)).toBe(300_000);
    expect(unbilledOf(e)).toBe(0);
    expect(unbilledOf({ ...e, invoicedMinor: 250_000 })).toBe(750_000);
  });

  it("vážená marže není průměr procent", () => {
    // 50 % z 100 + 10 % z 900 = 140 / 1000 = 14 %, ne 30 %
    const rows = [
      { contractMinor: 100, costMinor: 50, invoicedMinor: 0 },
      { contractMinor: 900, costMinor: 810, invoicedMinor: 0 },
    ];
    expect(weightedMarginPct(rows)).toBe(14);
  });

  it("bez zakázek nebo bez ceny je výsledek null; ztrátová zakázka dá zápornou marži", () => {
    expect(weightedMarginPct([])).toBeNull();
    expect(weightedMarginPct([{ contractMinor: 100, costMinor: 150, invoicedMinor: 0 }])).toBe(-50);
  });

  it("každá metrika vyžaduje ekonomiku zakázek a má klíč s prefixem modulu", () => {
    for (const m of dashboardMetrics) {
      expect(m.key.startsWith("zakazky.")).toBe(true);
      expect(m.permissions).toContain("zakazky.economics");
    }
  });
});
