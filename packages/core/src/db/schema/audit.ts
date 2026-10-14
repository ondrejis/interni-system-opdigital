import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { pk, ts } from "../columns";
import { user } from "./identity";

export type AuditChange = { field: string; old: unknown; new: unknown };

/** Kdo provedl změnu: uživatel, systém (úlohy), servisní přístup agentury, nebo vnější zdroj (n8n, Google, Meta, úloha). */
export const AUDIT_ACTOR_KINDS = [
  "user",
  "system",
  "agency",
  "n8n",
  "google",
  "meta",
  "job",
] as const;
/** Druh aktéra změny v auditu (viz `AUDIT_ACTOR_KINDS`). */
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number];

/** Kategorie záznamu v historii: změna dat, bezpečnostní událost (přihlášení), změna integrace/nastavení. */
export const AUDIT_CATEGORIES = ["data", "security", "integration"] as const;
/** Kategorie záznamu v historii (viz `AUDIT_CATEGORIES`). */
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

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
    actorKind: text("actor_kind", { enum: AUDIT_ACTOR_KINDS }).notNull(),
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
    /** Popisek vnějšího aktéra (např. „n8n: Drive“, „Google Kalendář“); u uživatele prázdné. */
    actorLabel: text("actor_label"),
    category: text("category", { enum: AUDIT_CATEGORIES }).notNull().default("data"),
    /** Kopie viditelnosti záznamu v době změny (R-33: starý záznam zůstane skrytý i po zveřejnění). */
    isPrivate: boolean("is_private").notNull().default(false),
    /** Název záznamu v době změny (R-34), aby historie dávala smysl i po přejmenování nebo smazání. */
    entityTitle: text("entity_title"),
    /** Kontext změny pro filtrování a odkazy: `{ dealId, jobId, companyId… }`. */
    context: jsonb("context").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId, t.occurredAt),
    index("audit_log_actor_idx").on(t.actorId, t.occurredAt),
    index("audit_log_time_idx").on(t.occurredAt),
    index("audit_log_category_idx").on(t.category, t.occurredAt),
    index("audit_log_private_idx")
      .on(t.occurredAt)
      .where(sql`${t.isPrivate}`),
    index("audit_log_title_trgm_idx").using(
      "gin",
      sql`lower(f_unaccent(${t.entityTitle})) gin_trgm_ops`,
    ),
  ],
);
