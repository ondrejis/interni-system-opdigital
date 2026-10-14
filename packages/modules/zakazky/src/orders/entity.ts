import { defineEntity } from "@rebar/core/entities";
import { UserError } from "@rebar/core/rbac";
import { approvalsApi } from "./approvals-link";
import { ORDER_STATUSES } from "./calc";
import { jobOrder } from "../schema";

const NO_CREATE =
  "Objednávku založte na zakázce (záložka Náklady › Objednávky), vždy patří k jedné zakázce.";

/** Objednávka dodavateli na zakázku. Zakládá se příkazem na zakázce; po schválení je zamčená. */
export const orderEntity = defineEntity({
  key: "job_order",
  listPath: "/zakazky/objednavky",
  module: "zakazky",
  label: { one: "Objednávka", many: "Objednávky" },
  table: jobOrder,
  titleKey: "title",
  statusKey: "status",
  // ceny a dodavatelé jsou ekonomika zakázky: montér a mistr objednávky nevidí
  permissions: { read: "zakazky.economics", write: "zakazky.budget" },
  ownerColumns: [jobOrder.createdBy],
  noCreate: NO_CREATE,
  beforeUpdate: async (_ctx, before) => {
    approvalsApi.assertUnlocked(
      before as { lockedAt?: Date | null },
      `Objednávka ${String(before.number)}`,
    );
    if (before.status !== "draft")
      throw new UserError("Objednávku jde upravit jen v konceptu. Vraťte ji do konceptu.");
  },
  beforeDelete: async (_ctx, raw) => {
    if (raw.status !== "draft")
      throw new UserError("Smazat jde jen koncept objednávky, ostatní se ruší.");
  },
  attributes: [
    {
      key: "number",
      label: "Číslo",
      type: "text",
      field: "number",
      readonly: true,
      width: 140,
      defaultVisible: true,
    },
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
      key: "job",
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      readonly: true,
      width: 220,
      defaultVisible: true,
    },
    {
      key: "supplier",
      label: "Dodavatel",
      type: "record",
      field: "supplierId",
      record: { entityType: "company" },
      width: 200,
      defaultVisible: true,
    },
    {
      key: "supplierName",
      label: "Dodavatel (text)",
      type: "text",
      field: "supplierName",
      width: 200,
    },
    {
      key: "status",
      label: "Stav",
      type: "select",
      field: "status",
      readonly: true,
      choices: ORDER_STATUSES.map((s) => ({ value: s.key, label: s.label, color: s.color })),
      width: 130,
      defaultVisible: true,
    },
    {
      key: "total",
      label: "Celkem bez DPH",
      type: "currency",
      field: "totalMinor",
      readonly: true,
      aggregate: ["sum"],
      width: 150,
      defaultVisible: true,
    },
    {
      key: "orderDate",
      label: "Objednáno",
      type: "date",
      field: "orderDate",
      width: 120,
      defaultVisible: true,
    },
    {
      key: "deliveryDate",
      label: "Dodání",
      type: "date",
      field: "deliveryDate",
      width: 120,
      defaultVisible: true,
    },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 300 },
  ],
  search: (r) => ({
    title: `${r.number} ${r.title}`,
    ...(r.supplierName ? { subtitle: String(r.supplierName) } : {}),
    extra: String(r.number),
  }),
  url: (id) => `/zakazky/objednavky/${id}`,
});
