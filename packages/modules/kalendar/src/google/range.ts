import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { schema } from "@rebar/core/db";
import { visibleRecordTitles } from "@rebar/core/entities";
import type { CalendarItem, ModuleDeps } from "@rebar/core/module-server";
import { canSeePrivate, scopeOf, UserError, type Ctx } from "@rebar/core/rbac";
import { addDaysIso, czechHolidays, diffDaysIso, localParts, zonedToUtc } from "@rebar/core/time";
import {
  BUSY_TITLE,
  CALENDAR_TIME_ZONE,
  MAX_RANGE_DAYS,
  type CalendarItemDto,
  type LayerMetaDto,
  type RangeResult,
} from "../contract";
import { calendar, calendarAccount, calendarEvent } from "../schema";
import type { KalEnv } from "./env";

/*
  Čtení kalendáře: události z Googlu (zrcadlo) projektované pro toho, kdo se dívá, plus vrstvy ostatních modulů a
  svátky. Pravidlo „Obsazeno“: cizí událost, která je v Googlu soukromá (nebo patří k soukromému úkolu, který divák
  nesmí vidět), se ukáže jen jako čas a text „Obsazeno“, bez názvu, místa, účastníků, odkazů a vazeb.
*/

/** Klíč vrstvy, kterou kalendář nabízí ostatním (jeho vlastní události bez vrstev jiných modulů). */
export const OWN_LAYER_KEY = "kalendar";

/** Řádek zrcadla události s kalendářem a majitelem účtu. */
export type Row = {
  event: typeof calendarEvent.$inferSelect;
  calendar: typeof calendar.$inferSelect;
  ownerId: string;
  ownerName: string;
};

/** Kdo se dívá a co smí. */
export type Viewer = {
  userId: string | null;
  canWrite: boolean;
  writeAll: boolean;
  canSeePrivate: boolean;
};

/** Názvy záznamů, které divák smí vidět (co v mapě chybí, se v položce nezobrazí). */
export type LinkTitles = {
  deal: Record<string, string>;
  company: Record<string, string>;
  person: Record<string, string>;
};

const localIso = (d: Date) => {
  const p = localParts(d, CALENDAR_TIME_ZONE);
  return `${p.date}T${p.time}`;
};

/** Položka kalendáře z řádku zrcadla pro daného diváka (čistá funkce; pravidlo „Obsazeno“). */
export function projectEvent(
  r: Row,
  viewer: Viewer,
  ctx: { taskPrivate: boolean; titles: LinkTitles },
): CalendarItemDto {
  const e = r.event;
  const own = r.ownerId === viewer.userId;
  const busy = !own && (e.isGooglePrivate || (ctx.taskPrivate && !viewer.canSeePrivate));
  const start = e.allDay ? localParts(e.startsAt, CALENDAR_TIME_ZONE).date : localIso(e.startsAt);
  const lastDay = localParts(
    new Date(Math.max(e.startsAt.getTime(), e.endsAt.getTime() - 1)),
    CALENDAR_TIME_ZONE,
  ).date;
  const end = e.allDay ? lastDay : localIso(e.endsAt);
  const base = {
    id: e.id,
    layer: null,
    start,
    end,
    allDay: e.allDay,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    href: null,
    calendarId: r.calendar.id,
    calendarName: r.calendar.name,
    owner: r.ownerName,
    ownerId: r.ownerId,
    own,
    recurring: !!e.recurringEventId,
  };
  if (busy)
    return {
      ...base,
      kind: "busy",
      title: BUSY_TITLE,
      color: "gray",
      eventId: null,
      taskId: null,
      location: null,
      meetUrl: null,
      description: null,
      attendees: [],
      canEdit: false,
      source: null,
      deal: null,
      company: null,
      person: null,
      htmlLink: null,
    };
  const writable = r.calendar.accessRole === "owner" || r.calendar.accessRole === "writer";
  const link = (id: string | null, titles: Record<string, string>) =>
    id && titles[id] !== undefined ? { id, title: titles[id]! } : null;
  return {
    ...base,
    kind: "event",
    title: e.title ?? "(bez názvu)",
    color: r.calendar.color ?? "blue",
    eventId: e.id,
    taskId: e.taskId,
    location: e.place,
    meetUrl: e.meetUrl,
    description: own ? e.description : null,
    attendees: e.attendees,
    canEdit: viewer.canWrite && writable && (own || viewer.writeAll),
    source: e.source,
    deal: link(e.dealId, ctx.titles.deal),
    company: link(e.companyId, ctx.titles.company),
    person: link(e.personId, ctx.titles.person),
    htmlLink: own ? e.htmlLink : null,
  };
}

/** Co smí divák (podle oprávnění `kalendar.write` a `private.read`). */
export const viewerOf = (ctx: Ctx): Viewer => ({
  userId: ctx.actor.userId,
  canWrite: scopeOf(ctx, "kalendar.write") !== undefined,
  writeAll: scopeOf(ctx, "kalendar.write") === "all",
  canSeePrivate: canSeePrivate(ctx),
});

/** Řádky zrcadla pro diváka v okně (viditelné kalendáře živých účtů; `userIds` = jen tito majitelé). */
async function queryRows(
  ctx: Ctx,
  where: { from: Date; to: Date; userIds?: string[] },
): Promise<Row[]> {
  const rows = await ctx.db
    .select({
      event: calendarEvent,
      calendar,
      ownerId: calendarAccount.userId,
      ownerName: schema.user.name,
    })
    .from(calendarEvent)
    .innerJoin(calendar, eq(calendar.id, calendarEvent.calendarId))
    .innerJoin(calendarAccount, eq(calendarAccount.id, calendar.accountId))
    .innerJoin(schema.user, eq(schema.user.id, calendarAccount.userId))
    .where(
      and(
        isNull(calendar.deletedAt),
        isNull(calendarAccount.deletedAt),
        eq(calendar.visible, true),
        eq(calendarEvent.remoteDeleted, false),
        lt(calendarEvent.startsAt, where.to),
        gt(calendarEvent.endsAt, where.from),
        where.userIds ? inArray(calendarAccount.userId, where.userIds) : undefined,
      ),
    )
    .orderBy(calendarEvent.startsAt)
    .limit(3000);
  return rows;
}

/** Úkoly (podle id), které jsou soukromé (tabulka `private_record`). */
async function privateTaskIds(ctx: Ctx, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await ctx.db
    .select({ id: schema.privateRecord.entityId })
    .from(schema.privateRecord)
    .where(
      and(eq(schema.privateRecord.entityType, "task"), inArray(schema.privateRecord.entityId, ids)),
    );
  return new Set(rows.map((r) => r.id));
}

/** Názvy záznamů, na které události odkazují a které divák smí vidět. */
export async function loadLinkTitles(
  ctx: Ctx,
  env: Pick<KalEnv, "registry">,
  rows: Row[],
): Promise<LinkTitles> {
  const pick = (k: "dealId" | "companyId" | "personId") => [
    ...new Set(rows.map((r) => r.event[k]).filter((v): v is string => !!v)),
  ];
  const [deal, company, person] = await Promise.all([
    visibleRecordTitles(ctx, env.registry, "deal", pick("dealId")),
    visibleRecordTitles(ctx, env.registry, "company", pick("companyId")),
    visibleRecordTitles(ctx, env.registry, "person", pick("personId")),
  ]);
  return { deal, company, person };
}

/** Projekce řádků pro diváka: zjistí soukromé úkoly a názvy vazeb. */
export async function projectRows(
  ctx: Ctx,
  env: Pick<KalEnv, "registry">,
  rows: Row[],
): Promise<CalendarItemDto[]> {
  const viewer = viewerOf(ctx);
  const foreign = rows.filter((r) => r.ownerId !== viewer.userId);
  const privTasks = await privateTaskIds(
    ctx,
    foreign.map((r) => r.event.taskId).filter((v): v is string => !!v),
  );
  const titles = await loadLinkTitles(ctx, env, rows);
  return rows.map((r) =>
    projectEvent(r, viewer, {
      taskPrivate: !!r.event.taskId && privTasks.has(r.event.taskId),
      titles,
    }),
  );
}

/** Události navázané na obchod, organizaci nebo kontakt (nejnovější první). */
export async function eventsForRecord(
  ctx: Ctx,
  env: Pick<KalEnv, "registry">,
  q: {
    dealId?: string | undefined;
    companyId?: string | undefined;
    personId?: string | undefined;
    limit?: number | undefined;
  },
): Promise<CalendarItemDto[]> {
  const viewer = viewerOf(ctx);
  const match = q.dealId
    ? eq(calendarEvent.dealId, q.dealId)
    : q.companyId
      ? eq(calendarEvent.companyId, q.companyId)
      : eq(calendarEvent.personId, q.personId ?? "00000000-0000-0000-0000-000000000000");
  const rows = await ctx.db
    .select({
      event: calendarEvent,
      calendar,
      ownerId: calendarAccount.userId,
      ownerName: schema.user.name,
    })
    .from(calendarEvent)
    .innerJoin(calendar, eq(calendar.id, calendarEvent.calendarId))
    .innerJoin(calendarAccount, eq(calendarAccount.id, calendar.accountId))
    .innerJoin(schema.user, eq(schema.user.id, calendarAccount.userId))
    .where(
      and(
        isNull(calendar.deletedAt),
        isNull(calendarAccount.deletedAt),
        eq(calendarEvent.remoteDeleted, false),
        match,
        scopeOf(ctx, "kalendar.read") === "all"
          ? undefined
          : eq(calendarAccount.userId, viewer.userId ?? ""),
      ),
    )
    .orderBy(sql`${calendarEvent.startsAt} desc`)
    .limit(q.limit ?? 50);
  return (await projectRows(ctx, env, rows)).filter((i) => i.kind === "event");
}

/** Položky vrstvy z cizích modulů převedené na položky kalendáře. */
function layerItem(layer: { key: string; color: string }, it: CalendarItem): CalendarItemDto {
  const allDay = it.allDay;
  return {
    id: `${layer.key}:${it.id}`,
    kind: "layer",
    layer: layer.key,
    title: it.title,
    start: allDay ? it.start.slice(0, 10) : it.start.slice(0, 16),
    end: allDay ? (it.end ?? it.start).slice(0, 10) : (it.end ?? it.start).slice(0, 16),
    allDay,
    startsAt: null,
    endsAt: null,
    color: it.color ?? layer.color,
    href: it.href ?? null,
    eventId: null,
    taskId: null,
    location: null,
    meetUrl: null,
    description: null,
    calendarId: null,
    calendarName: null,
    owner: null,
    ownerId: null,
    own: false,
    attendees: [],
    recurring: false,
    canEdit: false,
    source: null,
    deal: null,
    company: null,
    person: null,
    htmlLink: null,
  };
}

/** `kalendar.range`: události (moje, případně i ostatních), vrstvy ostatních modulů a svátky. */
export async function rangeItems(
  ctx: Ctx,
  deps: ModuleDeps,
  i: { from: string; to: string; who: "me" | "all"; layers?: string[] | undefined },
): Promise<RangeResult> {
  if (i.to < i.from) throw new UserError("Konec období je před začátkem.");
  if (diffDaysIso(i.from, i.to) > MAX_RANGE_DAYS) throw new UserError("Období je příliš dlouhé.");
  const viewer = viewerOf(ctx);
  const canSeeAll = scopeOf(ctx, "kalendar.read") === "all";
  const from = zonedToUtc(i.from, "00:00", CALENDAR_TIME_ZONE);
  const to = zonedToUtc(addDaysIso(i.to, 1), "00:00", CALENDAR_TIME_ZONE);
  const all = canSeeAll && i.who === "all";
  const rows = await queryRows(ctx, {
    from,
    to,
    ...(all ? {} : { userIds: [viewer.userId ?? ""] }),
  });
  const items = await projectRows(ctx, deps, rows);

  const [mine] = await ctx.db
    .select({ id: calendarAccount.id })
    .from(calendarAccount)
    .where(and(eq(calendarAccount.userId, viewer.userId ?? ""), isNull(calendarAccount.deletedAt)));

  // úkoly, které už jsou v kalendáři jako události (zapsané do Googlu), se z vrstvy úkolů nezobrazují podruhé
  const shownTasks = new Set(items.filter((x) => x.taskId).map((x) => x.taskId!));
  const wanted = i.layers ? new Set(i.layers) : null;
  const layerMeta: LayerMetaDto[] = [];
  for (const layer of deps.calendarLayers) {
    if (layer.key === OWN_LAYER_KEY) continue;
    layerMeta.push({ key: layer.key, label: layer.label, color: layer.color });
    if (wanted && !wanted.has(layer.key)) continue;
    try {
      for (const it of await layer.items(ctx, { from: i.from, to: i.to }, deps)) {
        const m = /^task:([0-9a-f-]{36})$/i.exec(it.id);
        if (m && shownTasks.has(m[1]!.toLowerCase())) continue;
        items.push(layerItem(layer, it));
      }
    } catch {
      // jedna rozbitá vrstva nesmí shodit celý kalendář
    }
  }
  for (let y = Number(i.from.slice(0, 4)); y <= Number(i.to.slice(0, 4)); y++)
    for (const [date, name] of czechHolidays(y))
      if (date >= i.from && date <= i.to)
        items.push({
          ...layerItem(
            { key: "holiday", color: "red" },
            { id: date, layer: "holiday", title: name, start: date, end: date, allDay: true },
          ),
          id: `holiday:${date}`,
          kind: "holiday",
          layer: "holiday",
        });
  items.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, "cs"));
  return { items, layers: layerMeta, canWrite: viewer.canWrite, canSeeAll, connected: !!mine };
}

/** Vrstva „Kalendář“ (Google události přihlášeného uživatele) pro ostatní konzumenty `calendarLayers`. */
export const calendarLayer = {
  key: OWN_LAYER_KEY,
  label: "Kalendář (Google)",
  color: "blue",
  async items(
    ctx: Ctx,
    range: { from: string; to: string },
    deps: { registry: KalEnv["registry"] },
  ): Promise<CalendarItem[]> {
    if (!ctx.actor.userId) return [];
    const rows = await queryRows(ctx, {
      from: zonedToUtc(range.from.slice(0, 10), "00:00", CALENDAR_TIME_ZONE),
      to: zonedToUtc(addDaysIso(range.to.slice(0, 10), 1), "00:00", CALENDAR_TIME_ZONE),
      userIds: [ctx.actor.userId],
    });
    return (await projectRows(ctx, deps, rows))
      .filter((x) => x.kind === "event")
      .map((x) => ({
        id: x.id,
        layer: OWN_LAYER_KEY,
        title: x.title,
        start: x.start,
        end: x.end,
        allDay: x.allDay,
        color: x.color,
      }));
  },
};

export { queryRows };
