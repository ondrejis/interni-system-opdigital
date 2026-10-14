import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { audit, pk, trigramIndex, visibilityColumns, visibilityIndex } from "@rebar/core/db";

/**
 * Poznámka s formátovaným textem (Tiptap JSON v `body_json`, prostý text v `body_text` pro hledání). Má nejvýše jednu
 * vazbu (obchod, organizace, kontakt, zakázka), nebo je samostatná. Viditelnost: dědí od obchodu a zakázky,
 * smí mít vlastní zámek (soukromá organizace a kontakt do poznámek nedědí, R-31).
 */
export const note = pgTable(
  "note",
  {
    id: pk(),
    title: text("title"),
    bodyJson: jsonb("body_json").$type<Record<string, unknown>>(),
    bodyText: text("body_text").notNull().default(""),
    pinned: boolean("pinned").notNull().default(false),
    dealId: uuid("deal_id"),
    companyId: uuid("company_id"),
    personId: uuid("person_id"),
    jobId: uuid("job_id"),
    ...visibilityColumns(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...audit(),
  },
  (t) => [
    check(
      "note_single_link_chk",
      sql`num_nonnulls(${t.dealId}, ${t.companyId}, ${t.personId}, ${t.jobId}) <= 1`,
    ),
    trigramIndex("note_title_trgm_idx", t.title),
    trigramIndex("note_body_trgm_idx", t.bodyText),
    index("note_deal_idx")
      .on(t.dealId)
      .where(sql`${t.dealId} is not null`),
    index("note_company_idx")
      .on(t.companyId)
      .where(sql`${t.companyId} is not null`),
    index("note_person_idx")
      .on(t.personId)
      .where(sql`${t.personId} is not null`),
    index("note_job_idx")
      .on(t.jobId)
      .where(sql`${t.jobId} is not null`),
    index("note_pinned_idx")
      .on(t.updatedAt)
      .where(sql`${t.pinned}`),
    index("note_tags_idx").using("gin", t.tags),
    visibilityIndex("note_private_idx", t),
  ],
);
