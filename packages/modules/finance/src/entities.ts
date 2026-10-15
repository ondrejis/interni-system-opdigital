import { defineEntity, type Choice } from "@rebar/core/entities";
import {
  type PAYMENT_KINDS,
  type PAYMENT_SOURCES,
  type PAYMENT_STATUSES,
  type SETTLEMENT_METHODS,
  payment,
  paymentAllocation,
  settlement,
} from "./schema";

/** Popisky druhů plateb. */
export const PAYMENT_KIND_LABELS: Record<(typeof PAYMENT_KINDS)[number], string> = {
  one_off: "Jednorázová",
  intro: "Úvodní fáze",
  retainer: "Retainer",
  extra: "Navíc",
  recurring: "Opakovaná (Fakturoid)",
};
/** Popisky stavů plateb. */
export const PAYMENT_STATUS_LABELS: Record<(typeof PAYMENT_STATUSES)[number], string> = {
  planned: "Plánovaná",
  issued: "Vystavená",
  paid: "Zaplacená",
  canceled: "Zrušená",
};
/** Popisky zdrojů plateb. */
export const PAYMENT_SOURCE_LABELS: Record<(typeof PAYMENT_SOURCES)[number], string> = {
  manual: "Ručně",
  template: "Ze šablony",
  retainer: "Z retaineru",
  fakturoid: "Fakturoid",
};
/** Popisky způsobů vyrovnání. */
export const SETTLEMENT_METHOD_LABELS: Record<(typeof SETTLEMENT_METHODS)[number], string> = {
  invoice: "Faktura mezi IČO",
  transfer: "Převod",
  offset: "Zápočet",
};

const choices = <K extends string>(
  labels: Record<K, string>,
  colors?: Partial<Record<K, string>>,
): Choice[] =>
  (Object.keys(labels) as K[]).map((value) => ({
    value,
    label: labels[value],
    ...(colors?.[value] ? { color: colors[value] } : {}),
  }));

/**
 * Platba zakázky (plánovaná, vystavená, zaplacená). Vzniká příkazy modulu (šablona, retainer, ruční zadání);
 * rozdělení mezi lidi je v `payment_allocation`. Částky vidí jen, kdo má `finance.read`. Platba bez zakázky (Fakturoid)
 * je vždy soukromá a mimo saldo (R-12).
 */
export const paymentEntity = defineEntity({
  key: "payment",
  // `/finance` je stránka modulu (FIN-C: seznam plateb s filtry, součty a stavovým tokem); generická tabulka je tady
  listPath: "/finance/platby",
  module: "finance",
  label: { one: "Platba", many: "Platby" },
  table: payment,
  noCreate: "Platba se zakládá v zakázce (záložka Finance) nebo na stránce Platby a rozdělení.",
  titleKey: "description",
  permissions: {
    read: "finance.read",
    write: "finance.payments_write",
    create: "finance.payments_write",
    delete: "finance.payments_write",
    export: "finance.export",
  },
  ownerColumns: [payment.issuerId],
  visibility: {
    parents: [{ entityType: "job", column: "jobId" }],
    ownLock: true,
    privateWithoutParent: true,
  },
  children: [{ entityType: "payment_allocation", column: "paymentId", table: paymentAllocation }],
  quickFilters: [
    {
      key: "unpaid",
      label: "Nezaplacené",
      filter: {
        op: "and",
        conditions: [{ attr: "status", op: "is_any_of", value: ["planned", "issued"] }],
      },
    },
    {
      key: "issued",
      label: "Vystavené",
      filter: { op: "and", conditions: [{ attr: "status", op: "is", value: "issued" }] },
    },
  ],
  attributes: [
    {
      key: "description",
      label: "Popis",
      type: "text",
      field: "description",
      required: true,
      width: 280,
      defaultVisible: true,
    },
    {
      key: "job",
      readonly: true,
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      width: 220,
      defaultVisible: true,
    },
    {
      key: "company",
      readonly: true,
      label: "Klient",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      width: 200,
      defaultVisible: true,
    },
    {
      key: "amount",
      readonly: true,
      label: "Částka",
      type: "currency",
      field: "amountMinor",
      required: true,
      min: 1,
      aggregate: ["sum"],
      width: 140,
      defaultVisible: true,
    },
    {
      key: "kind",
      readonly: true,
      label: "Druh",
      type: "select",
      field: "kind",
      choices: choices(PAYMENT_KIND_LABELS),
      default: "one_off",
      width: 150,
      defaultVisible: true,
    },
    {
      key: "status",
      readonly: true,
      label: "Stav",
      type: "select",
      field: "status",
      choices: choices(PAYMENT_STATUS_LABELS, {
        planned: "gray",
        issued: "blue",
        paid: "green",
        canceled: "red",
      }),
      default: "planned",
      width: 130,
      defaultVisible: true,
    },
    {
      key: "issuer",
      readonly: true,
      label: "Fakturuje",
      type: "user",
      field: "issuerId",
      width: 160,
      defaultVisible: true,
    },
    {
      key: "dueOn",
      readonly: true,
      label: "Splatnost",
      type: "date",
      field: "dueOn",
      width: 120,
      defaultVisible: true,
    },
    {
      key: "periodMonth",
      readonly: true,
      label: "Měsíc",
      type: "text",
      field: "periodMonth",
      width: 100,
    },
    {
      key: "invoiceNumber",
      readonly: true,
      label: "Číslo faktury",
      type: "text",
      field: "invoiceNumber",
      width: 140,
    },
    {
      key: "invoiceUrl",
      readonly: true,
      label: "Odkaz na fakturu",
      type: "url",
      field: "invoiceUrl",
      width: 200,
    },
    {
      key: "issuedOn",
      readonly: true,
      label: "Vystaveno",
      type: "date",
      field: "issuedOn",
      width: 120,
    },
    {
      key: "paidOn",
      readonly: true,
      label: "Zaplaceno",
      type: "date",
      field: "paidOn",
      width: 120,
    },
    {
      key: "source",
      readonly: true,
      label: "Zdroj",
      type: "select",
      field: "source",
      choices: choices(PAYMENT_SOURCE_LABELS),
      default: "manual",
      width: 130,
    },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 260 },
  ],
  search: (r) => ({
    title: String(r.description),
    ...(r.invoiceNumber ? { subtitle: String(r.invoiceNumber) } : {}),
    extra: String(r.invoiceNumber ?? ""),
  }),
  url: (id) => `/finance/${id}`,
});

/** Záznam vyrovnání mezi partnery (kdo komu, kolik, jak). Storno místo mazání; zápis jen s `finance.settlements_write`. */
export const settlementEntity = defineEntity({
  key: "settlement",
  listPath: "/finance/vyrovnani/zapisy",
  module: "finance",
  label: { one: "Vyrovnání", many: "Vyrovnání" },
  table: settlement,
  noCreate: "Vyrovnání se zapisuje na stránce Vyrovnání („Zapsat vyrovnání“).",
  titleKey: "settledOn",
  permissions: {
    read: "finance.read",
    write: "finance.settlements_write",
    create: "finance.settlements_write",
    export: "finance.export",
  },
  noDelete: "Vyrovnání se neruší mazáním, ale stornem.",
  attributes: [
    {
      key: "settledOn",
      readonly: true,
      label: "Datum",
      type: "date",
      field: "settledOn",
      required: true,
      width: 120,
      defaultVisible: true,
    },
    {
      key: "from",
      readonly: true,
      label: "Od",
      type: "user",
      field: "fromUserId",
      required: true,
      width: 160,
      defaultVisible: true,
    },
    {
      key: "to",
      readonly: true,
      label: "Komu",
      type: "user",
      field: "toUserId",
      required: true,
      width: 160,
      defaultVisible: true,
    },
    {
      key: "amount",
      readonly: true,
      label: "Částka",
      type: "currency",
      field: "amountMinor",
      required: true,
      min: 1,
      aggregate: ["sum"],
      width: 140,
      defaultVisible: true,
    },
    {
      key: "method",
      readonly: true,
      label: "Způsob",
      type: "select",
      field: "method",
      choices: choices(SETTLEMENT_METHOD_LABELS),
      required: true,
      default: "transfer",
      width: 160,
      defaultVisible: true,
    },
    { key: "reference", label: "Odkaz / číslo", type: "text", field: "reference", width: 180 },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 260 },
    {
      key: "canceledAt",
      readonly: true,
      label: "Stornováno",
      type: "date",
      field: "canceledAt",
      width: 130,
    },
  ],
  url: (id) => `/finance/vyrovnani/zapisy/${id}`,
});

export const entities = [paymentEntity, settlementEntity];
export { payment, settlement };
