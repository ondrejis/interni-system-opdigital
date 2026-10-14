import { addDaysIso, localParts, timeToMinutes, zonedToUtc } from "../time/dates";
import type { QuietHours } from "./config";

/*
  Časy v místní zóně klienta (Europe/Prague). Přechod letního času řeší `zonedToUtc`: neexistující hodinu (jarní skok)
  posune dopředu, nejednoznačnou (podzimní) bere jako první výskyt. Tiché hodiny tedy vždy skončí v místní čas
  a nikdy neskončí „v minulosti“.
*/

/** Je okamžik v tichých hodinách? Okno může přecházet přes půlnoc (20:00–06:00). */
export function inQuietHours(at: Date, quiet: QuietHours, tz: string): boolean {
  if (!quiet.enabled || quiet.start === quiet.end) return false;
  const m = timeToMinutes(localParts(at, tz).time);
  const s = timeToMinutes(quiet.start);
  const e = timeToMinutes(quiet.end);
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** Kdy tiché hodiny, ve kterých okamžik je, skončí. Mimo ně vrací `at`. */
export function quietEnd(at: Date, quiet: QuietHours, tz: string): Date {
  if (!inQuietHours(at, quiet, tz)) return at;
  const { date, time } = localParts(at, tz);
  const m = timeToMinutes(time);
  const s = timeToMinutes(quiet.start);
  const e = timeToMinutes(quiet.end);
  const endsTomorrow = s >= e && m >= s;
  const end = zonedToUtc(endsTomorrow ? addDaysIso(date, 1) : date, quiet.end, tz);
  return end.getTime() > at.getTime() ? end : new Date(at.getTime() + 60_000);
}

/** Nejbližší z denních časů (`HH:MM`) striktně po okamžiku. */
export function nextDailyTime(at: Date, times: readonly string[], tz: string): Date {
  const { date } = localParts(at, tz);
  let best: Date | null = null;
  for (const day of [date, addDaysIso(date, 1), addDaysIso(date, 2)]) {
    for (const t of times) {
      const candidate = zonedToUtc(day, t, tz);
      if (candidate.getTime() > at.getTime() && (!best || candidate < best)) best = candidate;
    }
    if (best) break;
  }
  return best ?? new Date(at.getTime() + 24 * 3_600_000);
}
