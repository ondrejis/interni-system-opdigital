import { addDaysIso, diffDaysIso } from "@rebar/core/time";
import {
  phaseState,
  monthShort,
  relativeDay,
  type GanttPhase,
  type PhaseState,
} from "./schedule-shared";

/**
 * Zmenšený harmonogram pro kartu na Přehledu zakázky: čisté výpočty (okno, pozice pruhů, výběr řádků, zpoždění,
 * nejbližší fáze). Bez Reactu a bez serveru, aby se daly testovat. Karta nic nepočítá po svém.
 */

export type CompactPhase = Pick<
  GanttPhase,
  "id" | "name" | "startDate" | "endDate" | "progress" | "status" | "milestone" | "delay"
>;

/** Nejvýš tolik dní se vejde do pásu celé; delší plán se ukáže jako okno kolem dneška. */
export const FULL_SPAN_DAYS = 150;
/** Délka okna kolem dneška u dlouhých plánů. */
export const WINDOW_DAYS = 120;
/** Kolik dní před dneškem okno začíná (aby bylo vidět, co právě skončilo). */
export const WINDOW_LEAD_DAYS = 30;
/** Nejvíc řádků (fází) v pásu; zbytek se shrne do „+ N dalších“. */
export const MAX_ROWS = 8;
/** Nejmenší šířka pruhu v procentech pásu, aby byla i jednodenní fáze vidět. */
export const MIN_BAR_PCT = 1.6;
/** Dnes se do pásu přidá, jen když je od plánu blíž než tolik dní (jinak by pruhy byly stlačené). */
export const TODAY_PAD_DAYS = 45;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Zobrazený rozsah dní v pásu (celý plán, nebo výřez kolem dneška). */
export type TimelineWindow = {
  /** První a poslední zobrazený den (včetně). */
  start: string;
  end: string;
  /** Počet zobrazených dní. */
  days: number;
  /** Plán je delší než pás a ukazuje se jen výřez. */
  windowed: boolean;
};

/**
 * Rozsah pásu: celý plán (od první fáze do konce poslední), a když je dlouhý, okno kolem dneška. Dnešek se do rozsahu
 * přidá, když je těsně před začátkem nebo za koncem plánu (zakázka se chystá začít nebo je po termínu).
 */
export function timelineWindow(
  phases: readonly Pick<CompactPhase, "startDate" | "endDate" | "status" | "progress">[],
  today: string,
): TimelineWindow | null {
  if (!phases.length) return null;
  let start = phases.reduce((m, p) => (p.startDate < m ? p.startDate : m), phases[0]!.startDate);
  let end = phases.reduce((m, p) => (p.endDate > m ? p.endDate : m), phases[0]!.endDate);
  const open = phases.some((p) => p.status !== "done" && p.progress < 100);
  if (today < start && diffDaysIso(today, start) <= TODAY_PAD_DAYS) start = today;
  if (today > end && open && diffDaysIso(end, today) <= TODAY_PAD_DAYS) end = today;
  const days = diffDaysIso(start, end) + 1;
  if (days <= FULL_SPAN_DAYS) return { start, end, days, windowed: false };
  const first = addDaysIso(start, 0);
  const lastStart = addDaysIso(end, -(WINDOW_DAYS - 1));
  const raw = addDaysIso(today, -WINDOW_LEAD_DAYS);
  const ws = raw < first ? first : raw > lastStart ? lastStart : raw;
  return { start: ws, end: addDaysIso(ws, WINDOW_DAYS - 1), days: WINDOW_DAYS, windowed: true };
}

/** Jeden pruh nebo milník v pásu: stav, termíny a poloha v procentech šířky. */
export type CompactBar = {
  id: string;
  name: string;
  state: PhaseState;
  milestone: boolean;
  startDate: string;
  endDate: string;
  progress: number;
  delay: number;
  /** Levý okraj a šířka v procentech pásu (u milníku šířka 0, `left` je střed dne). */
  left: number;
  width: number;
  /** Pruh pokračuje za okraj okna (u dlouhých plánů). */
  cutLeft: boolean;
  cutRight: boolean;
};

/** Pozice jedné fáze v okně, nebo `null`, když je celá mimo okno. */
export function barFor(p: CompactPhase, w: TimelineWindow): CompactBar | null {
  if (p.endDate < w.start || p.startDate > w.end) return null;
  const base = {
    id: p.id,
    name: p.name,
    state: phaseState(p),
    milestone: p.milestone,
    startDate: p.startDate,
    endDate: p.endDate,
    progress: clamp(p.progress, 0, 100),
    delay: p.delay,
  };
  if (p.milestone) {
    const at = diffDaysIso(w.start, p.startDate) + 0.5;
    return { ...base, left: (at / w.days) * 100, width: 0, cutLeft: false, cutRight: false };
  }
  const from = p.startDate < w.start ? w.start : p.startDate;
  const to = p.endDate > w.end ? w.end : p.endDate;
  const left = (diffDaysIso(w.start, from) / w.days) * 100;
  const width = clamp(((diffDaysIso(from, to) + 1) / w.days) * 100, MIN_BAR_PCT, 100);
  return {
    ...base,
    left: Math.min(left, 100 - width),
    width,
    cutLeft: p.startDate < w.start,
    cutRight: p.endDate > w.end,
  };
}

/**
 * Které fáze se ukážou, když jich je víc než řádků: nejdřív zpožděné, pak rozpracované, pak nejbližší plánované
 * a nakonec nedávno hotové. Výsledek zůstává v pořadí harmonogramu.
 */
export function pickRows<T extends CompactPhase>(
  phases: readonly T[],
  today: string,
  max = MAX_ROWS,
): T[] {
  if (phases.length <= max) return [...phases];
  const rank: Record<PhaseState, number> = { late: 0, active: 1, planned: 2, done: 3 };
  const scored = phases.map((p, index) => {
    const state = phaseState(p);
    const near = Math.abs(diffDaysIso(today, state === "done" ? p.endDate : p.startDate));
    return { p, index, rank: rank[state], near };
  });
  return scored
    .sort((a, b) => a.rank - b.rank || a.near - b.near || a.index - b.index)
    .slice(0, max)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.p);
}

/** Popisek měsíce nad pásem a jeho poloha v procentech šířky. */
export type MonthTick = { label: string; left: number };

/** Popisky měsíců nad pásem: první den měsíce v okně; ledna nese i rok. Příliš blízké popisky se vynechají. */
export function monthTicks(w: TimelineWindow, minGapPct = 9): MonthTick[] {
  const ticks: MonthTick[] = [];
  const push = (iso: string, left: number) => {
    const prev = ticks.at(-1);
    if (prev && left - prev.left < minGapPct) return;
    const jan = iso.slice(5, 7) === "01";
    ticks.push({ label: jan ? `${monthShort(iso)} ${iso.slice(2, 4)}` : monthShort(iso), left });
  };
  // začátek okna: měsíc, ve kterém začíná, se ukáže, jen když na něj zbyde místo
  const monthsAfter: string[] = [];
  let y = Number(w.start.slice(0, 4));
  let m = Number(w.start.slice(5, 7));
  for (let guard = 0; guard < 40; guard++) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const iso = `${y}-${String(m).padStart(2, "0")}-01`;
    if (iso > w.end) break;
    monthsAfter.push(iso);
  }
  const firstTickLeft = monthsAfter[0]
    ? (diffDaysIso(w.start, monthsAfter[0]) / w.days) * 100
    : Infinity;
  if (firstTickLeft >= minGapPct + 3) push(w.start, 0);
  for (const iso of monthsAfter) push(iso, (diffDaysIso(w.start, iso) / w.days) * 100);
  return ticks;
}

/** Hotový podklad pro vykreslení pásu: okno, pruhy, značka dnes, počet skrytých fází a popisky měsíců. */
export type CompactTimeline = {
  window: TimelineWindow;
  bars: CompactBar[];
  /** Poloha značky „dnes“ v procentech pásu; `null`, když dnešek leží mimo okno. */
  today: number | null;
  /** Fází (a milníků), které se do pásu nevešly nebo leží mimo okno. */
  hidden: number;
  ticks: MonthTick[];
};

/** Spočítá celý pás z fází harmonogramu (okno, výběr řádků, pozice); pro prázdný plán vrací `null`. */
export function compactTimeline(
  phases: readonly CompactPhase[],
  today: string,
  maxRows = MAX_ROWS,
): CompactTimeline | null {
  const window = timelineWindow(phases, today);
  if (!window) return null;
  const inWindow = phases.filter((p) => !(p.endDate < window.start || p.startDate > window.end));
  const rows = pickRows(inWindow, today, maxRows);
  const bars = rows.map((p) => barFor(p, window)!);
  const todayPos =
    today >= window.start && today <= window.end
      ? ((diffDaysIso(window.start, today) + 0.5) / window.days) * 100
      : null;
  return {
    window,
    bars,
    today: todayPos,
    hidden: phases.length - bars.length,
    ticks: monthTicks(window),
  };
}

/** Zdraví harmonogramu pro štítek na kartě: prázdný, hotový, zpožděný (s nejdelším zpožděním) nebo podle plánu. */
export type ScheduleHealth =
  | { kind: "empty" }
  | { kind: "done" }
  | { kind: "late"; delay: number; count: number; names: string[] }
  | { kind: "ontrack" };

/** Souhrn zpoždění: nejdelší zpoždění z otevřených fází a počet zpožděných. Hotový plán je „hotovo“. */
export function scheduleHealth(phases: readonly CompactPhase[]): ScheduleHealth {
  if (!phases.length) return { kind: "empty" };
  const open = phases.filter((p) => phaseState(p) !== "done");
  if (!open.length) return { kind: "done" };
  const late = open.filter((p) => p.delay > 0);
  if (!late.length) return { kind: "ontrack" };
  return {
    kind: "late",
    delay: Math.max(...late.map((p) => p.delay)),
    count: late.length,
    names: late.map((p) => p.name),
  };
}

/**
 * Nejbližší nehotové fáze a milníky: zpožděné a rozpracované podle konce, plánované podle začátku; nejdřív to,
 * co je na řadě dřív.
 */
export function nextUp<T extends CompactPhase>(phases: readonly T[], n = 3): T[] {
  const due = (p: T) => (phaseState(p) === "planned" ? p.startDate : p.endDate);
  return phases
    .filter((p) => phaseState(p) !== "done")
    .sort((a, b) => due(a).localeCompare(due(b)) || a.name.localeCompare(b.name, "cs"))
    .slice(0, n);
}

/** „začne za 3 dny“, „končí dnes“, „měla skončit před 2 dny“: kdy je fáze na řadě. */
export function dueText(notStarted: boolean, date: string, today: string): string {
  const rel = relativeDay(date, today);
  if (date < today) return `${notStarted ? "měla začít" : "měla skončit"} ${rel}`;
  if (date === today) return notStarted ? "začíná dnes" : "končí dnes";
  return `${notStarted ? "začne" : "končí"} ${rel}`;
}
