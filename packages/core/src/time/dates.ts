// Práce s kalendářními daty bez časových pásem: datum je řetězec `YYYY-MM-DD`, počítá se v UTC,
// takže přechod letního času nikdy neposune den. „Dnes“ se bere v české časové zóně.

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
};

/** Dnešní datum v dané zóně (výchozí Europe/Prague). */
export function todayIso(tz = "Europe/Prague", now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(now);
}

export function addDaysIso(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/** Posune datum o měsíce; den se při krátším měsíci zkrátí na jeho poslední (31. 1. + 1 měsíc = 28. 2.). */
export function addMonthsIso(date: string, months: number): string {
  const d = parse(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return iso(d);
}

/** Počet dní od `a` do `b` (b − a). */
export function diffDaysIso(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

/** Den v týdnu podle ISO: pondělí = 1 … neděle = 7. */
export function isoWeekday(date: string): number {
  return parse(date).getUTCDay() || 7;
}

export function weekStartIso(date: string): string {
  return addDaysIso(date, 1 - isoWeekday(date));
}

export function eachDayIso(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

/** První a poslední den měsíce `YYYY-MM`. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${pad(last)}` };
}

export const monthOf = (date: string) => date.slice(0, 7);

function easterSunday(year: number): Date {
  // Anonymní gregoriánský algoritmus (Meeus/Jones/Butcher)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const FIXED: [number, number, string][] = [
  [1, 1, "Den obnovy samostatného českého státu"],
  [5, 1, "Svátek práce"],
  [5, 8, "Den vítězství"],
  [7, 5, "Cyril a Metoděj"],
  [7, 6, "Jan Hus"],
  [9, 28, "Den české státnosti"],
  [10, 28, "Vznik samostatného československého státu"],
  [11, 17, "Den boje za svobodu a demokracii"],
  [12, 24, "Štědrý den"],
  [12, 25, "1. svátek vánoční"],
  [12, 26, "2. svátek vánoční"],
];

const holidayCache = new Map<number, Map<string, string>>();

/** Státní svátky ČR v daném roce: `YYYY-MM-DD` → název. */
export function czechHolidays(year: number): ReadonlyMap<string, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const map = new Map<string, string>();
  for (const [m, d, name] of FIXED) map.set(`${year}-${pad(m)}-${pad(d)}`, name);
  const easter = iso(easterSunday(year));
  map.set(addDaysIso(easter, -2), "Velký pátek");
  map.set(addDaysIso(easter, 1), "Velikonoční pondělí");
  holidayCache.set(year, map);
  return map;
}

export const holidayName = (date: string) => czechHolidays(Number(date.slice(0, 4))).get(date);

export const DEFAULT_WORK_DAYS: readonly number[] = [1, 2, 3, 4, 5];

/** Pracovní den = den v pracovním týdnu, který není státní svátek. */
export function isWorkday(date: string, workDays: readonly number[] = DEFAULT_WORK_DAYS): boolean {
  return workDays.includes(isoWeekday(date)) && !holidayName(date);
}

/** Pracovní dny v rozsahu včetně obou konců. */
export function workingDays(
  from: string,
  to: string,
  workDays: readonly number[] = DEFAULT_WORK_DAYS,
): string[] {
  return eachDayIso(from, to).filter((d) => isWorkday(d, workDays));
}

/** Datum po `n` pracovních dnech (n může být záporné); `n = 0` vrátí nejbližší pracovní den od data výše. */
export function addWorkdays(
  date: string,
  n: number,
  workDays: readonly number[] = DEFAULT_WORK_DAYS,
): string {
  let d = date;
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  if (n === 0) {
    while (!isWorkday(d, workDays)) d = addDaysIso(d, 1);
    return d;
  }
  while (left > 0) {
    d = addDaysIso(d, step);
    if (isWorkday(d, workDays)) left--;
  }
  return d;
}

/** Fond pracovní doby za měsíc v minutách (pracovní dny × hodin denně × úvazek). */
export function monthFundMinutes(
  month: string,
  hoursPerDay: number,
  workDays: readonly number[] = DEFAULT_WORK_DAYS,
  workload = 1,
): number {
  const { from, to } = monthRange(month);
  return Math.round(workingDays(from, to, workDays).length * hoursPerDay * 60 * workload);
}

/** 450 → „7:30“. */
export function formatMinutes(min: number, withUnit = true): string {
  const sign = min < 0 ? "−" : "";
  const m = Math.abs(Math.round(min));
  return `${sign}${Math.floor(m / 60)}:${pad(m % 60)}${withUnit ? " h" : ""}`;
}

/** „07:30“ → 450. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Rozloží okamžik na místní datum a čas v dané zóně (výchozí Europe/Prague): `{ date: "2026-10-08", time: "07:30" }`. */
export function localParts(at: Date, tz = "Europe/Prague"): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/**
 * Okamžik jako krátký český text v dané zóně (výchozí Europe/Prague): „8. 10. 14:30“, s `year` „8. 10. 2026 14:30“, s
 * `time: false` jen datum. Text se skládá z čísel, takže je stejný na serveru i v prohlížeči bez ohledu na časové pásmo
 * stroje i verzi ICU (jinak by se vykreslení liší a React hlásí chybu hydratace #418). Neplatná nebo prázdná hodnota
 * je pomlčka.
 */
export function formatInstant(
  value: string | number | Date | null | undefined,
  opts: { year?: boolean; time?: boolean; tz?: string } = {},
): string {
  if (value === null || value === undefined || value === "") return "—";
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return "—";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: opts.tz ?? "Europe/Prague",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((x) => [x.type, Number(x.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute", number>;
  const date = `${p.day}. ${p.month}.${opts.year ? ` ${p.year}` : ""}`;
  return opts.time === false ? date : `${date} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** Okamžik jako čas „14:30“ v dané zóně (výchozí Europe/Prague), stejný na serveru i v prohlížeči. */
export function formatClock(
  value: string | number | Date | null | undefined,
  tz = "Europe/Prague",
): string {
  const t = formatInstant(value, { tz });
  return t === "—" ? t : t.slice(t.lastIndexOf(" ") + 1);
}

/**
 * Místní datum a čas v zóně → okamžik (UTC). Správně zvládá letní čas; neexistující hodinu (jarní skok) posune dopředu
 * a nejednoznačnou (podzimní) bere jako první výskyt.
 */
export function zonedToUtc(date: string, time: string, tz = "Europe/Prague"): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y!, m! - 1, d!, hh, mm);
  // odhad s posunem zóny v daném okamžiku, pak oprava (posun se u přechodu může lišit)
  let guess = naive;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess), tz);
    const [py, pm, pd] = p.date.split("-").map(Number);
    const [ph, pmin] = p.time.split(":").map(Number);
    const shown = Date.UTC(py!, pm! - 1, pd!, ph, pmin);
    const diff = naive - shown;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}
