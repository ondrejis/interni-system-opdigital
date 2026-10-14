// Čistá logika aktivit (termíny, filtry, návrh další aktivity). Klientsky bezpečná: žádný server, čas dostává jako parametr.
// Vše se počítá v pražském čase; aktivita na celý den je uložená na půlnoc pražského času (`all_day = true`).

import {
  addDaysIso,
  addWorkdays,
  diffDaysIso,
  isoWeekday,
  localParts,
  weekStartIso,
  zonedToUtc,
} from "@rebar/core/time";
import type { ActivityDueState, ActivityRange, TimelineEntry, TimelineFilter } from "./types";

type DateInput = Date | string | number;
const toDate = (v: DateInput): Date => (v instanceof Date ? v : new Date(v));

/** Dnešní kalendářní den v pražském čase (`YYYY-MM-DD`). */
export const dayOf = (v: DateInput): string => localParts(toDate(v)).date;

/** Aktivita na celý den se ukládá na půlnoc pražského času toho dne; jinak se čas nemění. */
export function normalizeDue(dueAt: Date, allDay: boolean): Date {
  return allDay ? zonedToUtc(localParts(dueAt).date, "00:00") : dueAt;
}

/**
 * Stav aktivity vůči `now`: hotová, po termínu, dnes, budoucí, nebo bez termínu. Aktivita na celý den je „dnes“
 * po celý den a po termínu až od dalšího dne; časová aktivita je po termínu, jakmile čas uplyne.
 */
export function dueState(
  a: { dueAt: DateInput | null | undefined; allDay: boolean; doneAt?: DateInput | null },
  now: Date = new Date(),
): ActivityDueState {
  if (a.doneAt) return "done";
  if (a.dueAt === null || a.dueAt === undefined) return "nodate";
  const due = toDate(a.dueAt);
  if (Number.isNaN(due.getTime())) return "nodate";
  const diff = diffDaysIso(dayOf(now), dayOf(due));
  if (diff < 0) return "overdue";
  if (diff > 0) return "future";
  if (a.allDay) return "today";
  return due.getTime() < now.getTime() ? "overdue" : "today";
}

/** Pořadí řazení stavů v seznamu otevřených aktivit (nejdřív co hoří). */
export const STATE_ORDER: Record<ActivityDueState, number> = {
  overdue: 0,
  today: 1,
  future: 2,
  nodate: 3,
  done: 4,
};

/**
 * Návrh termínu další aktivity po dokončení: nejbližší pracovní den po pozdějším z dneška a termínu dokončené
 * aktivity, ve stejnou hodinu (celodenní zůstane celodenní, bez termínu je to 9:00).
 */
export function suggestNextDue(
  prev: { dueAt: DateInput | null | undefined; allDay: boolean },
  now: Date = new Date(),
): Date {
  const today = dayOf(now);
  const prevDay = prev.dueAt ? dayOf(prev.dueAt) : today;
  const base = prevDay > today ? prevDay : today;
  const day = addWorkdays(base, 1);
  if (prev.allDay) return zonedToUtc(day, "00:00");
  const time = prev.dueAt ? localParts(toDate(prev.dueAt)).time : "09:00";
  return zonedToUtc(day, time);
}

/** Termín po odložení o `days` dní od dneška (hodina zůstává, celodenní zůstane celodenní). */
export function snoozeTarget(
  cur: { dueAt: DateInput | null | undefined; allDay: boolean },
  days: number,
  now: Date = new Date(),
): Date {
  const day = addDaysIso(dayOf(now), days);
  if (cur.allDay) return zonedToUtc(day, "00:00");
  const time = cur.dueAt ? localParts(toDate(cur.dueAt)).time : "09:00";
  return zonedToUtc(day, time);
}

/** Za kolik dní od dneška je nejbližší pondělí po dnešku (pro „Příští týden“ v odložení). */
export function daysToNextMonday(now: Date = new Date()): number {
  const today = dayOf(now);
  return diffDaysIso(today, addDaysIso(weekStartIso(today), 7));
}

/** Konec aktivity: začátek + délka (výchozí 30 minut; celodenní končí o půlnoci dalšího dne). */
export function activityEnd(dueAt: Date, allDay: boolean, durationMin: number | null): Date {
  if (allDay) return zonedToUtc(addDaysIso(localParts(dueAt).date, 1), "00:00");
  return new Date(dueAt.getTime() + (durationMin && durationMin > 0 ? durationMin : 30) * 60_000);
}

/** Meze rychlého časového filtru v pražských dnech (`null` = bez meze). */
export type RangeBounds = {
  /** Jen hotové aktivity (`true`), nebo jen otevřené (`false`). */
  done: boolean;
  fromDay: string | null;
  toDay: string | null;
  /** Jen aktivity po termínu (podle stavu, ne jen podle dne). */
  overdue: boolean;
};

/** Převede rychlý filtr na meze: dnes, zítra, tento a příští týden (pondělí až neděle). */
export function rangeBounds(range: ActivityRange, now: Date = new Date()): RangeBounds {
  const today = dayOf(now);
  const monday = weekStartIso(today);
  switch (range) {
    case "open":
      return { done: false, fromDay: null, toDay: null, overdue: false };
    case "overdue":
      return { done: false, fromDay: null, toDay: null, overdue: true };
    case "today":
      return { done: false, fromDay: today, toDay: today, overdue: false };
    case "tomorrow": {
      const d = addDaysIso(today, 1);
      return { done: false, fromDay: d, toDay: d, overdue: false };
    }
    case "week":
      return { done: false, fromDay: monday, toDay: addDaysIso(monday, 6), overdue: false };
    case "nextWeek":
      return {
        done: false,
        fromDay: addDaysIso(monday, 7),
        toDay: addDaysIso(monday, 13),
        overdue: false,
      };
    case "done":
      return { done: true, fromDay: null, toDay: null, overdue: false };
  }
}

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Termín česky: „Dnes 14:30“, „Zítra“, „Pá 9:00“, „12. 10.“ (u celodenní bez času). */
export function formatDue(
  dueAt: DateInput | null | undefined,
  allDay: boolean,
  now: Date = new Date(),
): string {
  if (dueAt === null || dueAt === undefined) return "Bez termínu";
  const due = toDate(dueAt);
  if (Number.isNaN(due.getTime())) return "Bez termínu";
  const { date, time } = localParts(due);
  const diff = diffDaysIso(dayOf(now), date);
  const [y, m, d] = date.split("-").map(Number);
  let day: string;
  if (diff === 0) day = "Dnes";
  else if (diff === 1) day = "Zítra";
  else if (diff === -1) day = "Včera";
  else if (diff > 1 && diff < 7) day = WEEKDAYS[isoWeekday(date) - 1]!;
  else day = `${d}. ${m}.${y !== Number(dayOf(now).slice(0, 4)) ? ` ${y}` : ""}`;
  if (allDay) return day;
  const [hh, mm] = time.split(":");
  return `${day} ${Number(hh)}:${mm}`;
}

/** Datum a čas z formuláře (pražský čas) → okamžik jako ISO text; celodenní má půlnoc. */
export function dueFromInput(date: string, time: string | null, allDay: boolean): string {
  return zonedToUtc(date, allDay ? "00:00" : time || "09:00").toISOString();
}

/** Okamžik → datum a čas pro pole formuláře (pražský čas). */
export function dueToInput(
  iso: DateInput | null | undefined,
  allDay: boolean,
): { date: string; time: string } {
  if (iso === null || iso === undefined) return { date: "", time: "" };
  const p = localParts(toDate(iso));
  return { date: p.date, time: allDay ? "" : p.time };
}

/** Z minut „90“ → „1 h 30 min“. */
export function formatDuration(min: number | null | undefined): string {
  if (!min || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${pad(m)} min` : `${h} h`;
}

/** Která položky časové osy patří do filtru (komentáře jsou součást „Poznámky“). */
export function timelineMatches(entry: Pick<TimelineEntry, "kind">, filter: TimelineFilter) {
  if (filter === "all") return true;
  if (filter === "note") return entry.kind === "note" || entry.kind === "comment";
  return entry.kind === filter;
}

/** Položky časové osy, které patří do zvoleného filtru. */
export function filterTimeline(entries: readonly TimelineEntry[], filter: TimelineFilter) {
  return entries.filter((e) => timelineMatches(e, filter));
}
