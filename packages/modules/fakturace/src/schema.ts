import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { audit, minor, pk, ts } from "@rebar/core/db";
import { company, person } from "@rebar/kontakty/schema";
import { job } from "@rebar/zakazky/schema";

/** Údaje o straně dokladu, uložené při vystavení, aby se vystavený doklad už nikdy neměnil. */
export type PartySnapshot = {
  name: string;
  ico: string | null;
  dic: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  email?: string | null;
  phone?: string | null;
  web?: string | null;
  bankAccount?: string | null;
};

/**
 * Faktura. Koncept nemá číslo (přidělí se při vystavení, aby v řadě nevznikaly díry). Stav:
 * `draft` → `issued` → `partial` (část uhrazena) → `paid`; `credited` = zrušeno dobropisem.
 * Součty jsou v haléřích a počítají se při uložení z položek.
 */
export const invoice = pgTable(
  "invoice",
  {
    id: pk(),
    number: text("number"),
    /** Popis v seznamech (i u konceptu, který ještě nemá číslo). */
    title: text("title").notNull().default(""),
    /** `proforma` (zálohová), `partial` (průběžná), `final` (vyúčtování), `credit_note` (dobropis). */
    kind: text("kind").notNull(),
    state: text("state").notNull().default("draft"),
    jobId: uuid("job_id").references(() => job.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    personId: uuid("person_id").references(() => person.id),
    issueDate: date("issue_date", { mode: "string" }),
    taxableDate: date("taxable_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    currency: text("currency").notNull().default("CZK"),
    variableSymbol: text("variable_symbol"),
    note: text("note"),
    netMinor: minor("net_minor").notNull().default(0),
    vatMinor: minor("vat_minor").notNull().default(0),
    grossMinor: minor("gross_minor").notNull().default(0),
    paidMinor: minor("paid_minor").notNull().default(0),
    overdue: boolean("overdue").notNull().default(false),
    /** Dobropis odkazuje na původní fakturu. */
    originalInvoiceId: uuid("original_invoice_id").references((): AnyPgColumn => invoice.id),
    supplier: jsonb("supplier").$type<PartySnapshot>(),
    customer: jsonb("customer").$type<PartySnapshot>(),
    issuedAt: date("issued_at", { mode: "string" }),
    /** Režim DPH dokladu: `standard`, nebo `reverse_charge` (přenesená daňová povinnost, doklad bez DPH). */
    vatMode: text("vat_mode").notNull().default("standard"),
    /** Zádržné stržené z této faktury v haléřích (kladné číslo); uvolňuje se samostatným dokladem. */
    retentionMinor: minor("retention_minor").notNull().default(0),
    /** Soupis provedených prací, ze kterého faktura vznikla (měkký odkaz do Zakázek). */
    statementId: uuid("statement_id"),
    /** Vystavený doklad je zamčený; úprava vyžaduje vrácení do konceptu (zapíše se do auditu). */
    lockedAt: ts("locked_at"),
    /** Kdy byl doklad naposledy úspěšně odeslán e-mailem (udržuje srovnání evidence odeslání). */
    sentOn: date("sent_on", { mode: "string" }),
    /** Počet úspěšně odeslaných upomínek a datum poslední. */
    reminderCount: integer("reminder_count").notNull().default(0),
    lastReminderOn: date("last_reminder_on", { mode: "string" }),
    custom: jsonb("custom")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...audit(),
  },
  (t) => [
    uniqueIndex("invoice_number_uq")
      .on(t.number)
      .where(sql`${t.number} is not null`),
    index("invoice_job_idx").on(t.jobId),
    index("invoice_company_idx").on(t.companyId),
    index("invoice_state_idx").on(t.state),
    index("invoice_due_idx").on(t.dueDate),
    index("invoice_custom_idx").using("gin", t.custom),
    index("invoice_title_trgm_idx").using("gin", sql`lower(f_unaccent(${t.title})) gin_trgm_ops`),
    index("invoice_number_trgm_idx").using("gin", sql`lower(f_unaccent(${t.number})) gin_trgm_ops`),
    index("invoice_variable_symbol_trgm_idx").using(
      "gin",
      sql`lower(f_unaccent(${t.variableSymbol})) gin_trgm_ops`,
    ),
  ],
);

export const invoiceLine = pgTable(
  "invoice_line",
  {
    id: pk(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("ks"),
    unitPriceMinor: minor("unit_price_minor").notNull().default(0),
    /** Sazba DPH v setinách procenta (21 % = 2100). */
    vatRateBp: integer("vat_rate_bp").notNull().default(2100),
    netMinor: minor("net_minor").notNull().default(0),
    vatMinor: minor("vat_minor").notNull().default(0),
    grossMinor: minor("gross_minor").notNull().default(0),
    /** Položka rozpočtu zakázky, ze které řádek vznikl (soupis prací; měkký odkaz). */
    budgetItemId: uuid("budget_item_id"),
    /**
     * Role řádku v dokladu: `work` (vlastní plnění), `previous` (odpočet už fakturovaných prací), `advance`
     * (odpočet zaplacené zálohy), `retention` (strženo zádržné, záporná částka), `release` (uvolněné zádržné).
     */
    role: text("role").notNull().default("work"),
    /** Doklad, na který řádek odkazuje (odpočet zálohy nebo dílčí faktury). */
    refInvoiceId: uuid("ref_invoice_id"),
  },
  (t) => [
    index("invoice_line_invoice_idx").on(t.invoiceId, t.position),
    index("invoice_line_ref_idx").on(t.refInvoiceId),
  ],
);

/** Úhrada faktury; částečné úhrady jsou povolené. */
export const payment = pgTable(
  "payment",
  {
    id: pk(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id),
    date: date("date", { mode: "string" }).notNull(),
    amountMinor: minor("amount_minor").notNull(),
    method: text("method"),
    note: text("note"),
    ...audit(),
  },
  (t) => [index("payment_invoice_idx").on(t.invoiceId, t.date)],
);

/**
 * Evidence odeslání vydané faktury e-mailem (doklad nebo upomínka). Tělo zprávy se neukládá (jen předmět);
 * stav doručení do SMTP drží `email_log` (měkký odkaz `emailLogId`) a zrcadlí se sem úlohou i při čtení.
 */
export const invoiceDispatch = pgTable(
  "invoice_dispatch",
  {
    id: pk(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id),
    /** `invoice` (odeslání dokladu) nebo `reminder` (upomínka po splatnosti). */
    kind: text("kind").notNull(),
    toEmail: text("to_email").notNull(),
    cc: jsonb("cc")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    subject: text("subject").notNull(),
    emailLogId: uuid("email_log_id"),
    /** `queued` (ve frontě nebo se opakuje), `sent`, `failed` (vyčerpané pokusy nebo nenastavené SMTP). */
    status: text("status").notNull().default("queued"),
    error: text("error"),
    sentBy: uuid("sent_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    sentAt: ts("sent_at"),
  },
  (t) => [
    index("invoice_dispatch_invoice_idx").on(t.invoiceId, t.createdAt),
    index("invoice_dispatch_pending_idx")
      .on(t.status)
      .where(sql`${t.status} = 'queued'`),
  ],
);

/**
 * Přijatá (nákladová) faktura od dodavatele. Rozpadá se na řádky s oddílem rozpočtu zakázky, tím vstupuje do skutečných
 * nákladů (poskytovatel nákladů fakturace). Schválená faktura je zamčená; úprava = vrátit do konceptu.
 */
export const receivedInvoice = pgTable(
  "received_invoice",
  {
    id: pk(),
    /** Číslo dokladu dodavatele. */
    number: text("number").notNull(),
    jobId: uuid("job_id").references(() => job.id),
    supplierId: uuid("supplier_id").references(() => company.id),
    supplier: jsonb("supplier").$type<PartySnapshot>(),
    variableSymbol: text("variable_symbol"),
    constantSymbol: text("constant_symbol"),
    /** Objednávka zakázky (měkký odkaz do Zakázek). */
    orderId: uuid("order_id"),
    issueDate: date("issue_date", { mode: "string" }),
    taxableDate: date("taxable_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    receivedDate: date("received_date", { mode: "string" }),
    currency: text("currency").notNull().default("CZK"),
    netMinor: minor("net_minor").notNull().default(0),
    vatMinor: minor("vat_minor").notNull().default(0),
    grossMinor: minor("gross_minor").notNull().default(0),
    paidMinor: minor("paid_minor").notNull().default(0),
    paidDate: date("paid_date", { mode: "string" }),
    /** `draft`, `pending` (ke schválení), `approved`, `rejected`, `paid`. */
    state: text("state").notNull().default("draft"),
    /** Přijatý doklad v režimu přenesené daňové povinnosti (DPH přiznává příjemce). */
    vatMode: text("vat_mode").notNull().default("standard"),
    fileId: uuid("file_id"),
    note: text("note"),
    lockedAt: ts("locked_at"),
    custom: jsonb("custom")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...audit(),
  },
  (t) => [
    index("received_invoice_job_idx").on(t.jobId),
    index("received_invoice_supplier_idx").on(t.supplierId),
    index("received_invoice_state_idx").on(t.state),
    index("received_invoice_number_trgm_idx").using(
      "gin",
      sql`lower(f_unaccent(${t.number})) gin_trgm_ops`,
    ),
    index("received_invoice_variable_symbol_trgm_idx").using(
      "gin",
      sql`lower(f_unaccent(${t.variableSymbol})) gin_trgm_ops`,
    ),
    // stejný dodavatel + stejné číslo dokladu = duplicita (souběh zachytí databáze)
    uniqueIndex("received_invoice_dup_uq")
      .on(t.supplierId, sql`lower(btrim(${t.number}))`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** Řádek přijaté faktury rozpadnutý na oddíl rozpočtu (a případně položku) zakázky. */
export const receivedInvoiceLine = pgTable(
  "received_invoice_line",
  {
    id: pk(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => receivedInvoice.id),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    /** Oddíl a položka rozpočtu zakázky (měkký odkaz do Zakázek); prázdné = nespárováno. */
    sectionId: uuid("section_id"),
    itemId: uuid("item_id"),
    /** Kategorie nákladu (`material`, `subcontract`…), pro souhrn ekonomiky. */
    category: text("category").notNull().default("other"),
    netMinor: minor("net_minor").notNull().default(0),
    vatRateBp: integer("vat_rate_bp").notNull().default(2100),
    vatMinor: minor("vat_minor").notNull().default(0),
    grossMinor: minor("gross_minor").notNull().default(0),
  },
  (t) => [index("received_invoice_line_invoice_idx").on(t.invoiceId, t.position)],
);
