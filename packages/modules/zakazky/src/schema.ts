import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  audit,
  minor,
  pk,
  schema,
  trigramIndex,
  ts,
  visibilityColumns,
  visibilityIndex,
} from "@rebar/core/db";

const { user } = schema;

/** Typ zakázky = služba, kterou agentura poskytuje. */
export const JOB_TYPES = ["web", "marketing", "systemy"] as const;
/** Stav zakázky (`JobStatus` v kontraktech). */
export const JOB_STATUSES = ["planned", "active", "paused", "done", "cancelled"] as const;
/** Způsob fakturace zakázky (`hourly` je jen příznak, R-25). */
export const BILLING_MODELS = ["one_off", "intro_then_retainer", "retainer", "hourly"] as const;
/** Fáze marketingové zakázky (úvod → rozhodnutí → retainer → konec). */
export const MARKETING_STAGES = ["intro", "decision", "retainer", "ended"] as const;
/** Stav fáze zakázky. */
export const PHASE_STATUSES = ["not_started", "in_progress", "done", "skipped"] as const;
/** Zvláštní význam fáze: vyhodnocení úvodní fáze marketingu, retainer. */
export const PHASE_ROLES = ["intro_evaluation", "retainer"] as const;
/** Role člena týmu zakázky. */
export const JOB_MEMBER_ROLES = ["lead", "member"] as const;

/** Šablona úkolu: úkol vzniklý při založení zakázky ze šablony. */
export type TemplateTask = {
  phaseIndex: number;
  title: string;
  typeKey: string;
  priority: "none" | "low" | "medium" | "high" | "urgent";
  assignee: { rule: "owner" | "lead" | "user" | "none"; userId?: string };
  dueOffsetDays: number | null;
  estimateMin: number | null;
  description: string | null;
};
/** Šablona platby: platba založená se zakázkou (např. úvodní fáze 2 × 7 000 Kč). */
export type TemplatePayment = {
  description: string;
  kind: "one_off" | "intro" | "retainer" | "extra";
  amountMinor: number;
  issuer: { rule: "owner" | "other" | "user"; userId?: string };
  dueOffsetDays: number | null;
};
/** Šablona fáze zakázky; `role` označuje fázi se zvláštním významem. */
export type TemplatePhase = {
  name: string;
  role: (typeof PHASE_ROLES)[number] | null;
  offsetDays: number;
  durationDays: number;
};
/** Obsah šablony zakázky (`job_template.payload`, verze 1). */
export type JobTemplatePayload = {
  v: 1;
  phases: TemplatePhase[];
  tasks: TemplateTask[];
  payments: TemplatePayment[];
};

/**
 * Zakázka. `number` se přiděluje z řady `zakazky.cislo` (`Z-{YYYY}-{NNN}`). Viditelnost: kořen s vlastním zámkem
 * (rodiče nemá; soukromý klient do zakázek nedědí, R-31). Odkazy na organizaci, obchod a aktuální fázi jsou měkké
 * (bez cizího klíče). `drive_*` píše jen modul Disk, `marketing_stage` modul Finance přes `setMarketingStage`.
 */
export const job = pgTable(
  "job",
  {
    id: pk(),
    number: text("number").notNull(),
    title: text("title").notNull(),
    companyId: uuid("company_id").notNull(),
    type: text("type", { enum: JOB_TYPES }).notNull(),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("planned"),
    currentPhaseId: uuid("current_phase_id"),
    billingModel: text("billing_model", { enum: BILLING_MODELS }).notNull().default("one_off"),
    marketingStage: text("marketing_stage", { enum: MARKETING_STAGES }),
    ownerId: uuid("owner_id").references(() => user.id),
    startDate: date("start_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    completedAt: ts("completed_at"),
    /** Dohodnutá cena v haléřích (CZK); viz oprávnění financí. */
    priceMinor: minor("price_minor"),
    description: text("description"),
    dealId: uuid("deal_id"),
    templateId: uuid("template_id").references(() => jobTemplate.id),
    driveFolderId: text("drive_folder_id"),
    driveStatus: text("drive_status", {
      enum: ["none", "pending", "ready", "error", "timeout"],
    })
      .notNull()
      .default("none"),
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
    uniqueIndex("job_number_uq").on(t.number),
    index("job_company_idx").on(t.companyId),
    index("job_owner_idx").on(t.ownerId),
    index("job_status_idx").on(t.status, t.type),
    index("job_deal_idx")
      .on(t.dealId)
      .where(sql`${t.dealId} is not null`),
    index("job_due_idx")
      .on(t.dueDate)
      .where(sql`${t.status} in ('planned', 'active', 'paused')`),
    index("job_template_idx").on(t.templateId),
    trigramIndex("job_title_trgm_idx", t.title),
    trigramIndex("job_number_trgm_idx", t.number),
    index("job_tags_idx").using("gin", t.tags),
    index("job_custom_idx").using("gin", t.custom),
    visibilityIndex("job_private_idx", t),
  ],
);

/** Fáze zakázky (z šablony typu, upravitelné). Zdědí viditelnost zakázky (bez vlastního zámku). */
export const jobPhase = pgTable(
  "job_phase",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    role: text("role", { enum: PHASE_ROLES }),
    status: text("status", { enum: PHASE_STATUSES }).notNull().default("not_started"),
    plannedStart: date("planned_start", { mode: "string" }),
    plannedEnd: date("planned_end", { mode: "string" }),
    completedAt: ts("completed_at"),
    ...visibilityColumns(),
    ...audit(),
  },
  (t) => [
    index("job_phase_job_idx").on(t.jobId, t.position),
    index("job_phase_status_idx").on(t.status),
    visibilityIndex("job_phase_private_idx", t),
  ],
);

/** Tým zakázky: vedoucí a členové. Člen zakázku vidí i při oprávnění „jen moje“. */
export const jobMember = pgTable(
  "job_member",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role", { enum: JOB_MEMBER_ROLES }).notNull().default("member"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("job_member_uq")
      .on(t.jobId, t.userId)
      .where(sql`${t.deletedAt} is null`),
    index("job_member_user_idx").on(t.userId),
  ],
);

/** Další kontakty na zakázce (investor, TDI, projektant…) s rolí na zakázce. */
export const jobParticipant = pgTable(
  "job_participant",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    personId: uuid("person_id").notNull(),
    role: text("role"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("job_participant_uq")
      .on(t.jobId, t.personId)
      .where(sql`${t.deletedAt} is null`),
    index("job_participant_person_idx").on(t.personId),
  ],
);

/** Šablona zakázky: fáze, úkoly a platby ve verzovaném JSON (`payload`). Archivuje se, nemaže. */
export const jobTemplate = pgTable(
  "job_template",
  {
    id: pk(),
    name: text("name").notNull(),
    type: text("type", { enum: JOB_TYPES }).notNull(),
    description: text("description"),
    defaultBillingModel: text("default_billing_model", { enum: BILLING_MODELS })
      .notNull()
      .default("one_off"),
    isDefault: boolean("is_default").notNull().default(false),
    archivedAt: ts("archived_at"),
    payload: jsonb("payload")
      .$type<JobTemplatePayload>()
      .notNull()
      .default(sql`'{"v":1,"phases":[],"tasks":[],"payments":[]}'::jsonb`),
    ...audit(),
  },
  (t) => [
    index("job_template_type_idx").on(t.type),
    uniqueIndex("job_template_default_uq")
      .on(t.type)
      .where(sql`${t.isDefault} and ${t.archivedAt} is null and ${t.deletedAt} is null`),
  ],
);
