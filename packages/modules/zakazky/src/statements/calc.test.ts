import { describe, expect, it } from "vitest";
import { claimedOf, computeLine, overrunMessage, statementLabel } from "./calc";

const base = {
  budgetQuantity: "100",
  previousQuantity: "0",
  othersQuantity: "0",
  unitPriceMinor: 250_00,
};

describe("řádek soupisu", () => {
  it("první soupis: kumulace = období, procento a částky v haléřích", () => {
    const c = computeLine({ ...base, periodQuantity: "25" });
    expect(c).toMatchObject({
      quantityTotal: "25",
      percent: 25,
      remainingQuantity: "100",
      amountPeriodMinor: 6_250_00,
      amountTotalMinor: 6_250_00,
      over: false,
    });
  });

  it("další soupis navazuje na předchozí a zbývá rozpočet minus ostatní soupisy", () => {
    const c = computeLine({
      ...base,
      previousQuantity: "40",
      othersQuantity: "40",
      periodQuantity: "10.5",
    });
    expect(c.quantityTotal).toBe("50.5");
    expect(c.percent).toBe(50.5);
    expect(c.remainingQuantity).toBe("60");
    expect(c.amountPeriodMinor).toBe(2_625_00);
    expect(c.amountTotalMinor).toBe(12_625_00);
  });

  it("překročení rozpočtovaného množství se pozná a vysvětlí", () => {
    const ok = computeLine({
      ...base,
      previousQuantity: "90",
      othersQuantity: "90",
      periodQuantity: "10",
    });
    expect(ok.over).toBe(false);
    const bad = computeLine({
      ...base,
      previousQuantity: "90",
      othersQuantity: "95",
      periodQuantity: "6",
    });
    expect(bad.over).toBe(true);
    expect(overrunMessage("Obklad", "m2", bad)).toMatch(/zbývá 5 m2.*zadejte změnu/);
    expect(overrunMessage("Obklad", "m2", ok)).toBeNull();
  });

  it("zaokrouhluje půl od nuly a nepadá na nulovém rozpočtu", () => {
    expect(
      computeLine({ ...base, unitPriceMinor: 100, periodQuantity: "0.335" }).amountPeriodMinor,
    ).toBe(34);
    const zero = computeLine({ ...base, budgetQuantity: "0", periodQuantity: "1" });
    expect(zero.percent).toBe(0);
    expect(zero.over).toBe(true);
  });

  it("nárokovaná částka je součet období; označení soupisu", () => {
    expect(claimedOf([{ amountPeriodMinor: 100 }, { amountPeriodMinor: 250 }])).toBe(350);
    expect(statementLabel(3)).toBe("Soupis č. 3");
  });
});
