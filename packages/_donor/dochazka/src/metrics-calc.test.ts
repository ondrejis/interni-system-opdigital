import { describe, expect, it } from "vitest";
import { monthFundMinutes } from "@rebar/core/time";
import { periodFundMinutes, utilizationPct } from "./metrics-calc";

const MON_FRI = [1, 2, 3, 4, 5];

describe("periodFundMinutes", () => {
  it("celý měsíc v minulosti odpovídá fondu měsíce (svátky pryč)", () => {
    const r = { from: "2026-10-01", to: "2026-10-31" };
    expect(periodFundMinutes(r, "2026-11-15", 8, MON_FRI)).toBe(
      monthFundMinutes("2026-10", 8, MON_FRI),
    );
  });

  it("úvazek 0,5 poloviční fond", () => {
    const r = { from: "2026-10-01", to: "2026-10-31" };
    expect(periodFundMinutes(r, "2026-11-15", 8, MON_FRI, 0.5)).toBe(
      monthFundMinutes("2026-10", 8, MON_FRI, 0.5),
    );
  });

  it("rozpracované období se počítá jen do dneška", () => {
    // 1.–9. 10. 2026: čt 1., pá 2., po–pá 5.–9. = 7 pracovních dnů
    expect(
      periodFundMinutes({ from: "2026-10-01", to: "2026-10-31" }, "2026-10-09", 8, MON_FRI),
    ).toBe(7 * 480);
  });

  it("budoucí období nemá fond", () => {
    expect(
      periodFundMinutes({ from: "2026-11-01", to: "2026-11-30" }, "2026-10-09", 8, MON_FRI),
    ).toBe(0);
  });

  it("přechod letního času nezmění počet dnů ani fond", () => {
    // 23.–31. 3. 2026 přes změnu času 29. 3.: po–pá 23.–27. + po–út 30.–31. = 7 dnů
    expect(
      periodFundMinutes({ from: "2026-03-23", to: "2026-03-31" }, "2026-12-31", 8, MON_FRI),
    ).toBe(7 * 480);
  });

  it("státní svátek se nepočítá (28. 10. 2026)", () => {
    expect(
      periodFundMinutes({ from: "2026-10-26", to: "2026-10-30" }, "2026-12-31", 8, MON_FRI),
    ).toBe(4 * 480);
  });

  it("jiná pracovní doba a týden se šesti dny", () => {
    expect(
      periodFundMinutes(
        { from: "2026-10-05", to: "2026-10-10" },
        "2026-12-31",
        6,
        [1, 2, 3, 4, 5, 6],
      ),
    ).toBe(6 * 360);
  });
});

describe("utilizationPct", () => {
  it("odpracované děleno fondem", () => {
    expect(utilizationPct(420, 480)).toBe(87.5);
    expect(utilizationPct(600, 480)).toBe(125);
  });
  it("bez fondu je výsledek null", () => {
    expect(utilizationPct(100, 0)).toBeNull();
  });
});
