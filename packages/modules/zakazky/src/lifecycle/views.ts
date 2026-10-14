import type { SeedViewDef } from "@rebar/core/views";

const active = ["preparation", "execution", "handover"];
const COLUMNS = ["title", "number", "company", "phase", "manager", "value", "endDate"];

/**
 * Výchozí sdílené pohledy seznamu zakázek (zakládá je seed, jakmile existuje první uživatel).
 * Jména jsou klientovi k dispozici k úpravě; smazaný pohled se znovu nezakládá.
 */
export const JOB_VIEWS: readonly SeedViewDef[] = [
  {
    entityType: "job",
    name: "Moje zakázky",
    position: 10,
    config: {
      viewType: "table",
      filters: {
        op: "and",
        conditions: [
          { attr: "manager", op: "is_me" },
          { attr: "phase", op: "is_none_of", value: ["lost", "closed"] },
        ],
      },
      sort: [{ attr: "number", dir: "desc" }],
      columns: COLUMNS,
    },
  },
  {
    entityType: "job",
    name: "Nabídky čekající na odpověď",
    position: 20,
    config: {
      viewType: "table",
      filters: { op: "and", conditions: [{ attr: "phase", op: "is", value: "offer" }] },
      sort: [{ attr: "number", dir: "asc" }],
      columns: ["title", "number", "company", "manager", "value", "address"],
    },
  },
  {
    entityType: "job",
    name: "V realizaci",
    position: 30,
    config: {
      viewType: "table",
      filters: { op: "and", conditions: [{ attr: "phase", op: "is", value: "execution" }] },
      sort: [{ attr: "endDate", dir: "asc" }],
      columns: COLUMNS,
    },
  },
  {
    entityType: "job",
    name: "Po termínu",
    position: 40,
    config: {
      viewType: "table",
      filters: {
        op: "and",
        conditions: [
          { attr: "phase", op: "is_any_of", value: active },
          { attr: "endDate", op: "in_last_days", value: 3650 },
        ],
      },
      sort: [{ attr: "endDate", dir: "asc" }],
      columns: COLUMNS,
    },
  },
  {
    entityType: "job",
    name: "V záruce",
    position: 50,
    config: {
      viewType: "table",
      filters: { op: "and", conditions: [{ attr: "phase", op: "is", value: "warranty" }] },
      sort: [{ attr: "warrantyUntil", dir: "asc" }],
      columns: ["title", "number", "company", "manager", "handoverAt", "warrantyUntil"],
    },
  },
  {
    entityType: "job",
    name: "Kanban podle stavu",
    position: 60,
    config: {
      viewType: "kanban",
      filters: {
        op: "and",
        conditions: [{ attr: "phase", op: "is_none_of", value: ["lost", "closed"] }],
      },
      group: "stage",
      cardAttributes: ["company", "value", "endDate"],
    },
  },
];
