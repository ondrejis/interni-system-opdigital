import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
  boolean,
} from "drizzle-orm/pg-core";
import { audit, minor, pk, schema, ts } from "@rebar/core/db";
import { company, person } from "@rebar/kontakty/schema";

const { user, pipelineStage } = schema;

/** Zakázka. Číslo se přiděluje z číselné řady `zakazky.cislo` ve stejné transakci jako založení. */
export const job = pgTable(
  "job",
  {
    id: pk(),
    number: text("number").notNull(),
    title: text("title").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    personId: uuid("person_id").references(() => person.id),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStage.id),
    valueMinor: minor("value_minor").notNull().default(0),
    currency: text("currency").notNull().default("CZK"),
    address: text("address"),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    managerId: uuid("manager_id").references(() => user.id),
    description: text("description"),
    /**
     * Fáze životního cyklu (pevná v kódu, ADR 015): `inquiry`, `offer`, `preparation`, `execution`, `handover`,
     * `warranty`, `closed`; vedlejší `lost`, `paused`. Odvozuje se ze stavu pipeline (`pipeline_stage.phase`)
     * a mění ji jen přechod fáze (`beforeUpdate` entity), proto je tady zapsaná i pro filtry a řazení.
     */
    phase: text("phase").notNull().default("preparation"),
    phaseChangedAt: ts("phase_changed_at"),
    /** Fáze, ze které byla zakázka pozastavena (návrat po obnovení). */
    pausedFrom: text("paused_from"),
    lostReason: text("lost_reason"),
    wonAt: date("won_at", { mode: "string" }),
    handoverAt: date("handover_at", { mode: "string" }),
    closedAt: date("closed_at", { mode: "string" }),
    warrantyMonths: integer("warranty_months"),
    warrantyUntil: date("warranty_until", { mode: "string" }),
    color: text("color"),
    /** Poptávka, ze které zakázka vznikla (měkký odkaz, modul Poptávky je volitelný). */
    sourceInquiryId: uuid("source_inquiry_id"),
    templateId: uuid("template_id"),
    /* ---------- CRM (obchodní část zakázky ve fázích poptávka a nabídka, docs/CRM.md) ---------- */
    /** Očekávané datum uzavření obchodu (prognóza). */
    expectedCloseDate: date("expected_close_date", { mode: "string" }),
    /** Ruční přepsání pravděpodobnosti stavu v procentech (0–100); `null` = platí pravděpodobnost stavu. Změna stavu přepsání zruší. */
    crmProbabilityPct: smallint("crm_probability_pct"),
    /** Zdroj obchodu (číselník `job.source`), kanál (web, Meta, doporučení…) a kampaň. */
    crmSource: text("crm_source"),
    crmSourceChannel: text("crm_source_channel"),
    crmCampaign: text("crm_campaign"),
    /** Město stavby (filtry a prognóza podle místa). */
    siteCity: text("site_city"),
    /** Od kdy je zakázka v aktuálním stavu (z historie stavů). Počítané, ukládá se. */
    crmStageEnteredAt: ts("crm_stage_entered_at"),
    /** Počítané z aktivit (`recomputeJobCrm`): nejbližší otevřená aktivita, poslední dokončená, počty a hnití. */
    crmNextActivityAt: ts("crm_next_activity_at"),
    crmLastActivityAt: ts("crm_last_activity_at"),
    crmOpenActivities: integer("crm_open_activities").notNull().default(0),
    crmOverdueActivities: integer("crm_overdue_activities").notNull().default(0),
    crmRotting: boolean("crm_rotting").notNull().default(false),
    /** Vážená hodnota (cena × pravděpodobnost) v haléřích; ukládá se kvůli součtům v prognóze a na nástěnce. */
    crmWeightedMinor: minor("crm_weighted_minor").notNull().default(0),
    /** Archivované zakázky zmizí z nástěnky a seznamu; vrací je jen pohled Archiv. */
    crmArchivedAt: ts("crm_archived_at"),
    /** Poznámka k prohře (k důvodu z číselníku). */
    crmLostNote: text("crm_lost_note"),
    custom: jsonb("custom")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...audit(),
  },
  (t) => [
    uniqueIndex("job_number_uq").on(t.number),
    index("job_phase_idx").on(t.phase),
    index("job_company_idx").on(t.companyId),
    index("job_stage_idx").on(t.stageId),
    index("job_manager_idx").on(t.managerId),
    index("job_crm_close_idx").on(t.expectedCloseDate),
    index("job_crm_next_activity_idx").on(t.crmNextActivityAt),
    index("job_title_trgm_idx").using("gin", sql`lower(f_unaccent(${t.title})) gin_trgm_ops`),
    index("job_number_trgm_idx").using("gin", sql`lower(f_unaccent(${t.number})) gin_trgm_ops`),
    index("job_address_trgm_idx").using("gin", sql`lower(f_unaccent(${t.address})) gin_trgm_ops`),
    index("job_custom_idx").using("gin", t.custom),
  ],
);

/** Tým zakázky. Člen týmu zakázku vidí i při oprávnění „jen moje“. */
export const jobMember = pgTable(
  "job_member",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role"),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.userId] }), index("job_member_user_idx").on(t.userId)],
);

/**
 * Historie stavů zakázky: jeden řádek na pobyt ve stavu (`left_at` je prázdné u aktuálního). Zapisuje ji změna stavu
 * (`lifecycle/history.ts`); z ní se počítají dny ve stavu (pás fází), konverze a rychlost obchodu.
 */
export const jobStageHistory = pgTable(
  "job_stage_history",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStage.id),
    /** Fáze stavu v době vstupu (stav se může později přesunout do jiné fáze). */
    phase: text("phase"),
    enteredAt: ts("entered_at").notNull().defaultNow(),
    leftAt: ts("left_at"),
    changedBy: uuid("changed_by").references(() => user.id),
  },
  (t) => [
    index("job_stage_history_job_idx").on(t.jobId, t.enteredAt),
    index("job_stage_history_stage_idx").on(t.stageId),
  ],
);

/** Další lidé na zakázce kromě hlavní kontaktní osoby (investor, TDI, projektant…), s rolí na zakázce. */
export const jobParticipant = pgTable(
  "job_participant",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id),
    /** Role na zakázce (`investor`, `tdi`, `projektant`…, volný text). */
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

/* ---------- Šablony zakázek ---------- */

/** Šablona zakázky: úkoly, složky a role týmu v JSON (tvar určuje `templates` v modulu). */
export const jobTemplate = pgTable("job_template", {
  id: pk(),
  name: text("name").notNull(),
  description: text("description"),
  payload: jsonb("payload")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  ...audit(),
});
