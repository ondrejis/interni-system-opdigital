import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { audit, minor, pk, schema, trigramIndex, ts } from "@rebar/core/db";

const { user } = schema;

/** Čí je reklamní účet: agentury (vlastní akvizice), nebo klienta (kampaně pro zakázku). */
export const AD_OWNER_KINDS = ["agency", "client"] as const;
/** Úroveň objektu v denních statistikách. */
export const AD_LEVELS = ["campaign", "adset", "ad"] as const;

/** Reklamní účet z Meta Ads (synchronizace stahuje jen čtení). `company_id` je měkký odkaz na klienta. */
export const adAccount = pgTable(
  "ad_account",
  {
    id: pk(),
    metaId: text("meta_id").notNull(),
    name: text("name").notNull(),
    timezone: text("timezone"),
    currency: text("currency"),
    ownerKind: text("owner_kind", { enum: AD_OWNER_KINDS }).notNull().default("agency"),
    companyId: uuid("company_id"),
    active: boolean("active").notNull().default(true),
    lastSyncAt: ts("last_sync_at"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("ad_account_meta_uq").on(t.metaId),
    index("ad_account_company_idx")
      .on(t.companyId)
      .where(sql`${t.companyId} is not null`),
    trigramIndex("ad_account_name_trgm_idx", t.name),
  ],
);

/** Kampaň reklamního účtu; `job_id` je měkký odkaz na marketingovou zakázku, ke které se kampaň vztahuje. */
export const adCampaign = pgTable(
  "ad_campaign",
  {
    id: pk(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => adAccount.id),
    metaId: text("meta_id").notNull(),
    name: text("name").notNull(),
    objective: text("objective"),
    status: text("status"),
    jobId: uuid("job_id"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("ad_campaign_meta_uq").on(t.metaId),
    index("ad_campaign_account_idx").on(t.accountId),
    index("ad_campaign_job_idx")
      .on(t.jobId)
      .where(sql`${t.jobId} is not null`),
    trigramIndex("ad_campaign_name_trgm_idx", t.name),
  ],
);

/** Sada reklam (ad set) v kampani. */
export const adSet = pgTable(
  "ad_set",
  {
    id: pk(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => adCampaign.id),
    metaId: text("meta_id").notNull(),
    name: text("name").notNull(),
    status: text("status"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("ad_set_meta_uq").on(t.metaId),
    index("ad_set_campaign_idx").on(t.campaignId),
  ],
);

/** Reklama v sadě; `creative_url` je odkaz na náhled kreativy. */
export const ad = pgTable(
  "ad",
  {
    id: pk(),
    adSetId: uuid("ad_set_id")
      .notNull()
      .references(() => adSet.id),
    metaId: text("meta_id").notNull(),
    name: text("name").notNull(),
    status: text("status"),
    creativeUrl: text("creative_url"),
    ...audit(),
  },
  (t) => [uniqueIndex("ad_meta_uq").on(t.metaId), index("ad_ad_set_idx").on(t.adSetId)],
);

/**
 * Denní statistiky objektu (kampaň, sada, reklama): útrata v haléřích, zobrazení, kliky, leady. Posledních 7 dní se při
 * synchronizaci přepisuje. Technická tabulka bez soft-delete; unikátní je `(level, object_id, date)`.
 */
export const adInsightDaily = pgTable(
  "ad_insight_daily",
  {
    id: pk(),
    date: date("date", { mode: "string" }).notNull(),
    level: text("level", { enum: AD_LEVELS }).notNull(),
    objectId: uuid("object_id").notNull(),
    spendMinor: minor("spend_minor").notNull().default(0),
    impressions: bigint("impressions", { mode: "number" }).notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    leads: integer("leads").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("ad_insight_daily_uq").on(t.level, t.objectId, t.date),
    index("ad_insight_daily_date_idx").on(t.date),
  ],
);

/**
 * Mapování Meta formuláře na pipeline obchodů: do které fáze lead padá, kdo je vlastník a jaké služby se předvyplní.
 * Příchozí leady loguje core `inbound_event`.
 */
export const leadFormMapping = pgTable(
  "lead_form_mapping",
  {
    id: pk(),
    metaFormId: text("meta_form_id").notNull(),
    name: text("name").notNull(),
    pipelineId: uuid("pipeline_id"),
    stageId: uuid("stage_id"),
    ownerId: uuid("owner_id").references(() => user.id),
    defaultServices: text("default_services")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...audit(),
  },
  (t) => [
    uniqueIndex("lead_form_mapping_form_uq")
      .on(t.metaFormId)
      .where(sql`${t.deletedAt} is null`),
  ],
);
