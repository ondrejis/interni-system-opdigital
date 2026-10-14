import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { audit, minor, pk, schema, ts } from "@rebar/core/db";
import { company, person } from "@rebar/kontakty/schema";
import { job } from "@rebar/zakazky/schema";

const { user, pipelineStage } = schema;

/**
 * Poptávka (lead). Firma nemusí existovat (příchozí poptávka z webu má jen volný text); při převodu na zakázku
 * se firma vytvoří nebo vybere. `convertedJobId` je záměrně bez cizího klíče — poptávky nesmí záviset na modulu zakázek.
 */
export const inquiry = pgTable(
  "inquiry",
  {
    id: pk(),
    title: text("title").notNull(),
    companyId: uuid("company_id").references(() => company.id),
    personId: uuid("person_id").references(() => person.id),
    companyName: text("company_name"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStage.id),
    source: text("source"),
    /** Kanál a kampaň z UTM značek formuláře na webu (`utm_source` / `utm_medium`, `utm_campaign`); při kvalifikaci se přenesou na zakázku. */
    sourceChannel: text("source_channel"),
    campaign: text("campaign"),
    expectedValueMinor: minor("expected_value_minor").notNull().default(0),
    currency: text("currency").notNull().default("CZK"),
    ownerId: uuid("owner_id").references(() => user.id),
    nextStep: text("next_step"),
    nextStepAt: date("next_step_at", { mode: "string" }),
    lostReason: text("lost_reason"),
    convertedJobId: uuid("converted_job_id"),
    message: text("message"),
    custom: jsonb("custom")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...audit(),
  },
  (t) => [
    index("inquiry_stage_idx").on(t.stageId),
    index("inquiry_owner_idx").on(t.ownerId),
    index("inquiry_company_idx").on(t.companyId),
    index("inquiry_next_step_idx").on(t.nextStepAt),
    index("inquiry_title_trgm_idx").using("gin", sql`lower(f_unaccent(${t.title})) gin_trgm_ops`),
    index("inquiry_custom_idx").using("gin", t.custom),
  ],
);

/** Klíč příjmu poptávek (webhook, formulář na webu). Ukládá se jen hash; hodnotu klíče uvidí správce jednou. */
export const intakeKey = pgTable(
  "inquiry_intake_key",
  {
    id: pk(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    /** Prvních pár znaků klíče, aby šel v seznamu rozpoznat. */
    prefix: text("prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...audit(),
  },
  (t) => [uniqueIndex("inquiry_intake_key_hash_uq").on(t.keyHash)],
);

/** Záznam o každém příchozím požadavku (bez klíče a bez nadbytečných osobních údajů mimo to, co je v poptávce). */
export const intakeLog = pgTable(
  "inquiry_intake",
  {
    id: pk(),
    keyId: uuid("key_id").references(() => intakeKey.id),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    outcome: text("outcome").notNull(),
    inquiryId: uuid("inquiry_id").references(() => inquiry.id),
    ip: text("ip"),
    error: text("error"),
  },
  (t) => [index("inquiry_intake_received_idx").on(t.receivedAt)],
);

/* ---------- CRM nad zakázkou (docs/CRM.md): sledující, aktivity, poznámky ---------- */

/** Sledující zakázky: dostávají upozornění na změny a aktivity, i když zakázku nevedou. */
export const crmFollower = pgTable(
  "crm_follower",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.userId] }),
    index("crm_follower_user_idx").on(t.userId),
  ],
);

/** Typ aktivity (hovor, schůzka, úkol, termín, e-mail, obhlídka). Konfiguruje se; výchozí sadu zakládá seed. */
export const crmActivityType = pgTable(
  "crm_activity_type",
  {
    id: pk(),
    /** Stabilní klíč typu (`call`, `meeting`, `site_visit`…); podle něj se typ hledá v kódu a v importech. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    /** Název ikony ze sady ikon aplikace (`phone`, `users`, `map-pin`…). */
    icon: text("icon").notNull().default("circle"),
    defaultDurationMin: integer("default_duration_min"),
    position: integer("position").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...audit(),
  },
  (t) => [
    uniqueIndex("crm_activity_type_key_uq")
      .on(t.key)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/**
 * Aktivita: motor prodeje (co a kdy se má s obchodem udělat). Může se vázat na zakázku, firmu i osobu zároveň;
 * vazby jsou měkká uuid bez cizího klíče (jako jinde). Přepočet `job.crm_*` provádí `crmApi.recomputeJobCrm`.
 * Aktivita na celý den (`all_day`) má `due_at` v půlnoci pražského času.
 */
export const crmActivity = pgTable(
  "crm_activity",
  {
    id: pk(),
    typeId: uuid("type_id")
      .notNull()
      .references(() => crmActivityType.id),
    subject: text("subject").notNull(),
    dueAt: ts("due_at"),
    allDay: boolean("all_day").notNull().default(false),
    durationMin: integer("duration_min"),
    /** `low`, `normal`, `high`. */
    priority: text("priority").notNull().default("normal"),
    location: text("location"),
    note: text("note"),
    /** Výsledek po dokončení (volný text nebo klíč z konfigurace). */
    outcome: text("outcome"),
    doneAt: ts("done_at"),
    doneBy: uuid("done_by").references(() => user.id),
    assigneeId: uuid("assignee_id").references(() => user.id),
    jobId: uuid("job_id"),
    companyId: uuid("company_id"),
    personId: uuid("person_id"),
    ...audit(),
  },
  (t) => [
    index("crm_activity_job_idx").on(t.jobId),
    index("crm_activity_company_idx").on(t.companyId),
    index("crm_activity_person_idx").on(t.personId),
    index("crm_activity_assignee_due_idx").on(t.assigneeId, t.dueAt),
    index("crm_activity_due_idx").on(t.dueAt),
  ],
);

/** Poznámka u zakázky, firmy nebo osoby (polymorfní vazba), volitelně připnutá nahoru. */
export const crmNote = pgTable(
  "crm_note",
  {
    id: pk(),
    body: text("body").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    /** `job`, `company`, `person`. */
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    authorId: uuid("author_id").references(() => user.id),
    ...audit(),
  },
  (t) => [index("crm_note_entity_idx").on(t.entityType, t.entityId)],
);
