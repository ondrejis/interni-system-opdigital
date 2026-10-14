import { describe, expect, it } from "vitest";
import {
  StockError,
  assertDocShape,
  formatQty,
  fromMilli,
  isOutgoing,
  lineTotalMinor,
  mergeLines,
  toMilli,
  weightedAverage,
} from "./stock-math";

describe("množství v tisícinách", () => {
  it("převádí tam i zpět bez chyby desetinných čísel", () => {
    expect(toMilli("12.5")).toBe(12500);
    expect(toMilli("0.1") + toMilli("0.2")).toBe(300);
    expect(toMilli(0.3)).toBe(300);
    expect(toMilli("2,25")).toBe(2250);
    expect(fromMilli(12500)).toBe("12.500");
    expect(fromMilli(-250)).toBe("-0.250");
    expect(fromMilli(toMilli("999999.999"))).toBe("999999.999");
  });

  it("zaokrouhlí víc než tři desetinná místa a odmítne nečíselné", () => {
    expect(toMilli("1.0004")).toBe(1000);
    expect(toMilli("1.0006")).toBe(1001);
    expect(() => toMilli("abc")).toThrow(StockError);
  });

  it("zobrazí bez zbytečných nul", () => {
    expect(formatQty("12.500")).toBe("12,5");
    expect(formatQty("1200.000")).toMatch(/^1\s?200$/);
  });
});

describe("vážený průměr", () => {
  it("při prázdném skladu je to cena příjmu", () => {
    expect(weightedAverage(0, 0, 10_000, 250)).toBe(250);
    expect(weightedAverage(-5_000, 300, 10_000, 250)).toBe(250);
  });

  it("míchá zásobu a příjem podle množství", () => {
    // 10 ks po 100 + 30 ks po 200 = 7000 / 40 = 175
    expect(weightedAverage(10_000, 100, 30_000, 200)).toBe(175);
  });

  it("drží čtyři desetinná místa", () => {
    // (1 × 1 + 2 × 1,3333…) / 3 = 1,2222…
    expect(weightedAverage(1_000, 1, 2_000, 4 / 3)).toBe(1.2222);
  });
});

describe("hodnota řádku", () => {
  it("zaokrouhlí na haléře", () => {
    expect(lineTotalMinor(2_500, 1_000)).toBe(2_500);
    expect(lineTotalMinor(333, 100)).toBe(33);
    expect(lineTotalMinor(1_000, 0.37)).toBe(0);
    expect(lineTotalMinor(1_000_000, 0.3774)).toBe(377);
    expect(lineTotalMinor(-2_000, 150.5)).toBe(-301);
  });
});

describe("slučování řádků", () => {
  it("sečte stejné položky, drží pořadí a poslední známou cenu", () => {
    const merged = mergeLines("receipt", [
      { itemId: "a", qty: "1", unitPriceMinor: 100 },
      { itemId: "b", qty: "2" },
      { itemId: "a", qty: "2.5", unitPriceMinor: 120 },
    ]);
    expect(merged).toEqual([
      { itemId: "a", qtyMilli: 3500, unitPriceMinor: 120 },
      { itemId: "b", qtyMilli: 2000, unitPriceMinor: null },
    ]);
  });

  it("vynechá nulové řádky a odmítne prázdný doklad", () => {
    expect(
      mergeLines("issue", [
        { itemId: "a", qty: "0" },
        { itemId: "b", qty: 1 },
      ]),
    ).toHaveLength(1);
    expect(() => mergeLines("issue", [{ itemId: "a", qty: 0 }])).toThrow(/alespoň u jedné/);
  });

  it("záporné množství povolí jen inventurní rozdíl", () => {
    expect(() => mergeLines("issue", [{ itemId: "a", qty: -1 }])).toThrow(/kladné/);
    expect(mergeLines("adjustment", [{ itemId: "a", qty: -1 }])[0]!.qtyMilli).toBe(-1000);
  });

  it("řádky, které se sečtou na nulu, zmizí", () => {
    expect(() =>
      mergeLines("adjustment", [
        { itemId: "a", qty: 2 },
        { itemId: "a", qty: -2 },
      ]),
    ).toThrow(/alespoň u jedné/);
  });
});

describe("tvar dokladu", () => {
  it("převodka potřebuje jiný cíl", () => {
    expect(() => assertDocShape({ type: "transfer", warehouseId: "w1" })).toThrow(/cílové/);
    expect(() =>
      assertDocShape({ type: "transfer", warehouseId: "w1", targetWarehouseId: "w1" }),
    ).toThrow(/cílové/);
    expect(() =>
      assertDocShape({ type: "transfer", warehouseId: "w1", targetWarehouseId: "w2" }),
    ).not.toThrow();
  });

  it("výdejka a vratka potřebují zakázku, příjemka dodavatele", () => {
    expect(() => assertDocShape({ type: "issue", warehouseId: "w1" })).toThrow(/zakázku/);
    expect(() => assertDocShape({ type: "return", warehouseId: "w1" })).toThrow(/zakázku/);
    expect(() => assertDocShape({ type: "receipt", warehouseId: "w1" })).toThrow(/dodavatele/);
    expect(() =>
      assertDocShape({ type: "receipt", warehouseId: "w1", supplierId: "s" }),
    ).not.toThrow();
  });

  it("směr pohybu", () => {
    expect(isOutgoing("issue", 1)).toBe(true);
    expect(isOutgoing("transfer", 1)).toBe(true);
    expect(isOutgoing("receipt", 1)).toBe(false);
    expect(isOutgoing("return", 1)).toBe(false);
    expect(isOutgoing("adjustment", -1)).toBe(true);
    expect(isOutgoing("adjustment", 1)).toBe(false);
  });
});
