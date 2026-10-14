import { workingDays } from "@rebar/core/time";
import { capRangeToToday, pct1, type DateRange } from "@rebar/core/dashboards";

/**
 * Fond pracovní doby v minutách za období: pracovní dny (bez státních svátků) × hodin denně × úvazek. Období se
 * zkracuje na dnešek, aby rozpracovaný měsíc neukazoval nízké využití jen proto, že zbývající dny teprve přijdou.
 */
export function periodFundMinutes(
  range: DateRange,
  today: string,
  hoursPerDay: number,
  workDays: readonly number[],
  workload = 1,
): number {
  const capped = capRangeToToday(range, today);
  if (!capped) return 0;
  return Math.round(
    workingDays(capped.from, capped.to, workDays).length * hoursPerDay * 60 * workload,
  );
}

/** Využití v procentech: odpracované minuty děleno fondem; bez fondu (svátky, budoucnost) `null`. */
export const utilizationPct = (workedMinutes: number, fundMinutes: number): number | null =>
  pct1(workedMinutes, fundMinutes);
