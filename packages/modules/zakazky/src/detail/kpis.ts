// Čísla v hlavičce zakázky: čisté funkce bez Reactu a databáze (ADR 015). Zdroj je příkaz `zakazky.summary`,
// dokud nebo kdyby nebyl, stačí přepočtené sloupce `sum_*` z řádku zakázky.

import { isPreContract } from "../lifecycle/phases";

export type JobSummary = {
  contractMinor: number;
  originalContractMinor: number;
  approvedChangesMinor: number;
  plannedCostMinor: number;
  costMinor: number;
  drawdownPct: number | null;
  marginMinor: number;
  marginPct: number | null;
  plannedMarginMinor: number;
  plannedMarginPct: number | null;
  invoicedMinor: number;
  paidMinor: number;
  unpairedCount: number;
  health: "ok" | "warning" | "danger" | null;
  /** Prodej bez DPH z aktuálního rozpočtu (u nabídky cena nabídky); chybí u souhrnu z řádku zakázky. */
  budgetSellMinor?: number;
};

export type Tone = "neutral" | "success" | "warning" | "danger";

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const pct = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};

/** Souhrn z přepočtených sloupců řádku zakázky (záloha, když příkaz `zakazky.summary` není). */
export function summaryFromRow(row: Record<string, unknown>): JobSummary | null {
  if (row.sumContract === undefined && row.sumCost === undefined) return null;
  // v poptávce a nabídce bez zadané ceny nese `sumContract` cenu nabídky z rozpočtu, ne smluvní cenu (viz `listPriceMinor`)
  const offerPrice = isPreContract(row.phase) && n(row.value) === 0 ? n(row.sumContract) : 0;
  const contract = offerPrice > 0 ? 0 : n(row.sumContract);
  const cost = n(row.sumCost);
  const planned = n(row.sumPlannedCost);
  return {
    contractMinor: contract,
    originalContractMinor: n(row.value),
    approvedChangesMinor: Math.max(0, contract - n(row.value)),
    plannedCostMinor: planned,
    costMinor: cost,
    drawdownPct: pct(row.sumDrawdownPct),
    marginMinor: contract - cost,
    marginPct: pct(row.sumMarginPct),
    plannedMarginMinor: contract - planned,
    plannedMarginPct:
      contract > 0 ? Math.round(((contract - planned) / contract) * 1000) / 10 : null,
    invoicedMinor: n(row.sumInvoiced),
    paidMinor: n(row.sumPaid),
    unpairedCount: 0,
    ...(offerPrice > 0 ? { budgetSellMinor: offerPrice } : {}),
    health:
      row.sumHealth === "ok" || row.sumHealth === "warning" || row.sumHealth === "danger"
        ? row.sumHealth
        : null,
  };
}

/** Čerpání nákladového rozpočtu: od 85 % pozor, od 100 % problém. */
export function drawdownTone(p: number | null): Tone {
  if (p === null) return "neutral";
  if (p >= 100) return "danger";
  if (p >= 85) return "warning";
  return "success";
}

/** Marže: záporná je problém, pod plánem pozor, jinak v pořádku. */
export function marginTone(
  s: Pick<JobSummary, "marginMinor" | "marginPct" | "plannedMarginPct">,
): Tone {
  if (s.marginMinor < 0) return "danger";
  if (s.marginPct !== null && s.plannedMarginPct !== null && s.marginPct < s.plannedMarginPct - 2)
    return "warning";
  return s.marginPct === null ? "neutral" : "success";
}

/** Podíl uhrazeného z fakturovaného (0–100). */
export function paidShare(invoiced: number, paid: number): number {
  return invoiced > 0 ? Math.max(0, Math.min(100, Math.round((paid / invoiced) * 100))) : 0;
}

export const formatPct = (p: number | null): string =>
  p === null ? "—" : `${String(Math.round(p * 10) / 10).replace(".", ",")} %`;
