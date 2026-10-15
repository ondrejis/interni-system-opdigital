import { sql } from "drizzle-orm";
import { date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
import { DEAL_RESULTS, DEAL_SOURCES } from "./shared";

const { user, pipelineStage } = schema;

export { DEAL_RESULTS, DEAL_SOURCES };

/**
 * Obchod (příležitost). Pipeline `deal/default`: `stage_id` je stav pipeline (atribut `status`), `result` říká, zda je
 * obchod otevřený, vyhraný, nebo prohraný. Viditelnost: kořen s vlastním zámkem. Odkazy na organizaci a kontakt jsou
 * měkké. `next_activity_at`, `last_activity_at` a `next_task_id` jsou systémová pole, která píše modul Úkoly
 * (`writeSystemFields`); `meta_leadgen_id` je idempotenční klíč Meta leadu.
 */
export const deal = pgTable(
  "deal",
  {
    id: pk(),
    title: text("title").notNull(),
    companyId: uuid("company_id"),
    personId: uuid("person_id"),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStage.id),
    stageEnteredAt: ts("stage_entered_at").notNull().defaultNow(),
    result: text("result", { enum: DEAL_RESULTS }).notNull().default("open"),
    valueMinor: minor("value_minor"),
    /** Vážená hodnota (hodnota × pravděpodobnost fáze) v haléřích; ukládá se kvůli součtům. */
    weightedMinor: minor("weighted_minor"),
    services: text("services")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    expectedCloseDate: date("expected_close_date", { mode: "string" }),
    ownerId: uuid("owner_id").references(() => user.id),
    source: text("source", { enum: DEAL_SOURCES }).notNull().default("manual"),
    sourceDetail: text("source_detail"),
    metaCampaignId: text("meta_campaign_id"),
    metaAdsetId: text("meta_adset_id"),
    metaAdId: text("meta_ad_id"),
    metaLeadgenId: text("meta_leadgen_id"),
    wonAt: ts("won_at"),
    lostAt: ts("lost_at"),
    lostReason: text("lost_reason"),
    lostNote: text("lost_note"),
    /** Kdy obchod poprvé někdo otevřel (nový Meta lead je do té doby zvýrazněný, R-42). */
    firstOpenedAt: ts("first_opened_at"),
    openedBy: uuid("opened_by").references(() => user.id),
    nextActivityAt: ts("next_activity_at"),
    lastActivityAt: ts("last_activity_at"),
    nextTaskId: uuid("next_task_id"),
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
    uniqueIndex("deal_meta_leadgen_uq")
      .on(t.metaLeadgenId)
      .where(sql`${t.metaLeadgenId} is not null`),
    index("deal_stage_idx").on(t.stageId, t.result),
    index("deal_company_idx").on(t.companyId),
    index("deal_person_idx").on(t.personId),
    index("deal_owner_idx").on(t.ownerId),
    index("deal_open_close_idx")
      .on(t.expectedCloseDate)
      .where(sql`${t.result} = 'open'`),
    index("deal_next_activity_idx")
      .on(t.nextActivityAt)
      .where(sql`${t.result} = 'open'`),
    index("deal_unopened_idx")
      .on(t.createdAt)
      .where(sql`${t.firstOpenedAt} is null and ${t.source} = 'meta'`),
    trigramIndex("deal_title_trgm_idx", t.title),
    index("deal_services_idx").using("gin", t.services),
    index("deal_tags_idx").using("gin", t.tags),
    index("deal_custom_idx").using("gin", t.custom),
    visibilityIndex("deal_private_idx", t),
  ],
);

/** Další kontakty u obchodu (kromě hlavního kontaktu). Zdědí viditelnost obchodu. */
export const dealParticipant = pgTable(
  "deal_participant",
  {
    id: pk(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deal.id),
    personId: uuid("person_id").notNull(),
    ...audit(),
  },
  (t) => [
    uniqueIndex("deal_participant_uq")
      .on(t.dealId, t.personId)
      .where(sql`${t.deletedAt} is null`),
    index("deal_participant_person_idx").on(t.personId),
  ],
);

/**
 * Historie fází obchodu: jeden řádek na pobyt ve fázi (`left_at` je prázdné u aktuální). Jen přírůstky; z ní se počítá
 * doba ve fázi, konverze a rychlost obchodu.
 */
export const dealStageHistory = pgTable(
  "deal_stage_history",
  {
    id: pk(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deal.id),
    fromStageId: uuid("from_stage_id").references(() => pipelineStage.id),
    toStageId: uuid("to_stage_id")
      .notNull()
      .references(() => pipelineStage.id),
    enteredAt: ts("entered_at").notNull().defaultNow(),
    leftAt: ts("left_at"),
    durationSec: integer("duration_sec"),
    byUserId: uuid("by_user_id").references(() => user.id),
  },
  (t) => [
    index("deal_stage_history_deal_idx").on(t.dealId, t.enteredAt),
    index("deal_stage_history_stage_idx").on(t.toStageId),
  ],
);
