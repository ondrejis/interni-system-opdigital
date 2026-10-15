import { addDaysIso, localParts, zonedToUtc } from "@rebar/core/time";
import type { EventAttendee } from "../contract";
import { CALENDAR_TIME_ZONE } from "../contract";
import type { GoogleEvent, GoogleEventInput, GoogleEventTime } from "./client";

/*
  Čisté mapování mezi událostí Google Calendar API a řádkem `calendar_event` (a úkolem z `ukoly`). Bez databáze a bez
  sítě, aby šlo ověřit testy: časová pásma (Europe/Prague, letní čas), celodenní události (konec je v Googlu výlučný),
  výskyty opakovaných událostí (`singleEvents=true`), soukromí a identifikace událostí z OPSYS.
*/

/** Pole zrcadla, která pocházejí z Googlu. */
export type MirrorFields = {
  title: string | null;
  description: string | null;
  place: string | null;
  meetUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  attendees: EventAttendee[];
  visibility: "default" | "public" | "private" | "confidential";
  isGooglePrivate: boolean;
  recurringEventId: string | null;
  originalStartAt: Date | null;
  htmlLink: string | null;
  organizerEmail: string | null;
  etag: string | null;
  googleUpdatedAt: Date | null;
};

/** Výsledek převodu události z Googlu: smazaná/ignorovaná, nebo platná s poli a případným úkolem. */
export type RemoteEvent =
  | { googleId: string; deleted: true }
  | { googleId: string; deleted: false; taskId: string | null; fields: MirrorFields };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Klíč v `extendedProperties.private`, pod kterým událost nese id úkolu z OPSYS. */
export const TASK_PROP = "opsysTaskId";

/** Čas z Googlu na okamžik: celodenní datum = místní půlnoc Europe/Prague, jinak přesný okamžik. */
export function googleTimeToDate(t: GoogleEventTime | undefined): Date | null {
  if (!t) return null;
  if (t.date) return zonedToUtc(t.date, "00:00", CALENDAR_TIME_ZONE);
  if (t.dateTime) {
    const d = new Date(t.dateTime);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Událost z Googlu → řádek zrcadla. Smazané, zrušené a „pracovní místo“ události se zrcadlit nemají (`deleted: true`). */
export function fromGoogleEvent(e: GoogleEvent): RemoteEvent {
  if (e.status === "cancelled" || e.eventType === "workingLocation")
    return { googleId: e.id, deleted: true };
  const startsAt = googleTimeToDate(e.start);
  if (!startsAt) return { googleId: e.id, deleted: true };
  const allDay = !!e.start?.date;
  let endsAt = googleTimeToDate(e.end) ?? startsAt;
  if (endsAt <= startsAt)
    endsAt = allDay
      ? zonedToUtc(addDaysIso(localParts(startsAt).date, 1), "00:00", CALENDAR_TIME_ZONE)
      : startsAt;
  const visibility = e.visibility ?? "default";
  const meetUrl =
    e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
  const rawTask = e.extendedProperties?.private?.[TASK_PROP];
  return {
    googleId: e.id,
    deleted: false,
    taskId: rawTask && UUID.test(rawTask) ? rawTask.toLowerCase() : null,
    fields: {
      title: e.summary ?? null,
      description: e.description ?? null,
      place: e.location ?? null,
      meetUrl: meetUrl ?? null,
      startsAt,
      endsAt,
      allDay,
      attendees: (e.attendees ?? []).map((a) => ({
        email: a.email,
        ...(a.displayName ? { name: a.displayName } : {}),
        ...(a.responseStatus ? { responseStatus: a.responseStatus } : {}),
        ...(a.self ? { self: true } : {}),
        ...(a.organizer ? { organizer: true } : {}),
      })),
      visibility,
      isGooglePrivate: visibility === "private" || visibility === "confidential",
      recurringEventId: e.recurringEventId ?? null,
      originalStartAt: googleTimeToDate(e.originalStartTime),
      htmlLink: e.htmlLink ?? null,
      organizerEmail: e.organizer?.email ?? null,
      etag: e.etag ?? null,
      googleUpdatedAt: e.updated ? new Date(e.updated) : null,
    },
  };
}

/** Okamžik jako ISO s pražským posunem (`2026-10-15T09:00:00+02:00`); přesnost na minuty. */
export function toPragueIso(d: Date): string {
  const ms = d.getTime() - (d.getTime() % 60_000);
  const p = localParts(new Date(ms), CALENDAR_TIME_ZONE);
  const [y, mo, da] = p.date.split("-").map(Number);
  const [h, mi] = p.time.split(":").map(Number);
  const offsetMin = Math.round((Date.UTC(y!, mo! - 1, da!, h, mi) - ms) / 60_000);
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${p.date}T${p.time}:00${sign}${hh}:${mm}`;
}

/** Začátek a konec do Googlu: celodenní jako `date` (konec výlučný), jinak `dateTime` v Europe/Prague. */
export function timesToGoogle(
  startsAt: Date,
  endsAt: Date,
  allDay: boolean,
): { start: GoogleEventTime; end: GoogleEventTime } {
  if (allDay) {
    const start = localParts(startsAt, CALENDAR_TIME_ZONE).date;
    let end = localParts(endsAt, CALENDAR_TIME_ZONE).date;
    if (end <= start) end = addDaysIso(start, 1);
    return { start: { date: start }, end: { date: end } };
  }
  return {
    start: { dateTime: toPragueIso(startsAt), timeZone: CALENDAR_TIME_ZONE },
    end: { dateTime: toPragueIso(endsAt), timeZone: CALENDAR_TIME_ZONE },
  };
}

/** Úkol z OPSYS, jak ho kalendář potřebuje k zápisu do Googlu. */
export type TaskForPush = {
  id: string;
  title: string;
  typeKey: string;
  description: string | null;
  place: string | null;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  /** `HH:mm` nebo `null` (celodenní). */
  dueTime: string | null;
  durationMin: number | null;
  allDay: boolean;
  isPrivate: boolean;
  sendInvites: boolean;
  /** E-maily účastníků (uživatelé, kontakty, adresy); do Googlu jdou jen s `sendInvites`. */
  attendeeEmails: string[];
};

/** Výchozí délka: hovor 30 minut, ostatní 60. */
export const defaultDuration = (typeKey: string) => (typeKey === "call" ? 30 : 60);

/** Začátek, konec a příznak celého dne úkolu. */
export function taskTimes(
  t: Pick<TaskForPush, "dueDate" | "dueTime" | "durationMin" | "allDay" | "typeKey">,
) {
  const allDay = t.allDay || !t.dueTime;
  const startsAt = zonedToUtc(t.dueDate, allDay ? "00:00" : t.dueTime!, CALENDAR_TIME_ZONE);
  const endsAt = allDay
    ? zonedToUtc(addDaysIso(t.dueDate, 1), "00:00", CALENDAR_TIME_ZONE)
    : new Date(startsAt.getTime() + (t.durationMin ?? defaultDuration(t.typeKey)) * 60_000);
  return { startsAt, endsAt, allDay };
}

/** Úkol → událost pro Google. Soukromý úkol má `visibility: private` (R-14), účastníci jen s „Poslat pozvánky“. */
export function taskToGoogle(t: TaskForPush): GoogleEventInput {
  const { startsAt, endsAt, allDay } = taskTimes(t);
  const { start, end } = timesToGoogle(startsAt, endsAt, allDay);
  return {
    summary: t.title,
    description: t.description,
    location: t.place,
    start,
    end,
    visibility: t.isPrivate ? "private" : "default",
    ...(t.sendInvites && t.attendeeEmails.length
      ? {
          attendees: [...new Set(t.attendeeEmails.map((e) => e.toLowerCase()))].map((email) => ({
            email,
          })),
        }
      : {}),
    extendedProperties: { private: { [TASK_PROP]: t.id, opsysSource: "opsys" } },
  };
}

/** Deterministické id události v Googlu pro úkol (idempotentní zápis; povolené znaky `a–v0–9`). */
export const googleIdForTask = (taskId: string) =>
  `opsys${taskId.replaceAll("-", "").toLowerCase()}`;

/** Čas události → pole úkolu (při přetažení v Googlu): datum, čas, délka, celý den. */
export function timesToTask(f: Pick<MirrorFields, "startsAt" | "endsAt" | "allDay">) {
  const s = localParts(f.startsAt, CALENDAR_TIME_ZONE);
  if (f.allDay) return { dueDate: s.date, dueTime: null, durationMin: null, allDay: true };
  return {
    dueDate: s.date,
    dueTime: s.time,
    durationMin: Math.max(1, Math.round((f.endsAt.getTime() - f.startsAt.getTime()) / 60_000)),
    allDay: false,
  };
}

/** Shodují se pole, která OPSYS do Googlu zapisuje? (zápis, který by nic nezměnil, se vynechá) */
export function sameWritten(
  a: Pick<
    MirrorFields,
    "title" | "description" | "place" | "startsAt" | "endsAt" | "allDay" | "visibility"
  >,
  b: Pick<
    MirrorFields,
    "title" | "description" | "place" | "startsAt" | "endsAt" | "allDay" | "visibility"
  >,
): boolean {
  const n = (v: string | null) => v ?? "";
  const vis = (v: MirrorFields["visibility"]) =>
    v === "private" || v === "confidential" ? "p" : "d";
  return (
    n(a.title) === n(b.title) &&
    n(a.description) === n(b.description) &&
    n(a.place) === n(b.place) &&
    a.startsAt.getTime() === b.startsAt.getTime() &&
    a.endsAt.getTime() === b.endsAt.getTime() &&
    a.allDay === b.allDay &&
    vis(a.visibility) === vis(b.visibility)
  );
}

/** Pole zrcadla, která se skutečně zapisují do Googlu (podoba `GoogleEventInput` jako `MirrorFields`). */
export function inputToFields(
  i: GoogleEventInput,
): Pick<
  MirrorFields,
  "title" | "description" | "place" | "startsAt" | "endsAt" | "allDay" | "visibility"
> {
  return {
    title: i.summary ?? null,
    description: i.description ?? null,
    place: i.location ?? null,
    startsAt: googleTimeToDate(i.start)!,
    endsAt: googleTimeToDate(i.end)!,
    allDay: !!i.start.date,
    visibility: i.visibility ?? "default",
  };
}
