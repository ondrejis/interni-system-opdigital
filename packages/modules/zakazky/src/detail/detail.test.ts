import { describe, expect, it } from "vitest";
import { drawdownTone, formatPct, marginTone, paidShare, summaryFromRow } from "./kpis";
import {
  GROUP_VISIBLE,
  effectivePhase,
  fromExecution,
  fromPreparation,
  phaseAtLeast,
} from "./visibility";

describe("hlavička zakázky: čísla", () => {
  it("souhrn z přepočtených sloupců řádku (záloha, když příkaz není)", () => {
    const s = summaryFromRow({
      value: 100_000_00,
      sumContract: 120_000_00,
      sumPlannedCost: 80_000_00,
      sumCost: 60_000_00,
      sumMarginPct: "50.0",
      sumDrawdownPct: "75.0",
      sumInvoiced: 50_000_00,
      sumPaid: 20_000_00,
      sumHealth: "ok",
    });
    expect(s).toMatchObject({
      contractMinor: 120_000_00,
      originalContractMinor: 100_000_00,
      approvedChangesMinor: 20_000_00,
      marginMinor: 60_000_00,
      marginPct: 50,
      drawdownPct: 75,
      plannedMarginPct: 33.3,
      health: "ok",
    });
  });

  it("v nabídce bez ceny nese sloupec cenu nabídky; hlavička ji ukáže jako cenu nabídky, ne smluvní", () => {
    const offer = { value: 0, sumContract: 2_500_000_00, sumPlannedCost: 0, sumCost: 0 };
    expect(summaryFromRow({ ...offer, phase: "offer" })).toMatchObject({
      contractMinor: 0,
      budgetSellMinor: 2_500_000_00,
    });
    expect(summaryFromRow({ ...offer, phase: "inquiry" })).toMatchObject({ contractMinor: 0 });
    // po výhře je to smluvní cena; v nabídce se zadanou cenou taky
    expect(summaryFromRow({ ...offer, phase: "preparation" })).toMatchObject({
      contractMinor: 2_500_000_00,
    });
    expect(summaryFromRow({ ...offer, value: 2_400_000_00, phase: "offer" })).toMatchObject({
      contractMinor: 2_500_000_00,
    });
  });

  it("bez ekonomiky řádek čísla nenese a souhrn je prázdný", () => {
    expect(summaryFromRow({ sumHealth: "ok", title: "x" })).toBeNull();
  });

  it("semafor čerpání a marže", () => {
    expect(drawdownTone(50)).toBe("success");
    expect(drawdownTone(85)).toBe("warning");
    expect(drawdownTone(100)).toBe("danger");
    expect(drawdownTone(null)).toBe("neutral");
    expect(marginTone({ marginMinor: -1, marginPct: -1, plannedMarginPct: 20 })).toBe("danger");
    expect(marginTone({ marginMinor: 10, marginPct: 10, plannedMarginPct: 20 })).toBe("warning");
    expect(marginTone({ marginMinor: 10, marginPct: 21, plannedMarginPct: 20 })).toBe("success");
  });

  it("podíl uhrazeného a procenta", () => {
    expect(paidShare(0, 0)).toBe(0);
    expect(paidShare(200, 50)).toBe(25);
    expect(paidShare(100, 500)).toBe(100);
    expect(formatPct(12.34)).toBe("12,3 %");
    expect(formatPct(null)).toBe("—");
  });
});

describe("záložky podle fáze", () => {
  const at = (phase: string, pausedFrom?: string) => ({ phase, pausedFrom: pausedFrom ?? null });

  it("pozastavená zakázka se chová jako fáze, ze které byla pozastavena", () => {
    expect(effectivePhase(at("paused", "execution"))).toBe("execution");
    expect(effectivePhase(at("paused", "lost"))).toBe("lost");
  });

  it("změny od realizace, náklady a fakturace od přípravy, rozpočet vždy", () => {
    expect(GROUP_VISIBLE.rozpocet!(at("inquiry"))).toBe(true);
    expect(GROUP_VISIBLE.zmeny!(at("preparation"))).toBe(false);
    expect(GROUP_VISIBLE.zmeny!(at("execution"))).toBe(true);
    expect(GROUP_VISIBLE.naklady!(at("offer"))).toBe(false);
    expect(GROUP_VISIBLE.naklady!(at("preparation"))).toBe(true);
    expect(GROUP_VISIBLE.fakturace!(at("warranty"))).toBe(true);
    expect(fromExecution(at("handover"))).toBe(true);
    expect(fromPreparation(at("inquiry"))).toBe(false);
  });

  it("prohraná zakázka má jen obchodní část", () => {
    for (const g of ["zmeny", "naklady", "fakturace", "realizace"])
      expect(GROUP_VISIBLE[g]!(at("lost"))).toBe(false);
    expect(phaseAtLeast(at("lost"), "inquiry")).toBe(false);
  });

  it("stará data bez fáze se berou jako běžící", () => {
    expect(effectivePhase({})).toBe("execution");
  });
});
