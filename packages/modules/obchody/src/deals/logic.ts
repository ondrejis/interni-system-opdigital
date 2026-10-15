// Čistá logika obchodů: vážená hodnota, pravděpodobnost podle výsledku, stav další aktivity, dny ve fázi, hnití,
// zvýraznění karty a souhrn sloupce boardu. Klientsky bezpečné (žádné serverové importy; používá je i UI), bez vedlejších
// účinků; čas dostávají funkce jako parametr a všechno se počítá v pražském čase (Europe/Prague).

import type { DealResult, DealSource } from "../shared";

const TZ = "Europe/Prague";
const MS_DAY = 86_400_000;

type DateInput = Date | string | number;
const toDate = (v: DateInput): Date => (v instanceof Date ? v : new Date(v));

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const clockFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Kalendářní den v pražském čase (`YYYY-MM-DD`). */
export function pragueDay(v: DateInput): string {
  return dayFmt.format(toDate(v));
}

/** Je čas přesně o půlnoci pražského času (konvence aktivit na celý den). */
function isPragueMidnight(v: DateInput): boolean {
  return clockFmt.format(toDate(v)) === "00:00:00";
}

/** Počet kalendářních dnů mezi dvěma dny `YYYY-MM-DD` (b − a). */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_DAY);
}

/** Pravděpodobnost do rozsahu 0–100; nečíselná hodnota je 0. */
export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

/** Vážená hodnota v haléřích: hodnota × pravděpodobnost / 100, zaokrouhleno na haléř. */
export function weightedValueMinor(valueMinor: number, probabilityPct: number): number {
  if (!Number.isFinite(valueMinor)) return 0;
  return Math.round((valueMinor * clampPct(probabilityPct)) / 100);
}

/**
 * Platná pravděpodobnost obchodu v procentech: vyhraný = 100, prohraný = 0, otevřený podle fáze (bez pravděpodobnosti
 * u fáze 0).
 */
export function effectiveProbabilityPct(
  result: DealResult,
  stageProbabilityPct: number | null | undefined,
): number {
  if (result === "won") return 100;
  if (result === "lost") return 0;
  return stageProbabilityPct === null || stageProbabilityPct === undefined
    ? 0
    : clampPct(stageProbabilityPct);
}

/**
 * Uložená vážená hodnota obchodu v haléřích (sloupec `weighted_minor`); `null`, když obchod nemá hodnotu.
 * Přepočítává se při změně fáze, hodnoty a výsledku.
 */
export function storedWeightedMinor(
  valueMinor: number | null | undefined,
  result: DealResult,
  stageProbabilityPct: number | null | undefined,
): number | null {
  if (valueMinor === null || valueMinor === undefined) return null;
  return weightedValueMinor(valueMinor, effectiveProbabilityPct(result, stageProbabilityPct));
}

/** Stav další aktivity obchodu pro ikonu na kartě. */
export type ActivityState = "today" | "future" | "overdue" | "none";

/**
 * Stav „další aktivity“: bez naplánované aktivity `none`; jinak podle termínu porovnaného s dneškem v pražském čase.
 * Aktivita dnes s uplynulým časem je po termínu; čas přesně o půlnoci se bere jako aktivita na celý den (ta je „dnes“
 * po celý den).
 */
export function activityState(
  nextActivityAt: DateInput | null | undefined,
  now: Date = new Date(),
): ActivityState {
  if (nextActivityAt === null || nextActivityAt === undefined) return "none";
  const due = toDate(nextActivityAt);
  if (Number.isNaN(due.getTime())) return "none";
  const diff = dayDiff(pragueDay(now), pragueDay(due));
  if (diff < 0) return "overdue";
  if (diff > 0) return "future";
  if (isPragueMidnight(due)) return "today";
  return due.getTime() < now.getTime() ? "overdue" : "today";
}

/** Celé kalendářní dny (pražské) od `since` do `now`; budoucí datum nebo prázdná hodnota je 0. */
export function daysSince(since: DateInput | null | undefined, now: Date = new Date()): number {
  if (since === null || since === undefined) return 0;
  const d = toDate(since);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, dayDiff(pragueDay(d), pragueDay(now)));
}

/** Dny ve fázi (pás fází, karta): od vstupu do aktuální fáze. */
export const daysInStage = (stageEnteredAt: DateInput | null | undefined, now?: Date): number =>
  daysSince(stageEnteredAt, now);

/** Sekundy mezi dvěma okamžiky (nezáporné, celé); pro `deal_stage_history.duration_sec`. */
export function durationSec(from: DateInput, to: DateInput): number {
  return Math.max(0, Math.round((toDate(to).getTime() - toDate(from).getTime()) / 1000));
}

/**
 * Hnije obchod? Ano, když od posledního pohybu uplynul aspoň `rottingDays` dní. Posledním pohybem je pozdější z okamžiku
 * vstupu do fáze a poslední dokončené aktivity. Fáze bez `rottingDays` (nebo 0) nehnije; bez jediného údaje o čase také ne.
 */
export function isRotting(
  input: {
    stageEnteredAt?: DateInput | null | undefined;
    lastActivityAt?: DateInput | null | undefined;
    rottingDays?: number | null | undefined;
  },
  now: Date = new Date(),
): boolean {
  const limit = input.rottingDays;
  if (limit === null || limit === undefined || !(limit > 0)) return false;
  const stamps = [input.stageEnteredAt, input.lastActivityAt]
    .filter((v): v is DateInput => v !== null && v !== undefined)
    .map((v) => toDate(v).getTime())
    .filter((t) => !Number.isNaN(t));
  if (!stamps.length) return false;
  return daysSince(new Date(Math.max(...stamps)), now) >= limit;
}

/** Nový Meta lead, který ještě nikdo neotevřel (na boardu je zvýrazněný, R-42/OBCH-15). */
export function isUnopenedLead(d: {
  source: DealSource | string | null | undefined;
  firstOpenedAt: DateInput | null | undefined;
  result: DealResult;
}): boolean {
  return d.result === "open" && d.source === "meta" && !d.firstOpenedAt;
}

/** Vstup `dealHighlight`: údaje obchodu a jeho fáze. */
export type HighlightInput = {
  result: DealResult;
  stageEnteredAt: DateInput | null | undefined;
  nextActivityAt: DateInput | null | undefined;
  lastActivityAt: DateInput | null | undefined;
  rottingDays: number | null | undefined;
  source?: DealSource | string | null | undefined;
  firstOpenedAt?: DateInput | null | undefined;
};

/** Vizuální zvýraznění obchodu (OBCH-07, OBCH-15): nic se podle něj nedělá automaticky. */
export type DealHighlight = {
  /** Stav další aktivity (ikona hodin/výstrahy). Zavřený obchod je vždy `none`. */
  activityState: ActivityState;
  /** Otevřený obchod bez naplánované další aktivity: výstražná ikona. */
  noNextActivity: boolean;
  /** Ve fázi déle bez aktivity, než fáze dovoluje: červený obchod. */
  rotting: boolean;
  /** Celé dny ve fázi. */
  daysInStage: number;
  /** Celé dny od poslední dokončené aktivity (nebo od vstupu do fáze, když žádná není). */
  daysSinceActivity: number;
  /** Nový Meta lead bez otevření. */
  unopenedLead: boolean;
};

/**
 * Zvýraznění obchodu podle fáze: výstražná ikona bez další aktivity, červeně po překročení prahu fáze a zvýraznění
 * neotevřeného leadu. Zavřený (vyhraný, prohraný) obchod se nezvýrazňuje nikdy.
 */
export function dealHighlight(input: HighlightInput, now: Date = new Date()): DealHighlight {
  const open = input.result === "open";
  const state = open ? activityState(input.nextActivityAt, now) : "none";
  const lastMove = [input.stageEnteredAt, input.lastActivityAt]
    .filter((v): v is DateInput => v !== null && v !== undefined)
    .map((v) => toDate(v).getTime())
    .filter((t) => !Number.isNaN(t));
  return {
    activityState: state,
    noNextActivity: open && state === "none",
    rotting: open && isRotting(input, now),
    daysInStage: daysInStage(input.stageEnteredAt, now),
    daysSinceActivity: lastMove.length ? daysSince(new Date(Math.max(...lastMove)), now) : 0,
    unopenedLead: isUnopenedLead({
      source: input.source,
      firstOpenedAt: input.firstOpenedAt,
      result: input.result,
    }),
  };
}

/** Souhrn sloupce boardu: počet, součet a vážený součet. */
export type ColumnSummary = {
  count: number;
  /** Součet hodnot v haléřích. */
  totalMinor: number;
  /** Součet vážených hodnot v haléřích (každý obchod zaokrouhlený zvlášť). */
  weightedMinor: number;
};

/**
 * Souhrn sloupce boardu (OBCH-05): počet, součet hodnot a vážený součet (hodnota × pravděpodobnost fáze). Obchod bez
 * hodnoty se počítá, ale nic nepřidá k součtům.
 */
export function columnSummary(
  deals: ReadonlyArray<{ valueMinor: number | null; probabilityPct: number }>,
): ColumnSummary {
  let totalMinor = 0;
  let weightedMinor = 0;
  for (const d of deals) {
    const value = d.valueMinor !== null && Number.isFinite(d.valueMinor) ? d.valueMinor : 0;
    totalMinor += value;
    weightedMinor += weightedValueMinor(value, d.probabilityPct);
  }
  return { count: deals.length, totalMinor, weightedMinor };
}

/**
 * Okamžik odpovídající pražskému dni `YYYY-MM-DD` v poledne (výhra „k datu“: poledne nikdy nespadne do jiného dne
 * kvůli přechodu letního času).
 */
export function pragueNoon(day: string): Date {
  for (const offset of ["+01:00", "+02:00"]) {
    const d = new Date(`${day}T12:00:00${offset}`);
    if (!Number.isNaN(d.getTime()) && pragueDay(d) === day && clockFmt.format(d) === "12:00:00")
      return d;
  }
  throw new Error(`Neplatné datum ${day}.`);
}
