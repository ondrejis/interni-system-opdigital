import { describe, expect, it } from "vitest";
import {
  FinanceLogicError,
  addDays,
  addMonths,
  assertDate,
  assertMonth,
  dateInMonth,
  daysBetween,
  daysInMonth,
  dativeOf,
  formatMoney,
  isIsoDate,
  isMonth,
  monthInRange,
  monthOf,
  monthsBetween,
  percentOfMinor,
  percentToUnits,
} from "./index";

describe("formatMoney", () => {
  it("česky s mezerami u tisíců, haléře jen když nejsou nulové", () => {
    const f = (n: number) => formatMoney(n, { nbsp: false });
    expect(f(0)).toBe("0 Kč");
    expect(f(100)).toBe("1 Kč");
    expect(f(99)).toBe("0,99 Kč");
    expect(f(5)).toBe("0,05 Kč");
    expect(f(1_000_000)).toBe("10 000 Kč");
    expect(f(123_456_789)).toBe("1 234 567,89 Kč");
    expect(f(16_666)).toBe("166,66 Kč");
    expect(f(-2_000_000)).toBe("−20 000 Kč");
  });
  it("výchozí jsou pevné mezery (nezalamuje se), volitelně bez měny", () => {
    expect(formatMoney(1_000_000)).toBe("10 000 Kč");
    expect(formatMoney(1_000_000, { currency: false })).toBe("10 000");
  });
  it("neceločíselná částka je chyba", () => {
    expect(() => formatMoney(1.5)).toThrowError(FinanceLogicError);
  });
});

describe("procenta", () => {
  it("percentToUnits přijímá čísla i řetězce, max. 4 desetinná místa", () => {
    expect(percentToUnits(60)).toBe(600_000);
    expect(percentToUnits("60.00")).toBe(600_000);
    expect(percentToUnits("33,3333")).toBe(333_333);
    expect(percentToUnits(33.33)).toBe(333_300);
    expect(percentToUnits(0.0001)).toBe(1);
    expect(() => percentToUnits(33.33333)).toThrowError(FinanceLogicError);
    expect(() => percentToUnits("12.34567")).toThrowError(FinanceLogicError);
    expect(() => percentToUnits("-5")).toThrowError(FinanceLogicError);
    expect(() => percentToUnits(Number.NaN)).toThrowError(FinanceLogicError);
  });
  it("percentOfMinor je přesné a zaokrouhluje dolů, i pro velké částky", () => {
    expect(percentOfMinor(33_333, percentToUnits(50))).toBe(16_666);
    expect(percentOfMinor(1_000_000, percentToUnits(60))).toBe(600_000);
    expect(percentOfMinor(9_007_199_254_740_991, percentToUnits(100))).toBe(9_007_199_254_740_991);
    expect(percentOfMinor(1, percentToUnits("99.9999"))).toBe(0);
  });
});

describe("dativeOf", () => {
  it("odvodí 3. pád mužských jmen, explicitní má přednost", () => {
    expect(dativeOf({ name: "Ondřej" })).toBe("Ondřejovi");
    expect(dativeOf({ name: "Patrik" })).toBe("Patrikovi");
    expect(dativeOf({ name: "Jana", dative: "Janě" })).toBe("Janě");
    expect(dativeOf({ name: "Jana" })).toBe("Jana");
  });
});

describe("data a měsíce", () => {
  it("validace tvaru", () => {
    expect(isMonth("2026-12")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-1")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-04-31")).toBe(false);
    expect(() => assertMonth("x")).toThrowError(FinanceLogicError);
    expect(() => assertDate("2026-1-1")).toThrowError(FinanceLogicError);
  });
  it("aritmetika měsíců přes hranici roku", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(addMonths("2026-01", -13)).toBe("2024-12");
    expect(addMonths("2026-05", 24)).toBe("2028-05");
    expect(monthsBetween("2026-12", "2027-03")).toBe(3);
    expect(monthsBetween("2027-03", "2026-12")).toBe(-3);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2027-02")).toBe(28);
    expect(dateInMonth("2027-02", 31)).toBe("2027-02-28");
    expect(monthOf("2026-12-31")).toBe("2026-12");
  });
  it("dny", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-14")).toBe(13);
  });
  it("monthInRange: obě meze včetně, prázdná = bez omezení", () => {
    expect(monthInRange("2026-12", null, "2026-12")).toBe(true);
    expect(monthInRange("2027-01", null, "2026-12")).toBe(false);
    expect(monthInRange("2027-01", "2027-01", undefined)).toBe(true);
    expect(monthInRange("2026-12", "2027-01", undefined)).toBe(false);
    expect(monthInRange("1999-01", "", "")).toBe(true);
  });
});
