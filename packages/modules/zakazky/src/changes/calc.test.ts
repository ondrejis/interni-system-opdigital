import { describe, expect, it } from "vitest";
import {
  changeLabel,
  fromThousandths,
  lineImpact,
  quantityDelta,
  rebaseLine,
  sumImpacts,
  toThousandths,
} from "./calc";

const base = { unitCostMinor: 600_00, unitPriceMinor: 890_00 };

describe("dopad řádků změny", () => {
  it("nová položka: plné množství × cena", () => {
    const i = lineImpact({ kind: "add", quantityBefore: "0", quantityAfter: "12.5", ...base });
    expect(i).toEqual({ priceImpactMinor: 11_125_00, costImpactMinor: 7_500_00 });
  });

  it("změna množství: rozdíl proti původnímu, i záporný", () => {
    expect(
      lineImpact({ kind: "qty", quantityBefore: "10", quantityAfter: "14", ...base })
        .priceImpactMinor,
    ).toBe(3_560_00);
    expect(lineImpact({ kind: "qty", quantityBefore: "10", quantityAfter: "4", ...base })).toEqual({
      priceImpactMinor: -5_340_00,
      costImpactMinor: -3_600_00,
    });
  });

  it("odebrání: záporná hodnota celého původního množství bez ohledu na „po“", () => {
    expect(
      lineImpact({ kind: "remove", quantityBefore: "3.5", quantityAfter: "99", ...base })
        .priceImpactMinor,
    ).toBe(-3_115_00);
  });

  it("součet dopadů je částka změny a dopad na náklad", () => {
    const lines = [
      lineImpact({ kind: "add", quantityBefore: "0", quantityAfter: "2", ...base }),
      lineImpact({ kind: "remove", quantityBefore: "1", quantityAfter: "0", ...base }),
    ];
    expect(sumImpacts(lines)).toEqual({ priceMinor: 890_00, costMinor: 600_00 });
  });

  it("zaokrouhluje půl od nuly a množství počítá po tisícinách", () => {
    expect(
      quantityDelta({ kind: "add", quantityBefore: "0", quantityAfter: "0.335", ...base }),
    ).toBe(335);
    expect(
      lineImpact({
        kind: "add",
        quantityBefore: "0",
        quantityAfter: "0.335",
        unitCostMinor: 0,
        unitPriceMinor: 100,
      }).priceImpactMinor,
    ).toBe(34);
    expect(
      lineImpact({
        kind: "remove",
        quantityBefore: "0.335",
        quantityAfter: "0",
        unitCostMinor: 0,
        unitPriceMinor: 100,
      }).priceImpactMinor,
    ).toBe(-34);
  });
});

describe("převody množství", () => {
  it("tisíciny a zpět", () => {
    expect(toThousandths("12,5")).toBe(12500);
    expect(toThousandths("x")).toBe(0);
    expect(fromThousandths(12500)).toBe("12.5");
    expect(fromThousandths(-1)).toBe("-0.001");
    expect(fromThousandths(7000)).toBe("7");
  });
});

describe("přebázování řádku na aktuální položku", () => {
  const l = { kind: "qty" as const, quantityBefore: "10", quantityAfter: "14", ...base };
  it("zachová rozdíl, když se množství položky mezitím změnilo", () => {
    const r = rebaseLine(l, "20");
    expect(r.quantityBefore).toBe("20");
    expect(r.quantityAfter).toBe("24");
  });
  it("neklesne pod nulu", () => {
    const r = rebaseLine({ ...l, quantityBefore: "10", quantityAfter: "2" }, "3");
    expect(r.quantityAfter).toBe("0");
  });
  it("odebrání bere aktuální množství, nová položka se nemění", () => {
    expect(rebaseLine({ ...l, kind: "remove" as const }, "8")).toMatchObject({
      quantityBefore: "8",
      quantityAfter: "0",
    });
    const add = { ...l, kind: "add" as const };
    expect(rebaseLine(add, "5")).toBe(add);
  });
});

describe("označení", () => {
  it("VP pro kladnou, MP pro zápornou částku", () => {
    expect(changeLabel(3, 100)).toBe("VP-3");
    expect(changeLabel(4, -1)).toBe("MP-4");
  });
});
