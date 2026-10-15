/*
  Čistá logika UI kalendáře (KAL-B): pozice událostí v denní mřížce, kolize (vedle sebe), přichytávání tažení,
  převod místního času Europe/Prague na okamžiky (letní čas) a pomůcky pro vrstvy. Bez Reactu a bez prohlížeče,
  aby šla jednotkově testovat (`lib.test.ts`).
*/
import { addDaysIso, localParts, timeToMinutes, zonedToUtc } from "@rebar/core/time";
import type { CalendarItemDto } from "../contract";

/** Položka kalendáře, tak jak ji vrací `kalendar.range`. */
export type Item = CalendarItemDto;

/** Výška jedné hodiny v denní mřížce (px). */
export const HOUR_PX = 48;
/** Krok přichytávání při tažení (minuty). */
export const SNAP_MIN = 15;
/** Nejmenší délka schůzky vytvořené nebo zmenšené tažením (minuty). */
export const MIN_DURATION_MIN = 15;
/** Výchozí délka schůzky vytvořené jedním kliknutím (minuty). */
export const DEFAULT_DURATION_MIN = 60;
/** Nejmenší výška bloku v mřížce (minuty), aby šla krátká událost klepnout. */
const MIN_VISUAL_MIN = 25;

/**
 * Časová zóna a pracovní doba (KAL-03: 8–18) jako vlastní konstanty: `contract.ts` tahá do prohlížeče zod, který UI
 * modulu nesmí obsahovat (`tests/modules.test.ts`). Shodu s kontraktem hlídá `lib.test.ts`.
 */
export const CALENDAR_TIME_ZONE = "Europe/Prague";
/** Začátek pracovní doby v minutách od půlnoci. */
export const WORK_FROM_MIN = 8 * 60;
/** Konec pracovní doby v minutách od půlnoci. */
export const WORK_TO_MIN = 18 * 60;

export const DAY_NAMES = ["po", "út", "st", "čt", "pá", "so", "ne"];

/** Datum (`YYYY-MM-DD`) z místního času položky. */
export const dateOf = (s: string) => s.slice(0, 10);
/** Čas (`HH:mm`) z místního času položky; celodenní má prázdný řetězec. */
export const timeOf = (s: string) => (s.length > 10 ? s.slice(11, 16) : "");
/** Minuty od místní půlnoci z `YYYY-MM-DDTHH:mm` (celodenní = 0). */
export const minutesOf = (s: string) => (s.length > 10 ? timeToMinutes(timeOf(s)) : 0);

/** Zkratka dne v týdnu (po–ne) pro `YYYY-MM-DD`. */
export const dayName = (d: string) => DAY_NAMES[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7]!;

/** Pracovní den (po–pá); pracovní doba se zvýrazňuje jen v nich. */
export const isWeekday = (d: string) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7 < 5;

/** Poslední den, který položka zasahuje (konec přesně o půlnoci patří předchozímu dni). */
export function lastDay(it: Pick<Item, "start" | "end" | "allDay">): string {
  const end = dateOf(it.end);
  if (!it.allDay && timeOf(it.end) === "00:00" && end > dateOf(it.start))
    return addDaysIso(end, -1);
  return end < dateOf(it.start) ? dateOf(it.start) : end;
}
/** Zasahuje položka daný den? */
export const touches = (it: Pick<Item, "start" | "end" | "allDay">, day: string) =>
  dateOf(it.start) <= day && lastDay(it) >= day;

/** Položka patří do pruhu nahoře (celodenní, úkol bez času, svátek), ne do časové mřížky. */
export const isStripItem = (it: Pick<Item, "allDay" | "kind">) =>
  it.allDay || it.kind === "holiday";

/* ---------- segmenty a rozložení kolizí ---------- */

/** Úsek položky v jednom dni mřížky (minuty od půlnoci). */
export type Segment = { item: Item; day: string; startMin: number; endMin: number };
/** Úsek s přiděleným sloupcem pro kolize (`col` z `cols` vedle sebe). */
export type Placed = Segment & { col: number; cols: number };

/** Úsek položky v daném dni (0–1440 minut); položka přes půlnoc se v každém dni ořízne. */
export function segmentFor(it: Item, day: string): Segment | null {
  if (isStripItem(it) || !touches(it, day)) return null;
  const startMin = dateOf(it.start) < day ? 0 : minutesOf(it.start);
  let endMin = dateOf(it.end) > day ? 1440 : minutesOf(it.end);
  if (endMin === 0 && dateOf(it.end) === day && dateOf(it.start) === day) endMin = startMin;
  return { item: it, day, startMin, endMin: Math.max(endMin, startMin) };
}

/** Viditelný konec úseku (krátké události se roztáhnou na minimální výšku). */
export const visualEnd = (s: Pick<Segment, "startMin" | "endMin">) =>
  Math.min(1440, Math.max(s.endMin, s.startMin + MIN_VISUAL_MIN));

/**
 * Rozloží úseky jednoho dne do sloupců: překrývající se události stojí vedle sebe (kolize), nepřekrývající
 * zabírají celou šířku. Shluk = řetěz událostí, kde každá překrývá aspoň jednu předchozí.
 */
export function layoutDay(segments: Segment[]): Placed[] {
  const sorted = [...segments].sort(
    (a, b) =>
      a.startMin - b.startMin ||
      visualEnd(b) - visualEnd(a) ||
      a.item.title.localeCompare(b.item.title, "cs"),
  );
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  let colEnds: number[] = [];
  const flush = () => {
    for (const p of cluster) p.cols = colEnds.length;
    out.push(...cluster);
    cluster = [];
    colEnds = [];
    clusterEnd = -1;
  };
  for (const s of sorted) {
    if (cluster.length && s.startMin >= clusterEnd) flush();
    let col = colEnds.findIndex((e) => e <= s.startMin);
    if (col === -1) col = colEnds.length;
    colEnds[col] = visualEnd(s);
    clusterEnd = Math.max(clusterEnd, visualEnd(s));
    cluster.push({ ...s, col, cols: 1 });
  }
  flush();
  return out;
}

/** Dvě události se v čase překrývají (kolize v jednom kalendáři). */
export const collides = (
  a: Pick<Segment, "startMin" | "endMin">,
  b: Pick<Segment, "startMin" | "endMin">,
) => a.startMin < visualEnd(b) && b.startMin < visualEnd(a);

/* ---------- přichytávání a převody ---------- */

/** Minuty od půlnoci → pixely v denní mřížce. */
export const pxFromMin = (min: number) => (min / 60) * HOUR_PX;
/** Pixely v denní mřížce → minuty od půlnoci. */
export const minFromPx = (px: number) => (px / HOUR_PX) * 60;
/** Přichytí minuty na krok (výchozí 15). */
export const snap = (min: number, step = SNAP_MIN) => Math.round(min / step) * step;
/** Omezí hodnotu na interval. */
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** `HH:mm` z minut (0–1440; 1440 = „24:00“ se zobrazí jako 00:00). */
export function clock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Místní datum a minuty od půlnoci (i přes 1440 nebo záporné, přenese se do dalšího/předchozího dne) → okamžik
 * (ISO, UTC). Letní čas řeší `zonedToUtc`: neexistující hodina jarního skoku se posune dopředu.
 */
export function localToInstant(date: string, minutes: number): string {
  const carry = Math.floor(minutes / 1440);
  const m = ((minutes % 1440) + 1440) % 1440;
  return zonedToUtc(addDaysIso(date, carry), clock(m), CALENDAR_TIME_ZONE).toISOString();
}

/** Okamžik → místní datum a minuty od půlnoci. */
export function instantToLocal(instant: string): { date: string; min: number } {
  const p = localParts(new Date(instant), CALENDAR_TIME_ZONE);
  return { date: p.date, min: timeToMinutes(p.time) };
}

/** Rozdíl dvou místních časů (`YYYY-MM-DDTHH:mm`) v minutách podle „nástěnných hodin“ (bez ohledu na letní čas). */
export function wallMinutes(a: string, b: string): number {
  const t = (s: string) =>
    Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), 0, minutesOf(s));
  return Math.round((t(b) - t(a)) / 60000);
}

/** Nový začátek a konec události jako ISO okamžiky (UTC). */
export type Instants = { startsAt: string; endsAt: string };

/**
 * Přesun události (tažení): nový den a čas začátku, délka podle nástěnných hodin zůstává, takže událost 10:00–11:00
 * zůstane 10:00–11:00 i po přechodu přes změnu času.
 */
export function moveInstants(
  it: Pick<Item, "start" | "end">,
  newDate: string,
  newStartMin: number,
): Instants {
  const dur = wallMinutes(it.start, it.end);
  return {
    startsAt: localToInstant(newDate, newStartMin),
    endsAt: localToInstant(newDate, newStartMin + dur),
  };
}

/** Přesun celodenní události o počet dní (zachová počet dnů; konec je půlnoc po posledním dni). */
export function moveAllDay(it: Pick<Item, "start" | "end">, dayDelta: number): Instants {
  const s = addDaysIso(dateOf(it.start), dayDelta);
  const lastIncl = addDaysIso(dateOf(it.end), dayDelta);
  return { startsAt: localToInstant(s, 0), endsAt: localToInstant(addDaysIso(lastIncl, 1), 0) };
}

/** Změna délky (tažení dolního okraje): nový konec v minutách od půlnoci dne začátku, nejméně `MIN_DURATION_MIN`. */
export function resizeInstants(it: Pick<Item, "start">, newEndMin: number): Instants {
  const start = minutesOf(it.start);
  const end = Math.max(newEndMin, start + MIN_DURATION_MIN);
  const date = dateOf(it.start);
  return { startsAt: localToInstant(date, start), endsAt: localToInstant(date, end) };
}

/** Výběr tažením v prázdném místě: dva body v minutách, seřazené a přichycené; nejméně `MIN_DURATION_MIN`. */
export function selectionRange(aMin: number, bMin: number): { startMin: number; endMin: number } {
  const lo = clamp(snap(Math.min(aMin, bMin)), 0, 1440 - MIN_DURATION_MIN);
  let hi = clamp(snap(Math.max(aMin, bMin)), 0, 1440);
  if (hi - lo < MIN_DURATION_MIN)
    hi = Math.min(1440, lo + (aMin === bMin ? DEFAULT_DURATION_MIN : MIN_DURATION_MIN));
  return { startMin: lo, endMin: hi };
}

/* ---------- barvy ---------- */

const NAMED: Record<string, string> = {
  gray: "#6b7280",
  blue: "#3b82f6",
  green: "#16a34a",
  orange: "#ea580c",
  red: "#dc2626",
  purple: "#9333ea",
  pink: "#db2777",
  teal: "#0d9488",
  yellow: "#ca8a04",
  indigo: "#6366f1",
};
/** Barva položky jako CSS hodnota (pojmenovaná barva štítků, nebo `#rrggbb`). */
export const cssColor = (c: string | null | undefined) =>
  !c ? NAMED.blue! : c.startsWith("#") ? c : (NAMED[c] ?? NAMED.gray!);

/* ---------- vrstvy ---------- */

/** Klíče vestavěných vrstev (zapínatelné vedle vrstev ostatních modulů). */
export const LAYER_MINE = "kalendar.mine";
export const LAYER_OTHERS = "kalendar.others";

/** Do které vrstvy položka patří: moje kalendáře, kalendáře druhého, nebo vrstva jiného modulu (`layer`). */
export function layerOf(it: Pick<Item, "kind" | "layer" | "own">): string | null {
  if (it.kind === "holiday") return null;
  if (it.kind === "busy") return LAYER_OTHERS;
  if (it.kind === "event") return it.own ? LAYER_MINE : LAYER_OTHERS;
  return it.layer;
}

/** Odfiltruje položky vypnutých vrstev. */
export function visibleItems(items: Item[], hidden: readonly string[]): Item[] {
  return items.filter((it) => {
    const l = layerOf(it);
    return !l || !hidden.includes(l);
  });
}

/* ---------- účastníci ---------- */

/** Rozdělí text s e-maily (čárka, středník, mezera, nový řádek); vrací platné bez duplicit a nesrozumitelné zvlášť. */
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const v = raw.trim().replace(/^<|>$/g, "").toLowerCase();
    if (!v) continue;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
      if (!valid.includes(v)) valid.push(v);
    } else invalid.push(raw);
  }
  return { valid, invalid };
}

/* ---------- popisky ---------- */

/** „po 14. 10. 14:00–15:00“ (celodenní bez času); text jen z čísel, stejný na serveru i v prohlížeči. */
export function whenLabel(it: Pick<Item, "start" | "end" | "allDay">): string {
  const d = (s: string) => `${+s.slice(8, 10)}. ${+s.slice(5, 7)}.`;
  const day = `${dayName(dateOf(it.start))} ${d(it.start)}`;
  if (it.allDay) {
    const last = lastDay(it);
    return last > dateOf(it.start)
      ? `${day} – ${dayName(last)} ${d(last)} (celý den)`
      : `${day} (celý den)`;
  }
  const endDay =
    dateOf(it.end) === dateOf(it.start) ? "" : `${dayName(dateOf(it.end))} ${d(it.end)} `;
  return `${day} ${timeOf(it.start)}–${endDay}${timeOf(it.end)}`;
}

/** Další kus pracovní doby dne pro nepřeplněný start nové schůzky: nejbližší celá hodina (min. 8:00, nejvýš 17:00). */
export function nextFullHour(nowMin: number): number {
  return clamp(Math.ceil((nowMin + 1) / 60) * 60, WORK_FROM_MIN, WORK_TO_MIN - 60);
}
