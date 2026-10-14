import { addDaysIso, addMonthsIso, isoWeekday, localParts, zonedToUtc } from "@rebar/core/time";

/*
  iCalendar (RFC 5545): export vlastních událostí pro odběr z Google, Apple a Outlooku a import cizích kalendářů jako „obsazeno“.
  Čistá logika bez sítě a databáze. Časová zóna je Europe/Prague, výstup obsahuje její definici, aby se opakované události
  přes změnu letního času držely stejné hodiny.
*/

const TZ = "Europe/Prague";
/** Nejvyšší počet kroků při rozbalování pravidla (ochrana před nekonečnou smyčkou, ~54 let denně). */
const MAX_STEPS = 20_000;
const pad = (n: number) => String(n).padStart(2, "0");

/* ---------- export ---------- */

/** UTC čas „20261005T080000Z“. */
export const icsUtc = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const icsDate = (iso: string) => iso.replaceAll("-", "");
/** Místní čas pro `DTSTART;TZID=Europe/Prague`. */
const icsLocal = (d: Date) => {
  const p = localParts(d);
  return `${icsDate(p.date)}T${p.time.replace(":", "")}00`;
};

export const icsText = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/[,;]/g, (m) => `\\${m}`);

/** Řádky delší než 75 bajtů se zalomí (RFC 5545), aby je klienti přečetli. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (len + b > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const VTIMEZONE_PRAGUE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const RRULE: Record<string, string> = {
  daily: "FREQ=DAILY",
  weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
};

export type IcsExportEvent = {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  recurrence: string | null;
  recurrenceUntil: string | null;
  reminderMinutes: number | null;
  updatedAt: Date;
  url?: string | null;
};

/** Sestaví kalendář (VCALENDAR) z událostí. Řádky končí CRLF. */
export function buildIcs(events: readonly IcsExportEvent[], name: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kalendar//CS",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`,
    `X-WR-TIMEZONE:${TZ}`,
    ...VTIMEZONE_PRAGUE,
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${icsUtc(e.updatedAt)}`);
    lines.push(`SUMMARY:${icsText(e.title)}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(localParts(e.startsAt).date)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(localParts(e.endsAt).date)}`);
    } else {
      lines.push(`DTSTART;TZID=${TZ}:${icsLocal(e.startsAt)}`);
      lines.push(`DTEND;TZID=${TZ}:${icsLocal(e.endsAt)}`);
    }
    if (e.recurrence && RRULE[e.recurrence]) {
      let rule = RRULE[e.recurrence]!;
      if (e.recurrenceUntil)
        rule += e.allDay
          ? `;UNTIL=${icsDate(e.recurrenceUntil)}`
          : `;UNTIL=${icsUtc(zonedToUtc(e.recurrenceUntil, "23:59"))}`;
      lines.push(`RRULE:${rule}`);
    }
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.reminderMinutes)
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsText(e.title)}`,
        `TRIGGER:-PT${e.reminderMinutes}M`,
        "END:VALARM",
      );
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

/* ---------- import ---------- */

export type IcsEvent = {
  uid: string;
  title: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  rrule: string | null;
  /** Vynechané výskyty (místní data). */
  exdates: string[];
};

function validTz(tz: string | undefined): string {
  if (!tz) return TZ;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return TZ;
  }
}

/** Datum z iCalendar: „20261005“ (celý den), „20261005T080000Z“ (UTC), nebo místní čas se zónou / bez ní (pak Praha). */
function parseDate(value: string, params: string): { date: Date; allDay: boolean } | null {
  const tz = validTz(/TZID=([^;]+)/i.exec(params)?.[1]?.replace(/^"|"$/g, ""));
  if (/VALUE=DATE(?!-)/i.test(params) || /^\d{8}$/.test(value)) {
    const d = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    return { date: zonedToUtc(d, "00:00", TZ), allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z)
    return { date: new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +(s ?? 0))), allDay: false };
  return { date: zonedToUtc(`${y}-${mo}-${d}`, `${h}:${mi}`, tz), allDay: false };
}

const unescapeText = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

/** Minimalistický parser VEVENT: stačí na „obsazeno“ z Google, iCloudu a Outlooku. */
export function parseIcs(text: string): IcsEvent[] {
  const lines = text
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .split(/\r?\n/);
  const out: IcsEvent[] = [];
  let cur: Record<string, { value: string; params: string }[]> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      const first = (k: string) => cur![k]?.[0];
      const s = first("DTSTART") && parseDate(first("DTSTART")!.value, first("DTSTART")!.params);
      if (s && first("UID") && first("STATUS")?.value !== "CANCELLED" && !first("RECURRENCE-ID")) {
        const e = first("DTEND") ? parseDate(first("DTEND")!.value, first("DTEND")!.params) : null;
        const end =
          e?.date ??
          (s.allDay
            ? new Date(s.date.getTime() + 86_400_000)
            : new Date(s.date.getTime() + 3_600_000));
        const exdates = (cur["EXDATE"] ?? []).flatMap((x) =>
          x.value
            .split(",")
            .map((v) => parseDate(v.trim(), x.params))
            .flatMap((p) => (p ? [localParts(p.date).date] : [])),
        );
        out.push({
          uid: first("UID")!.value,
          title: first("SUMMARY") ? unescapeText(first("SUMMARY")!.value) : null,
          start: s.date,
          end,
          allDay: s.allDay,
          rrule: first("RRULE")?.value ?? null,
          exdates,
        });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(";");
      const key = name!.toUpperCase();
      (cur[key] ??= []).push({ value: line.slice(i + 1), params: params.join(";") });
    }
  }
  return out;
}

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/**
 * Rozbalí jednoduchá pravidla opakování (DAILY, WEEKLY s BYDAY, MONTHLY, YEARLY; INTERVAL, COUNT, UNTIL, EXDATE)
 * do výskytů, které zasahují do okna `[from, to]` (místní data). Složitější pravidla (např. „druhé úterý v měsíci“)
 * se zjednoduší na opakování ve stejný den.
 */
export function expandIcs(
  ev: IcsEvent,
  from: string,
  to: string,
): { start: Date; end: Date; uid: string }[] {
  const dur = ev.end.getTime() - ev.start.getTime();
  const startLocal = localParts(ev.start);
  const mk = (date: string) => {
    const s = ev.allDay ? zonedToUtc(date, "00:00") : zonedToUtc(date, startLocal.time);
    return { start: s, end: new Date(s.getTime() + dur), uid: ev.uid };
  };
  const inWindow = (o: { start: Date; end: Date }) =>
    localParts(new Date(o.end.getTime() - 1)).date >= from && localParts(o.start).date <= to;
  if (!ev.rrule) {
    const o = mk(startLocal.date);
    return inWindow(o) && !ev.exdates.includes(startLocal.date) ? [o] : [];
  }

  const rule = Object.fromEntries(ev.rrule.split(";").map((p) => p.split("=") as [string, string]));
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const untilParsed = rule.UNTIL ? parseDate(rule.UNTIL, "") : null;
  // UNTIL ve tvaru DATE platí do konce toho dne, jinak je to okamžik, který výskyt nesmí překročit
  const untilDate = untilParsed?.allDay ? localParts(untilParsed.date).date : null;
  const untilInstant = untilParsed && !untilParsed.allDay ? untilParsed.date : null;
  const freq = rule.FREQ;
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq ?? "")) return [];
  const byDay = (rule.BYDAY ?? "")
    .split(",")
    .map((d) => DAYS.indexOf(d.replace(/^[+-]?\d+/, "")) + 1)
    .filter((n) => n > 0);

  // kandidátní data v pořadí; COUNT se počítá od začátku, proto se prochází od prvního výskytu
  const out: { start: Date; end: Date; uid: string }[] = [];
  let produced = 0;
  const emit = (date: string): boolean => {
    if (date < startLocal.date) return true;
    if (untilDate && date > untilDate) return false;
    const o = mk(date);
    if (untilInstant && o.start > untilInstant) return false;
    if (produced >= count || date > to) return false;
    produced++;
    if (!ev.exdates.includes(date) && inWindow(o)) out.push(o);
    return true;
  };

  if (freq === "WEEKLY") {
    const weekStart = addDaysIso(startLocal.date, 1 - isoWeekday(startLocal.date));
    const days = byDay.length ? [...byDay].sort() : [isoWeekday(startLocal.date)];
    for (let w = 0; w < MAX_STEPS; w++) {
      const monday = addDaysIso(weekStart, 7 * interval * w);
      if (monday > to) break;
      for (const d of days) if (!emit(addDaysIso(monday, d - 1))) return out;
    }
    return out;
  }
  for (let i = 0; i < MAX_STEPS; i++) {
    const date =
      freq === "DAILY"
        ? addDaysIso(startLocal.date, i * interval)
        : freq === "MONTHLY"
          ? addMonthsIso(startLocal.date, i * interval)
          : addMonthsIso(startLocal.date, 12 * i * interval);
    if (date > to) break;
    if (!emit(date)) break;
  }
  return out;
}
