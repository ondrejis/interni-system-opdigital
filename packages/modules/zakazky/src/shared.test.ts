import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  dueFromOffset,
  isOverdue,
  monthOf,
  phaseDates,
  todayPrague,
} from "./shared";

describe("práce s daty", () => {
  it("addDays přičítá dny přes hranice měsíců, roků i přestupného února", () => {
    expect(addDays("2026-10-14", 0)).toBe("2026-10-14");
    expect(addDays("2026-10-14", 7)).toBe("2026-10-21");
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
    expect(addDays("2028-02-27", 2)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("přechod na letní a zimní čas nerozhodí počítání dnů", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(daysBetween("2026-03-25", "2026-04-01")).toBe(7);
    expect(daysBetween("2026-10-20", "2026-10-31")).toBe(11);
  });

  it("daysBetween je záporné, když je cíl dřív", () => {
    expect(daysBetween("2026-10-14", "2026-10-10")).toBe(-4);
    expect(daysBetween("2026-10-14", "2026-10-14")).toBe(0);
  });

  it("dueFromOffset: bez posunu žádný termín, posun 0 = start", () => {
    expect(dueFromOffset("2026-10-14", null)).toBeNull();
    expect(dueFromOffset("2026-10-14", undefined)).toBeNull();
    expect(dueFromOffset("2026-10-14", 0)).toBe("2026-10-14");
    expect(dueFromOffset("2026-10-14", 14)).toBe("2026-10-28");
  });

  it("phaseDates: konec je včetně posledního dne, nulová délka = jeden den", () => {
    expect(phaseDates("2026-10-01", { offsetDays: 0, durationDays: 7 })).toEqual({
      plannedStart: "2026-10-01",
      plannedEnd: "2026-10-07",
    });
    expect(phaseDates("2026-10-01", { offsetDays: 7, durationDays: 10 })).toEqual({
      plannedStart: "2026-10-08",
      plannedEnd: "2026-10-17",
    });
    expect(phaseDates("2026-10-01", { offsetDays: 45, durationDays: 0 })).toEqual({
      plannedStart: "2026-11-15",
      plannedEnd: "2026-11-15",
    });
    expect(phaseDates("2026-10-01", { offsetDays: 3, durationDays: 1 })).toEqual({
      plannedStart: "2026-10-04",
      plannedEnd: "2026-10-04",
    });
  });

  it("monthOf a todayPrague", () => {
    expect(monthOf("2026-10-14")).toBe("2026-10");
    // 23:30 UTC je už po půlnoci v Praze (letní čas)
    expect(todayPrague(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
    expect(todayPrague(new Date("2026-01-15T12:00:00Z"))).toBe("2026-01-15");
  });

  it("isOverdue: jen živá zakázka s termínem před dneškem", () => {
    const today = "2026-10-14";
    expect(isOverdue({ status: "active", dueDate: "2026-10-13" }, today)).toBe(true);
    expect(isOverdue({ status: "paused", dueDate: "2026-10-01" }, today)).toBe(true);
    expect(isOverdue({ status: "active", dueDate: "2026-10-14" }, today)).toBe(false);
    expect(isOverdue({ status: "done", dueDate: "2026-10-01" }, today)).toBe(false);
    expect(isOverdue({ status: "cancelled", dueDate: "2026-10-01" }, today)).toBe(false);
    expect(isOverdue({ status: "active", dueDate: null }, today)).toBe(false);
  });
});
