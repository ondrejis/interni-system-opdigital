import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { audit, pk, schema, ts } from "@rebar/core/db";

const { user } = schema;

/** Stav požadavku na založení nebo úpravu složky (fronta k n8n). */
export const DRIVE_REQUEST_STATES = ["pending", "sent", "done", "error", "timeout"] as const;
/** Podsložka v rámci klienta nebo zakázky: kořen (`''`), složka služby, nebo Archiv. */
export const DRIVE_SUBKEYS = ["", "web", "marketing", "systemy", "archive"] as const;

/**
 * Požadavek na složku (log odchozích událostí `drive.*` a jejich výsledku). `id` je zároveň `eventId` v těle webhooku
 * a v callbacku z n8n, proto se negeneruje. `pending` starší než 10 minut převede úloha `disk.timeout` na `timeout`.
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
  },
  (t) => [
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
