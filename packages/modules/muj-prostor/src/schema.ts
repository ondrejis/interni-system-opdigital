import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { audit, minor, pk, schema, trigramIndex, ts } from "@rebar/core/db";

const { user } = schema;

/** Druh opakované služby. */
export const RECURRING_KINDS = ["hosting", "maintenance"] as const;
/** Období, za které se služba platí (R-26: ročně i měsíčně). */
export const RECURRING_PERIODS = ["yearly", "monthly"] as const;
/** Stav opakované služby. */
export const RECURRING_STATUSES = ["active", "paused", "canceled"] as const;
/** Kdo platí doménu. */
export const DOMAIN_PAYERS = ["agency", "client"] as const;
/** Stav návrhu opakované faktury. */
export const INVOICE_STATUSES = ["draft", "approved", "sent_to_fakturoid", "canceled"] as const;

/*
  Modul „Můj prostor“ je jen pro vlastníka (oprávnění `muj-prostor.*`, která partner nemá, PŘEDPOKLAD D §6): tabulky
  proto nemají sloupce soukromí (`is_private`), přístup hlídají oprávnění.
*/

/** Opakovaná služba klienta (hosting, údržba webu) s cenou za období a dalším termínem obnovy. */
export const recurringService = pgTable(
  "recurring_service",
  {
    id: pk(),
    companyId: uuid("company_id").notNull(),
    jobId: uuid("job_id"),
    kind: text("kind", { enum: RECURRING_KINDS }).notNull(),
    name: text("name").notNull(),
    web: text("web"),
    priceMinor: minor("price_minor"),
    period: text("period", { enum: RECURRING_PERIODS }).notNull().default("yearly"),
    since: date("since", { mode: "string" }),
    nextRenewal: date("next_renewal", { mode: "string" }),
    status: text("status", { enum: RECURRING_STATUSES }).notNull().default("active"),
    /** Kde služba běží (server, hosting, účet u dodavatele). */
    runsAt: text("runs_at"),
    autoPrepareInvoice: boolean("auto_prepare_invoice").notNull().default(false),
    invoiceLeadDays: integer("invoice_lead_days").notNull().default(14),
    fakturoidSubjectId: text("fakturoid_subject_id"),
    note: text("note"),
    ...audit(),
  },
  (t) => [
    index("recurring_service_company_idx").on(t.companyId),
    index("recurring_service_renewal_idx")
      .on(t.nextRenewal)
      .where(sql`${t.status} = 'active'`),
    trigramIndex("recurring_service_name_trgm_idx", t.name),
  ],
);

/** Doména klienta nebo agentury: registrátor, expirace, kdo platí, varování `warn_days` předem. Doména je mezi živými unikátní. */
export const webDomain = pgTable(
  "web_domain",
  {
    id: pk(),
    domain: text("domain").notNull(),
    companyId: uuid("company_id"),
    registrar: text("registrar"),
    expiresOn: date("expires_on", { mode: "string" }),
    payer: text("payer", { enum: DOMAIN_PAYERS }).notNull().default("client"),
    autoRenew: boolean("auto_renew").notNull().default(false),
    renewalPriceMinor: minor("renewal_price_minor"),
    dns: text("dns"),
    recurringServiceId: uuid("recurring_service_id").references(() => recurringService.id),
    warnDays: integer("warn_days").notNull().default(30),
    note: text("note"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("web_domain_domain_uq")
      .on(sql`lower(${t.domain})`)
      .where(sql`${t.deletedAt} is null`),
    index("web_domain_expires_idx").on(t.expiresOn),
    index("web_domain_company_idx")
      .on(t.companyId)
      .where(sql`${t.companyId} is not null`),
    trigramIndex("web_domain_domain_trgm_idx", t.domain),
  ],
);

/** Soukromá knihovna e-mailových textů vlastníka (odděleně od sdílených šablon, lze přesouvat mezi nimi). */
export const emailLibraryItem = pgTable(
  "email_library_item",
  {
    id: pk(),
    title: text("title").notNull(),
    category: text("category"),
    subject: text("subject").notNull().default(""),
    bodyJson: jsonb("body_json").$type<Record<string, unknown>>(),
    bodyText: text("body_text").notNull().default(""),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...audit(),
  },
  (t) => [
    trigramIndex("email_library_item_title_trgm_idx", t.title),
    trigramIndex("email_library_item_body_trgm_idx", t.bodyText),
    index("email_library_item_category_idx").on(t.category),
    index("email_library_item_tags_idx").using("gin", t.tags),
  ],
);

/**
 * Návrh opakované faktury za období služby (v3, Fakturoid): koncept → schválená → odeslaná do Fakturoidu. Pro službu
 * a začátek období je jen jeden návrh (`recurring_invoice_period_uq`).
 */
export const recurringInvoice = pgTable(
  "recurring_invoice",
  {
    id: pk(),
    recurringServiceId: uuid("recurring_service_id")
      .notNull()
      .references(() => recurringService.id),
    periodFrom: date("period_from", { mode: "string" }).notNull(),
    periodTo: date("period_to", { mode: "string" }).notNull(),
    amountMinor: minor("amount_minor").notNull(),
    status: text("status", { enum: INVOICE_STATUSES }).notNull().default("draft"),
    fakturoidId: text("fakturoid_id"),
    fakturoidNumber: text("fakturoid_number"),
    fakturoidUrl: text("fakturoid_url"),
    approvedBy: uuid("approved_by").references(() => user.id),
    approvedAt: ts("approved_at"),
    error: text("error"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("recurring_invoice_period_uq")
      .on(t.recurringServiceId, t.periodFrom)
      .where(sql`${t.deletedAt} is null`),
    index("recurring_invoice_status_idx").on(t.status),
  ],
);
