import { workingDays } from "@rebar/core/time";
import { capRangeToToday, pct1, type DateRange } from "@rebar/core/dashboards";

/** Pracovní doba stroje za den v hodinách (modul Stroje nezná nastavení Docházky, proto pevně osm hodin). */
export const HOURS_PER_DAY = 8;

/**
 * Dostupné pracovní hodiny v období: pracovní dny (pondělí až pátek bez státních svátků) × hodin denně. Období se
 * zkracuje na dnešek, aby rozpracovaný měsíc neukazoval nízké využití jen proto, že zbývající dny teprve přijdou.
 */
export function availableHours(
  range: DateRange,
  today: string,
  hoursPerDay = HOURS_PER_DAY,
): number {
  const capped = capRangeToToday(range, today);
  return capped ? workingDays(capped.from, capped.to).length * hoursPerDay : 0;
}

/** Využití v procentech: hodiny nasazení děleno dostupnými hodinami; bez dostupných hodin `null`. */
export const machineUtilizationPct = (usedHours: number, available: number): number | null =>
  pct1(usedHours, available);
