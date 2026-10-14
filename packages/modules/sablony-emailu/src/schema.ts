import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { audit, pk, trigramIndex, visibilityColumns, visibilityIndex } from "@rebar/core/db";

/** Jazyk šablony. */
export const EMAIL_LANGUAGES = ["cs", "sk", "en"] as const;

/**
 * Šablona e-mailu pro klienty a obchody (předmět a tělo s proměnnými jako `{{jmeno}}`). Tělo je Tiptap JSON,
 * `body_text` je prostý text pro hledání a odkaz Gmailu. Viditelnost: kořen s vlastním zámkem.
 */
export const emailTemplate = pgTable(
  "email_template",
  {
    id: pk(),
    name: text("name").notNull(),
    category: text("category"),
    language: text("language", { enum: EMAIL_LANGUAGES }).notNull().default("cs"),
    subject: text("subject").notNull().default(""),
    bodyJson: jsonb("body_json").$type<Record<string, unknown>>(),
    bodyText: text("body_text").notNull().default(""),
    usageCount: integer("usage_count").notNull().default(0),
    ...visibilityColumns(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...audit(),
  },
  (t) => [
    trigramIndex("email_template_name_trgm_idx", t.name),
    trigramIndex("email_template_subject_trgm_idx", t.subject),
    index("email_template_category_idx").on(t.category),
    index("email_template_usage_idx").on(t.usageCount),
    index("email_template_tags_idx").using("gin", t.tags),
    visibilityIndex("email_template_private_idx", t),
  ],
);
