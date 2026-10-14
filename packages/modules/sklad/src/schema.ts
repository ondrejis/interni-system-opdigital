import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { audit, minor, pk, schema, ts } from "@rebar/core/db";
import { company } from "@rebar/kontakty/schema";

const { user } = schema;

/** Množství: `numeric(14,3)`, v kódu desetinný řetězec (ADR 003). */
const qty = (name: string) => numeric(name, { precision: 14, scale: 3 });
/** Jednotková cena v haléřích s dvěma desetinnými místy navíc, aby vážený průměr nezaokrouhloval po každém příjmu. */
const unitCost = (name: string) => numeric(name, { precision: 16, scale: 4 });

/** Umístění zásob: sklad, dílna, vozidlo (materiál v dodávce) nebo stavba. Vozidlo a zakázka jsou měkké odkazy. */
export const warehouse = pgTable("warehouse", {
  id: pk(),
  name: text("name").notNull(),
  /** `warehouse`, `workshop`, `vehicle`, `site`. */
  kind: text("kind").notNull().default("warehouse"),
  assetId: uuid("asset_id"),
  jobId: uuid("job_id"),
  responsibleId: uuid("responsible_id").references(() => user.id),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  ...audit(),
});

/**
 * Skladová karta. `totalQty` je součet přes všechna umístění a udržuje ho výhradně skladové jádro (`engine.ts`);
 * `avgCost` je vážený průměr nákupní ceny bez DPH v haléřích se 4 desetinnými místy. Odvozené sloupce
 * (`avgCostMinor`, `valueMinor`, `belowMin`) počítá databáze, aby šly filtrovat a sčítat v seznamu.
 */
export const stockItem = pgTable(
  "stock_item",
  {
    id: pk(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    unit: text("unit").notNull().default("ks"),
    ean: text("ean"),
    minQty: qty("min_qty").notNull().default("0"),
    totalQty: qty("total_qty").notNull().default("0"),
    supplierId: uuid("supplier_id").references(() => company.id),
    lastPriceMinor: minor("last_price_minor"),
    avgCost: unitCost("avg_cost").notNull().default("0"),
    avgCostMinor: minor("avg_cost_minor").generatedAlwaysAs(sql`round(avg_cost)::bigint`),
    valueMinor: minor("value_minor").generatedAlwaysAs(sql`round(total_qty * avg_cost)::bigint`),
    belowMin: boolean("below_min").generatedAlwaysAs(sql`min_qty > 0 and total_qty < min_qty`),
    vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default("21"),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    custom: jsonb("custom")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...audit(),
  },
  (t) => [
    uniqueIndex("stock_item_code_uq")
      .on(t.code)
      .where(sql`${t.deletedAt} is null`),
    index("stock_item_supplier_idx").on(t.supplierId),
    index("stock_item_name_trgm_idx").using("gin", sql`lower(f_unaccent(${t.name})) gin_trgm_ops`),
    index("stock_item_code_trgm_idx").using("gin", sql`lower(f_unaccent(${t.code})) gin_trgm_ops`),
    index("stock_item_ean_trgm_idx").using("gin", sql`lower(f_unaccent(${t.ean})) gin_trgm_ops`),
    index("stock_item_custom_idx").using("gin", t.custom),
  ],
);

/** Stav jedné položky na jednom umístění. */
export const stockLevel = pgTable(
  "stock_level",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => stockItem.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouse.id, { onDelete: "cascade" }),
    qty: qty("qty").notNull().default("0"),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.warehouseId] })],
);

/** Objednávka u dodavatele. Stav: `draft` → `sent` → `partial` → `received`, nebo `cancelled`. */
export const purchaseOrder = pgTable(
  "purchase_order",
  {
    id: pk(),
    number: text("number").notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => company.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouse.id),
    jobId: uuid("job_id"),
    status: text("status").notNull().default("draft"),
    date: date("date", { mode: "string" }).notNull(),
    expectedDate: date("expected_date", { mode: "string" }),
    note: text("note"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("purchase_order_number_uq").on(t.number),
    index("po_supplier_idx").on(t.supplierId),
  ],
);

export const purchaseOrderLine = pgTable(
  "purchase_order_line",
  {
    id: pk(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => purchaseOrder.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => stockItem.id),
    qty: qty("qty").notNull(),
    receivedQty: qty("received_qty").notNull().default("0"),
    unitPriceMinor: minor("unit_price_minor"),
  },
  (t) => [index("po_line_order_idx").on(t.orderId)],
);

/** Inventura jednoho umístění. Stav: `open` → `closed` (rozdíly se zaúčtují inventurním dokladem). */
export const stockCount = pgTable(
  "stock_count",
  {
    id: pk(),
    number: text("number").notNull(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouse.id),
    status: text("status").notNull().default("open"),
    note: text("note"),
    closedAt: ts("closed_at"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("stock_count_number_uq").on(t.number),
    // na jednom umístění smí být otevřená jen jedna inventura
    uniqueIndex("stock_count_open_uq")
      .on(t.warehouseId)
      .where(sql`${t.status} = 'open' and ${t.deletedAt} is null`),
  ],
);

export const stockCountLine = pgTable(
  "stock_count_line",
  {
    id: pk(),
    countId: uuid("count_id")
      .notNull()
      .references(() => stockCount.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => stockItem.id),
    expectedQty: qty("expected_qty").notNull(),
    countedQty: qty("counted_qty"),
  },
  (t) => [index("stock_count_line_count_idx").on(t.countId)],
);

/**
 * Skladový doklad (neměnný, vzniká jen zaúčtováním). Směr pohybu podle typu:
 * `receipt` + do `warehouseId` · `issue` − z `warehouseId` na zakázku · `transfer` − z `warehouseId`, + do `targetWarehouseId` ·
 * `return` + do `warehouseId` ze zakázky · `adjustment` ± ve `warehouseId` (znaménko u řádku). Zakázka je měkký odkaz.
 */
export const stockDoc = pgTable(
  "stock_doc",
  {
    id: pk(),
    number: text("number").notNull(),
    type: text("type").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouse.id),
    targetWarehouseId: uuid("target_warehouse_id").references(() => warehouse.id),
    supplierId: uuid("supplier_id").references(() => company.id),
    jobId: uuid("job_id"),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrder.id),
    countId: uuid("count_id").references(() => stockCount.id),
    /** Číslo dodacího listu nebo faktury dodavatele. */
    supplierDocNo: text("supplier_doc_no"),
    note: text("note"),
    totalMinor: minor("total_minor").notNull().default(0),
    lineCount: integer("line_count").notNull().default(0),
    ...audit(),
  },
  (t) => [
    uniqueIndex("stock_doc_number_uq").on(t.number),
    index("stock_doc_job_idx").on(t.jobId),
    index("stock_doc_date_idx").on(t.date),
    index("stock_doc_warehouse_idx").on(t.warehouseId),
  ],
);

export const stockDocLine = pgTable(
  "stock_doc_line",
  {
    id: pk(),
    docId: uuid("doc_id")
      .notNull()
      .references(() => stockDoc.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => stockItem.id),
    /** U inventurního rozdílu může být záporné. */
    qty: qty("qty").notNull(),
    unitCost: unitCost("unit_cost").notNull(),
    totalMinor: minor("total_minor").notNull(),
  },
  (t) => [
    index("stock_doc_line_item_idx").on(t.itemId),
    index("stock_doc_line_doc_idx").on(t.docId),
  ],
);
