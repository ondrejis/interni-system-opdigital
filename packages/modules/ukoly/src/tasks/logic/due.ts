/*
  Čistá logika termínů úkolů (klientsky bezpečná: žádný server, aktuální čas dostává jako parametr). Vše se počítá
  v pražském čase. Termín úkolu je datum (`dueDate`) a volitelný čas (`dueTime`, „HH:mm“); úkol bez času je „celodenní“.
*/
import {
  addDaysIso,
  addWorkdays,
  diffDaysIso,
  isoWeekday,
  localParts,
  todayIso,
  weekStartIso,
} from "@rebar/core/time";
import { CLOSED_STATUSES, type TaskStatus } from "../constants";

/** Stav termínu úkolu vůči „teď“. */
export type DueState = "done" | "overdue" | "today" | "future" | "nodate";

/** Pořadí řazení stavů v seznamu (nejdřív co hoří). */
export const DUE_STATE_ORDER: Record<DueState, number> = {
  overdue: 0,
  today: 1,
  future: 2,
  nodate: 3,
  done: 4,
};

/** Čas z databáze („10:00:00“) nebo formuláře → „HH:mm“; prázdné a neplatné je `null`. */
export function normalizeTime(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/**
 * Stav termínu: hotový/zrušený úkol je `done`, bez data `nodate`, den v minulosti `overdue`, dnes `today`
 * (úkol s časem je po termínu, jakmile čas uplyne), jinak `future`.
 */
export function dueState(
  t: {
    status: TaskStatus | string;
    dueDate: string | null | undefined;
    dueTime?: string | null | undefined;
  },
  now: Date = new Date(),
): DueState {
  if ((CLOSED_STATUSES as readonly string[]).includes(t.status)) return "done";
  if (!t.dueDate) return "nodate";
  const { date, time } = localParts(now);
  const diff = diffDaysIso(date, t.dueDate);
  if (diff < 0) return "overdue";
  if (diff > 0) return "future";
  const due = normalizeTime(t.dueTime);
  if (due && due < time) return "overdue";
  return "today";
}

/** Je úkol (otevřený) po termínu? */
export const isOverdue = (t: Parameters<typeof dueState>[0], now: Date = new Date()): boolean =>
  dueState(t, now) === "overdue";

/**
 * Návrh termínu další aktivity po dokončení: nejbližší pracovní den po pozdějším z dneška a termínu dokončené
 * aktivity, ve stejnou hodinu (bez času zůstane bez času).
 */
export function suggestNextDue(
  prev: { dueDate: string | null | undefined; dueTime?: string | null | undefined },
  now: Date = new Date(),
): { dueDate: string; dueTime: string | null } {
  const today = todayIso("Europe/Prague", now);
  const prevDay = prev.dueDate ?? today;
  const base = prevDay > today ? prevDay : today;
  return { dueDate: addWorkdays(base, 1), dueTime: normalizeTime(prev.dueTime) };
}

/** Nový termín po odložení o `days` dní od dneška (čas zůstává). */
export function snoozeTarget(
  cur: { dueTime?: string | null | undefined },
  days: number,
  now: Date = new Date(),
): { dueDate: string; dueTime: string | null } {
  return {
    dueDate: addDaysIso(todayIso("Europe/Prague", now), days),
    dueTime: normalizeTime(cur.dueTime),
  };
}

/** Za kolik dní od dneška je nejbližší pondělí po dnešku (pro „Příští týden“ v odložení). */
export function daysToNextMonday(now: Date = new Date()): number {
  const today = todayIso("Europe/Prague", now);
  return diffDaysIso(today, addDaysIso(weekStartIso(today), 7));
}

/** Konec úkolu s časem: začátek + délka (výchozí 30 minut); bez času nic. Vrací `{ date, time }` pražského času. */
export function taskEnd(t: {
  dueDate: string;
  dueTime: string | null;
  durationMin: number | null;
}): { date: string; time: string } | null {
  const time = normalizeTime(t.dueTime);
  if (!time) return null;
  const [h, m] = time.split(":").map(Number) as [number, number];
  const total = h * 60 + m + (t.durationMin && t.durationMin > 0 ? t.durationMin : 30);
  const days = Math.floor(total / 1440);
  const rest = total % 1440;
  return {
    date: addDaysIso(t.dueDate, days),
    time: `${String(Math.floor(rest / 60)).padStart(2, "0")}:${String(rest % 60).padStart(2, "0")}`,
  };
}

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

/** Termín česky: „Dnes 14:30“, „Zítra“, „Pá 9:00“, „12. 10.“ (bez času jen den). */
export function formatDue(
  dueDate: string | null | undefined,
  dueTime: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!dueDate) return "Bez termínu";
  const today = todayIso("Europe/Prague", now);
  const diff = diffDaysIso(today, dueDate);
  const [y, m, d] = dueDate.split("-").map(Number) as [number, number, number];
  let day: string;
  if (diff === 0) day = "Dnes";
  else if (diff === 1) day = "Zítra";
  else if (diff === -1) day = "Včera";
  else if (diff > 1 && diff < 7) day = WEEKDAYS[isoWeekday(dueDate) - 1]!;
  else day = `${d}. ${m}.${y !== Number(today.slice(0, 4)) ? ` ${y}` : ""}`;
  const time = normalizeTime(dueTime);
  return time ? `${day} ${Number(time.slice(0, 2))}:${time.slice(3)}` : day;
}

/** Z minut „90“ → „1 h 30 min“. */
export function formatDuration(min: number | null | undefined): string {
  if (!min || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")} min` : `${h} h`;
}
