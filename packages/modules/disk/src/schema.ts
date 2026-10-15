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
import { audit, pk, schema, ts } from "@rebar/core/db";

const { user } = schema;

/** Stav požadavku na založení nebo úpravu složky (fronta k n8n). */
export const DRIVE_REQUEST_STATES = ["pending", "sent", "done", "error", "timeout"] as const;
/** Podsložka v rámci klienta nebo zakázky: kořen (`''`), složka služby, nebo Archiv. */
export const DRIVE_SUBKEYS = ["", "web", "marketing", "systemy", "archive"] as const;

/**
 * Požadavek na složku (log odchozích událostí `drive.*` a jejich výsledku). `id` je zároveň `requestId` v těle webhooku
 * (`data.requestId`) a `eventId` v callbacku z n8n, proto se negeneruje. `pending` a `sent` starší než 10 minut převede
 * úloha `disk.timeout` na `timeout`.
 *
 * Požadavky jednoho klienta (`client_id`) odcházejí po jednom: nový požadavek čeká na předchozí otevřený (`blocked_by`),
 * aby n8n nezakládal tytéž složky dvakrát souběžně (výhra obchodu vytvoří složku klienta i zakázek najednou). Po
 * dokončení předchozího se čekající požadavek znovu sestaví (už se známými ID složek) a odešle.
 */
export const driveRequest = pgTable(
  "drive_request",
  {
    id: uuid("id").primaryKey(),
    event: text("event").notNull(),
    entityType: text("entity_type", { enum: ["company", "job"] }).notNull(),
    entityId: uuid("entity_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    state: text("state", { enum: DRIVE_REQUEST_STATES }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    requestedBy: uuid("requested_by").references(() => user.id),
    requestedAt: ts("requested_at").notNull().defaultNow(),
    doneAt: ts("done_at"),
    /** Klient, ke kterému požadavek patří (u zakázky její klient); řadí požadavky do fronty po klientovi. */
    clientId: uuid("client_id").notNull(),
    /** ID doménové události `drive.*` (obálka webhooku, `webhook_delivery.event_id`); doplní obsluha události. */
    eventId: uuid("event_id"),
    /** Požadavek, na jehož dokončení tento čeká (nic se neodeslalo); `null` = odešel nebo odejde hned. */
    blockedBy: uuid("blocked_by"),
    /** Kdy událost odešla do outboxu; od tohoto okamžiku běží 10 minut na odpověď. */
    sentAt: ts("sent_at"),
    /** Záznam byl v době požadavku soukromý: události dostane jen webhook s „Doručovat i soukromé“. */
    isPrivate: boolean("is_private").notNull().default(false),
  },
  (t) => [
    index("drive_request_client_open_idx")
      .on(t.clientId, t.requestedAt)
      .where(sql`${t.state} in ('pending', 'sent')`),
    uniqueIndex("drive_request_event_uq")
      .on(t.eventId)
      .where(sql`${t.eventId} is not null`),
    index("drive_request_blocked_idx")
      .on(t.blockedBy)
      .where(sql`${t.blockedBy} is not null`),
    index("drive_request_entity_idx").on(t.entityType, t.entityId, t.requestedAt),
    index("drive_request_open_idx")
      .on(t.requestedAt)
      .where(sql`${t.state} in ('pending', 'sent')`),
    index("drive_request_error_idx")
      .on(t.requestedAt)
      .where(sql`${t.state} in ('error', 'timeout')`),
  ],
);

/** Známé složky na Disku: kořen klienta či zakázky a jeho podsložky (služby, Archiv). Jedna složka na entitu a podklíč. */
export const driveFolder = pgTable(
  "drive_folder",
  {
    id: pk(),
    entityType: text("entity_type", { enum: ["company", "job"] }).notNull(),
    entityId: uuid("entity_id").notNull(),
    subkey: text("subkey", { enum: DRIVE_SUBKEYS }).notNull().default(""),
    folderId: text("folder_id").notNull(),
    ...audit(),
  },
  (t) => [uniqueIndex("drive_folder_entity_uq").on(t.entityType, t.entityId, t.subkey)],
);
