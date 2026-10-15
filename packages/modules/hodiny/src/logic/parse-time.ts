/*
  Zápis času člověkem (HOD-01): `1,5` (hodiny desetinně), `1:30` (h:mm), `90m`, `1h30`, `2 h`, `45 min`…
  Čistá logika bez závislostí; používá ji server (autorita) i prohlížeč (okamžitý náhled).
*/

/** Nejvíc minut jednoho záznamu i jednoho dne jednoho člověka (24 hodin). */
export const MAX_DAY_MINUTES = 24 * 60;

/** Výsledek rozboru zadaného času: minuty, nebo česká chyba. */
export type ParsedDuration = { ok: true; minutes: number } | { ok: false; error: string };

const HINT = "Zadejte čas ve tvaru 1,5 (hodiny), 1:30 nebo 90m (minuty).";
const TOO_BIG = `Nejvýš 24 hodin za záznam. Minuty zapište s písmenem m, například 90m.`;

const fail = (error: string): ParsedDuration => ({ ok: false, error });
const done = (minutes: number): ParsedDuration =>
  minutes > MAX_DAY_MINUTES ? fail(TOO_BIG) : { ok: true, minutes };

const num = (s: string) => Number(s.replace(",", "."));

/** Jednotky: hodiny (`h`, `hod`, `hodin`, `hodiny`, `hodina`) a minuty (`m`, `min`, `minut`, `minuty`, `minuta`). */
const H = "(?:h|hod|hodin|hodiny|hodina)";
const M = "(?:m|min|minut|minuty|minuta)";
const NUM = "\\d+(?:[.,]\\d+)?";

const COLON = /^(\d{1,2}):(\d{2})$/;
const PLAIN = new RegExp(`^(${NUM})$`);
const UNITS = new RegExp(`^(?:(${NUM})\\s*${H}\\.?)?\\s*(?:(${NUM})\\s*${M}\\.?)?$`);
const HOURS_MINUTES = new RegExp(`^(\\d+)\\s*${H}\\.?\\s*(\\d{1,2})$`);

/**
 * Rozebere zadaný čas na minuty. Prázdný text je chyba (u buňky mřížky ho řeší `parseCellDuration`).
 *
 * - `1,5`, `1.5`, `2` = hodiny (číslo bez jednotky jsou vždy hodiny),
 * - `1:30`, `0:45` = hodiny a minuty,
 * - `90m`, `45 min` = minuty, `2h`, `1,5 hod` = hodiny, `1h30`, `1 h 30 min` = hodiny a minuty.
 *
 * Desetinné hodiny se zaokrouhlí na celé minuty. Nula je platná (minuty 0); nejvýš 24 hodin.
 */
export function parseDuration(input: string): ParsedDuration {
  const text = input.replace(/\u00a0/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return fail(HINT);
  if (text.startsWith("-") || text.startsWith("−")) return fail("Čas nesmí být záporný.");

  const colon = COLON.exec(text);
  if (colon) {
    const minutes = Number(colon[2]);
    if (minutes > 59) return fail("Minuty musí být 0 až 59, například 1:30.");
    return done(Number(colon[1]) * 60 + minutes);
  }

  const plain = PLAIN.exec(text);
  if (plain) return done(Math.round(num(plain[1]!) * 60));

  const hm = HOURS_MINUTES.exec(text);
  if (hm) {
    const minutes = Number(hm[2]);
    if (minutes > 59) return fail("Minuty musí být 0 až 59, například 1h30.");
    return done(Number(hm[1]) * 60 + minutes);
  }

  const units = UNITS.exec(text);
  if (units && (units[1] !== undefined || units[2] !== undefined)) {
    const hours = units[1] !== undefined ? num(units[1]) : 0;
    const minutes = units[2] !== undefined ? num(units[2]) : 0;
    return done(Math.round(hours * 60 + minutes));
  }
  return fail(HINT);
}

/**
 * Čas z buňky týdenní mřížky: prázdný text nebo nula znamená „bez času“ (buňka se vymaže), jinak jako `parseDuration`.
 */
export function parseCellDuration(input: string): ParsedDuration {
  const text = input.trim();
  if (!text) return { ok: true, minutes: 0 };
  return parseDuration(text);
}

/** Způsob zobrazení času: `hm` = `1:30`, `decimal` = `1,5` (hodiny na dvě desetinná místa bez zbytečných nul). */
export type DurationFormat = "hm" | "decimal";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Čas v minutách jako text: `90` → `1:30` (nebo `1,5`); nula a záporné hodnoty jako `0:00`. */
export function formatDuration(minutes: number, format: DurationFormat = "hm"): string {
  const m = Math.max(0, Math.round(minutes));
  if (format === "decimal") {
    const hours = Math.round((m / 60) * 100) / 100;
    return String(hours).replace(".", ",");
  }
  return `${Math.floor(m / 60)}:${pad2(m % 60)}`;
}
