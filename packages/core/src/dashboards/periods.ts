// Období, kalendářní koše (den / týden / měsíc / čtvrtletí / rok) a filtry nástěnky v URL. Čisté funkce nad datem
// `YYYY-MM-DD` (bez časových pásem, aby přechod letního času nikdy neposunul den); „dnes“ dodá volající v české zóně.

import {
  addDaysIso,
  addMonthsIso,
  diffDaysIso,
  eachDayIso,
  monthRange,
  weekStartIso,
} from "../time/dates";
import {
  BUCKETS,
  PERIOD_PRESETS,
  type Bucket,
  type CompareMode,
  type DashboardFilters,
  type DateRange,
  type PeriodPreset,
} from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const quarterStart = (date: string) => {
  const m = Number(date.slice(5, 7));
  const qm = Math.floor((m - 1) / 3) * 3 + 1;
  return `${date.slice(0, 4)}-${String(qm).padStart(2, "0")}-01`;
};
const endOfMonth = (date: string) => monthRange(date.slice(0, 7)).to;

/** Období podle předvolby k danému dni. `all` a neplatné vlastní období = `null` (bez omezení). */
export function resolvePeriod(
  preset: PeriodPreset,
  today: string,
  custom?: { from?: string | undefined; to?: string | undefined },
): DateRange | null {
  switch (preset) {
    case "all":
      return null;
    case "today":
      return { from: today, to: today };
    case "this_week": {
      const from = weekStartIso(today);
      return { from, to: addDaysIso(from, 6) };
    }
    case "last_week": {
      const from = addDaysIso(weekStartIso(today), -7);
      return { from, to: addDaysIso(from, 6) };
    }
    case "this_month":
      return monthRange(today.slice(0, 7));
    case "last_month":
      return monthRange(addMonthsIso(`${today.slice(0, 7)}-01`, -1).slice(0, 7));
    case "this_quarter": {
      const from = quarterStart(today);
      return { from, to: endOfMonth(addMonthsIso(from, 2)) };
    }
    case "last_quarter": {
      const from = addMonthsIso(quarterStart(today), -3);
      return { from, to: endOfMonth(addMonthsIso(from, 2)) };
    }
    case "this_year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case "last_year": {
      const y = Number(today.slice(0, 4)) - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case "last_7_days":
      return { from: addDaysIso(today, -6), to: today };
    case "last_30_days":
      return { from: addDaysIso(today, -29), to: today };
    case "last_90_days":
      return { from: addDaysIso(today, -89), to: today };
    case "custom": {
      const f = custom?.from;
      const t = custom?.to;
      if (!f || !t || !ISO.test(f) || !ISO.test(t) || t < f) return null;
      return { from: f, to: t };
    }
  }
}

/** Období filtrů nástěnky. */
export const periodOf = (f: DashboardFilters, today: string): DateRange | null =>
  resolvePeriod(f.period, today, { from: f.from, to: f.to });

/**
 * Srovnávací období: předchozí stejně dlouhé období (u celých měsíců, čtvrtletí a let předchozí kalendářní měsíc /
 * čtvrtletí / rok, ne „30 dní zpět“) nebo stejné období o rok dříve.
 */
export function comparisonRange(range: DateRange, mode: CompareMode): DateRange | null {
  if (mode === "none") return null;
  if (mode === "previous_year")
    return { from: addMonthsIso(range.from, -12), to: addMonthsIso(range.to, -12) };
  const isFirst = range.from.endsWith("-01");
  const monthsSpan =
    (Number(range.to.slice(0, 4)) - Number(range.from.slice(0, 4))) * 12 +
    Number(range.to.slice(5, 7)) -
    Number(range.from.slice(5, 7)) +
    1;
  if (isFirst && range.to === endOfMonth(range.to) && [1, 3, 12].includes(monthsSpan)) {
    const from = addMonthsIso(range.from, -monthsSpan);
    return { from, to: endOfMonth(addMonthsIso(from, monthsSpan - 1)) };
  }
  const days = diffDaysIso(range.from, range.to) + 1;
  return { from: addDaysIso(range.from, -days), to: addDaysIso(range.from, -1) };
}

/** Začátek koše, do kterého datum spadá (týden začíná pondělím). */
export function bucketStart(date: string, bucket: Bucket): string {
  switch (bucket) {
    case "day":
      return date.slice(0, 10);
    case "week":
      return weekStartIso(date.slice(0, 10));
    case "month":
      return `${date.slice(0, 7)}-01`;
    case "quarter":
      return quarterStart(date);
    case "year":
      return `${date.slice(0, 4)}-01-01`;
  }
}

const nextBucket = (start: string, bucket: Bucket): string => {
  switch (bucket) {
    case "day":
      return addDaysIso(start, 1);
    case "week":
      return addDaysIso(start, 7);
    case "month":
      return addMonthsIso(start, 1);
    case "quarter":
      return addMonthsIso(start, 3);
    case "year":
      return addMonthsIso(start, 12);
  }
};

/** Všechny koše od začátku po konec rozsahu (i prázdné, aby časová řada neměla díry). */
export function bucketsBetween(range: DateRange, bucket: Bucket, max = 400): string[] {
  const out: string[] = [];
  for (
    let s = bucketStart(range.from, bucket);
    s <= range.to && out.length < max;
    s = nextBucket(s, bucket)
  )
    out.push(s);
  return out;
}

const MONTHS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

/** ISO číslo týdne a rok, ke kterému týden patří (čtvrtek rozhoduje). */
export function isoWeek(date: string): { year: number; week: number } {
  const thursday = addDaysIso(weekStartIso(date), 3);
  const year = Number(thursday.slice(0, 4));
  const week = Math.floor(diffDaysIso(`${year}-01-01`, thursday) / 7) + 1;
  return { year, week };
}

/** Popisek koše pro osu grafu: „říjen 2026“, „T41 2026“, „9. 10.“, „Q4 2026“, „2026“. */
export function bucketLabel(start: string, bucket: Bucket): string {
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  switch (bucket) {
    case "day":
      return `${d}. ${m}.`;
    case "week": {
      const w = isoWeek(start);
      return `T${w.week} ${w.year}`;
    }
    case "month":
      return `${MONTHS[m - 1]} ${y}`;
    case "quarter":
      return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
    case "year":
      return String(y);
  }
}

/** Rozumný koš podle délky období. */
export function defaultBucket(range: DateRange | null): Bucket {
  if (!range) return "month";
  const days = diffDaysIso(range.from, range.to) + 1;
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  if (days <= 800) return "month";
  return "year";
}

export const eachDay = eachDayIso;

/* ---------- filtry nástěnky v URL ---------- */

export const DEFAULT_FILTERS: DashboardFilters = { period: "all" };

/** Filtry z parametrů URL (`obdobi`, `od`, `do`, `zakazka`, `osoba`); neplatné hodnoty se tiše zahodí. */
export function filtersFromSearch(
  get: (key: string) => string | null | undefined,
  fallbackPeriod: PeriodPreset = "all",
): DashboardFilters {
  const p = get("obdobi");
  const period = (PERIOD_PRESETS as readonly string[]).includes(p ?? "")
    ? (p as PeriodPreset)
    : fallbackPeriod;
  const from = get("od");
  const to = get("do");
  const job = get("zakazka");
  const user = get("osoba");
  return {
    period,
    ...(period === "custom" && from && ISO.test(from) ? { from } : {}),
    ...(period === "custom" && to && ISO.test(to) ? { to } : {}),
    ...(job && UUID.test(job) ? { jobId: job } : {}),
    ...(user && UUID.test(user) ? { userId: user } : {}),
  };
}

/** Opačně: jen odchylky od výchozího stavu, ať je adresa krátká. */
export function filtersToSearch(
  f: DashboardFilters,
  fallbackPeriod: PeriodPreset = "all",
): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.period !== fallbackPeriod) out.obdobi = f.period;
  if (f.period === "custom") {
    if (f.from) out.od = f.from;
    if (f.to) out.do = f.to;
  }
  if (f.jobId) out.zakazka = f.jobId;
  if (f.userId) out.osoba = f.userId;
  return out;
}

export const isBucket = (v: unknown): v is Bucket => (BUCKETS as readonly unknown[]).includes(v);
