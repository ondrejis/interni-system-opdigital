import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pk, ts } from "../columns";
import { audit } from "./common";
import { user } from "./identity";

/*
  Integrace s vnějším světem (D §5.3, C2): odchozí webhooky pro n8n, příchozí události (ingest) a šifrovaná tajemství
  poskytovatelů. Tajemství jsou vždy zašifrovaná (`security/crypto`), nikdy v otevřené podobě.
*/

/** Odchozí webhook: adresa (n8n), tajemství pro podpis HMAC a odebírané události. */
export const webhookEndpoint = pgTable(
  "webhook_endpoint",
  {
    id: pk(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    /** Tajemství podpisu `X-Opsys-Signature`, zašifrované. */
    secretEnc: text("secret_enc").notNull(),
    /** Názvy odebíraných událostí z `WEBHOOK_EVENTS` (`deal.won`, `drive.*`…). */
    events: text("events")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Doručovat i události soukromých záznamů (jinak se soukromé tomuto endpointu nikdy neodešlou). */
    includePrivate: boolean("include_private").notNull().default(false),
    active: boolean("active").notNull().default(true),
    ...audit(),
  },
  (t) => [index("webhook_endpoint_active_idx").on(t.active)],
);

/** Doručení jedné události jednomu endpointu: zároveň fronta (outbox) a protokol (5 pokusů, 1 min až 1 h). */
export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: pk(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoint.id, { onDelete: "cascade" }),
    /** ID doménové události (`X-Opsys-Delivery` nese ID doručení, ne události). */
    eventId: uuid("event_id").notNull(),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["pending", "delivered", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lastError: text("last_error"),
    deliveredAt: ts("delivered_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_delivery_event_uq").on(t.endpointId, t.eventId),
    index("webhook_delivery_due_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'pending'`),
    index("webhook_delivery_failed_idx")
      .on(t.createdAt)
      .where(sql`${t.status} = 'failed'`),
  ],
);

/**
 * Příchozí událost z `/api/ingest/<source>` (Drive callback, Meta leady). Idempotence: dvojice (`source`, `external_id`)
 * je unikátní, opakované doručení se nezpracuje podruhé; chyba zůstane ve stavu `failed` s důvodem.
 */
export const inboundEvent = pgTable(
  "inbound_event",
  {
    id: pk(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["received", "processed", "failed"] })
      .notNull()
      .default("received"),
    error: text("error"),
    /** Záznam, který zpracování vytvořilo nebo změnilo. */
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    receivedAt: ts("received_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
  },
  (t) => [
    uniqueIndex("inbound_event_uq").on(t.source, t.externalId),
    index("inbound_event_status_idx").on(t.status, t.receivedAt),
  ],
);

/** Poskytovatelé s uloženými tajemstvími (přístupové tokeny, klíče). */
export const INTEGRATION_PROVIDERS = ["google", "meta", "fakturoid"] as const;
/** Poskytovatel integrace s uloženými tajemstvími (viz `INTEGRATION_PROVIDERS`). */
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

/**
 * Šifrovaná přihlašovací data poskytovatele (Meta token, Fakturoid klíč…). `user_id` je prázdné u společných
 * přístupů agentury; jinak patří uživateli (osobní propojení). Obsah je zašifrovaný přes `cipher` (`data_enc`).
 */
export const integrationCredential = pgTable(
  "integration_credential",
  {
    id: pk(),
    provider: text("provider", { enum: INTEGRATION_PROVIDERS }).notNull(),
    userId: uuid("user_id").references(() => user.id),
    dataEnc: text("data_enc").notNull(),
    status: text("status", { enum: ["ok", "reauth", "error"] })
      .notNull()
      .default("ok"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("integration_credential_shared_uq")
      .on(t.provider)
      .where(sql`${t.userId} is null and ${t.deletedAt} is null`),
    uniqueIndex("integration_credential_user_uq")
      .on(t.provider, t.userId)
      .where(sql`${t.userId} is not null and ${t.deletedAt} is null`),
  ],
);
