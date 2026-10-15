/*
  Týdenní výkaz (HOD-01): mřížka zakázka × den a pravidla zápisu buňky. Čistá logika bez databáze.
*/
import { MAX_DAY_MINUTES } from "./parse-time";

/** Záznam hodin tak, jak ho mřížka potřebuje. */
export type GridEntry = {
  id: string;
  jobId: string;
  taskId: string | null;
  date: string;
  minutes: number;
  note: string | null;
};

/** Jedna buňka mřížky (zakázka × den). */
export type GridCell = {
  /** Minuty záznamů bez úkolu: tohle buňka upravuje. */
  gridMinutes: number;
  /** Minuty záznamů navázaných na úkoly (v součtu, v buňce se jen ukážou). */
  taskMinutes: number;
  /** Počet záznamů bez úkolu v buňce (víc než jeden se při úpravě buňky sloučí). */
  gridEntries: number;
};

/** Řádek mřížky: jedna zakázka. */
export type GridRow = {
  jobId: string;
  cells: Record<string, GridCell>;
  totalMinutes: number;
};

/** Mřížka týdne: řádky podle zakázek, součty po dnech a celkem. */
export type WeekGrid = {
  rows: GridRow[];
  dayTotals: Record<string, number>;
  totalMinutes: number;
};

/**
 * Složí mřížku z záznamů týdne. Řádky jsou v pořadí prvního výskytu zakázky (řazení podle názvu dělá volající, který
 * názvy zná); dny `days` jsou všechny dny týdne (prázdné buňky nechybí). Záznam mimo `days` se ignoruje.
 */
export function buildWeekGrid(days: readonly string[], entries: readonly GridEntry[]): WeekGrid {
  const inWeek = new Set(days);
  const rows = new Map<string, GridRow>();
  const dayTotals: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
  let totalMinutes = 0;
  for (const e of entries) {
    if (!inWeek.has(e.date)) continue;
    let row = rows.get(e.jobId);
    if (!row) {
      row = {
        jobId: e.jobId,
        cells: Object.fromEntries(
          days.map((d) => [d, { gridMinutes: 0, taskMinutes: 0, gridEntries: 0 }]),
        ),
        totalMinutes: 0,
      };
      rows.set(e.jobId, row);
    }
    const cell = row.cells[e.date]!;
    if (e.taskId) cell.taskMinutes += e.minutes;
    else {
      cell.gridMinutes += e.minutes;
      cell.gridEntries += 1;
    }
    row.totalMinutes += e.minutes;
    dayTotals[e.date] = (dayTotals[e.date] ?? 0) + e.minutes;
    totalMinutes += e.minutes;
  }
  return { rows: [...rows.values()], dayTotals, totalMinutes };
}

/** Záznam bez úkolu v buňce, který se při úpravě buňky může sloučit. */
export type CellEntry = { id: string; minutes: number; note: string | null; createdAt: string };

/** Co s buňkou udělat po zadání nového času. */
export type CellPlan =
  | { kind: "noop" }
  | { kind: "insert"; minutes: number }
  | { kind: "update"; id: string; minutes: number; note: string | null; deleteIds: string[] }
  | { kind: "delete"; deleteIds: string[] };

/** Nejdelší poznámka záznamu (shoduje se se vstupem příkazů). */
export const MAX_NOTE_LENGTH = 500;

/**
 * Plán zápisu buňky týdenní mřížky („nastav čas bez úkolu na X“): žádný záznam a 0 = nic; žádný záznam a X = nový;
 * 0 = smazat všechny záznamy buňky; jinak se nejstarší záznam přepíše na X a ostatní se do něj sloučí (poznámky se
 * spojí, aby se text neztratil) a smažou.
 */
export function planCellSave(existing: readonly CellEntry[], minutes: number): CellPlan {
  const sorted = [...existing].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  if (!sorted.length) return minutes > 0 ? { kind: "insert", minutes } : { kind: "noop" };
  if (minutes <= 0) return { kind: "delete", deleteIds: sorted.map((e) => e.id) };
  const [first, ...rest] = sorted;
  const notes = [...new Set(sorted.map((e) => e.note?.trim()).filter((n): n is string => !!n))];
  const note = notes.length ? notes.join("; ").slice(0, MAX_NOTE_LENGTH) : null;
  if (!rest.length && first!.minutes === minutes) return { kind: "noop" };
  return { kind: "update", id: first!.id, minutes, note, deleteIds: rest.map((e) => e.id) };
}

/**
 * Ověří denní strop: součet všech záznamů člověka za den nesmí přesáhnout 24 hodin. Vrací českou chybu, nebo `null`.
 * `otherMinutes` jsou minuty dne bez záznamů, které se právě mění.
 */
export function dayLimitError(otherMinutes: number, minutes: number): string | null {
  if (otherMinutes + minutes <= MAX_DAY_MINUTES) return null;
  const free = Math.max(0, MAX_DAY_MINUTES - otherMinutes);
  const h = Math.floor(free / 60);
  const m = String(free % 60).padStart(2, "0");
  return `Za jeden den nejde zapsat víc než 24 hodin (zbývá ${h}:${m}).`;
}
