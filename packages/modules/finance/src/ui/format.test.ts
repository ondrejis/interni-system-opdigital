import { describe, expect, it } from "vitest";
import {
  fmtDate,
  monthLabel,
  monthName,
  monthRange,
  money,
  nextStep,
  personName,
  shiftMonth,
} from "./format";

const nb = (s: string) => s.split(String.fromCharCode(160)).join(" ");

describe("formáty UI financí", () => {
  it("částka a datum česky", () => {
    expect(nb(money(1_240_000))).toBe("12 400 Kč");
    expect(fmtDate("2026-10-14")).toBe("14. 10. 2026");
    expect(fmtDate(null)).toBe("–");
  });
  it("měsíce", () => {
    expect(monthLabel("2026-12")).toBe("12/2026");
    expect(monthName("2027-01")).toBe("leden 2027");
    expect(monthName(null)).toBe("Bez data");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("stavový tok: Plánovaná → Vystavená → Zaplacená, dál nic", () => {
    expect(nextStep("planned")).toEqual({ to: "issued", label: "Vystavit" });
    expect(nextStep("issued")).toEqual({ to: "paid", label: "Zaplaceno" });
    expect(nextStep("paid")).toBeNull();
    expect(nextStep("canceled")).toBeNull();
  });
  it("jméno osoby z odpovědi příkazu", () => {
    const people = { a: { id: "a", name: "Ondřej Dvořák", firstName: "Ondřej", shortName: null } };
    expect(personName(people, "a")).toBe("Ondřej");
    expect(personName(people, "x")).toBe("?");
    expect(personName(people, null)).toBe("–");
  });
});
