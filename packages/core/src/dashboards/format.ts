import { formatMinor } from "../entities/shared";
import { formatMinutes } from "../time/dates";
import type { CompareMode, ValueFormat } from "./types";

const nf = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 });
const nfInt = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("cs-CZ", { notation: "compact", maximumFractionDigits: 1 });

/** Hodnota widgetu jako text podle formátu (peníze jsou v haléřích). */
export function formatValue(format: ValueFormat, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  switch (format) {
    case "money":
      return formatMinor(Math.round(value));
    case "percent":
      return `${nf.format(value)}\u00a0%`;
    case "minutes":
      return formatMinutes(Math.round(value));
    case "hours":
      return `${nf.format(value)}\u00a0h`;
    default:
      return Number.isInteger(value) ? nfInt.format(value) : nf.format(value);
  }
}

/** Krátký tvar pro osy grafů („1,2 mil.“, „350 tis.“). Peníze se zkracují v korunách. */
export function formatCompact(format: ValueFormat, value: number): string {
  switch (format) {
    case "money":
      return `${compact.format(value / 100)}\u00a0Kč`;
    case "percent":
      return `${nfInt.format(value)}\u00a0%`;
    case "minutes":
      return `${compact.format(value / 60)}\u00a0h`;
    case "hours":
      return `${compact.format(value)}\u00a0h`;
    default:
      return compact.format(value);
  }
}

/** Změna proti srovnávacímu období. `pct` je `null`, když je základ nula (dělení nulou). */
export function deltaOf(
  value: number | null,
  previous: number | null,
): { abs: number; pct: number | null } | undefined {
  if (value === null || previous === null) return undefined;
  const abs = value - previous;
  return { abs, pct: previous === 0 ? null : (abs / Math.abs(previous)) * 100 };
}

export const COMPARE_LABELS: Record<CompareMode, string> = {
  none: "Bez srovnání",
  previous_period: "Proti předchozímu období",
  previous_year: "Proti stejnému období loni",
};
