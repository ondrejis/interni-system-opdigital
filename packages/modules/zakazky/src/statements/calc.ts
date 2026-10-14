/**
 * Čistá logika soupisů provedených prací: kumulace množství, procenta, částky a hlídání rozpočtovaného množství.
 * Množství jsou desetinné řetězce (3 místa) počítané v tisícinách, peníze v haléřích (ADR 003).
 */
import { amountMinor, fromThousandths, toThousandths } from "../changes/calc";

export { fromThousandths, toThousandths };

export const STATEMENT_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: "Koncept", color: "gray" },
  submitted: { label: "Ke schválení", color: "yellow" },
  approved: { label: "Schváleno", color: "green" },
  rejected: { label: "Zamítnuto", color: "red" },
};

export type StatementLineInput = {
  /** Rozpočtované množství položky (realizační verze, včetně schválených změn). */
  budgetQuantity: string;
  /** Provedeno v dřívějších soupisech (bez tohoto). */
  previousQuantity: string;
  /** Provedeno v jiných soupisech celkem (i pozdějších a rozpracovaných), které čerpají rozpočet. */
  othersQuantity: string;
  /** Provedeno v tomto soupisu za období. */
  periodQuantity: string;
  unitPriceMinor: number;
};

export type StatementLineCalc = {
  quantityTotal: string;
  /** Procento hotovo (0–100, jedno desetinné místo) včetně tohoto období. */
  percent: number;
  /** Kolik ještě lze v tomto soupisu zadat (rozpočet minus ostatní soupisy). */
  remainingQuantity: string;
  amountPeriodMinor: number;
  amountTotalMinor: number;
  /** Zadané množství překračuje, co rozpočet dovoluje. */
  over: boolean;
};

export function computeLine(l: StatementLineInput): StatementLineCalc {
  const budget = toThousandths(l.budgetQuantity);
  const period = toThousandths(l.periodQuantity);
  const total = toThousandths(l.previousQuantity) + period;
  const remaining = Math.max(0, budget - toThousandths(l.othersQuantity));
  return {
    quantityTotal: fromThousandths(total),
    percent: budget > 0 ? Math.round((total / budget) * 1000) / 10 : 0,
    remainingQuantity: fromThousandths(remaining),
    amountPeriodMinor: amountMinor(period, l.unitPriceMinor),
    amountTotalMinor: amountMinor(total, l.unitPriceMinor),
    over: period > remaining,
  };
}

/** Nárokovaná částka soupisu = součet částek za období. */
export const claimedOf = (lines: readonly { amountPeriodMinor: number }[]) =>
  lines.reduce((a, l) => a + l.amountPeriodMinor, 0);

/** Česká věta o překročení rozpočtu, nebo `null`, když je množství v pořádku. */
export function overrunMessage(
  title: string,
  unit: string,
  calc: Pick<StatementLineCalc, "over" | "remainingQuantity">,
): string | null {
  if (!calc.over) return null;
  const left = Number(calc.remainingQuantity).toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
  return `Položka „${title}“: provedené množství přesahuje rozpočet (zbývá ${left} ${unit}). Nejdřív zadejte změnu rozpočtu.`;
}

/** Název soupisu: „Soupis č. 3“. */
export const statementLabel = (n: number) => `Soupis č. ${n}`;
