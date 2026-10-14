/*
  Pomocné funkce pro měsíce (`YYYY-MM`) a data (`YYYY-MM-DD`). Čistě řetězcová a celočíselná aritmetika, bez `Date`
  (kromě výpočtu počtu dní v měsíci a přičtení dnů v UTC), takže nezávisí na časovém pásmu.
*/
import { FinanceLogicError } from "./types";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Je řetězec platný měsíc `YYYY-MM`? */
export function isMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH_RE.test(value);
}

/** Je řetězec platné datum `YYYY-MM-DD` (včetně kontroly počtu dní v měsíci)? */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  return Number(m[3]) <= daysInMonth(`${m[1]}-${m[2]}`);
}

/** Vyhodí chybu, pokud řetězec není měsíc `YYYY-MM`; jinak ho vrátí. */
export function assertMonth(value: unknown, what = "Měsíc"): string {
  if (!isMonth(value)) {
    throw new FinanceLogicError("invalid_month", `${what} musí být ve tvaru RRRR-MM.`);
  }
  return value;
}

/** Vyhodí chybu, pokud řetězec není datum `YYYY-MM-DD`; jinak ho vrátí. */
export function assertDate(value: unknown, what = "Datum"): string {
  if (!isIsoDate(value)) {
    throw new FinanceLogicError("invalid_date", `${what} musí být ve tvaru RRRR-MM-DD.`);
  }
  return value;
}

/** Měsíc z data (`2026-12-15` → `2026-12`). */
export function monthOf(date: string): string {
  assertDate(date);
  return date.slice(0, 7);
}

/** Počet dní v měsíci. */
export function daysInMonth(month: string): number {
  assertMonth(month);
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

/** Přičte (nebo odečte) počet měsíců k měsíci `YYYY-MM`. */
export function addMonths(month: string, delta: number): string {
  assertMonth(month);
  const index = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + delta;
  const year = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

/** Počet měsíců od `a` do `b` (kladné, je-li `b` později). */
export function monthsBetween(a: string, b: string): number {
  assertMonth(a);
  assertMonth(b);
  return (
    (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 +
    (Number(b.slice(5, 7)) - Number(a.slice(5, 7)))
  );
}

/** Přičte počet dní k datu `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  assertDate(date);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Datum v měsíci s daným dnem (den se případně ořízne na délku měsíce). */
export function dateInMonth(month: string, day: number): string {
  assertMonth(month);
  const d = Math.min(Math.max(1, Math.trunc(day)), daysInMonth(month));
  return `${month}-${String(d).padStart(2, "0")}`;
}

/** Je měsíc `month` v rozsahu `from`–`to` včetně (prázdná mez = bez omezení)? */
export function monthInRange(
  month: string,
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  // Řetězce `YYYY-MM` se řadí lexikograficky stejně jako chronologicky.
  if (from && month < from) return false;
  if (to && month > to) return false;
  return true;
}

/** Rozdíl dvou kalendářních dnů v celých dnech (`b − a`). */
export function daysBetween(a: string, b: string): number {
  assertDate(a);
  assertDate(b);
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
