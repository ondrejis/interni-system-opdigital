import { describe, expect, it } from "vitest";
import type { DailyPoint } from "../contract";
import {
  DASH,
  aggregateMonthly,
  fmtDay,
  fmtInt,
  fmtMonth,
  fmtMoney,
  fmtPct,
  fmtPeriod,
  lastMonthsPeriod,
  lostInfo,
  objectiveLabel,
  safeImageUrl,
  statusInfo,
  syncState,
} from "./format";

const nbsp = " ";

describe("fmtMoney", () => {
  it("převádí haléře na celé koruny s oddělenými tisíci", () => {
    expect(fmtMoney(12_345_600)).toBe(`123${nbsp}456${nbsp}Kč`);
    expect(fmtMoney(0)).toBe(`0${nbsp}Kč`);
    expect(fmtMoney(8_550)).toBe(`86${nbsp}Kč`);
  });
  it("null je pomlčka, ne nula", () => {
    expect(fmtMoney(null)).toBe(DASH);
    expect(fmtMoney(undefined)).toBe(DASH);
  });
  it("jiná měna dostane symbol nebo kód", () => {
    expect(fmtMoney(10_000, "EUR")).toBe(`100${nbsp}€`);
    expect(fmtMoney(10_000, "PLN")).toBe(`100${nbsp}PLN`);
  });
});

describe("čísla a procenta", () => {
  it("fmtInt a fmtPct mají české oddělovače", () => {
    expect(fmtInt(1234567)).toBe(`1${nbsp}234${nbsp}567`);
    expect(fmtInt(null)).toBe(DASH);
    expect(fmtPct(1.5)).toBe(`1,50${nbsp}%`);
    expect(fmtPct(null)).toBe(DASH);
  });
});

describe("data", () => {
  it("den, období a měsíc", () => {
    expect(fmtDay("2026-10-04")).toBe("4. 10.");
    expect(fmtDay("2026-10-04", true)).toBe("4. 10. 2026");
    expect(fmtPeriod({ from: "2026-10-01", to: "2026-10-14" })).toBe("1. 10. – 14. 10. 2026");
    expect(fmtPeriod({ from: "2025-12-20", to: "2026-01-10" })).toBe("20. 12. 2025 – 10. 1. 2026");
    expect(fmtPeriod({ from: "2026-10-14", to: "2026-10-14" })).toBe("14. 10. 2026");
    expect(fmtMonth("2026-03")).toBe("březen 2026");
  });
  it("poslední N měsíců začíná prvním dnem měsíce", () => {
    expect(lastMonthsPeriod("2026-10-14", 3)).toEqual({ from: "2026-08-01", to: "2026-10-14" });
    expect(lastMonthsPeriod("2026-02-10", 6)).toEqual({ from: "2025-09-01", to: "2026-02-10" });
    expect(lastMonthsPeriod("2026-10-14", 1)).toEqual({ from: "2026-10-01", to: "2026-10-14" });
  });
});

describe("lostInfo (rozdíl leadů Meta × OPSYS)", () => {
  it("ukáže ztracené leady, přebytek i shodu", () => {
    expect(lostInfo({ leadsMeta: 10, leadsOpsys: 7, leadsLost: 3 })).toMatchObject({
      label: "−3",
      tone: "warn",
    });
    expect(lostInfo({ leadsMeta: 4, leadsOpsys: 6, leadsLost: -2 })).toMatchObject({
      label: "+2",
      tone: "info",
    });
    expect(lostInfo({ leadsMeta: 5, leadsOpsys: 5, leadsLost: 0 })).toMatchObject({
      label: "0",
      tone: "ok",
    });
  });
  it("bez leadů nic neukazuje", () => {
    expect(lostInfo({ leadsMeta: 0, leadsOpsys: 0, leadsLost: 0 }).tone).toBe("none");
  });
});

describe("syncState", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  it("chyba má přednost před časem", () => {
    expect(syncState("2026-10-14T04:00:00Z", "Neplatný token", now).kind).toBe("error");
  });
  it("nikdy nesynchronizováno, čerstvé a zastaralé", () => {
    expect(syncState(null, null, now).kind).toBe("never");
    expect(syncState("2026-10-14T04:00:00Z", null, now).kind).toBe("ok");
    expect(syncState("2026-10-12T04:00:00Z", null, now).kind).toBe("stale");
  });
  it("čerstvý stav nese čas v pražském čase", () => {
    expect(syncState("2026-10-14T04:00:00Z", null, now).label).toBe(
      "Synchronizováno 14. 10. 06:00",
    );
  });
});

const day = (
  date: string,
  spendMinor: number,
  leadsMeta: number,
  leadsOpsys = leadsMeta,
): DailyPoint => ({
  date,
  spendMinor,
  impressions: 100,
  clicks: 10,
  leadsMeta,
  leadsOpsys,
});

describe("aggregateMonthly", () => {
  it("sečte dny po měsících a spočítá CPL", () => {
    const rows = aggregateMonthly([
      day("2026-08-30", 10_000, 1),
      day("2026-08-31", 20_000, 2),
      day("2026-09-01", 5_000, 0),
      day("2026-09-02", 5_000, 0),
    ]);
    expect(rows.map((r) => r.month)).toEqual(["2026-08", "2026-09"]);
    expect(rows[0]).toMatchObject({ spendMinor: 30_000, leadsMeta: 3, cplMinor: 10_000 });
    expect(rows[1]).toMatchObject({ spendMinor: 10_000, leadsMeta: 0, cplMinor: null });
  });
  it("doplní prázdný měsíc mezi dvěma a přes přelom roku", () => {
    const rows = aggregateMonthly([day("2025-12-31", 100, 1), day("2026-02-01", 200, 1)]);
    expect(rows.map((r) => r.month)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(rows[1]).toMatchObject({ spendMinor: 0, cplMinor: null });
  });
  it("prázdný vstup dá prázdný výstup", () => {
    expect(aggregateMonthly([])).toEqual([]);
  });
});

describe("stavy a kreativy", () => {
  it("stav a cíl z Meta česky, neznámé beze změny", () => {
    expect(statusInfo("ACTIVE")).toEqual({ label: "Aktivní", color: "green" });
    expect(statusInfo("paused")?.label).toBe("Pozastavená");
    expect(statusInfo("NECO_NOVEHO")?.label).toBe("NECO_NOVEHO");
    expect(statusInfo(null)).toBeNull();
    expect(objectiveLabel("OUTCOME_LEADS")).toBe("Poptávky");
    expect(objectiveLabel("X")).toBe("X");
    expect(objectiveLabel(null)).toBeNull();
  });
  it("náhled kreativy jen z http(s)", () => {
    expect(safeImageUrl("https://scontent.example/a.jpg")).toBe("https://scontent.example/a.jpg");
    expect(safeImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeImageUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(safeImageUrl("neurl")).toBeNull();
    expect(safeImageUrl(null)).toBeNull();
  });
});
