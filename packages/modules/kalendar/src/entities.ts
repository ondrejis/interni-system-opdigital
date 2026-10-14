import { and, eq, isNull, or, sql } from "drizzle-orm";
import { defineEntity } from "@rebar/core/entities";
import { UserError } from "@rebar/core/rbac";
import { EVENT_TYPES, RESOURCE_KINDS } from "./catalog";
import { calendarResource, event, eventAttendee } from "./schema";

/**
 * Událost. Čas, opakování a účastníky mění jen kalendář (hlídá kolize zdrojů a posílá pozvánky),
 * v seznamu jde upravit název, typ, místo a poznámku. Rozsah „jen moje“ = vlastník nebo účastník.
 */
export const eventEntity = defineEntity({
  key: "event",
  listPath: "/kalendar/udalosti",
  module: "kalendar",
  label: { one: "Událost", many: "Události" },
  table: event,
  titleKey: "title",
  permissions: { read: "kalendar.read", write: "kalendar.write" },
  noCreate: "Událost vytvoříte v kalendáři tlačítkem „Nová událost“.",
  scope: (ctx) => {
    const me = ctx.actor.userId;
    if (!me) return sql`false`;
    return or(
      eq(event.ownerId, me),
      sql`exists (select 1 from ${eventAttendee} where ${eventAttendee.eventId} = ${event.id} and ${eventAttendee.userId} = ${me})`,
    )!;
  },
  owners: async (db, id) => {
    const [row] = await db
      .select({ owner: event.ownerId })
      .from(event)
      .where(and(eq(event.id, id), isNull(event.deletedAt)));
    if (!row) return null;
    const attendees = await db
      .select({ userId: eventAttendee.userId })
      .from(eventAttendee)
      .where(eq(eventAttendee.eventId, id));
    return [row.owner, ...attendees.map((a) => a.userId)];
  },
  attributes: [
    {
      key: "title",
      label: "Název",
      type: "text",
      field: "title",
      required: true,
      width: 280,
      defaultVisible: true,
    },
    {
      key: "type",
      label: "Typ",
      type: "select",
      field: "type",
      choices: EVENT_TYPES.map((t) => ({ value: t.value, label: t.label, color: t.color })),
      width: 170,
      defaultVisible: true,
    },
    {
      key: "startsAt",
      label: "Začátek",
      type: "date",
      field: "startsAt",
      readonly: true,
      width: 130,
      defaultVisible: true,
    },
    {
      key: "owner",
      label: "Vlastník",
      type: "user",
      field: "ownerId",
      readonly: true,
      width: 170,
      defaultVisible: true,
    },
    {
      key: "resource",
      label: "Zdroj",
      type: "record",
      field: "resourceId",
      record: { entityType: "calendar_resource" },
      readonly: true,
      width: 170,
      defaultVisible: true,
    },
    {
      key: "job",
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      readonly: true,
      width: 220,
      defaultVisible: true,
    },
    { key: "location", label: "Místo", type: "text", field: "location", width: 200 },
    {
      key: "allDay",
      label: "Celý den",
      type: "checkbox",
      field: "allDay",
      readonly: true,
      width: 100,
    },
    {
      key: "recurrence",
      label: "Opakování",
      type: "select",
      field: "recurrence",
      readonly: true,
      choices: [
        { value: "daily", label: "Každý den" },
        { value: "weekdays", label: "Každý pracovní den" },
        { value: "weekly", label: "Každý týden" },
        { value: "monthly", label: "Každý měsíc" },
      ],
      width: 160,
    },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 280 },
  ],
  search: (r) => ({ title: String(r.title) }),
  url: () => "/kalendar",
});

export const resourceEntity = defineEntity({
  key: "calendar_resource",
  listPath: "/kalendar/zdroje",
  module: "kalendar",
  label: { one: "Zdroj", many: "Zdroje" },
  table: calendarResource,
  titleKey: "name",
  permissions: { read: "kalendar.read", write: "kalendar.resources" },
  beforeDelete: async (ctx, raw) => {
    const [r] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(event)
      .where(and(eq(event.resourceId, String(raw.id)), isNull(event.deletedAt)));
    if (r?.n)
      throw new UserError(
        "Zdroj mají obsazený události. Vyřaďte ho (Aktivní: ne) nebo události zrušte.",
      );
  },
  attributes: [
    {
      key: "name",
      label: "Název",
      type: "text",
      field: "name",
      required: true,
      width: 260,
      defaultVisible: true,
    },
    {
      key: "kind",
      label: "Druh",
      type: "select",
      field: "kind",
      required: true,
      default: "room",
      choices: RESOURCE_KINDS.map((k) => ({ value: k.value, label: k.label })),
      width: 150,
      defaultVisible: true,
    },
    {
      key: "active",
      label: "Aktivní",
      type: "checkbox",
      field: "active",
      width: 100,
      defaultVisible: true,
    },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 280 },
  ],
  search: (r) => ({ title: String(r.name) }),
  url: (id) => `/kalendar/zdroje/${id}`,
});

export const entities = [eventEntity, resourceEntity];
export { EVENT_TYPES, EVENT_TYPE_VALUES, RESOURCE_KINDS } from "./catalog";
