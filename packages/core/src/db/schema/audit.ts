import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { pk, ts } from "../columns";
import { user } from "./identity";

export type AuditChange = { field: string; old: unknown; new: unknown };

/**
 * Auditní záznam. Zapisuje se ve stejné transakci jako změna. Aplikační DB role
 * má na tuto tabulku jen INSERT a SELECT (viz `db/grants.ts`) — nejde ho měnit ani mazat.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: pk(),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    /** Kdo: uživatel, systém (úlohy na pozadí) nebo servisní přístup agentury. */
    actorKind: text("actor_kind", { enum: ["user", "system", "agency"] }).notNull(),
    actorId: uuid("actor_id").references(() => user.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary"),
    changes: jsonb("changes")
      .$type<AuditChange[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    requestId: text("request_id"),
    ip: text("ip"),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId, t.occurredAt),
    index("audit_log_actor_idx").on(t.actorId, t.occurredAt),
    index("audit_log_time_idx").on(t.occurredAt),
  ],
);
