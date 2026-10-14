import { describe, expect, it } from "vitest";
import {
  assertDayLimit,
  clockMinutes,
  editedStatus,
  entryMinutes,
  isAbsence,
  monthBalance,
  TimeRuleError,
} from "./rules";

describe("pravidla docházky", () => {
  it("doba z od–do minus přestávka, nebo z hodin", () => {
    expect(entryMinutes({ startTime: "07:00", endTime: "15:30", breakMinutes: 30 })).toBe(480);
    expect(entryMinutes({ hours: 7.5 })).toBe(450);
    expect(entryMinutes({ startTime: "07:00", endTime: "08:00" })).toBe(60);
  });

  it("neplatné vstupy se odmítnou srozumitelně", () => {
    expect(() => entryMinutes({ startTime: "08:00", endTime: "08:00" })).toThrow(TimeRuleError);
    expect(() => entryMinutes({ startTime: "09:00", endTime: "08:00" })).toThrow(/po začátku/);
    expect(() => entryMinutes({})).toThrow(/odpracovanou dobu/);
    expect(() => entryMinutes({ startTime: "07:00", endTime: "07:30", breakMinutes: 30 })).toThrow(
      /odpracovanou dobu/,
    );
  });

  it("den nepřesáhne 24 hodin", () => {
    expect(() => assertDayLimit(20 * 60, 4 * 60)).not.toThrow();
    expect(() => assertDayLimit(20 * 60, 4 * 60 + 1)).toThrow(/víc než 24 h/);
  });

  it("stav po úpravě: vrácený se vrací do rozpracovaných, schválený a odeslaný chrání před autorem", () => {
    expect(editedStatus({ status: "draft", isOwner: true, canApprove: false })).toBe("draft");
    expect(editedStatus({ status: "returned", isOwner: true, canApprove: false })).toBe("draft");
    expect(() => editedStatus({ status: "approved", isOwner: true, canApprove: false })).toThrow(
      /Požádejte vedoucího/,
    );
    expect(() => editedStatus({ status: "submitted", isOwner: true, canApprove: false })).toThrow(
      /vezměte zpět/,
    );
    expect(editedStatus({ status: "approved", isOwner: false, canApprove: true })).toBe("approved");
    expect(editedStatus({ status: "submitted", isOwner: false, canApprove: true })).toBe(
      "submitted",
    );
  });

  it("píchačka: čas mezi příchodem a odchodem minus přestávky", () => {
    const a = new Date("2026-10-08T05:00:00Z");
    expect(clockMinutes(a, new Date("2026-10-08T13:30:00Z"), 30)).toBe(480);
    expect(clockMinutes(a, new Date("2026-10-08T05:10:00Z"), 30)).toBe(0);
  });

  it("absence a zůstatek měsíce", () => {
    expect(isAbsence("vacation")).toBe(true);
    expect(isAbsence("work")).toBe(false);
    expect(monthBalance(9000, 10080)).toBe(-1080);
  });
});
