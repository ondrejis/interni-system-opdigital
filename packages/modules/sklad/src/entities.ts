import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { defineEntity } from "@rebar/core/entities";
import { UserError } from "@rebar/core/rbac";
import {
  purchaseOrder,
  stockCount,
  stockDoc,
  stockDocLine,
  stockItem,
  stockLevel,
  warehouse,
} from "./schema";
import { DOC_TYPE_INFO, DOC_TYPES, ORDER_STATUSES, WAREHOUSE_KINDS } from "./stock-math";

const NO_MANUAL_DOC = "Doklady vznikají zaúčtováním na stránce Sklad.";

export const stockItemEntity = defineEntity({
  key: "stock_item",
  listPath: "/sklad/karty",
  module: "sklad",
  label: { one: "Skladová karta", many: "Skladové karty" },
  table: stockItem,
  titleKey: "name",
  permissions: { read: "sklad.read", write: "sklad.write" },
  beforeCreate: async (_ctx, values) => ({
    ...values,
    ...(typeof values.code === "string" ? { code: values.code.trim().toUpperCase() } : {}),
  }),
  afterCreate: async (ctx, created) => {
    // počáteční průměrná cena je poslední známá nákupní cena
    const last = created.lastPriceMinor as number | null;
    if (last) {
      await ctx.db
        .update(stockItem)
        .set({ avgCost: String(last) })
        .where(eq(stockItem.id, String(created.id)));
    }
  },
  afterUpdate: async (ctx, _before, after) => {
    const code = String(after.code ?? "");
    if (code !== code.trim().toUpperCase())
      await ctx.db
        .update(stockItem)
        .set({ code: code.trim().toUpperCase() })
        .where(eq(stockItem.id, String(after.id)));
  },
  beforeDelete: async (ctx, raw) => {
    const [line] = await ctx.db
      .select({ id: stockDocLine.id })
      .from(stockDocLine)
      .where(eq(stockDocLine.itemId, String(raw.id)))
      .limit(1);
    if (line || Number(raw.totalQty) !== 0)
      throw new UserError(
        "Karta má pohyby nebo zásobu. Vyřaďte ji (Aktivní: ne), smazat jde jen karta bez historie.",
      );
  },
  attributes: [
    {
      key: "code",
      label: "Kód",
      type: "text",
      field: "code",
      required: true,
      width: 130,
      defaultVisible: true,
    },
    {
      key: "name",
      label: "Název",
      type: "text",
      field: "name",
      required: true,
      width: 300,
      defaultVisible: true,
    },
    {
      key: "category",
      label: "Kategorie",
      type: "select",
      field: "category",
      lookup: "sklad.category",
      width: 190,
      defaultVisible: true,
    },
    {
      key: "unit",
      label: "Jednotka",
      type: "select",
      field: "unit",
      lookup: "sklad.unit",
      required: true,
      default: "ks",
      width: 100,
      defaultVisible: true,
    },
    {
      key: "totalQty",
      label: "Skladem",
      type: "number",
      field: "totalQty",
      readonly: true,
      width: 110,
      defaultVisible: true,
    },
    {
      key: "minQty",
      label: "Minimum",
      min: 0,
      type: "number",
      field: "minQty",
      width: 110,
      defaultVisible: true,
    },
    {
      key: "belowMin",
      label: "Pod minimem",
      type: "checkbox",
      field: "belowMin",
      readonly: true,
      width: 130,
    },
    {
      key: "avgCost",
      permission: "sklad.write",
      label: "Průměrná cena",
      type: "currency",
      field: "avgCostMinor",
      readonly: true,
      width: 140,
      defaultVisible: true,
    },
    {
      key: "lastPrice",
      permission: "sklad.write",
      label: "Poslední nákupní cena",
      type: "currency",
      field: "lastPriceMinor",
      width: 160,
    },
    {
      key: "value",
      permission: "sklad.write",
      label: "Hodnota zásoby",
      type: "currency",
      field: "valueMinor",
      readonly: true,
      aggregate: ["sum"],
      width: 150,
      defaultVisible: true,
    },
    {
      key: "supplier",
      label: "Dodavatel",
      type: "record",
      field: "supplierId",
      record: { entityType: "company" },
      width: 200,
    },
    { key: "ean", label: "EAN", type: "text", field: "ean", width: 150 },
    {
      key: "vatRate",
      label: "DPH (%)",
      type: "number",
      field: "vatRate",
      min: 0,
      max: 100,
      width: 100,
    },
    { key: "active", label: "Aktivní", type: "checkbox", field: "active", width: 100 },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 280 },
  ],
  search: (r) => ({
    title: `${r.code} ${r.name}`,
    ...(r.category ? { subtitle: String(r.category) } : {}),
    ...(r.ean ? { extra: String(r.ean) } : {}),
  }),
  url: (id) => `/sklad/karty/${id}`,
});

export const warehouseEntity = defineEntity({
  key: "warehouse",
  listPath: "/sklad/umisteni",
  module: "sklad",
  label: { one: "Umístění", many: "Umístění" },
  table: warehouse,
  titleKey: "name",
  permissions: { read: "sklad.read", write: "sklad.write" },
  afterUpdate: async (ctx, before, after) => {
    if (before.active === true && after.active === false) {
      const [r] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(stockLevel)
        .where(and(eq(stockLevel.warehouseId, String(after.id)), ne(stockLevel.qty, "0")));
      if (r?.n) throw new UserError("Umístění ještě obsahuje zásoby, nejdřív je převeďte jinam.");
    }
  },
  beforeDelete: async (ctx, raw) => {
    const id = String(raw.id);
    const [lvl] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(stockLevel)
      .where(and(eq(stockLevel.warehouseId, id), ne(stockLevel.qty, "0")));
    const [doc] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(stockDoc)
      .where(
        and(
          isNull(stockDoc.deletedAt),
          sql`(${stockDoc.warehouseId} = ${id} or ${stockDoc.targetWarehouseId} = ${id})`,
        ),
      );
    if (lvl?.n || doc?.n)
      throw new UserError("Umístění má zásoby nebo doklady. Vyřaďte ho (Aktivní: ne).");
  },
  attributes: [
    {
      key: "name",
      label: "Název",
      type: "text",
      field: "name",
      required: true,
      width: 260,
      defaultVisible: true,
    },
    {
      key: "kind",
      label: "Typ",
      type: "select",
      field: "kind",
      required: true,
      default: "warehouse",
      choices: WAREHOUSE_KINDS.map((k) => ({ value: k.value, label: k.label })),
      width: 130,
      defaultVisible: true,
    },
    {
      key: "responsible",
      label: "Odpovídá",
      type: "user",
      field: "responsibleId",
      width: 180,
      defaultVisible: true,
    },
    {
      key: "job",
      label: "Zakázka (stavba)",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      width: 220,
      defaultVisible: true,
    },
    {
      key: "asset",
      label: "Vozidlo",
      type: "record",
      field: "assetId",
      record: { entityType: "asset" },
      width: 200,
    },
    {
      key: "active",
      label: "Aktivní",
      type: "checkbox",
      field: "active",
      width: 100,
      defaultVisible: true,
    },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 280 },
  ],
  search: (r) => ({ title: String(r.name) }),
  url: (id) => `/sklad/umisteni/${id}`,
});

const warehouseRef = (key: string, label: string, field: string) => ({
  key,
  label,
  type: "record" as const,
  field,
  record: { entityType: "warehouse" },
  readonly: true,
  width: 180,
});

export const stockDocEntity = defineEntity({
  key: "stock_doc",
  listPath: "/sklad/doklady",
  module: "sklad",
  label: { one: "Skladový doklad", many: "Skladové doklady" },
  table: stockDoc,
  titleKey: "number",
  permissions: { read: "sklad.read", write: "sklad.write" },
  noCreate: NO_MANUAL_DOC,
  noDelete: "Skladové doklady se nemažou. Chybu opravte vratkou nebo inventurním rozdílem.",
  attributes: [
    {
      key: "number",
      label: "Číslo",
      type: "text",
      field: "number",
      readonly: true,
      width: 150,
      defaultVisible: true,
    },
    {
      key: "type",
      label: "Typ",
      type: "select",
      field: "type",
      readonly: true,
      choices: DOC_TYPES.map((t) => ({
        value: t,
        label: DOC_TYPE_INFO[t].label,
        color: DOC_TYPE_INFO[t].color,
      })),
      width: 170,
      defaultVisible: true,
    },
    {
      key: "date",
      label: "Datum",
      type: "date",
      field: "date",
      readonly: true,
      width: 120,
      defaultVisible: true,
    },
    { ...warehouseRef("warehouse", "Umístění", "warehouseId"), defaultVisible: true },
    { ...warehouseRef("target", "Cílové umístění", "targetWarehouseId"), defaultVisible: true },
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
      readonly: true,
      width: 200,
    },
    {
      key: "total",
      permission: "sklad.write",
      label: "Hodnota",
      type: "currency",
      field: "totalMinor",
      readonly: true,
      aggregate: ["sum"],
      width: 130,
      defaultVisible: true,
    },
    {
      key: "lineCount",
      label: "Položek",
      type: "number",
      field: "lineCount",
      readonly: true,
      width: 90,
    },
    {
      key: "supplierDocNo",
      label: "Doklad dodavatele",
      type: "text",
      field: "supplierDocNo",
      readonly: true,
      width: 160,
    },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 260 },
  ],
  search: (r) => ({
    title: String(r.number),
    subtitle: DOC_TYPE_INFO[r.type as keyof typeof DOC_TYPE_INFO]?.label ?? String(r.type),
  }),
  url: (id) => `/sklad/doklady/${id}`,
});

export const purchaseOrderEntity = defineEntity({
  key: "purchase_order",
  listPath: "/sklad/objednavky",
  module: "sklad",
  label: { one: "Objednávka", many: "Objednávky" },
  table: purchaseOrder,
  titleKey: "number",
  permissions: { read: "sklad.read", write: "sklad.write" },
  noCreate: true,
  beforeDelete: async (_ctx, raw) => {
    if (raw.status !== "draft")
      throw new UserError("Smazat jde jen koncept. Odeslanou objednávku zrušte.");
  },
  attributes: [
    {
      key: "number",
      label: "Číslo",
      type: "text",
      field: "number",
      readonly: true,
      width: 150,
      defaultVisible: true,
    },
    {
      key: "supplier",
      label: "Dodavatel",
      type: "record",
      field: "supplierId",
      record: { entityType: "company" },
      readonly: true,
      width: 220,
      defaultVisible: true,
    },
    {
      key: "status",
      label: "Stav",
      type: "select",
      field: "status",
      readonly: true,
      choices: ORDER_STATUSES.map((s) => ({ value: s.value, label: s.label, color: s.color })),
      width: 160,
      defaultVisible: true,
    },
    {
      key: "date",
      label: "Vystaveno",
      type: "date",
      field: "date",
      readonly: true,
      width: 120,
      defaultVisible: true,
    },
    {
      key: "expectedDate",
      label: "Očekávaná dodávka",
      type: "date",
      field: "expectedDate",
      width: 150,
      defaultVisible: true,
    },
    { ...warehouseRef("warehouse", "Příjem do", "warehouseId"), defaultVisible: true },
    {
      key: "job",
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      readonly: true,
      width: 220,
    },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 260 },
  ],
  search: (r) => ({ title: String(r.number) }),
  url: (id) => `/sklad/objednavky/${id}`,
});

export const stockCountEntity = defineEntity({
  key: "stock_count",
  listPath: "/sklad/inventury",
  module: "sklad",
  label: { one: "Inventura", many: "Inventury" },
  table: stockCount,
  titleKey: "number",
  permissions: { read: "sklad.read", write: "sklad.inventory" },
  noCreate: true,
  beforeDelete: async (_ctx, raw) => {
    if (raw.status !== "open") throw new UserError("Uzavřenou inventuru nejde smazat.");
  },
  attributes: [
    {
      key: "number",
      label: "Číslo",
      type: "text",
      field: "number",
      readonly: true,
      width: 150,
      defaultVisible: true,
    },
    { ...warehouseRef("warehouse", "Umístění", "warehouseId"), defaultVisible: true },
    {
      key: "status",
      label: "Stav",
      type: "select",
      field: "status",
      readonly: true,
      choices: [
        { value: "open", label: "Probíhá", color: "orange" },
        { value: "closed", label: "Uzavřena", color: "green" },
      ],
      width: 130,
      defaultVisible: true,
    },
    {
      key: "createdAt",
      label: "Založena",
      type: "date",
      field: "createdAt",
      readonly: true,
      width: 130,
      defaultVisible: true,
    },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 260 },
  ],
  search: (r) => ({ title: String(r.number) }),
  url: (id) => `/sklad/inventury/${id}`,
});

export const entities = [
  stockItemEntity,
  warehouseEntity,
  stockDocEntity,
  purchaseOrderEntity,
  stockCountEntity,
];
