import type { SeedViewDef } from "@rebar/core/views";

/*
  Výchozí sdílené pohledy hostingu a domén (HOST-02): Obnova do 30 dní, Podle klienta, Zrušené; u domén Expirace do
  60 dní, Bez klienta a Podle klienta. Zakládá je `db:seed`; vlastník je může přejmenovat, upravit nebo smazat (smazaný
  se znovu nezakládá). Filtry jsou relativní (`in_next_days`, `older_than_days`), takže se nemusí obnovovat.
*/

const SERVICE_COLUMNS = [
  "name",
  "company",
  "kind",
  "price",
  "period",
  "nextRenewal",
  "status",
  "web",
];
const DOMAIN_COLUMNS = [
  "domain",
  "company",
  "registrar",
  "expiresOn",
  "payer",
  "autoRenew",
  "renewalPrice",
];

/** Názvy pohledů hostingu (podle nich je řadí `viewLayout` v UI). */
export const HOSTING_VIEW_NAMES = {
  renewal: "Obnova do 30 dní",
  byClient: "Podle klienta",
  canceled: "Zrušené",
} as const;
/** Názvy pohledů domén. */
export const DOMAIN_VIEW_NAMES = {
  expiring: "Expirace do 60 dní",
  noClient: "Bez klienta",
  byClient: "Podle klienta",
} as const;

/** Výchozí sdílené pohledy modulu „Můj prostor“. */
export const MUJ_PROSTOR_VIEWS: readonly SeedViewDef[] = [
  {
    entityType: "recurring_service",
    name: HOSTING_VIEW_NAMES.renewal,
    position: 10,
    config: {
      viewType: "table",
      filters: {
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
      sort: [{ attr: "nextRenewal", dir: "asc" }],
      columns: SERVICE_COLUMNS,
    },
  },
  {
    entityType: "recurring_service",
    name: HOSTING_VIEW_NAMES.byClient,
    position: 20,
    config: {
      viewType: "table",
      filters: { op: "and", conditions: [{ attr: "status", op: "is_not", value: "canceled" }] },
      sort: [{ attr: "nextRenewal", dir: "asc" }],
      group: "company",
      columns: SERVICE_COLUMNS,
    },
  },
  {
    entityType: "recurring_service",
    name: HOSTING_VIEW_NAMES.canceled,
    position: 30,
    config: {
      viewType: "table",
      filters: { op: "and", conditions: [{ attr: "status", op: "is", value: "canceled" }] },
      sort: [{ attr: "name", dir: "asc" }],
      columns: SERVICE_COLUMNS,
    },
  },
  {
    entityType: "web_domain",
    name: DOMAIN_VIEW_NAMES.expiring,
    position: 10,
    config: {
      viewType: "table",
      filters: {
        op: "or",
        conditions: [
          { attr: "expiresOn", op: "in_next_days", value: 60 },
          { attr: "expiresOn", op: "older_than_days", value: 0 },
        ],
      },
      sort: [{ attr: "expiresOn", dir: "asc" }],
      columns: DOMAIN_COLUMNS,
    },
  },
  {
    entityType: "web_domain",
    name: DOMAIN_VIEW_NAMES.noClient,
    position: 20,
    config: {
      viewType: "table",
      filters: { op: "and", conditions: [{ attr: "company", op: "empty" }] },
      sort: [{ attr: "domain", dir: "asc" }],
      columns: DOMAIN_COLUMNS,
    },
  },
  {
    entityType: "web_domain",
    name: DOMAIN_VIEW_NAMES.byClient,
    position: 30,
    config: {
      viewType: "table",
      sort: [{ attr: "expiresOn", dir: "asc" }],
      group: "company",
      columns: DOMAIN_COLUMNS,
    },
  },
];
