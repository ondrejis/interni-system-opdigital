import { describe, expect, it } from "vitest";
import { localParts } from "../time/dates";
import { csvLines, csvMoney, csvNumber, csvSafeText } from "./csv";
import { exportFileStem } from "./spec";
import { computeNextRun, periodKeyOf } from "./schedules";

const iso = (d: Date) => d.toISOString();

describe("příští spuštění plánu v Europe/Prague", () => {
  it("denně v 6:00: letní čas (UTC+2) a zimní čas (UTC+1)", () => {
    const t = { frequency: "daily" as const, weekday: null, monthDay: null, timeLocal: "06:00" };
    expect(iso(computeNextRun(t, new Date("2026-10-09T10:00:00Z")))).toBe(
      "2026-10-10T04:00:00.000Z",
    );
    expect(iso(computeNextRun(t, new Date("2026-11-10T10:00:00Z")))).toBe(
      "2026-11-11T05:00:00.000Z",
    );
    // před 6:00 místního času je dalším spuštěním dnešek
    expect(iso(computeNextRun(t, new Date("2026-10-10T02:00:00Z")))).toBe(
      "2026-10-10T04:00:00.000Z",
    );
  });

  it("přes přechod na zimní čas (25. 10.) zůstává místní čas stejný", () => {
    const t = { frequency: "daily" as const, weekday: null, monthDay: null, timeLocal: "02:30" };
    // 25. 10. 02:30 je v hodině, která se opakuje: místní čas zůstává 02:30 (první nebo druhý výskyt), den se nezmění
    const dup = computeNextRun(t, new Date("2026-10-24T01:00:00Z"));
    expect(localParts(dup)).toEqual({ date: "2026-10-25", time: "02:30" });
    const t6 = { ...t, timeLocal: "06:00" };
    expect(iso(computeNextRun(t6, new Date("2026-10-25T05:00:00Z")))).toBe(
      "2026-10-26T05:00:00.000Z",
    );
  });

  it("jarní skok (29. 3., 2:30 neexistuje) se posune dopředu, ne zahodí", () => {
    const t = { frequency: "daily" as const, weekday: null, monthDay: null, timeLocal: "02:30" };
    const next = computeNextRun(t, new Date("2026-03-28T12:00:00Z"));
    expect(next.getTime()).toBeGreaterThan(new Date("2026-03-28T12:00:00Z").getTime());
    expect(iso(next).startsWith("2026-03-29T")).toBe(true);
  });

  it("týdně v pondělí a měsíčně 15. a poslední den (i únor)", () => {
    const w = { frequency: "weekly" as const, weekday: 1, monthDay: null, timeLocal: "07:00" };
    expect(iso(computeNextRun(w, new Date("2026-10-09T10:00:00Z")))).toBe(
      "2026-10-12T05:00:00.000Z",
    );
    const m = { frequency: "monthly" as const, weekday: null, monthDay: 15, timeLocal: "08:00" };
    expect(iso(computeNextRun(m, new Date("2026-10-16T10:00:00Z")))).toBe(
      "2026-11-15T07:00:00.000Z",
    );
    const last = { frequency: "monthly" as const, weekday: null, monthDay: 0, timeLocal: "08:00" };
    expect(iso(computeNextRun(last, new Date("2027-02-10T10:00:00Z")))).toBe(
      "2027-02-28T07:00:00.000Z",
    );
  });

  it("klíč periody: den, ISO týden, měsíc (podle místního dne)", () => {
    const slot = new Date("2026-10-11T22:30:00Z"); // už pondělí 12. 10. 00:30 místního času
    expect(periodKeyOf("daily", slot)).toBe("2026-10-12");
    expect(periodKeyOf("weekly", slot)).toBe("2026-W42");
    expect(periodKeyOf("monthly", slot)).toBe("2026-10");
  });
});

describe("CSV: oddělovač, čísla a ochrana proti vzorcům", () => {
  it("čárka mění desetinný znak na tečku; středník ponechá desetinnou čárku", () => {
    expect(csvMoney(12_345)).toBe("123,45");
    expect(csvMoney(12_345, { delimiter: "," })).toBe("123.45");
    expect(csvNumber(1.5)).toBe("1,5");
    expect(csvNumber(1.5, { delimiter: "," })).toBe("1.5");
  });

  it("buňky začínající = + - @ (i tabulátor a návrat vozíku) dostanou apostrof; čísla ne", async () => {
    for (const bad of ["=1+1", "+420123", "-5+cmd", "@SUM(A1)", "\t=1", "\r=1"])
      expect(csvSafeText(bad), JSON.stringify(bad)).toBe(`'${bad}`);
    expect(csvSafeText("Novák")).toBe("Novák");
    const chunks: Buffer[] = [];
    for await (const c of csvLines(["=h", "b"], [["a,b", 'c"d']], { delimiter: "," }))
      chunks.push(c);
    expect(Buffer.concat(chunks).toString("utf8")).toBe('﻿\'=h,b\r\n"a,b","c""d"\r\n');
  });

  it("název souboru: bez přípony a nebezpečných znaků, {datum} dnešním datem", () => {
    const now = new Date("2026-10-09T10:00:00Z");
    expect(exportFileStem("../../etc/passwd", "x", now)).toBe("passwd");
    expect(exportFileStem("Faktury {datum}.xlsx", "x", now)).toBe("Faktury-2026-10-09");
    expect(exportFileStem("  ", "záloha", now)).toBe("záloha");
  });
});
