/**
 * Souhrn financí zakázky (čistá logika, bez databáze): smluvní cena, náklady, marže, čerpání a semafor.
 * Všechny částky v haléřích bez DPH. Jedno místo pro čísla v hlavičce, seznamu i přehledu.
 */

export type Health = "ok" | "warning" | "danger";

export type SummaryInput = {
  /** Původní cena zakázky (`job.value_minor`). */
  valueMinor: number;
  /** Součet schválených změn (vícepráce +, méněpráce −). */
  approvedChangesMinor: number;
  /** Plánovaný náklad z rozpočtu (aktuální verze). */
  plannedCostMinor: number;
  /** Skutečné náklady (ruční, přijaté faktury, docházka, sklad, stroje, deník). */
  costMinor: number;
  invoicedMinor: number;
  paidMinor: number;
  unpairedCount: number;
};

export type JobSummary = {
  contractMinor: number;
  originalContractMinor: number;
  approvedChangesMinor: number;
  plannedCostMinor: number;
  costMinor: number;
  /** Čerpání plánovaného nákladu v %; `null`, když rozpočet nemá plánovaný náklad. */
  drawdownPct: number | null;
  marginMinor: number;
  /** Marže ze smluvní ceny v %; `null`, když zakázka nemá cenu. */
  marginPct: number | null;
  plannedMarginMinor: number;
  plannedMarginPct: number | null;
  invoicedMinor: number;
  paidMinor: number;
  unpairedCount: number;
  health: Health | null;
};

const pct1 = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 1000) / 10 : null;

export function computeSummary(i: SummaryInput): Omit<JobSummary, "health"> {
  const contract = i.valueMinor + i.approvedChangesMinor;
  const margin = contract - i.costMinor;
  const planned = contract - i.plannedCostMinor;
  return {
    contractMinor: contract,
    originalContractMinor: i.valueMinor,
    approvedChangesMinor: i.approvedChangesMinor,
    plannedCostMinor: i.plannedCostMinor,
    costMinor: i.costMinor,
    drawdownPct: pct1(i.costMinor, i.plannedCostMinor),
    marginMinor: margin,
    marginPct: pct1(margin, contract),
    plannedMarginMinor: planned,
    plannedMarginPct: pct1(planned, contract),
    invoicedMinor: i.invoicedMinor,
    paidMinor: i.paidMinor,
    unpairedCount: i.unpairedCount,
  };
}

/** Fáze, ve kterých semafor dává smysl (před nabídkou a po uzavření se nehodnotí). */
const HEALTH_PHASES = ["preparation", "execution", "handover", "warranty", "paused"];

/**
 * Semafor zakázky.
 * `danger`: záporná marže (jsou-li náklady), čerpání nad 100 % plánu, nebo zpoždění termínu (příprava, realizace, předání).
 * `warning`: čerpání nad 85 % plánu, nebo skutečná marže o víc než 10 procentních bodů pod plánovanou.
 */
export function computeHealth(i: {
  phase: string;
  costMinor: number;
  marginMinor: number;
  marginPct: number | null;
  plannedMarginPct: number | null;
  drawdownPct: number | null;
  endDate: string | null;
  today: string;
}): Health | null {
  if (!HEALTH_PHASES.includes(i.phase)) return null;
  const late =
    !!i.endDate &&
    i.endDate < i.today &&
    ["preparation", "execution", "handover"].includes(i.phase);
  if ((i.costMinor > 0 && i.marginMinor < 0) || (i.drawdownPct ?? 0) > 100 || late) return "danger";
  const marginDrop =
    i.costMinor > 0 &&
    i.marginPct != null &&
    i.plannedMarginPct != null &&
    i.plannedMarginPct - i.marginPct > 10;
  if ((i.drawdownPct ?? 0) > 85 || marginDrop) return "warning";
  return "ok";
}

export const HEALTH_LABEL: Record<Health, string> = {
  ok: "V pořádku",
  warning: "Pozor",
  danger: "Problém",
};
