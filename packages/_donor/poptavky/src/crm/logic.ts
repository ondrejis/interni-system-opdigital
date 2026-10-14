// Čistá logika obchodu (CRM): vážená hodnota, pravděpodobnost, stav další aktivity, hnití, dny ve stavu, souhrn sloupce.
// Klientsky bezpečné: žádné serverové importy, používá je i prohlížeč (nástěnka, detail, prognóza). Vše se počítá
// v pražském čase; funkce jsou bez vedlejších účinků a čas dostávají jako parametr.

/** Fáze zakázky, ve kterých obchod ještě běží (otevřený deal). Ostatní fáze jsou vyhráno (a dál), prohráno, pozastaveno. */
export const OPEN_DEAL_PHASES: readonly string[] = ["inquiry", "offer"];
/** Fáze, ve kterých je obchod vyhraný (zakázka se realizuje nebo je uzavřená). */
export const WON_DEAL_PHASES: readonly string[] = [
  "preparation",
  "execution",
  "handover",
  "warranty",
  "closed",
];

/** Je obchod otevřený (zakázka ve fázi poptávka nebo nabídka)? */
export const isOpenDeal = (phase: unknown): boolean => OPEN_DEAL_PHASES.includes(String(phase));
/** Je obchod vyhraný (zakázka od přípravy dál)? */
export const isWonDeal = (phase: unknown): boolean => WON_DEAL_PHASES.includes(String(phase));
/** Je obchod prohraný (fáze prohráno)? */
export const isLostDeal = (phase: unknown): boolean => phase === "lost";

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
 * Platná pravděpodobnost zakázky v procentech. Pořadí: ruční přepsání na zakázce (`crmProbabilityPct`), prohra = 0,
 * pravděpodobnost stavu, a když ji stav nemá, vyhraná zakázka (příprava a dál) = 100, jinak 0.
 */
export function effectiveProbabilityPct(
  job: { phase?: string | null; crmProbabilityPct?: number | null },
  stage: { probabilityPct?: number | null } | null | undefined,
): number {
  if (job.crmProbabilityPct !== null && job.crmProbabilityPct !== undefined)
    return clampPct(job.crmProbabilityPct);
  if (isLostDeal(job.phase)) return 0;
  const fromStage = stage?.probabilityPct;
  if (fromStage !== null && fromStage !== undefined) return clampPct(fromStage);
  return isWonDeal(job.phase) ? 100 : 0;
}

/** Stav další aktivity zakázky pro ikonu na kartě. */
export type ActivityState = "today" | "future" | "overdue" | "none";

/**
 * Stav „další aktivity“ zakázky (ikona na kartě): bez otevřených aktivit `none`; jinak podle nejbližší otevřené
 * aktivity porovnané s dneškem v pražském čase. Aktivita dnes s uplynulým časem je po termínu; čas přesně o půlnoci
 * se bere jako aktivita na celý den (ta je „dnes“ po celý den).
 */
export function activityState(
  nextActivityAt: DateInput | null | undefined,
  openCount: number,
  now: Date = new Date(),
): ActivityState {
  if (openCount <= 0 || nextActivityAt === null || nextActivityAt === undefined) return "none";
  const due = toDate(nextActivityAt);
  if (Number.isNaN(due.getTime())) return "none";
  const diff = dayDiff(pragueDay(now), pragueDay(due));
  if (diff < 0) return "overdue";
  if (diff > 0) return "future";
  if (isPragueMidnight(due)) return "today";
  return due.getTime() < now.getTime() ? "overdue" : "today";
}

/** Celé dny od `since` do `now` (kalendářní dny v pražském čase); budoucí datum je 0. */
export function daysSince(since: DateInput | null | undefined, now: Date = new Date()): number {
  if (since === null || since === undefined) return 0;
  const d = toDate(since);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, dayDiff(pragueDay(d), pragueDay(now)));
}

/** Dny ve stavu (pás fází, karta): od vstupu do aktuálního stavu. */
export const daysInStage = (stageEnteredAt: DateInput | null | undefined, now?: Date): number =>
  daysSince(stageEnteredAt, now);

/**
 * Hnije zakázka? Ano, když od posledního pohybu uplynul aspoň `rottingDays` dní. Posledním pohybem je pozdější z okamžiku
 * vstupu do stavu a poslední dokončené aktivity. Stav bez `rottingDays` (nebo 0) nehnije; bez jediného údaje o čase také ne.
 */
export function isRotting(
  input: {
    stageEnteredAt?: DateInput | null;
    lastActivityAt?: DateInput | null;
    rottingDays?: number | null;
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

/** Souhrn sloupce nástěnky: počet, součet a vážený součet. */
export type ColumnSummary = {
  count: number;
  /** Součet hodnot v haléřích. */
  totalMinor: number;
  /** Součet vážených hodnot v haléřích (každá zakázka zaokrouhlená zvlášť). */
  weightedMinor: number;
};

/** Souhrn sloupce nástěnky: počet, součet a vážený součet. `probabilityPct` je platná pravděpodobnost zakázky. */
export function columnSummary(
  deals: ReadonlyArray<{ valueMinor: number; probabilityPct: number }>,
): ColumnSummary {
  let totalMinor = 0;
  let weightedMinor = 0;
  for (const d of deals) {
    const value = Number.isFinite(d.valueMinor) ? d.valueMinor : 0;
    totalMinor += value;
    weightedMinor += weightedValueMinor(value, d.probabilityPct);
  }
  return { count: deals.length, totalMinor, weightedMinor };
}
