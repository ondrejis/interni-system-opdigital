import { sql } from "drizzle-orm";
import { defineEntity } from "@rebar/core/entities";
import { timeEntry } from "./schema";

/**
 * Záznam odpracovaného času. Rozsah „jen moje“: vlastní záznamy. Viditelnost se dědí od zakázky a úkolu (soukromá
 * zakázka = soukromé hodiny), vlastní zámek nemá.
 */
export const timeEntryEntity = defineEntity({
  key: "time_entry",
  listPath: "/hodiny/zaznamy",
  module: "hodiny",
  label: { one: "Záznam hodin", many: "Záznamy hodin" },
  table: timeEntry,
  titleKey: "date",
  permissions: {
    read: "hodiny.read",
    write: "hodiny.write",
    create: "hodiny.write",
    delete: "hodiny.delete",
  },
  ownerColumns: [timeEntry.userId],
  scope: (ctx) => (ctx.actor.userId ? sql`${timeEntry.userId} = ${ctx.actor.userId}` : sql`false`),
  ownerDefaults: (ctx) => ({ user: ctx.actor.userId }),
  visibility: {
    parents: [
      { entityType: "job", column: "jobId" },
      { entityType: "task", column: "taskId" },
    ],
    ownLock: false,
  },
  quickFilters: [
    {
      key: "mine",
      label: "Moje",
      filter: { op: "and", conditions: [{ attr: "user", op: "is_me" }] },
    },
    {
      key: "this_week",
      label: "Tento týden",
      filter: { op: "and", conditions: [{ attr: "date", op: "in_this_week" }] },
    },
  ],
  attributes: [
    {
      key: "date",
      label: "Datum",
      type: "date",
      field: "date",
      required: true,
      width: 120,
      defaultVisible: true,
    },
    {
      key: "user",
      label: "Kdo",
      type: "user",
      field: "userId",
      required: true,
      width: 160,
      defaultVisible: true,
    },
    {
      key: "job",
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      required: true,
      width: 240,
      defaultVisible: true,
    },
    {
      key: "task",
      label: "Úkol",
      type: "record",
      field: "taskId",
      record: { entityType: "task" },
      width: 220,
      defaultVisible: true,
    },
    {
      key: "minutes",
      label: "Minuty",
      type: "number",
      field: "minutes",
      required: true,
      min: 1,
      aggregate: ["sum"],
      width: 110,
      defaultVisible: true,
    },
    {
      key: "note",
      label: "Poznámka",
      type: "longtext",
      field: "note",
      width: 300,
      defaultVisible: true,
    },
  ],
  url: (id) => `/hodiny/zaznamy/${id}`,
});

export const entities = [timeEntryEntity];
export { timeEntry };
