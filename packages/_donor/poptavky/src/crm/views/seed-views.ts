import type { SeedViewDef } from "@rebar/core/views";

const OPEN = ["inquiry", "offer"];
const open = { attr: "phase", op: "is_any_of", value: OPEN } as const;
const notArchived = { attr: "crmArchivedAt", op: "empty" } as const;

/** Sloupce obchodních pohledů (bez peněz je atribut pro uživatele bez `zakazky.finance` prostě vynechán). */
const DEAL_COLUMNS = [
  "title",
  "company",
  "stage",
  "value",
  "crmWeighted",
  "expectedCloseDate",
  "crmNextActivityAt",
  "manager",
];

/**
 * Výchozí sdílené pohledy obchodů (seznam, nástěnka, prognóza čtou stejné pohledy entity `job`) a filtry na čištění dat.
 * Zakládá je seed (`ModuleSeed.views`); klient je může přejmenovat, upravit nebo smazat (smazaný se znovu nezakládá).
 * Filtry používají vypočtené sloupce CRM (`crmNextActivityAt`, `crmRotting`, `crmOpenActivities`, `crmStageEnteredAt`)
 * a relativní operátory (`in_this_month`, `in_last_days`, `older_than_days`), takže se nemusí obnovovat.
 */
export const CRM_VIEWS: readonly SeedViewDef[] = [
  {
    entityType: "job",
    name: "Moje otevřené",
    position: 100,
    config: {
      viewType: "table",
      filters: {
        op: "and",
        conditions: [{ attr: "manager", op: "is_me" }, open, notArchived],
      },
      sort: [{ attr: "crmNextActivityAt", dir: "asc" }],
      columns: DEAL_COLUMNS,
    },
  },
  {
    entityType: "job",
    name: "Bez další aktivity",
    position: 110,
    config: {
      viewType: "table",
      filters: {
        op: "and",
        conditions: [open, notArchived, { attr: "crmOpenActivities", op: "eq", value: 0 }],
      },
      sort: [{ attr: "crmStageEnteredAt", dir: "asc" }],
      columns: DEAL_COLUMNS,
    },
  },
  {
    entityType: "job",
    name: "Zhnilé",
    position: 120,
    config: {
      viewType: "table",
      filters: {
        op: "and",
        conditions: [open, notArchived, { attr: "crmRotting", op: "is_true" }],
      },
      sort: [{ attr: "crmStageEnteredAt", dir: "asc" }],
      columns: [...DEAL_COLUMNS, "crmStageEnteredAt"],
    },
  },
  {
    entityType: "job",
    name: "Uzavření tento měsíc",
    position: 130,
    config: {
      viewType: "table",
      filters: {
        op: "and",
        conditions: [open, notArchived, { attr: "expectedCloseDate", op: "in_this_month" }],
      },
      sort: [{ attr: "expectedCloseDate", dir: "asc" }],
      columns: DEAL_COLUMNS,
    },
  },
  {
    entityType: "job",
    name: "Prohrané za čtvrtletí",
    position: 140,
    config: {
      viewType: "table",
      filters: {
        op: "and",
        conditions: [
          { attr: "phase", op: "is", value: "lost" },
          { attr: "phaseChangedAt", op: "in_last_days", value: 90 },
        ],
      },
      sort: [{ attr: "phaseChangedAt", dir: "desc" }],
      columns: [
        "title",
        "company",
        "value",
        "lostReason",
        "crmLostNote",
        "phaseChangedAt",
        "manager",
      ],
    },
  },
  // ---------- čištění dat ----------
  {
    entityType: "job",
    name: "Čištění: bez úpravy 90 dní",
    position: 150,
    config: {
      viewType: "table",
      filters: {
        op: "and",
        conditions: [open, notArchived, { attr: "updatedAt", op: "older_than_days", value: 90 }],
      },
      sort: [{ attr: "updatedAt", dir: "asc" }],
      columns: [...DEAL_COLUMNS, "updatedAt"],
    },
  },
  {
    entityType: "job",
    name: "Čištění: otevřené bez aktivit",
    position: 160,
    config: {
      viewType: "table",
      filters: {
        op: "and",
        conditions: [
          open,
          notArchived,
          { attr: "crmOpenActivities", op: "eq", value: 0 },
          { attr: "crmLastActivityAt", op: "empty" },
        ],
      },
      sort: [{ attr: "createdAt", dir: "asc" }],
      columns: [...DEAL_COLUMNS, "createdAt"],
    },
  },
  {
    entityType: "job",
    name: "Čištění: v první fázi déle než 30 dní",
    position: 170,
    config: {
      viewType: "table",
      filters: {
        op: "and",
        conditions: [
          { attr: "phase", op: "is", value: "inquiry" },
          notArchived,
          { attr: "crmStageEnteredAt", op: "older_than_days", value: 30 },
        ],
      },
      sort: [{ attr: "crmStageEnteredAt", dir: "asc" }],
      columns: [...DEAL_COLUMNS, "crmStageEnteredAt"],
    },
  },
];
