import { addDaysIso, addMonthsIso, diffDaysIso, monthRange } from "@rebar/core/time";
import type { RecurringKind, RecurringPeriod, RecurringStatus } from "../labels";

/*
  Čistá pravidla hostingu a údržby (HOST-02, HOST-03, R-26, R-47): posun obnovy o období, roční opakovaný příjem,
  souhrn a stav obnovy. Bez databáze a bez Reactu.
*/

/** Výchozí okno „Obnova do 30 dní“. */
export const RENEWAL_WINDOW_DAYS = 30;

/** Počet měsíců v období služby. */
export const periodMonths = (period: RecurringPeriod): number => (period === "yearly" ? 12 : 1);

const dayOf = (date: string) => Number(date.slice(8, 10));
const lastDayOf = (date: string) => Number(monthRange(date.slice(0, 7)).to.slice(8, 10));

/**
 * Posune datum další obnovy o jedno období (HOST-03, R-47): ročně o 12 měsíců, měsíčně o 1. Den v měsíci se drží:
 * obnova 31. 1. měsíčně dává 28. 2., ale pak 31. 3. (ne 28. 3.), protože zkrácený den se bere z původního dne.
 * Původní den je den dosavadní obnovy; byl-li ten sám zkrácený (poslední den měsíce) a služba běží `since` od
 * pozdějšího dne v měsíci, vrátí se k dni z `since` (29. 2. 2024 ročně → 28. 2. 2025 → … → 29. 2. 2028).
 */
export function shiftRenewal(
  nextRenewal: string,
  period: RecurringPeriod,
  since?: string | null,
): string {
  const date = nextRenewal.slice(0, 10);
  let anchor = dayOf(date);
  if (since && dayOf(since) > anchor && anchor === lastDayOf(date)) anchor = dayOf(since);
  const first = addMonthsIso(`${date.slice(0, 7)}-01`, periodMonths(period));
  const day = Math.min(anchor, lastDayOf(first));
  return `${first.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

/** Cena za rok: roční služba je jedno období, měsíční dvanáct (R-26). Nevyplněná cena je 0. */
export function annualMinor(
  priceMinor: number | null | undefined,
  period: RecurringPeriod,
): number {
  return (priceMinor ?? 0) * (period === "yearly" ? 1 : 12);
}

/** Měsíční ekvivalent ceny (roční cena / 12, zaokrouhleno na haléř). */
export function monthlyMinor(
  priceMinor: number | null | undefined,
  period: RecurringPeriod,
): number {
  return Math.round(annualMinor(priceMinor, period) / 12);
}

/** Stav obnovy: bez data, v pořádku, blíží se (v okně), po termínu. */
export type RenewalLevel = "none" | "ok" | "soon" | "overdue";

/** Stav obnovy služby k danému dni. Počítá se jen u aktivní služby; pozastavená a zrušená se neobnovuje. */
export function renewalState(
  nextRenewal: string | null | undefined,
  status: RecurringStatus,
  today: string,
  windowDays = RENEWAL_WINDOW_DAYS,
): { level: RenewalLevel; daysLeft: number | null } {
  if (status !== "active" || !nextRenewal) return { level: "none", daysLeft: null };
  const daysLeft = diffDaysIso(today, nextRenewal.slice(0, 10));
  const level: RenewalLevel = daysLeft < 0 ? "overdue" : daysLeft <= windowDays ? "soon" : "ok";
  return { level, daysLeft };
}

/** Poslední den okna „Obnova do N dní“ (včetně). */
export const renewalWindowEnd = (today: string, windowDays = RENEWAL_WINDOW_DAYS): string =>
  addDaysIso(today, windowDays);

/** Vstup souhrnu. */
export type ServiceLike = {
  kind: RecurringKind;
  period: RecurringPeriod;
  status: RecurringStatus;
  priceMinor: number | null;
  nextRenewal: string | null;
};

/** Souhrn hostingu a údržby (karty nad seznamem a metriky nástěnek). */
export type HostingSummary = {
  /** Počet aktivních služeb. */
  activeCount: number;
  pausedCount: number;
  canceledCount: number;
  /** Roční opakovaný příjem z aktivních služeb (měsíční × 12). */
  annualMinor: number;
  /** Měsíční ekvivalent ročního příjmu. */
  monthlyMinor: number;
  byKind: Record<RecurringKind, { count: number; annualMinor: number }>;
  /** Aktivní služby s obnovou do 30 dní včetně těch po termínu. */
  dueSoonCount: number;
  /** Aktivní služby, jejichž obnova už měla být. */
  overdueCount: number;
};

/**
 * Souhrn služeb (HOST-02): roční opakovaný příjem a počet aktivních. Do příjmu se počítají jen aktivní služby;
 * pozastavená a zrušená ne.
 */
export function summarizeServices(
  rows: readonly ServiceLike[],
  today: string,
  windowDays = RENEWAL_WINDOW_DAYS,
): HostingSummary {
  const out: HostingSummary = {
    activeCount: 0,
    pausedCount: 0,
    canceledCount: 0,
    annualMinor: 0,
    monthlyMinor: 0,
    byKind: { hosting: { count: 0, annualMinor: 0 }, maintenance: { count: 0, annualMinor: 0 } },
    dueSoonCount: 0,
    overdueCount: 0,
  };
  for (const r of rows) {
    if (r.status === "paused") out.pausedCount += 1;
    else if (r.status === "canceled") out.canceledCount += 1;
    else {
      out.activeCount += 1;
      const annual = annualMinor(r.priceMinor, r.period);
      out.annualMinor += annual;
      out.byKind[r.kind].count += 1;
      out.byKind[r.kind].annualMinor += annual;
      const { level } = renewalState(r.nextRenewal, r.status, today, windowDays);
      if (level === "overdue") out.overdueCount += 1;
      if (level === "overdue" || level === "soon") out.dueSoonCount += 1;
    }
  }
  out.monthlyMinor = Math.round(out.annualMinor / 12);
  return out;
}
