import { defineEntity, type Choice } from "@rebar/core/entities";
import {
  type DOMAIN_PAYERS,
  type INVOICE_STATUSES,
  type RECURRING_KINDS,
  type RECURRING_PERIODS,
  type RECURRING_STATUSES,
  emailLibraryItem,
  recurringInvoice,
  recurringService,
  webDomain,
} from "./schema";

/** Popisky druhů opakované služby. */
export const RECURRING_KIND_LABELS: Record<(typeof RECURRING_KINDS)[number], string> = {
  hosting: "Hosting",
  maintenance: "Údržba",
};
/** Popisky období opakované služby. */
export const RECURRING_PERIOD_LABELS: Record<(typeof RECURRING_PERIODS)[number], string> = {
  yearly: "Ročně",
  monthly: "Měsíčně",
};
/** Popisky stavů opakované služby. */
export const RECURRING_STATUS_LABELS: Record<(typeof RECURRING_STATUSES)[number], string> = {
  active: "Aktivní",
  paused: "Pozastavená",
  canceled: "Zrušená",
};
/** Popisky plátců domény. */
export const DOMAIN_PAYER_LABELS: Record<(typeof DOMAIN_PAYERS)[number], string> = {
  agency: "Agentura",
  client: "Klient",
};
/** Popisky stavů návrhu opakované faktury. */
export const INVOICE_STATUS_LABELS: Record<(typeof INVOICE_STATUSES)[number], string> = {
  draft: "Koncept",
  approved: "Schváleno",
  sent_to_fakturoid: "Odesláno do Fakturoidu",
  canceled: "Zrušeno",
};

const choices = <K extends string>(labels: Record<K, string>): Choice[] =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));

/*
  Entity modulu „Můj prostor“ nemají zámek soukromí (`visibility`): přístup k nim určují oprávnění `muj-prostor.*`,
  která má jen vlastník (D §6, PŘEDPOKLAD). Čtení i zápis hlídá tentýž klíč.
*/

/** Hosting a údržba webů klientů (opakované služby s obnovou). */
export const recurringServiceEntity = defineEntity({
  key: "recurring_service",
  listPath: "/muj-prostor/hosting",
  module: "muj-prostor",
  label: { one: "Hosting / údržba", many: "Hosting a údržba" },
  table: recurringService,
  titleKey: "name",
  permissions: {
    read: "muj-prostor.hosting",
    write: "muj-prostor.hosting",
    create: "muj-prostor.hosting",
    delete: "muj-prostor.hosting",
  },
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
      default: 14,
      width: 150,
    },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 260 },
  ],
  search: (r) => ({ title: String(r.name), ...(r.web ? { subtitle: String(r.web) } : {}) }),
  url: (id) => `/muj-prostor/hosting/${id}`,
});

/** Domény klientů a agentury s expirací a upozorněním (`warn_days`). */
export const webDomainEntity = defineEntity({
  key: "web_domain",
  listPath: "/muj-prostor/domeny",
  module: "muj-prostor",
  label: { one: "Doména", many: "Domény" },
  table: webDomain,
  titleKey: "domain",
  permissions: {
    read: "muj-prostor.domains",
    write: "muj-prostor.domains",
    create: "muj-prostor.domains",
    delete: "muj-prostor.domains",
  },
  quickFilters: [
    {
      key: "expiring",
      label: "Brzy vyprší",
      filter: { op: "and", conditions: [{ attr: "expiresOn", op: "in_next_days", value: 60 }] },
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
  url: (id) => `/muj-prostor/domeny/${id}`,
});

/** Soukromá e-mailová knihovna vlastníka (texty, které nejsou sdílenými šablonami). */
export const emailLibraryItemEntity = defineEntity({
  key: "email_library_item",
  listPath: "/muj-prostor/knihovna",
  module: "muj-prostor",
  label: { one: "Položka knihovny", many: "E-mailová knihovna" },
  table: emailLibraryItem,
  titleKey: "title",
  permissions: {
    read: "muj-prostor.email_library",
    write: "muj-prostor.email_library",
    create: "muj-prostor.email_library",
    delete: "muj-prostor.email_library",
  },
  attributes: [
    {
      key: "title",
      label: "Název",
      type: "text",
      field: "title",
      required: true,
      width: 260,
      defaultVisible: true,
    },
    {
      key: "category",
      label: "Kategorie",
      type: "text",
      field: "category",
      width: 160,
      defaultVisible: true,
    },
    {
      key: "subject",
      label: "Předmět",
      type: "text",
      field: "subject",
      width: 280,
      defaultVisible: true,
    },
    {
      key: "tags",
      label: "Štítky",
      type: "multiselect",
      field: "tags",
      lookup: "tag",
      lookupScope: "email_library_item",
      width: 200,
    },
  ],
  search: (r) => ({
    title: String(r.title),
    ...(r.category ? { subtitle: String(r.category) } : {}),
    extra: `${r.subject ?? ""} ${String(r.bodyText ?? "").slice(0, 2000)}`,
  }),
  url: (id) => `/muj-prostor/knihovna/${id}`,
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
export { recurringService, webDomain, emailLibraryItem, recurringInvoice };
