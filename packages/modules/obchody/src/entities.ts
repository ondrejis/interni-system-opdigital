import { defineEntity, type Choice } from "@rebar/core/entities";
import { deal, dealParticipant, dealStageHistory } from "./schema";
import {
  DEAL_PIPELINE,
  DEAL_RESULT_LABELS,
  DEAL_SOURCE_LABELS,
  LOST_REASON_LOOKUP,
  type DealResult,
  type DealSource,
} from "./shared";
import { dealHooks } from "./deals/hooks";

export { DEAL_PIPELINE, DEAL_RESULT_LABELS, DEAL_SOURCE_LABELS, LOST_REASON_LOOKUP };

const SERVICES: Choice[] = [
  { value: "web", label: "Web" },
  { value: "marketing", label: "Marketing" },
  { value: "systemy", label: "Systémy" },
];

/**
 * Obchod (příležitost) v pipeline `deal/default` (kanban podle atributu `status`). Výsledek (`result`) určují příkazy
 * `win`/`lose`/`reopen`; fáze se přesouvá `moveStage`. Systémová pole píše modul Úkoly, `first_opened_at` příkaz `markOpened`.
 */
export const dealEntity = defineEntity({
  key: "deal",
  listPath: "/obchody",
  module: "obchody",
  label: { one: "Obchod", many: "Obchody" },
  table: deal,
  titleKey: "title",
  statusKey: "status",
  permissions: {
    read: "obchody.read",
    write: "obchody.write",
    create: "obchody.create",
    delete: "obchody.delete",
    export: "obchody.export",
  },
  ownerColumns: [deal.ownerId],
  ownerDefaults: (ctx) => ({ owner: ctx.actor.userId }),
  visibility: { ownLock: true },
  systemFields: ["nextActivityAt", "lastActivityAt", "nextTaskId"],
  children: [
    { entityType: "deal_participant", column: "dealId", table: dealParticipant },
    { entityType: "deal_stage_history", column: "dealId", table: dealStageHistory },
    { entityType: "task", column: "dealId" },
    { entityType: "note", column: "dealId" },
  ],
  quickFilters: [
    {
      key: "mine",
      label: "Moje",
      filter: { op: "and", conditions: [{ attr: "owner", op: "is_me" }] },
    },
    {
      key: "open",
      label: "Otevřené",
      filter: { op: "and", conditions: [{ attr: "result", op: "is", value: "open" }] },
    },
    {
      key: "no_activity",
      label: "Bez aktivity",
      filter: {
        op: "and",
        conditions: [
          { attr: "result", op: "is", value: "open" },
          { attr: "nextActivityAt", op: "empty" },
        ],
      },
    },
  ],
  attributes: [
    {
      key: "title",
      label: "Název",
      type: "text",
      field: "title",
      required: true,
      width: 280,
      defaultVisible: true,
    },
    {
      key: "company",
      label: "Organizace",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      width: 220,
      defaultVisible: true,
    },
    {
      key: "person",
      label: "Kontakt",
      type: "record",
      field: "personId",
      record: { entityType: "person" },
      width: 200,
      defaultVisible: true,
    },
    {
      key: "status",
      label: "Fáze",
      type: "status",
      field: "stageId",
      pipeline: DEAL_PIPELINE,
      required: true,
      width: 150,
      defaultVisible: true,
    },
    {
      key: "value",
      label: "Hodnota",
      type: "currency",
      field: "valueMinor",
      min: 0,
      aggregate: ["sum"],
      width: 150,
      defaultVisible: true,
    },
    {
      key: "weighted",
      label: "Vážená hodnota",
      type: "currency",
      field: "weightedMinor",
      readonly: true,
      aggregate: ["sum"],
      width: 150,
    },
    {
      key: "services",
      label: "Služby",
      type: "multiselect",
      field: "services",
      choices: SERVICES,
      width: 180,
      defaultVisible: true,
    },
    {
      key: "owner",
      label: "Vlastník",
      type: "user",
      field: "ownerId",
      width: 160,
      defaultVisible: true,
    },
    {
      key: "expectedCloseDate",
      label: "Očekávané uzavření",
      type: "date",
      field: "expectedCloseDate",
      width: 150,
      defaultVisible: true,
    },
    {
      key: "nextActivityAt",
      label: "Další aktivita",
      type: "date",
      field: "nextActivityAt",
      readonly: true,
      width: 140,
      defaultVisible: true,
    },
    {
      key: "result",
      label: "Výsledek",
      type: "select",
      field: "result",
      choices: (Object.keys(DEAL_RESULT_LABELS) as DealResult[]).map((v) => ({
        value: v,
        label: DEAL_RESULT_LABELS[v],
        color: { open: "blue", won: "green", lost: "red" }[v],
      })),
      readonly: true,
      default: "open",
      width: 120,
    },
    {
      key: "source",
      label: "Zdroj",
      type: "select",
      field: "source",
      choices: (Object.keys(DEAL_SOURCE_LABELS) as DealSource[]).map((v) => ({
        value: v,
        label: DEAL_SOURCE_LABELS[v],
      })),
      default: "manual",
      width: 150,
    },
    {
      key: "sourceDetail",
      label: "Detail zdroje",
      type: "text",
      field: "sourceDetail",
      width: 200,
    },
    {
      key: "lastActivityAt",
      label: "Poslední aktivita",
      type: "date",
      field: "lastActivityAt",
      readonly: true,
      width: 140,
    },
    {
      key: "stageEnteredAt",
      label: "Ve fázi od",
      type: "date",
      field: "stageEnteredAt",
      readonly: true,
      width: 130,
    },
    { key: "wonAt", label: "Vyhráno", type: "date", field: "wonAt", readonly: true, width: 120 },
    { key: "lostAt", label: "Prohráno", type: "date", field: "lostAt", readonly: true, width: 120 },
    {
      key: "lostReason",
      label: "Důvod prohry",
      type: "select",
      field: "lostReason",
      lookup: LOST_REASON_LOOKUP,
      width: 170,
    },
    {
      key: "lostNote",
      label: "Poznámka k prohře",
      type: "longtext",
      field: "lostNote",
      width: 260,
    },
    {
      key: "firstOpenedAt",
      label: "Poprvé otevřeno",
      type: "date",
      field: "firstOpenedAt",
      readonly: true,
      width: 140,
    },
    {
      key: "tags",
      label: "Štítky",
      type: "multiselect",
      field: "tags",
      lookup: "tag",
      lookupScope: "deal",
      width: 200,
    },
  ],
  search: (r) => ({
    title: String(r.title),
    ...(r.sourceDetail ? { subtitle: String(r.sourceDetail) } : {}),
  }),
  ...dealHooks,
  url: (id) => `/obchody/${id}`,
});

export const entities = [dealEntity];
export { deal };
