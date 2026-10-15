/*
  Přehledy hodin (HOD-02): moje hodiny za týden a měsíc, hodiny podle zakázky a osoby. Čistá logika.
*/
import { addDaysIso, addMonthsIso, monthRange, weekStartIso } from "@rebar/core/time";

/** Druh období přehledu. */
export type PeriodKind = "week" | "month";

/** Hranice období (včetně obou konců). */
export type Period = { kind: PeriodKind; from: string; to: string };

/** Období, do kterého spadá `anchor` (týden od pondělí, nebo kalendářní měsíc). */
export function periodOf(kind: PeriodKind, anchor: string): Period {
  if (kind === "week") {
    const from = weekStartIso(anchor);
    return { kind, from, to: addDaysIso(from, 6) };
  }
  return { kind, ...monthRange(anchor.slice(0, 7)) };
}

/** Posune období o `delta` týdnů nebo měsíců a vrátí den, který do něj spadá (první den období). */
export function shiftAnchor(kind: PeriodKind, anchor: string, delta: number): string {
  if (kind === "week") return addDaysIso(weekStartIso(anchor), 7 * delta);
  return addMonthsIso(`${anchor.slice(0, 7)}-01`, delta);
}

/** Řádek přehledu: skupina (zakázka nebo osoba) s rozpadem podle druhé osy. */
export type GroupRow = {
  id: string;
  minutes: number;
  /** Rozpad: u přehledu podle zakázky podle osob, u přehledu podle osoby podle zakázek. */
  parts: { id: string; minutes: number }[];
};

/** Podle čeho se hodiny seskupují. */
export type GroupBy = "job" | "person";

/** Minuty jednoho člověka na jedné zakázce v jednom dni (vstup seskupení). */
export type HourFact = { userId: string; jobId: string; date: string; minutes: number };

/**
 * Seskupí hodiny podle zakázky nebo osoby; skupiny i jejich části od největší (při shodě podle id), takže výsledek
 * nezávisí na pořadí vstupu.
 */
export function groupHours(facts: readonly HourFact[], by: GroupBy): GroupRow[] {
  const groups = new Map<string, { minutes: number; parts: Map<string, number> }>();
  for (const f of facts) {
    const key = by === "job" ? f.jobId : f.userId;
    const sub = by === "job" ? f.userId : f.jobId;
    const g = groups.get(key) ?? { minutes: 0, parts: new Map<string, number>() };
    g.minutes += f.minutes;
    g.parts.set(sub, (g.parts.get(sub) ?? 0) + f.minutes);
    groups.set(key, g);
  }
  const bySize = <T extends { id: string; minutes: number }>(a: T, b: T) =>
    b.minutes - a.minutes || a.id.localeCompare(b.id);
  return [...groups.entries()]
    .map(([id, g]) => ({
      id,
      minutes: g.minutes,
      parts: [...g.parts.entries()].map(([pid, minutes]) => ({ id: pid, minutes })).sort(bySize),
    }))
    .sort(bySize);
}

/** Součty po dnech období (každý den období je v odpovědi, i bez hodin). */
export function dayTotals(period: Period, facts: readonly HourFact[]): { date: string; minutes: number }[] {
  const by = new Map<string, number>();
  for (const f of facts) by.set(f.date, (by.get(f.date) ?? 0) + f.minutes);
  const out: { date: string; minutes: number }[] = [];
  for (let d = period.from; d <= period.to; d = addDaysIso(d, 1))
    out.push({ date: d, minutes: by.get(d) ?? 0 });
  return out;
}
