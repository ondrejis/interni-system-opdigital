import { formatMinutes, localParts } from "@rebar/core/time";
import { formatDate } from "@rebar/core/shared";

/*
  Rozhodování plánovaných upozornění docházky. Čisté funkce bez databáze: čas dostávají parametrem (`now`),
  „dnes“ i čas dne se berou v české zóně, takže přechod letního času (29. 3. 2026, 25. 10. 2026) posune
  hodinu na hodinkách, ne den ani délku běžící píchačky (ta se počítá ze skutečně uplynulého času).
*/

/** Zapomenutý odchod se hlásí jen ve dne; v noci by naléhavé upozornění (obchází tiché hodiny) budilo lidi. */
export const FORGOT_WINDOW = { from: "06:00", to: "22:00" } as const;
/** Píchačka z předchozího dne je „zapomenutá“, až když běží aspoň tolik hodin (noční směna 22–06 ne). */
export const CARRIED_MIN_HOURS = 10;
/** Během jednoho dne: tolik hodin v kuse je zjevně moc. */
export const LONG_RUN_HOURS = 12;
/** Po tomto čase hlídáme píchačku, která už běží aspoň `EVENING_MIN_HOURS` (večerní směna od 17:00 není zapomenutá). */
export const EVENING_FROM = "19:00";
export const EVENING_MIN_HOURS = 6;

/** Proč je běžící píchačka považována za zapomenutou. */
export type ForgotStage = "carried" | "long" | "evening";

/**
 * Je běžící píchačka zapomenutá? Vrací důvod, nebo `null`.
 * - `carried`: začala v předchozím dni a běží aspoň 10 h,
 * - `long`: začala dnes a běží aspoň 12 h,
 * - `evening`: začala dnes, je po 19:00 a běží aspoň 6 h.
 * Mimo okno 6:00–22:00 se nehlásí nic.
 */
export function forgottenClockStage(startedAt: Date, now: Date, tz?: string): ForgotStage | null {
  const here = localParts(now, tz);
  if (here.time < FORGOT_WINDOW.from || here.time >= FORGOT_WINDOW.to) return null;
  const hours = (now.getTime() - startedAt.getTime()) / 3_600_000;
  if (hours < 0) return null;
  const start = localParts(startedAt, tz);
  if (start.date < here.date) return hours >= CARRIED_MIN_HOURS ? "carried" : null;
  if (hours >= LONG_RUN_HOURS) return "long";
  if (here.time >= EVENING_FROM && hours >= EVENING_MIN_HOURS) return "evening";
  return null;
}

/** Texty do upozornění: „dnes v 7:02“ / „2. 3. 2026 v 7:02“ a „14:20 h“ (skutečně uplynulý čas). */
export function clockRunText(startedAt: Date, now: Date, tz?: string) {
  const start = localParts(startedAt, tz);
  const today = localParts(now, tz).date;
  const time = start.time.replace(/^0/, "");
  return {
    since: `${start.date === today ? "dnes" : formatDate(start.date)} v ${time}`,
    running: formatMinutes(Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60_000))),
  };
}

/** Zaměstnanec s údaji potřebnými k rozhodnutí, zda má dnes pracovat. */
export type ExpectedPerson = { userId: string; employmentType: string; startDate: string | null };

/**
 * Kdo má v tento den pracovat. V datech není plán směn ani kalendář dovolených (absence jsou jen záznamy docházky
 * s druhem dovolená/nemoc/lékař…, které den zároveň zaplní), proto je pravidlo záměrně konzervativní:
 * aktivní uživatel s právem `dochazka.own`, který má kartu zaměstnance, není externista a už nastoupil.
 * Kdo má na dnešek jakýkoli záznam (i absenci) nebo mu běží píchačka, se nepřipomíná.
 */
export function expectedToWork(
  people: readonly ExpectedPerson[],
  today: string,
  covered: ReadonlySet<string>,
): string[] {
  return people
    .filter(
      (p) =>
        p.employmentType !== "external" &&
        (!p.startDate || p.startDate <= today) &&
        !covered.has(p.userId),
    )
    .map((p) => p.userId);
}
