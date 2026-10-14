import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  audit,
  pk,
  schema,
  trigramIndex,
  ts,
  visibilityColumns,
  visibilityIndex,
} from "@rebar/core/db";

const { user } = schema;

/** Stav úkolu. */
export const TASK_STATUSES = ["todo", "in_progress", "done", "canceled"] as const;
/** Priorita úkolu. */
export const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
/** Druh účastníka úkolu/schůzky: uživatel systému, kontakt, nebo prosté e-mailové adresy. */
export const ATTENDEE_KINDS = ["user", "person", "email"] as const;

/** Typ úkolu (Úkol, Hovor, Schůzka, E-mail, Termín…). Systémové typy se nemažou; `is_calendar_event` zobrazí úkol v kalendáři. */
export const taskType = pgTable(
  "task_type",
  {
    id: pk(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    icon: text("icon"),
    color: text("color"),
    isCalendarEvent: boolean("is_calendar_event").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
    position: integer("position").notNull().default(0),
    ...audit(),
  },
  (t) => [
    uniqueIndex("task_type_key_uq")
      .on(t.key)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/**
 * Úkol a aktivita (hovor, schůzka, e-mail, termín jsou typy úkolu). Popis je prostý text, podúkol má jednu úroveň
 * (`parent_id`). Vazby na obchod, organizaci, kontakt, zakázku a její fázi jsou měkké (bez cizího klíče). Viditelnost:
 * dědí od obchodu, zakázky a nadřazeného úkolu a smí mít i vlastní zámek.
 */
export const task = pgTable(
  "task",
  {
    id: pk(),
    title: text("title").notNull(),
    description: text("description"),
    typeKey: text("type_key").notNull().default("task"),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("todo"),
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("none"),
    assigneeId: uuid("assignee_id").references(() => user.id),
    dueDate: date("due_date", { mode: "string" }),
    dueTime: time("due_time"),
    durationMin: integer("duration_min"),
    allDay: boolean("all_day").notNull().default(false),
    place: text("place"),
    estimateMin: integer("estimate_min"),
    outcome: text("outcome"),
    completedAt: ts("completed_at"),
    parentId: uuid("parent_id").references((): AnyPgColumn => task.id),
    dealId: uuid("deal_id"),
    companyId: uuid("company_id"),
    personId: uuid("person_id"),
    jobId: uuid("job_id"),
    jobPhaseId: uuid("job_phase_id"),
    sendInvites: boolean("send_invites").notNull().default(false),
    /** Úkol z šablony zakázky: popis původního šablonového úkolu (pořadí fáze a název), pro dohledání. */
    sourceTemplateTask: text("source_template_task"),
    ...visibilityColumns(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    custom: jsonb("custom")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...audit(),
  },
  (t) => [
    check("task_duration_chk", sql`${t.durationMin} is null or ${t.durationMin} > 0`),
    index("task_assignee_idx").on(t.assigneeId, t.status, t.dueDate),
    index("task_open_due_idx")
      .on(t.dueDate)
      .where(sql`${t.status} in ('todo', 'in_progress')`),
    index("task_completed_idx")
      .on(t.completedAt)
      .where(sql`${t.completedAt} is not null`),
    index("task_deal_idx")
      .on(t.dealId)
      .where(sql`${t.dealId} is not null`),
    index("task_company_idx")
      .on(t.companyId)
      .where(sql`${t.companyId} is not null`),
    index("task_person_idx")
      .on(t.personId)
      .where(sql`${t.personId} is not null`),
    index("task_job_idx")
      .on(t.jobId)
      .where(sql`${t.jobId} is not null`),
    index("task_job_phase_idx")
      .on(t.jobPhaseId)
      .where(sql`${t.jobPhaseId} is not null`),
    index("task_parent_idx")
      .on(t.parentId)
      .where(sql`${t.parentId} is not null`),
    index("task_created_by_idx").on(t.createdBy),
    trigramIndex("task_title_trgm_idx", t.title),
    index("task_tags_idx").using("gin", t.tags),
    index("task_custom_idx").using("gin", t.custom),
    visibilityIndex("task_private_idx", t),
  ],
);

/** Účastník úkolu nebo schůzky: uživatel (`ref` = id), kontakt (`ref` = id), nebo e-mail (`ref` = adresa). */
export const taskAttendee = pgTable(
  "task_attendee",
  {
    id: pk(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => task.id),
    kind: text("kind", { enum: ATTENDEE_KINDS }).notNull(),
    ref: text("ref").notNull(),
    ...audit(),
  },
  (t) => [
    uniqueIndex("task_attendee_uq")
      .on(t.taskId, t.kind, t.ref)
      .where(sql`${t.deletedAt} is null`),
    index("task_attendee_ref_idx").on(t.kind, t.ref),
  ],
);

export * from "./schema/notes";
