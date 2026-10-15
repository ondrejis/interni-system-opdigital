import { defineEntity, type Choice } from "@rebar/core/entities";
import type { Executor } from "@rebar/core/db";
import { UserError } from "@rebar/core/rbac";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { normalizeDomain } from "./domains/logic";
import {
  DOMAIN_PAYER_LABELS,
  INVOICE_STATUS_LABELS,
  RECURRING_KIND_LABELS,
  RECURRING_PERIOD_LABELS,
  RECURRING_STATUS_LABELS,
} from "./labels";
import { emailLibraryItem, recurringInvoice, recurringService, webDomain } from "./schema";
import { emailLibraryItemEntity } from "./library/entity";

export {
  DOMAIN_PAYER_LABELS,
  INVOICE_STATUS_LABELS,
  RECURRING_KIND_LABELS,
  RECURRING_PERIOD_LABELS,
  RECURRING_STATUS_LABELS,
};

/** Zkontroluje, že doména ještě není v evidenci (mezi nesmazanými, bez ohledu na velikost písmen). */
async function assertDomainFree(db: Executor, domain: string, exceptId?: string): Promise<void> {
  const [hit] = await db
    .select({ id: webDomain.id })
    .from(webDomain)
    .where(
      and(
        isNull(webDomain.deletedAt),
        eq(sql`lower(${webDomain.domain})`, domain),
        exceptId ? ne(webDomain.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (hit) throw new UserError(`Doména ${domain} už je v evidenci.`);
}

const choices = <K extends string>(labels: Record<K, string>): Choice[] =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));

/*
  Entity modulu „Můj prostor“ nemají zámek soukromí (`visibility`): přístup k nim určují oprávnění `muj-prostor.*`,
  která má jen vlastník (D §6, PŘEDPOKLAD). Čtení i zápis hlídá tentýž klíč.
*/

/**
 * Hosting a údržba webů klientů (opakované služby s obnovou). Stránku `/muj-prostor/hosting` (souhrn, pohledy)
 * kreslí UI modulu; generický seznam s filtry, exportem a detaily záznamů je na `/muj-prostor/hosting/vse`.
 */
export const recurringServiceEntity = defineEntity({
  key: "recurring_service",
  listPath: "/muj-prostor/hosting/vse",
  module: "muj-prostor",
  label: { one: "Hosting / údržba", many: "Hosting a údržba" },
  table: recurringService,
  titleKey: "name",
  permissions: {
    read: "muj-prostor.hosting",
    write: "muj-prostor.hosting",
    create: "muj-prostor.hosting",
    delete: "muj-prostor.hosting",
    export: "muj-prostor.hosting",
  },
  quickFilters: [
    {
      key: "renewal_soon",
      label: "Obnova do 30 dní",
      filter: {
        op: "and",
        conditions: [
          { attr: "status", op: "is", value: "active" },
          {
            op: "or",
            conditions: [
              { attr: "nextRenewal", op: "in_next_days", value: 30 },
              { attr: "nextRenewal", op: "older_than_days", value: 0 },
            ],
          },
        ],
      },
    },
  ],
  attributes: [
    {
      key: "name",
      label: "Název",
      type: "text",
      field: "name",
      required: true,
      width: 240,
      defaultVisible: true,
    },
    {
      key: "company",
      label: "Klient",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      required: true,
      width: 220,
      defaultVisible: true,
    },
    {
      key: "kind",
      label: "Druh",
      type: "select",
      field: "kind",
      choices: choices(RECURRING_KIND_LABELS),
      required: true,
      default: "hosting",
      width: 120,
      defaultVisible: true,
    },
    { key: "web", label: "Web", type: "url", field: "web", width: 200, defaultVisible: true },
    {
      key: "price",
      label: "Cena za období",
      type: "currency",
      field: "priceMinor",
      min: 0,
      aggregate: ["sum"],
      width: 150,
      defaultVisible: true,
    },
    {
      key: "period",
      label: "Období",
      type: "select",
      field: "period",
      choices: choices(RECURRING_PERIOD_LABELS),
      default: "yearly",
      width: 110,
      defaultVisible: true,
    },
    {
      key: "nextRenewal",
      label: "Další obnova",
      type: "date",
      field: "nextRenewal",
      width: 130,
      defaultVisible: true,
    },
    {
      key: "status",
      label: "Stav",
      type: "select",
      field: "status",
      choices: choices(RECURRING_STATUS_LABELS),
      default: "active",
      width: 120,
      defaultVisible: true,
    },
    {
      key: "job",
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      width: 200,
    },
    { key: "since", label: "Od", type: "date", field: "since", width: 120 },
    { key: "runsAt", label: "Kde běží", type: "text", field: "runsAt", width: 180 },
    {
      key: "autoPrepareInvoice",
      label: "Připravovat fakturu",
      type: "checkbox",
      field: "autoPrepareInvoice",
      width: 140,
    },
    {
      key: "invoiceLeadDays",
      label: "Faktura dní předem",
      type: "number",
      field: "invoiceLeadDays",
      min: 0,
      max: 90,
      default: 14,
      width: 150,
    },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 260 },
  ],
  search: (r) => ({ title: String(r.name), ...(r.web ? { subtitle: String(r.web) } : {}) }),
  url: (id) => `/muj-prostor/hosting/vse/${id}`,
});

/**
 * Domény klientů a agentury s expirací a upozorněním (`warn_days`). Stránku `/muj-prostor/domeny` (barvy expirace,
 * hromadné vložení) kreslí UI modulu; generický seznam s filtry a exportem je na `/muj-prostor/domeny/vse`.
 */
export const webDomainEntity = defineEntity({
  key: "web_domain",
  listPath: "/muj-prostor/domeny/vse",
  module: "muj-prostor",
  label: { one: "Doména", many: "Domény" },
  table: webDomain,
  titleKey: "domain",
  permissions: {
    read: "muj-prostor.domains",
    write: "muj-prostor.domains",
    create: "muj-prostor.domains",
    delete: "muj-prostor.domains",
    export: "muj-prostor.domains",
  },
  /** Doména je evidovaná jednou (bez ohledu na velikost písmen) a ukládá se v normalizovaném tvaru. */
  beforeCreate: async (ctx, values) => {
    const raw = String(values.domain ?? "").trim();
    if (!raw) return values;
    const domain = normalizeDomain(raw);
    if (!domain) throw new UserError(`„${raw}“ není platná doména (například firma.cz).`);
    await assertDomainFree(ctx.db, domain);
    return { ...values, domain };
  },
  beforeUpdate: async (ctx, before, changes) => {
    if (!("domain" in changes)) return;
    const raw = String(changes.domain ?? "").trim();
    if (!raw) return;
    const domain = normalizeDomain(raw);
    if (!domain) throw new UserError(`„${raw}“ není platná doména (například firma.cz).`);
    await assertDomainFree(ctx.db, domain, String(before.id));
    return { domain };
  },
  quickFilters: [
    {
      key: "expiring",
      label: "Brzy vyprší",
      filter: {
        op: "or",
        conditions: [
          { attr: "expiresOn", op: "in_next_days", value: 60 },
          { attr: "expiresOn", op: "older_than_days", value: 0 },
        ],
      },
    },
  ],
  attributes: [
    {
      key: "domain",
      label: "Doména",
      type: "text",
      field: "domain",
      required: true,
      width: 240,
      defaultVisible: true,
    },
    {
      key: "company",
      label: "Klient",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      width: 220,
      defaultVisible: true,
    },
    {
      key: "registrar",
      label: "Registrátor",
      type: "text",
      field: "registrar",
      width: 160,
      defaultVisible: true,
    },
    {
      key: "expiresOn",
      label: "Expirace",
      type: "date",
      field: "expiresOn",
      width: 130,
      defaultVisible: true,
    },
    {
      key: "payer",
      label: "Platí",
      type: "select",
      field: "payer",
      choices: choices(DOMAIN_PAYER_LABELS),
      default: "client",
      width: 110,
      defaultVisible: true,
    },
    {
      key: "autoRenew",
      label: "Auto-prodloužení",
      type: "checkbox",
      field: "autoRenew",
      width: 140,
      defaultVisible: true,
    },
    {
      key: "renewalPrice",
      label: "Cena obnovy",
      type: "currency",
      field: "renewalPriceMinor",
      min: 0,
      width: 130,
    },
    {
      key: "recurringService",
      label: "Hosting",
      type: "record",
      field: "recurringServiceId",
      record: { entityType: "recurring_service" },
      width: 200,
    },
    {
      key: "warnDays",
      label: "Upozornit dní předem",
      type: "number",
      field: "warnDays",
      min: 1,
      default: 30,
      width: 160,
    },
    { key: "dns", label: "DNS", type: "longtext", field: "dns", width: 240 },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 260 },
  ],
  search: (r) => ({
    title: String(r.domain),
    ...(r.registrar ? { subtitle: String(r.registrar) } : {}),
  }),
  url: (id) => `/muj-prostor/domeny/vse/${id}`,
});

/** Návrhy opakovaných faktur za období služby (v3, odeslání do Fakturoidu po schválení). */
export const recurringInvoiceEntity = defineEntity({
  key: "recurring_invoice",
  listPath: "/muj-prostor/faktury",
  module: "muj-prostor",
  label: { one: "Opakovaná faktura", many: "Opakované faktury" },
  table: recurringInvoice,
  titleKey: "periodFrom",
  permissions: {
    read: "muj-prostor.recurring_invoices",
    write: "muj-prostor.recurring_invoices",
    create: "muj-prostor.recurring_invoices",
  },
  noCreate: "Návrhy faktur vznikají automaticky z opakovaných služeb.",
  noDelete: "Návrh faktury se neruší mazáním, ale stornem.",
  attributes: [
    {
      key: "periodFrom",
      label: "Období od",
      type: "date",
      field: "periodFrom",
      readonly: true,
      width: 130,
      defaultVisible: true,
    },
    {
      key: "periodTo",
      label: "Období do",
      type: "date",
      field: "periodTo",
      readonly: true,
      width: 130,
      defaultVisible: true,
    },
    {
      key: "service",
      label: "Služba",
      type: "record",
      field: "recurringServiceId",
      record: { entityType: "recurring_service" },
      readonly: true,
      width: 240,
      defaultVisible: true,
    },
    {
      key: "amount",
      label: "Částka",
      type: "currency",
      field: "amountMinor",
      min: 0,
      aggregate: ["sum"],
      width: 140,
      defaultVisible: true,
    },
    {
      key: "status",
      label: "Stav",
      type: "select",
      field: "status",
      choices: choices(INVOICE_STATUS_LABELS),
      readonly: true,
      default: "draft",
      width: 180,
      defaultVisible: true,
    },
    {
      key: "fakturoidNumber",
      label: "Číslo ve Fakturoidu",
      type: "text",
      field: "fakturoidNumber",
      readonly: true,
      width: 160,
    },
    {
      key: "fakturoidUrl",
      label: "Odkaz",
      type: "url",
      field: "fakturoidUrl",
      readonly: true,
      width: 200,
    },
    { key: "error", label: "Chyba", type: "longtext", field: "error", readonly: true, width: 240 },
  ],
  url: (id) => `/muj-prostor/faktury/${id}`,
});

export const entities = [
  recurringServiceEntity,
  webDomainEntity,
  emailLibraryItemEntity,
  recurringInvoiceEntity,
];
export { emailLibraryItemEntity };
export { recurringService, webDomain, emailLibraryItem, recurringInvoice };
