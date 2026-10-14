import { eq, or, sql } from "drizzle-orm";
import { defineEntity, type Choice } from "@rebar/core/entities";
import { todayIso } from "@rebar/core/time";
import {
  type TASK_PRIORITIES,
  type TASK_STATUSES,
  note,
  task,
  taskAttendee,
  taskType,
} from "./schema";

/** Popisky stavů úkolu. */
export const TASK_STATUS_LABELS: Record<(typeof TASK_STATUSES)[number], string> = {
  todo: "K udělání",
  in_progress: "Rozpracovaný",
  done: "Hotovo",
  canceled: "Zrušeno",
};
/** Popisky priorit úkolu. */
export const TASK_PRIORITY_LABELS: Record<(typeof TASK_PRIORITIES)[number], string> = {
  none: "Bez priority",
  low: "Nízká",
  medium: "Střední",
  high: "Vysoká",
  urgent: "Urgentní",
};

const choices = <K extends string>(
  labels: Record<K, string>,
  colors: Record<K, string>,
): Choice[] =>
  (Object.keys(labels) as K[]).map((value) => ({
    value,
    label: labels[value],
    color: colors[value],
  }));

const OPEN = ["todo", "in_progress"] as const;

/**
 * Úkol a aktivita (hovor, schůzka, e-mail, termín jsou typy). Rozsah „jen moje“: přidělený nebo vlastní. Výsledek
 * a dokončení řeší příkaz `complete`; vazby jsou měkké (obchod, organizace, kontakt, zakázka, fáze).
 */
export const taskEntity = defineEntity({
  key: "task",
  listPath: "/ukoly/vse",
  module: "ukoly",
  label: { one: "Úkol", many: "Úkoly" },
  table: task,
  titleKey: "title",
  permissions: {
    read: "ukoly.read",
    write: "ukoly.write",
    create: "ukoly.create",
    delete: "ukoly.delete",
  },
  ownerColumns: [task.assigneeId, task.createdBy],
  scope: (ctx) => {
    const me = ctx.actor.userId;
    if (!me) return sql`false`;
    return or(eq(task.assigneeId, me), eq(task.createdBy, me))!;
  },
  ownerDefaults: (ctx) => ({ assignee: ctx.actor.userId }),
  visibility: {
    parents: [
      { entityType: "deal", column: "dealId" },
      { entityType: "job", column: "jobId" },
      { entityType: "task", column: "parentId" },
    ],
    ownLock: true,
  },
  children: [
    { entityType: "task", column: "parentId" },
    { entityType: "task_attendee", column: "taskId", table: taskAttendee },
  ],
  quickFilters: [
    {
      key: "mine",
      label: "Moje",
      filter: {
        op: "and",
        conditions: [
          { attr: "assignee", op: "is_me" },
          { attr: "status", op: "is_any_of", value: [...OPEN] },
        ],
      },
    },
    {
      key: "today",
      label: "Dnes",
      filter: () => ({
        op: "and",
        conditions: [
          { attr: "dueDate", op: "eq", value: todayIso() },
          { attr: "status", op: "is_any_of", value: [...OPEN] },
        ],
      }),
    },
    {
      key: "overdue",
      label: "Po termínu",
      filter: () => ({
        op: "and",
        conditions: [
          { attr: "dueDate", op: "before", value: todayIso() },
          { attr: "status", op: "is_any_of", value: [...OPEN] },
        ],
      }),
    },
  ],
  attributes: [
    {
      key: "title",
      label: "Název",
      type: "text",
      field: "title",
      required: true,
      width: 320,
      defaultVisible: true,
    },
    {
      key: "type",
      label: "Typ",
      type: "text",
      field: "typeKey",
      default: "task",
      width: 110,
      defaultVisible: true,
    },
    {
      key: "status",
      label: "Stav",
      type: "select",
      field: "status",
      choices: choices(TASK_STATUS_LABELS, {
        todo: "gray",
        in_progress: "blue",
        done: "green",
        canceled: "red",
      }),
      default: "todo",
      width: 130,
      defaultVisible: true,
    },
    {
      key: "priority",
      label: "Priorita",
      type: "select",
      field: "priority",
      choices: choices(TASK_PRIORITY_LABELS, {
        none: "gray",
        low: "blue",
        medium: "yellow",
        high: "orange",
        urgent: "red",
      }),
      default: "none",
      width: 130,
      defaultVisible: true,
    },
    {
      key: "assignee",
      label: "Řešitel",
      type: "user",
      field: "assigneeId",
      width: 160,
      defaultVisible: true,
    },
    {
      key: "dueDate",
      label: "Termín",
      type: "date",
      field: "dueDate",
      width: 120,
      defaultVisible: true,
    },
    { key: "dueTime", label: "Čas", type: "text", field: "dueTime", width: 90 },
    {
      key: "durationMin",
      label: "Délka (min)",
      type: "number",
      field: "durationMin",
      min: 1,
      width: 110,
    },
    { key: "allDay", label: "Celý den", type: "checkbox", field: "allDay", width: 100 },
    { key: "place", label: "Místo", type: "text", field: "place", width: 180 },
    {
      key: "deal",
      label: "Obchod",
      type: "record",
      field: "dealId",
      record: { entityType: "deal" },
      width: 200,
      defaultVisible: true,
    },
    {
      key: "company",
      label: "Organizace",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      width: 200,
    },
    {
      key: "person",
      label: "Kontakt",
      type: "record",
      field: "personId",
      record: { entityType: "person" },
      width: 200,
    },
    {
      key: "job",
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      width: 200,
      defaultVisible: true,
    },
    {
      key: "estimateMin",
      label: "Odhad (min)",
      type: "number",
      field: "estimateMin",
      min: 0,
      width: 120,
    },
    { key: "description", label: "Popis", type: "longtext", field: "description", width: 300 },
    { key: "outcome", label: "Výsledek", type: "longtext", field: "outcome", width: 260 },
    {
      key: "completedAt",
      label: "Dokončeno",
      type: "date",
      field: "completedAt",
      readonly: true,
      width: 130,
    },
    {
      key: "tags",
      label: "Štítky",
      type: "multiselect",
      field: "tags",
      lookup: "tag",
      lookupScope: "task",
      width: 200,
    },
  ],
  search: (r) => ({ title: String(r.title), ...(r.place ? { subtitle: String(r.place) } : {}) }),
  url: (id) => `/ukoly/vse/${id}`,
});

/**
 * Poznámka s formátovaným textem. Bez položky v navigaci (R-23): otevírá se z karty, paletou a z Můj prostor → Soukromé.
 * Rozsah „jen moje“: vlastní poznámky.
 */
export const noteEntity = defineEntity({
  key: "note",
  listPath: "/poznamky",
  module: "ukoly",
  label: { one: "Poznámka", many: "Poznámky" },
  table: note,
  titleKey: "title",
  permissions: {
    read: "ukoly.read",
    write: "ukoly.write",
    create: "ukoly.create",
    delete: "ukoly.delete",
  },
  ownerColumns: [note.createdBy],
  visibility: {
    parents: [
      { entityType: "deal", column: "dealId" },
      { entityType: "job", column: "jobId" },
    ],
    ownLock: true,
  },
  quickFilters: [
    {
      key: "pinned",
      label: "Připnuté",
      filter: { op: "and", conditions: [{ attr: "pinned", op: "is_true" }] },
    },
  ],
  attributes: [
    {
      key: "title",
      label: "Název",
      type: "text",
      field: "title",
      width: 280,
      defaultVisible: true,
    },
    {
      key: "pinned",
      label: "Připnuto",
      type: "checkbox",
      field: "pinned",
      width: 100,
      defaultVisible: true,
    },
    {
      key: "deal",
      label: "Obchod",
      type: "record",
      field: "dealId",
      record: { entityType: "deal" },
      width: 200,
      defaultVisible: true,
    },
    {
      key: "company",
      label: "Organizace",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      width: 200,
      defaultVisible: true,
    },
    {
      key: "person",
      label: "Kontakt",
      type: "record",
      field: "personId",
      record: { entityType: "person" },
      width: 200,
    },
    {
      key: "job",
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      width: 200,
    },
    {
      key: "tags",
      label: "Štítky",
      type: "multiselect",
      field: "tags",
      lookup: "tag",
      lookupScope: "note",
      width: 200,
    },
  ],
  search: (r) => ({
    title: String(r.title || "Poznámka"),
    extra: String(r.bodyText ?? "").slice(0, 2000),
  }),
  url: (id) => `/poznamky/${id}`,
});

/** Typ úkolu (Úkol, Hovor, Schůzka, E-mail, Termín…); správa v Nastavení přes `ukoly.types`, systémové typy se nemažou. */
export const taskTypeEntity = defineEntity({
  key: "task_type",
  listPath: "/ukoly/typy",
  module: "ukoly",
  label: { one: "Typ úkolu", many: "Typy úkolů" },
  table: taskType,
  titleKey: "name",
  permissions: {
    read: "ukoly.read",
    write: "ukoly.types",
    create: "ukoly.types",
    delete: "ukoly.types",
  },
  attributes: [
    {
      key: "name",
      label: "Název",
      type: "text",
      field: "name",
      required: true,
      width: 220,
      defaultVisible: true,
    },
    {
      key: "key",
      label: "Klíč",
      type: "text",
      field: "key",
      required: true,
      width: 140,
      defaultVisible: true,
    },
    { key: "icon", label: "Ikona", type: "text", field: "icon", width: 120, defaultVisible: true },
    {
      key: "color",
      label: "Barva",
      type: "text",
      field: "color",
      width: 110,
      defaultVisible: true,
    },
    {
      key: "isCalendarEvent",
      label: "Událost v kalendáři",
      type: "checkbox",
      field: "isCalendarEvent",
      width: 150,
      defaultVisible: true,
    },
    {
      key: "isSystem",
      label: "Systémový",
      type: "checkbox",
      field: "isSystem",
      readonly: true,
      width: 110,
    },
    {
      key: "position",
      label: "Pořadí",
      type: "number",
      field: "position",
      width: 90,
      defaultVisible: true,
    },
  ],
  search: (r) => ({ title: String(r.name), extra: String(r.key) }),
  url: (id) => `/ukoly/typy/${id}`,
});

export const entities = [taskEntity, noteEntity, taskTypeEntity];
export { task, note, taskType };
