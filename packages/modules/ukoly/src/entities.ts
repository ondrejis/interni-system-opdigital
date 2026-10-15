import { defineEntity, type Choice } from "@rebar/core/entities";
import { todayIso } from "@rebar/core/time";
import { note, task, taskAttendee, taskType } from "./schema";
import { noteEntity } from "./notes/entity";
import { taskHooks, typeHooks } from "./tasks/hooks";
import { ownTaskScope } from "./tasks/scope";
import { OPEN_STATUSES, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "./tasks/constants";

export { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS };

const choices = <K extends string>(
  labels: Record<K, string>,
  colors: Record<K, string>,
): Choice[] =>
  (Object.keys(labels) as K[]).map((value) => ({
    value,
    label: labels[value],
    color: colors[value],
  }));

const OPEN = OPEN_STATUSES;

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
  scope: ownTaskScope,
  ownerDefaults: (ctx) => ({ assignee: ctx.actor.userId }),
  ...taskHooks,
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
      key: "parent",
      label: "Nadřazený úkol",
      type: "record",
      field: "parentId",
      record: { entityType: "task" },
      width: 200,
    },
    { key: "jobPhase", label: "Fáze zakázky", type: "text", field: "jobPhaseId", width: 160 },
    {
      key: "sendInvites",
      label: "Poslat pozvánky",
      type: "checkbox",
      field: "sendInvites",
      width: 120,
    },
    {
      key: "sourceTemplateTask",
      label: "Z šablony",
      type: "text",
      field: "sourceTemplateTask",
      width: 160,
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

/** Typ úkolu (Úkol, Hovor, Schůzka, E-mail, Termín…); správa v Nastavení přes `ukoly.types`, systémové typy se nemažou. */
export const taskTypeEntity = defineEntity({
  key: "task_type",
  listPath: "/ukoly/typy/zaznamy",
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
  ...typeHooks,
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
  url: (id) => `/ukoly/typy/zaznamy/${id}`,
});

export const entities = [taskEntity, noteEntity, taskTypeEntity];
export { task, note, taskType, noteEntity };
