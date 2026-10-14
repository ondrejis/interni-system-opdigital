import { describe, expect, it } from "vitest";
import {
  FinanceLogicError,
  retainerEndImpact,
  retainerIssuerFor,
  retainerLabel,
  retainerSchedule,
  type RetainerDef,
} from "./index";

const O = "ondrej";
const P = "patrik";

const def = (extra: Partial<RetainerDef> = {}): RetainerDef => ({
  id: "ret",
  jobId: "job",
  amountMinor: 1_500_000,
  fromMonth: "2026-12",
  issueDay: 5,
  issuerMode: "fixed",
  issuerId: O,
  active: true,
  ...extra,
});

describe("retainerSchedule", () => {
  it("první měsíc: platba „Retainer 12/2026“ s plánovaným datem vystavení z issueDay (R-35)", () => {
    const plan = retainerSchedule(def(), { upToMonth: "2026-12" });
    expect(plan).toEqual([
      {
        jobId: "job",
        retainerId: "ret",
        kind: "retainer",
        periodMonth: "2026-12",
        description: "Retainer 12/2026",
        amountMinor: 1_500_000,
        issuerId: O,
        plannedIssuedOn: "2026-12-05",
        status: "planned",
      },
    ]);
  });

  it("je idempotentní: druhé spuštění nad existujícími platbami nevrátí nic (AS-03)", () => {
    const first = retainerSchedule(def(), { upToMonth: "2027-02" });
    expect(first.map((p) => p.periodMonth)).toEqual(["2026-12", "2027-01", "2027-02"]);
    const second = retainerSchedule(def(), {
      upToMonth: "2027-02",
      existing: first.map((p) => ({
        periodMonth: p.periodMonth,
        retainerId: "ret",
        status: "planned",
      })),
    });
    expect(second).toEqual([]);
  });

  it("dožene zameškaný měsíc; zrušená platba se znovu nezakládá (unikát platí i na ni)", () => {
    const plan = retainerSchedule(def(), {
      upToMonth: "2027-03",
      existing: [
        { periodMonth: "2026-12", status: "paid" },
        { periodMonth: "2027-01", status: "canceled" },
        { periodMonth: "2027-03", status: "planned" },
      ],
    });
    expect(plan.map((p) => p.periodMonth)).toEqual(["2027-02"]);
  });

  it("platby jiného retaineru se ignorují", () => {
    const plan = retainerSchedule(def(), {
      upToMonth: "2026-12",
      existing: [{ periodMonth: "2026-12", retainerId: "jiny" }],
    });
    expect(plan).toHaveLength(1);
  });

  it("neaktivní, ještě nezačatý a skončený retainer", () => {
    expect(retainerSchedule(def({ active: false }), { upToMonth: "2027-06" })).toEqual([]);
    expect(retainerSchedule(def(), { upToMonth: "2026-11" })).toEqual([]);
    const ended = retainerSchedule(def({ toMonth: "2027-02" }), { upToMonth: "2027-12" });
    expect(ended.map((p) => p.periodMonth)).toEqual(["2026-12", "2027-01", "2027-02"]);
  });

  it("notBefore omezí dohánění", () => {
    const plan = retainerSchedule(def(), { upToMonth: "2027-02", notBefore: "2027-01" });
    expect(plan.map((p) => p.periodMonth)).toEqual(["2027-01", "2027-02"]);
  });

  it("střídání fakturujícího se odvozuje od měsíce, ne od počtu plateb", () => {
    const alt = def({ issuerMode: "alternate", issuerId: null, firstIssuerId: P });
    const plan = retainerSchedule(alt, { upToMonth: "2027-03", partnerIds: [O, P] });
    expect(plan.map((p) => p.issuerId)).toEqual([P, O, P, O]);
    // jen pozdější měsíc (dřívější už existují) vyjde stejně
    const later = retainerSchedule(alt, {
      upToMonth: "2027-03",
      partnerIds: [O, P],
      existing: [{ periodMonth: "2026-12" }, { periodMonth: "2027-01" }],
    });
    expect(later.map((p) => [p.periodMonth, p.issuerId])).toEqual([
      ["2027-02", P],
      ["2027-03", O],
    ]);
  });

  it("retainerIssuerFor: pevný vs. střídavý, tři osoby", () => {
    expect(retainerIssuerFor(def(), "2030-01")).toBe(O);
    const alt = { fromMonth: "2026-12", issuerMode: "alternate" as const, firstIssuerId: O };
    expect(retainerIssuerFor(alt, "2026-12", [P, "jana"])).toBe(O);
    expect(retainerIssuerFor(alt, "2027-01", [P, "jana"])).toBe(P);
    expect(retainerIssuerFor(alt, "2027-02", [P, "jana"])).toBe("jana");
    expect(retainerIssuerFor(alt, "2027-03", [P, "jana"])).toBe(O);
    // bez partnerů střídat není s kým
    expect(retainerIssuerFor(alt, "2027-01")).toBe(O);
  });

  it("den vystavení 28 funguje i v únoru", () => {
    const plan = retainerSchedule(def({ fromMonth: "2027-02", issueDay: 28 }), {
      upToMonth: "2027-02",
    });
    expect(plan[0]?.plannedIssuedOn).toBe("2027-02-28");
  });

  it("neplatné definice vyhodí invalid_retainer / chybu měsíce", () => {
    const fail = (d: Partial<RetainerDef>) => () =>
      retainerSchedule(def(d), { upToMonth: "2027-01" });
    expect(fail({ issueDay: 0 })).toThrowError(FinanceLogicError);
    expect(fail({ issueDay: 29 })).toThrowError(FinanceLogicError);
    expect(fail({ issueDay: 1.5 })).toThrowError(FinanceLogicError);
    expect(fail({ amountMinor: 0 })).toThrowError(FinanceLogicError);
    expect(fail({ toMonth: "2026-11" })).toThrowError(FinanceLogicError);
    expect(fail({ issuerId: null })).toThrowError(FinanceLogicError);
    expect(fail({ fromMonth: "2026-13" })).toThrowError(FinanceLogicError);
    expect(fail({ issuerMode: "alternate", firstIssuerId: null })).toThrowError(FinanceLogicError);
    expect(() => retainerSchedule(def(), { upToMonth: "27-01" })).toThrowError(FinanceLogicError);
  });

  it("retainerLabel", () => {
    expect(retainerLabel("2026-12")).toBe("Retainer 12/2026");
    expect(retainerLabel("2027-01")).toBe("Retainer 01/2027");
  });
});

describe("retainerEndImpact (ZAK-17, AS-04)", () => {
  it("zruší budoucí Plánované platby, vystavené a zaplacené po konci jen ohlásí", () => {
    const impact = retainerEndImpact(
      [
        { id: "a", periodMonth: "2027-03", status: "planned" },
        { id: "b", periodMonth: "2027-02", status: "planned" },
        { id: "c", periodMonth: "2027-01", status: "planned" },
        { id: "d", periodMonth: "2027-04", status: "issued" },
        { id: "e", periodMonth: "2027-05", status: "canceled" },
        { id: "f", periodMonth: "2026-12", status: "paid" },
      ],
      "2027-01",
    );
    expect(impact.cancelIds).toEqual(["b", "a"]);
    expect(impact.keptIds).toEqual(["d"]);
  });
});
