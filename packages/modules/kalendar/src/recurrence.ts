import { addDaysIso, addMonthsIso, isoWeekday, localParts, zonedToUtc } from "@rebar/core/time";

/**
 * Opakování událostí. Rozbaluje se v místním čase (Europe/Prague) po dnech, takže událost v 8:00 zůstane v 8:00
 * i po přechodu na letní čas. Bez databáze, aby šla ověřit testy.
 */

export const RECURRENCES = [
  { value: "daily", label: "Každý den" },
  { value: "weekdays", label: "Každý pracovní den" },
  { value: "weekly", label: "Každý týden" },
  { value: "monthly", label: "Každý měsíc" },
] as const;
export type Recurrence = (typeof RECURRENCES)[number]["value"];
export const RECURRENCE_VALUES = RECURRENCES.map((r) => r.value) as [Recurrence, ...Recurrence[]];

export const REMINDER_MINUTES = [15, 60, 1440] as const;

export type EventTimes = {
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  recurrence: string | null;
  recurrenceUntil: string | null;
};

export type Occurrence = {
  start: Date;
  end: Date;
  /** Místní datum začátku a (u celodenní) posledního dne včetně. */
  date: string;
  endDate: string;
};

/** Nejvyšší počet výskytů, který se rozbalí najednou (ochrana před nekonečnou smyčkou). */
export const MAX_OCCURRENCES = 1000;

/** Datum následujícího výskytu podle pravidla, počítáno od prvního dne (`i` je pořadí výskytu). */
function nth(rule: string, first: string, i: number): string {
  switch (rule) {
    case "weekly":
      return addDaysIso(first, 7 * i);
    case "monthly":
      return addMonthsIso(first, i);
    default:
      return addDaysIso(first, i);
  }
}

/**
 * Výskyty události, které zasahují do okna `[from, to]` (místní data včetně). Neopakovaná událost má nejvýš jeden výskyt.
 * Celodenní událost trvá od místní půlnoci po místní půlnoc dne po posledním dni.
 */
export function expandEvent(ev: EventTimes, from: string, to: string): Occurrence[] {
  const start = localParts(ev.startsAt);
  const durationMs = ev.endsAt.getTime() - ev.startsAt.getTime();
  const spanDays = ev.allDay
    ? Math.max(
        1,
        Math.round(
          (zonedToUtc(localParts(ev.endsAt).date, "00:00").getTime() -
            zonedToUtc(start.date, "00:00").getTime()) /
            86_400_000,
        ),
      )
    : 0;
  const make = (date: string): Occurrence => {
    if (ev.allDay) {
      const lastDay = addDaysIso(date, spanDays - 1);
      return {
        start: zonedToUtc(date, "00:00"),
        end: zonedToUtc(addDaysIso(date, spanDays), "00:00"),
        date,
        endDate: lastDay,
      };
    }
    const s = zonedToUtc(date, start.time);
    const e = new Date(s.getTime() + durationMs);
    return { start: s, end: e, date, endDate: localParts(new Date(e.getTime() - 1)).date };
  };
  const overlaps = (o: Occurrence) => o.endDate >= from && o.date <= to;

  if (!ev.recurrence) {
    const o = make(start.date);
    return overlaps(o) ? [o] : [];
  }

  const out: Occurrence[] = [];
  const until = ev.recurrenceUntil;
  // přeskočit rovnou do blízkosti okna, ať se nemusí procházet celá historie
  const gap = Math.max(
    0,
    Math.round(
      (zonedToUtc(from, "00:00").getTime() - zonedToUtc(start.date, "00:00").getTime()) /
        86_400_000,
    ),
  );
  let i = 0;
  if (ev.recurrence === "daily") i = Math.max(0, gap - spanDays - 1);
  else if (ev.recurrence === "weekly")
    i = Math.max(0, Math.floor(gap / 7) - 1 - Math.ceil(spanDays / 7));
  else if (ev.recurrence === "monthly")
    i = Math.max(0, Math.floor(gap / 31) - 1 - Math.ceil(spanDays / 28));
  else if (ev.recurrence === "weekdays") i = Math.max(0, gap - spanDays - 1);

  for (let n = 0; n < MAX_OCCURRENCES * 2 && out.length < MAX_OCCURRENCES; n++, i++) {
    const date = nth(ev.recurrence, start.date, i);
    if (date > to) break;
    if (until && date > until) break;
    if (ev.recurrence === "weekdays" && isoWeekday(date) > 5) continue;
    const o = make(date);
    if (overlaps(o)) out.push(o);
  }
  return out;
}

/** Zda se dvě časová období (polootevřená) překrývají. */
export const overlap = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) =>
  a.start < b.end && b.start < a.end;
