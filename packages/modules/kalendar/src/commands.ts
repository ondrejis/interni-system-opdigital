import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { schema } from "@rebar/core/db";
import { assertEntityAccess, visibleRecordTitles } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { notify } from "@rebar/core/notifications";
import { can, inTx, NotFoundError, PermissionError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatDate } from "@rebar/core/shared";
import { addDaysIso, czechHolidays, diffDaysIso, localParts, zonedToUtc } from "@rebar/core/time";
import { EVENT_TYPE_VALUES } from "./catalog";
import { KALENDAR_CANCELLED, KALENDAR_CHANGED, KALENDAR_INVITE } from "./notifications";
import {
  RECURRENCE_VALUES,
  expandEvent,
  overlap,
  type EventTimes,
  type Occurrence,
} from "./recurrence";
import { FetchBlockedError, fetchCalendarText } from "./safe-fetch";
import {
  calendarFeed,
  calendarImport,
  calendarResource,
  event,
  eventAttendee,
  externalEvent,
} from "./schema";
import { regenerateFeedToken, syncImport } from "./sync";

const id = z.uuid();
const dateInput = z.iso.date("Vyplňte datum.");
const timeInput = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Čas zapište jako 08:30.");

/** Nejdelší okno, které kalendář najednou vrací. */
const MAX_RANGE_DAYS = 400;

type Row = typeof event.$inferSelect;

const mine = (userId: string) =>
  or(
    eq(event.ownerId, userId),
    sql`exists (select 1 from ${eventAttendee} where ${eventAttendee.eventId} = ${event.id} and ${eventAttendee.userId} = ${userId})`,
  )!;

function me(ctx: Ctx): string {
  if (!ctx.actor.userId) throw new PermissionError();
  return ctx.actor.userId;
}

const times = (e: Row): EventTimes => ({
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  allDay: e.allDay,
  recurrence: e.recurrence,
  recurrenceUntil: e.recurrenceUntil,
});

const localIso = (d: Date) => {
  const p = localParts(d);
  return `${p.date}T${p.time}`;
};

/* ---------- rozsah kalendáře ---------- */

export type CalendarItemOut = {
  id: string;
  kind: "event" | "busy" | "layer" | "holiday";
  layer: string | null;
  title: string;
  /** Celodenní: `YYYY-MM-DD`; jinak místní `YYYY-MM-DDTHH:mm`. */
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  href: string | null;
  eventId: string | null;
  type: string | null;
  location: string | null;
  owner: string | null;
  ownerId: string | null;
  /** Událost patří přihlášenému (ne jen pozvanému); v přeplněném dni se řadí přednostně. */
  own: boolean;
  resource: string | null;
  attendees: string[];
  recurring: boolean;
  canEdit: boolean;
};

const blank = {
  href: null,
  eventId: null,
  type: null,
  location: null,
  owner: null,
  ownerId: null,
  own: false,
  resource: null,
  attendees: [] as string[],
  recurring: false,
  canEdit: false,
};

export const range = defineCommand({
  name: "kalendar.range",
  permission: "kalendar.read",
  input: z.object({
    from: dateInput,
    to: dateInput,
    who: z.enum(["me", "all"]).default("me"),
    layers: z.array(z.string().max(80)).max(30).optional(),
  }),
  handler: async (ctx, i, deps) => {
    if (i.to < i.from) throw new UserError("Konec období je před začátkem.");
    if (diffDaysIso(i.from, i.to) > MAX_RANGE_DAYS) throw new UserError("Období je příliš dlouhé.");
    const userId = me(ctx);
    const all = scopeOf(ctx, "kalendar.read") === "all" && i.who === "all";
    const windowStart = zonedToUtc(i.from, "00:00");
    const windowEnd = zonedToUtc(addDaysIso(i.to, 1), "00:00");

    const rows = await ctx.db
      .select({ e: event, ownerName: schema.user.name, resourceName: calendarResource.name })
      .from(event)
      .innerJoin(schema.user, eq(schema.user.id, event.ownerId))
      .leftJoin(calendarResource, eq(calendarResource.id, event.resourceId))
      .where(
        and(
          isNull(event.deletedAt),
          lte(event.startsAt, windowEnd),
          or(sql`${event.recurrence} is not null`, gte(event.endsAt, windowStart)),
          all ? undefined : mine(userId),
        ),
      )
      .limit(2000);
    const ids = rows.map((r) => r.e.id);
    const attendees = ids.length
      ? await ctx.db
          .select({ eventId: eventAttendee.eventId, name: schema.user.name })
          .from(eventAttendee)
          .innerJoin(schema.user, eq(schema.user.id, eventAttendee.userId))
          .where(inArray(eventAttendee.eventId, ids))
          .orderBy(asc(schema.user.name))
      : [];
    const writeAll = scopeOf(ctx, "kalendar.write") === "all";
    const canWrite = can(ctx, "kalendar.write");

    const items: CalendarItemOut[] = [];
    const typeColor: Record<string, string> = {
      meeting: "blue",
      survey: "orange",
      handover: "green",
      other: "gray",
    };
    for (const r of rows) {
      for (const o of expandEvent(times(r.e), i.from, i.to)) {
        items.push({
          ...blank,
          id: `${r.e.id}:${o.date}`,
          kind: "event",
          layer: null,
          title: r.e.title,
          start: r.e.allDay ? o.date : localIso(o.start),
          end: r.e.allDay ? o.endDate : localIso(o.end),
          allDay: r.e.allDay,
          color: typeColor[r.e.type] ?? "gray",
          eventId: r.e.id,
          type: r.e.type,
          location: r.e.location,
          owner: r.ownerName,
          ownerId: r.e.ownerId,
          own: r.e.ownerId === userId,
          resource: r.resourceName,
          attendees: attendees.filter((a) => a.eventId === r.e.id).map((a) => a.name),
          recurring: !!r.e.recurrence,
          canEdit: canWrite && (writeAll || r.e.ownerId === userId),
        });
      }
    }

    // cizí kalendáře připojené uživatelem: jen jeho vlastní „obsazeno“
    const busy = await ctx.db
      .select({
        id: externalEvent.id,
        title: externalEvent.title,
        startsAt: externalEvent.startsAt,
        endsAt: externalEvent.endsAt,
        allDay: externalEvent.allDay,
        name: calendarImport.name,
      })
      .from(externalEvent)
      .innerJoin(calendarImport, eq(calendarImport.id, externalEvent.importId))
      .where(
        and(
          eq(calendarImport.userId, userId),
          lte(externalEvent.startsAt, windowEnd),
          gte(externalEvent.endsAt, windowStart),
        ),
      )
      .limit(2000);
    for (const b of busy)
      items.push({
        ...blank,
        id: `busy:${b.id}`,
        kind: "busy",
        layer: "busy",
        title: b.title ?? "Obsazeno",
        start: b.allDay ? localParts(b.startsAt).date : localIso(b.startsAt),
        end: b.allDay ? localParts(new Date(b.endsAt.getTime() - 1)).date : localIso(b.endsAt),
        allDay: b.allDay,
        color: "gray",
        location: b.name,
      });

    // vrstvy ostatních modulů (fáze zakázek, splatnosti, rezervace strojů, absence…)
    const wanted = i.layers ? new Set(i.layers) : null;
    const layerMeta: { key: string; label: string; color: string }[] = [];
    for (const layer of deps.calendarLayers) {
      layerMeta.push({ key: layer.key, label: layer.label, color: layer.color });
      if (wanted && !wanted.has(layer.key)) continue;
      try {
        for (const it of await layer.items(ctx, { from: i.from, to: i.to }, deps)) {
          const allDay = it.allDay;
          items.push({
            ...blank,
            id: `${layer.key}:${it.id}`,
            kind: "layer",
            layer: layer.key,
            title: it.title,
            start: allDay ? it.start.slice(0, 10) : it.start.slice(0, 16),
            end: allDay ? (it.end ?? it.start).slice(0, 10) : (it.end ?? it.start).slice(0, 16),
            allDay,
            color: it.color ?? layer.color,
            href: it.href ?? null,
          });
        }
      } catch {
        // jedna rozbitá vrstva nesmí shodit celý kalendář
      }
    }

    for (let y = Number(i.from.slice(0, 4)); y <= Number(i.to.slice(0, 4)); y++)
      for (const [date, name] of czechHolidays(y))
        if (date >= i.from && date <= i.to)
          items.push({
            ...blank,
            id: `holiday:${date}`,
            kind: "holiday",
            layer: "holiday",
            title: name,
            start: date,
            end: date,
            allDay: true,
            color: "red",
          });

    items.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, "cs"));
    return {
      items,
      layers: layerMeta,
      canWrite,
      canSeeAll: scopeOf(ctx, "kalendar.read") === "all",
    };
  },
});

/* ---------- události ---------- */

export const options = defineCommand({
  name: "kalendar.options",
  permission: "kalendar.read",
  input: z.object({}),
  handler: async (ctx) => ({
    resources: await ctx.db
      .select({ id: calendarResource.id, name: calendarResource.name, kind: calendarResource.kind })
      .from(calendarResource)
      .where(and(isNull(calendarResource.deletedAt), eq(calendarResource.active, true)))
      .orderBy(asc(calendarResource.name)),
    me: { id: ctx.actor.userId, name: null as string | null },
  }),
});

export const eventGet = defineCommand({
  name: "kalendar.event.get",
  permission: "kalendar.read",
  input: z.object({ id }),
  handler: async (ctx, i, deps) => {
    await assertEntityAccess(ctx, "event", i.id, "read");
    const [e] = await ctx.db
      .select()
      .from(event)
      .where(and(eq(event.id, i.id), isNull(event.deletedAt)));
    if (!e) throw new NotFoundError();
    const attendees = await ctx.db
      .select({ id: schema.user.id, name: schema.user.name })
      .from(eventAttendee)
      .innerJoin(schema.user, eq(schema.user.id, eventAttendee.userId))
      .where(eq(eventAttendee.eventId, i.id))
      .orderBy(asc(schema.user.name));
    const start = localParts(e.startsAt);
    const endLocal = localParts(e.endsAt);
    const endDate = e.allDay ? localParts(new Date(e.endsAt.getTime() - 1)).date : endLocal.date;
    const jobs = e.jobId ? await visibleRecordTitles(ctx, deps.registry, "job", [e.jobId]) : {};
    return {
      id: e.id,
      title: e.title,
      type: e.type,
      allDay: e.allDay,
      startDate: start.date,
      startTime: e.allDay ? null : start.time,
      endDate,
      endTime: e.allDay ? null : endLocal.time,
      location: e.location,
      note: e.note,
      ownerId: e.ownerId,
      resourceId: e.resourceId,
      jobId: e.jobId,
      jobTitle: e.jobId ? (jobs[e.jobId] ?? null) : null,
      attendees,
      recurrence: e.recurrence,
      recurrenceUntil: e.recurrenceUntil,
      reminderMinutes: e.reminderMinutes,
      canEdit:
        can(ctx, "kalendar.write") &&
        (scopeOf(ctx, "kalendar.write") === "all" || e.ownerId === ctx.actor.userId),
    };
  },
});

const eventInput = z.object({
  id: id.optional(),
  title: z.string().trim().min(1, "Vyplňte název.").max(200),
  type: z.enum(EVENT_TYPE_VALUES),
  allDay: z.boolean(),
  startDate: dateInput,
  startTime: timeInput.nullish(),
  endDate: dateInput,
  endTime: timeInput.nullish(),
  location: z.string().trim().max(200).nullish(),
  note: z.string().trim().max(2000).nullish(),
  resourceId: id.nullish(),
  jobId: id.nullish(),
  attendeeIds: z.array(id).max(50).default([]),
  recurrence: z.enum(RECURRENCE_VALUES).nullish(),
  recurrenceUntil: dateInput.nullish(),
  reminderMinutes: z.union([z.literal(15), z.literal(60), z.literal(1440)]).nullish(),
});

/** Převede zadání formuláře na okamžiky; celodenní událost končí místní půlnocí dne po posledním dni. */
export function eventTimesOf(i: {
  allDay: boolean;
  startDate: string;
  startTime?: string | null | undefined;
  endDate: string;
  endTime?: string | null | undefined;
}): { startsAt: Date; endsAt: Date } {
  if (i.endDate < i.startDate) throw new UserError("Konec je před začátkem.");
  if (i.allDay)
    return {
      startsAt: zonedToUtc(i.startDate, "00:00"),
      endsAt: zonedToUtc(addDaysIso(i.endDate, 1), "00:00"),
    };
  if (!i.startTime || !i.endTime) throw new UserError("Vyplňte čas začátku a konce.");
  const startsAt = zonedToUtc(i.startDate, i.startTime);
  const endsAt = zonedToUtc(i.endDate, i.endTime);
  if (endsAt <= startsAt) throw new UserError("Konec musí být po začátku.");
  return { startsAt, endsAt };
}

/** Okno, ve kterém se kontrolují kolize opakované události se zdrojem. */
const COLLISION_DAYS = 370;

async function assertResourceFree(
  c: Ctx,
  self: { id?: string | undefined; resourceId: string; times: EventTimes },
) {
  const first = localParts(self.times.startsAt).date;
  const limit = addDaysIso(first, COLLISION_DAYS);
  const last =
    self.times.recurrence && self.times.recurrenceUntil && self.times.recurrenceUntil < limit
      ? self.times.recurrenceUntil
      : self.times.recurrence
        ? limit
        : localParts(new Date(self.times.endsAt.getTime() - 1)).date;
  const mineOccurrences = expandEvent(self.times, first, last);
  if (!mineOccurrences.length) return;
  const others = await c.db
    .select()
    .from(event)
    .where(
      and(
        eq(event.resourceId, self.resourceId),
        isNull(event.deletedAt),
        self.id ? sql`${event.id} <> ${self.id}` : undefined,
        or(sql`${event.recurrence} is not null`, gte(event.endsAt, zonedToUtc(first, "00:00"))),
        lte(event.startsAt, zonedToUtc(addDaysIso(last, 1), "00:00")),
      ),
    );
  for (const other of others) {
    const theirs: Occurrence[] = expandEvent(times(other), first, last);
    for (const a of mineOccurrences)
      for (const b of theirs)
        if (overlap(a, b)) {
          const [r] = await c.db
            .select({ name: calendarResource.name })
            .from(calendarResource)
            .where(eq(calendarResource.id, self.resourceId));
          const when = other.allDay
            ? formatDate(b.date)
            : `${formatDate(b.date)} ${localParts(b.start).time}`;
          throw new UserError(
            `${r?.name ?? "Zdroj"} je v tomto čase obsazený: „${other.title}“ (${when}).`,
          );
        }
  }
}

export const eventSave = defineCommand({
  name: "kalendar.event.save",
  permission: "kalendar.write",
  input: eventInput,
  handler: async (ctx, i) => {
    const actor = me(ctx);
    if (!can(ctx, "kalendar.write")) throw new PermissionError();
    const { startsAt, endsAt } = eventTimesOf(i);
    if (i.recurrence && i.recurrenceUntil && i.recurrenceUntil < i.startDate)
      throw new UserError("Opakování končí před začátkem události.");
    if (i.reminderMinutes && i.allDay && i.reminderMinutes < 1440)
      throw new UserError("U celodenní události zvolte připomenutí den předem.");
    const requestedIds = [...new Set(i.attendeeIds)];
    const res = await inTx(ctx, async (c) => {
      let before: Row | undefined;
      if (i.id) {
        [before] = await c.db
          .select()
          .from(event)
          .where(and(eq(event.id, i.id), isNull(event.deletedAt)))
          .for("update");
        if (!before) throw new NotFoundError("Událost nenalezena.");
        if (!can(c, "kalendar.write", { ownerIds: [before.ownerId] })) throw new PermissionError();
      }
      // vlastník je účastník vždy a do seznamu se nezapisuje; kdo upravuje cizí událost (správce), účastníkem zůstává
      // a nevyřadí se (dřív se z účastníků odstraňoval aktér, ne vlastník)
      const attendeeIds = requestedIds.filter((u) => u !== (before?.ownerId ?? actor));
      if (i.jobId) {
        try {
          await assertEntityAccess(c, "job", i.jobId, "read");
        } catch (err) {
          if (err instanceof NotFoundError) throw new UserError("Zakázka neexistuje.");
          if (err instanceof PermissionError)
            throw new UserError("Zakázku nelze zadat (modul Zakázky není zapnutý).");
          throw err;
        }
      }
      if (i.resourceId) {
        const [r] = await c.db
          .select({ id: calendarResource.id })
          .from(calendarResource)
          .where(
            and(
              eq(calendarResource.id, i.resourceId),
              isNull(calendarResource.deletedAt),
              eq(calendarResource.active, true),
            ),
          );
        if (!r) throw new UserError("Zdroj neexistuje nebo je vyřazený.");
        await assertResourceFree(c, {
          id: i.id,
          resourceId: i.resourceId,
          times: {
            startsAt,
            endsAt,
            allDay: i.allDay,
            recurrence: i.recurrence ?? null,
            recurrenceUntil: i.recurrenceUntil ?? null,
          },
        });
      }
      if (attendeeIds.length) {
        const found = await c.db
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(
            and(
              inArray(schema.user.id, attendeeIds),
              eq(schema.user.active, true),
              isNull(schema.user.deletedAt),
            ),
          );
        if (found.length !== attendeeIds.length)
          throw new UserError("Některý z účastníků neexistuje nebo je deaktivovaný.");
      }

      const values = {
        title: i.title,
        type: i.type,
        startsAt,
        endsAt,
        allDay: i.allDay,
        location: i.location || null,
        note: i.note || null,
        resourceId: i.resourceId ?? null,
        jobId: i.jobId ?? null,
        recurrence: i.recurrence ?? null,
        recurrenceUntil: i.recurrence ? (i.recurrenceUntil ?? null) : null,
        reminderMinutes: i.reminderMinutes ?? null,
        updatedBy: actor,
      };
      let eventId = i.id;
      if (before) {
        await c.db.update(event).set(values).where(eq(event.id, before.id));
      } else {
        const [row] = await c.db
          .insert(event)
          .values({ ...values, ownerId: actor, createdBy: actor })
          .returning({ id: event.id });
        eventId = row!.id;
      }
      const previous = before
        ? (
            await c.db
              .select({ userId: eventAttendee.userId })
              .from(eventAttendee)
              .where(eq(eventAttendee.eventId, eventId!))
          ).map((a) => a.userId)
        : [];
      await c.db.delete(eventAttendee).where(eq(eventAttendee.eventId, eventId!));
      if (attendeeIds.length)
        await c.db
          .insert(eventAttendee)
          .values(attendeeIds.map((userId) => ({ eventId: eventId!, userId })));
      await recordAudit(c, {
        action: before ? "update" : "create",
        entityType: "event",
        entityId: eventId!,
        summary: `${i.title} · ${formatDate(i.startDate)}${i.allDay ? "" : ` ${i.startTime}`}`,
      });

      const when = `${formatDate(i.startDate)}${i.allDay ? "" : ` ${i.startTime}`}`;
      const moved = !!before && before.startsAt.getTime() !== startsAt.getTime();
      const invited = attendeeIds.filter((u) => !previous.includes(u));
      const kept = attendeeIds.filter((u) => previous.includes(u));
      if (invited.length) {
        const [organizer] = await c.db
          .select({ name: schema.user.name })
          .from(schema.user)
          .where(eq(schema.user.id, actor));
        await notify(c.db, KALENDAR_INVITE, {
          params: {
            title: i.title,
            when,
            location: i.location,
            organizer: organizer?.name,
          },
          to: { attendee: invited },
          record: { id: eventId! },
          actorId: actor,
        });
      }
      if (moved && kept.length && before) {
        const was = localParts(before.startsAt);
        await notify(c.db, KALENDAR_CHANGED, {
          params: {
            title: i.title,
            when,
            previous: `${formatDate(was.date)}${before.allDay ? "" : ` ${was.time}`}`,
          },
          to: { attendee: kept },
          record: { id: eventId! },
          actorId: actor,
        });
      }
      return { id: eventId! };
    });
    return res;
  },
});

export const eventDelete = defineCommand({
  name: "kalendar.event.delete",
  permission: "kalendar.write",
  input: z.object({ id }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      const [e] = await c.db
        .select()
        .from(event)
        .where(and(eq(event.id, i.id), isNull(event.deletedAt)));
      if (!e) throw new NotFoundError("Událost nenalezena.");
      if (!can(c, "kalendar.write", { ownerIds: [e.ownerId] })) throw new PermissionError();
      await c.db
        .update(event)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(event.id, i.id));
      await recordAudit(c, {
        action: "delete",
        entityType: "event",
        entityId: i.id,
        summary: e.title,
      });
      const attendees = await c.db
        .select({ userId: eventAttendee.userId })
        .from(eventAttendee)
        .where(eq(eventAttendee.eventId, i.id));
      // záznam už je smazaný, takže se upozornění nevážou na něj (politika entity by pozvaným přístup upřela)
      const was = localParts(e.startsAt);
      await notify(c.db, KALENDAR_CANCELLED, {
        params: {
          title: e.title,
          when: `${formatDate(was.date)}${e.allDay ? "" : ` ${was.time}`}`,
        },
        to: { attendee: attendees.map((a) => a.userId) },
        actorId: c.actor.userId,
      });
    }),
});

/* ---------- odběr (ICS) ---------- */

export const feedStatus = defineCommand({
  name: "kalendar.feed.status",
  permission: "kalendar.read",
  input: z.object({}),
  handler: async (ctx) => {
    const [feed] = await ctx.db
      .select({ createdAt: calendarFeed.createdAt, lastFetchAt: calendarFeed.lastFetchAt })
      .from(calendarFeed)
      .where(eq(calendarFeed.userId, me(ctx)));
    return {
      exists: !!feed,
      createdAt: feed?.createdAt ?? null,
      lastFetchAt: feed?.lastFetchAt ?? null,
    };
  },
});

/** Nový odkaz: starý přestane fungovat. Token se vrací jen tady, v databázi zůstává otisk. */
export const feedRegenerate = defineCommand({
  name: "kalendar.feed.regenerate",
  permission: "kalendar.read",
  input: z.object({}),
  handler: async (ctx, _i, deps) => {
    const userId = me(ctx);
    const token = await regenerateFeedToken(ctx.db, userId);
    await recordAudit(ctx, {
      action: "update",
      entityType: "calendar_feed",
      entityId: userId,
      summary: "Nový odkaz na odběr kalendáře",
    });
    return { url: `${deps.baseURL.replace(/\/$/, "")}/api/kalendar/feed/${token}.ics` };
  },
});

/* ---------- import cizích kalendářů ---------- */

const visibleError = <T>(fn: () => Promise<T>) =>
  fn().catch((err: unknown) => {
    throw err instanceof FetchBlockedError ? new UserError(err.message) : err;
  });

export const importList = defineCommand({
  name: "kalendar.import.list",
  permission: "kalendar.read",
  input: z.object({}),
  handler: async (ctx) =>
    ctx.db
      .select({
        id: calendarImport.id,
        name: calendarImport.name,
        lastSyncAt: calendarImport.lastSyncAt,
        lastError: calendarImport.lastError,
        eventCount: calendarImport.eventCount,
      })
      .from(calendarImport)
      .where(eq(calendarImport.userId, me(ctx)))
      .orderBy(asc(calendarImport.createdAt)),
});

export const importAdd = defineCommand({
  name: "kalendar.import.add",
  permission: "kalendar.read",
  input: z.object({
    name: z.string().trim().max(80).default(""),
    url: z.string().trim().min(1, "Vložte adresu kalendáře.").max(2000),
  }),
  handler: async (ctx, i, deps) => {
    const userId = me(ctx);
    // ověřit hned, ať uživatel ví, že adresa funguje (a ať se nic nezapíše pro adresu, kterou nesmíme stáhnout)
    await visibleError(() => fetchCalendarText(i.url));
    const [row] = await ctx.db
      .insert(calendarImport)
      .values({
        userId,
        name: i.name || "Můj kalendář",
        urlEncrypted: deps.cipher.encrypt(i.url),
      })
      .returning({ id: calendarImport.id });
    const res = await syncImport(ctx.db, deps.cipher, row!.id);
    return { id: row!.id, count: res.ok ? res.count : 0 };
  },
});

export const importSync = defineCommand({
  name: "kalendar.import.sync",
  permission: "kalendar.read",
  input: z.object({ id }),
  handler: async (ctx, i, deps) => {
    const [imp] = await ctx.db
      .select({ id: calendarImport.id })
      .from(calendarImport)
      .where(and(eq(calendarImport.id, i.id), eq(calendarImport.userId, me(ctx))));
    if (!imp) throw new NotFoundError("Import nenalezen.");
    const res = await syncImport(ctx.db, deps.cipher, i.id);
    if (!res.ok) throw new UserError(res.error);
    return { count: res.count };
  },
});

export const importDelete = defineCommand({
  name: "kalendar.import.delete",
  permission: "kalendar.read",
  input: z.object({ id }),
  handler: async (ctx, i) => {
    await ctx.db
      .delete(calendarImport)
      .where(and(eq(calendarImport.id, i.id), eq(calendarImport.userId, me(ctx))));
  },
});

export const commands = [
  range,
  options,
  eventGet,
  eventSave,
  eventDelete,
  feedStatus,
  feedRegenerate,
  importList,
  importAdd,
  importSync,
  importDelete,
];
