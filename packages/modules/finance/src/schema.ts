import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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

const { user } = schema;

/** Druh platby (`PaymentKind` v kontraktech). */
export const PAYMENT_KINDS = ["one_off", "intro", "retainer", "extra", "recurring"] as const;
/** Stav platby. */
export const PAYMENT_STATUSES = ["planned", "issued", "paid", "canceled"] as const;
/** Jak se platba rozdělila mezi lidi: podle pravidel zakázky, nebo ručně přepsáno. */
export const ALLOCATION_MODES = ["rules", "manual"] as const;
/** Odkud platba vznikla. */
export const PAYMENT_SOURCES = ["manual", "template", "retainer", "fakturoid"] as const;
/** Na jaké platby pravidlo rozdělení platí: na všechny, nebo na jeden druh. */
export const SPLIT_APPLIES_TO = ["all", ...PAYMENT_KINDS] as const;
/** Způsob pravidla rozdělení. */
export const SPLIT_MODES = ["percent", "fixed_per_payment", "fixed_total"] as const;
/** Kdo fakturuje retainer: stále stejná osoba, nebo se střídají. */
export const ISSUER_MODES = ["fixed", "alternate"] as const;
/** Způsob vyrovnání mezi partnery. */
export const SETTLEMENT_METHODS = ["invoice", "transfer", "offset"] as const;

/**
 * Retainer zakázky: opakovaná měsíční platba s dnem vystavení (1–28) a fakturujícím (pevný, nebo střídavý). Měsíce jsou
 * `YYYY-MM`. Platby z něj generuje úloha `finance.retainer.generate` (idempotentně podle `payment_retainer_month_uq`).
 */
export const retainer = pgTable(
  "retainer",
  {
    id: pk(),
    jobId: uuid("job_id").notNull(),
    amountMinor: minor("amount_minor").notNull(),
    fromMonth: text("from_month").notNull(),
    toMonth: text("to_month"),
    issueDay: integer("issue_day").notNull().default(1),
    issuerMode: text("issuer_mode", { enum: ISSUER_MODES }).notNull().default("fixed"),
    issuerId: uuid("issuer_id")
      .notNull()
      .references(() => user.id),
    firstIssuerId: uuid("first_issuer_id").references(() => user.id),
    active: boolean("active").notNull().default(true),
    ...audit(),
  },
  (t) => [
    check("retainer_amount_chk", sql`${t.amountMinor} > 0`),
    check("retainer_issue_day_chk", sql`${t.issueDay} between 1 and 28`),
    check("retainer_from_month_chk", sql`${t.fromMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    index("retainer_job_idx").on(t.jobId),
    index("retainer_active_idx")
      .on(t.fromMonth)
      .where(sql`${t.active} and ${t.deletedAt} is null`),
  ],
);

/**
 * Platba (plánovaná, vystavená, zaplacená, zrušená). `job_id` je prázdné jen u plateb z Fakturoidu (`kind = recurring`,
 * R-12): taková platba je vždy soukromá a mimo saldo. Viditelnost: dědí od zakázky a smí mít vlastní zámek.
 * Měsíční retainer platba je v zakázce jedna na měsíc.
 */
export const payment = pgTable(
  "payment",
  {
    id: pk(),
    jobId: uuid("job_id"),
    companyId: uuid("company_id"),
    description: text("description").notNull(),
    kind: text("kind", { enum: PAYMENT_KINDS }).notNull().default("one_off"),
    /** Měsíc, za který platba je (`YYYY-MM`); u retainerů povinné. */
    periodMonth: text("period_month"),
    amountMinor: minor("amount_minor").notNull(),
    issuerId: uuid("issuer_id").references(() => user.id),
    status: text("status", { enum: PAYMENT_STATUSES }).notNull().default("planned"),
    invoiceNumber: text("invoice_number"),
    invoiceUrl: text("invoice_url"),
    issuedOn: date("issued_on", { mode: "string" }),
    dueOn: date("due_on", { mode: "string" }),
    paidOn: date("paid_on", { mode: "string" }),
    allocationMode: text("allocation_mode", { enum: ALLOCATION_MODES }).notNull().default("rules"),
    source: text("source", { enum: PAYMENT_SOURCES }).notNull().default("manual"),
    retainerId: uuid("retainer_id").references(() => retainer.id),
    note: text("note"),
    ...visibilityColumns(),
    ...audit(),
  },
  (t) => [
    check("payment_amount_chk", sql`${t.amountMinor} > 0`),
    check(
      "payment_period_month_chk",
      sql`${t.periodMonth} is null or ${t.periodMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    uniqueIndex("payment_retainer_month_uq")
      .on(t.jobId, t.retainerId, t.periodMonth)
      .where(sql`${t.retainerId} is not null and ${t.deletedAt} is null`),
    index("payment_job_idx")
      .on(t.jobId, t.status)
      .where(sql`${t.jobId} is not null`),
    index("payment_company_idx")
      .on(t.companyId)
      .where(sql`${t.companyId} is not null`),
    index("payment_status_due_idx").on(t.status, t.dueOn),
    index("payment_paid_idx")
      .on(t.paidOn)
      .where(sql`${t.status} = 'paid'`),
    index("payment_issued_idx")
      .on(t.issuedOn)
      .where(sql`${t.issuedOn} is not null`),
    index("payment_issuer_idx").on(t.issuerId),
    trigramIndex("payment_description_trgm_idx", t.description),
    trigramIndex("payment_invoice_number_trgm_idx", t.invoiceNumber),
    visibilityIndex("payment_private_idx", t),
  ],
);

/** Podíl uživatele na platbě v haléřích; součet podílů se rovná částce platby. Dědí viditelnost platby. */
export const paymentAllocation = pgTable(
  "payment_allocation",
  {
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payment.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    amountMinor: minor("amount_minor").notNull(),
    ...audit(),
  },
  (t) => [
    primaryKey({ columns: [t.paymentId, t.userId] }),
    check("payment_allocation_amount_chk", sql`${t.amountMinor} >= 0`),
    index("payment_allocation_user_idx").on(t.userId),
  ],
);

/**
 * Pravidlo rozdělení plateb zakázky mezi lidi: procenta, pevná částka za platbu, nebo pevná celková částka;
 * platí pro všechny druhy plateb nebo jen pro jeden, od–do měsíce (`YYYY-MM`). Pořadí určuje `position`.
 */
export const splitRule = pgTable(
  "split_rule",
  {
    id: pk(),
    jobId: uuid("job_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    mode: text("mode", { enum: SPLIT_MODES }).notNull(),
    percent: numeric("percent", { precision: 5, scale: 2 }),
    fixedMinor: minor("fixed_minor"),
    appliesTo: text("applies_to", { enum: SPLIT_APPLIES_TO }).notNull().default("all"),
    validFromMonth: text("valid_from_month"),
    validToMonth: text("valid_to_month"),
    position: integer("position").notNull().default(0),
    ...audit(),
  },
  (t) => [
    check("split_rule_percent_chk", sql`${t.percent} is null or ${t.percent} between 0 and 100`),
    check("split_rule_fixed_chk", sql`${t.fixedMinor} is null or ${t.fixedMinor} >= 0`),
    index("split_rule_job_idx").on(t.jobId, t.position),
    index("split_rule_user_idx").on(t.userId),
  ],
);

/**
 * Vyrovnání mezi partnery (ruční záznam, že jeden druhému zaplatil nebo zafakturoval): kdo, komu, kolik, kdy, jak.
 * Storno vyplní `canceled_at` (záznam se nemaže). Počítá se jen se sdílenými zakázkami.
 */
export const settlement = pgTable(
  "settlement",
  {
    id: pk(),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => user.id),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => user.id),
    amountMinor: minor("amount_minor").notNull(),
    settledOn: date("settled_on", { mode: "string" }).notNull(),
    method: text("method", { enum: SETTLEMENT_METHODS }).notNull(),
    reference: text("reference"),
    note: text("note"),
    canceledAt: ts("canceled_at"),
    ...audit(),
  },
  (t) => [
    check("settlement_amount_chk", sql`${t.amountMinor} > 0`),
    check("settlement_users_chk", sql`${t.fromUserId} <> ${t.toUserId}`),
    index("settlement_date_idx").on(t.settledOn),
    index("settlement_users_idx").on(t.fromUserId, t.toUserId),
  ],
);
