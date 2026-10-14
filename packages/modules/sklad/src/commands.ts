import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { auditChange, recordAudit } from "@rebar/core/audit";
import { assertEntityAccess, visibleRecordTitles } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { nextNumber } from "@rebar/core/numbering";
import { can, inTx, NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import { company } from "@rebar/kontakty/schema";
import { engineCall, notifyLowStock, postDoc } from "./engine";
import { maskPrices } from "./prices";
import {
  purchaseOrder,
  purchaseOrderLine,
  stockCount,
  stockCountLine,
  stockDoc,
  stockDocLine,
  stockItem,
  stockLevel,
  warehouse,
} from "./schema";
import { DOC_PERMISSION, DOC_TYPES, StockError, fromMilli, toMilli } from "./stock-math";

const id = z.uuid();
const qtyInput = z.union([z.string(), z.number()]);
const minorInput = z.number().int().min(0).max(1_000_000_000_000);
const dateInput = z.iso.date("Vyplňte datum.");

const ANY_STOCK_WRITE = ["sklad.write", "sklad.issue", "sklad.inventory"] as const;

async function item(c: Ctx, itemId: string) {
  const [row] = await c.db
    .select()
    .from(stockItem)
    .where(and(eq(stockItem.id, itemId), isNull(stockItem.deletedAt)));
  if (!row) throw new NotFoundError("Skladová karta nenalezena.");
  return row;
}

/* ---------- čtení ---------- */

/** Podklady pro formuláře dokladů: umístění a aktivní karty se stavy po umístěních. */
export const options = defineCommand({
  name: "sklad.options",
  permission: "sklad.read",
  input: z.object({}),
  handler: async (ctx) => {
    const warehouses = await ctx.db
      .select({ id: warehouse.id, name: warehouse.name, kind: warehouse.kind })
      .from(warehouse)
      .where(and(isNull(warehouse.deletedAt), eq(warehouse.active, true)))
      .orderBy(asc(warehouse.name));
    const items = await ctx.db
      .select({
        id: stockItem.id,
        code: stockItem.code,
        name: stockItem.name,
        unit: stockItem.unit,
        totalQty: stockItem.totalQty,
        minQty: stockItem.minQty,
        avgCostMinor: stockItem.avgCostMinor,
        lastPriceMinor: stockItem.lastPriceMinor,
        supplierId: stockItem.supplierId,
      })
      .from(stockItem)
      .where(and(isNull(stockItem.deletedAt), eq(stockItem.active, true)))
      .orderBy(asc(stockItem.name));
    const levels = await ctx.db
      .select({
        itemId: stockLevel.itemId,
        warehouseId: stockLevel.warehouseId,
        qty: stockLevel.qty,
      })
      .from(stockLevel)
      .where(ne(stockLevel.qty, "0"));
    const byItem = new Map<string, { warehouseId: string; qty: string }[]>();
    for (const l of levels)
      byItem.set(l.itemId, [
        ...(byItem.get(l.itemId) ?? []),
        { warehouseId: l.warehouseId, qty: l.qty },
      ]);
    return maskPrices(ctx, {
      warehouses,
      items: items.map((i) => ({ ...i, levels: byItem.get(i.id) ?? [] })),
    });
  },
});

/** Přehled zásob se stavy po umístěních a souhrnem. */
export const overview = defineCommand({
  name: "sklad.overview",
  permission: "sklad.read",
  input: z.object({
    q: z.string().trim().max(100).optional(),
    category: z.string().max(80).optional(),
    warehouseId: id.optional(),
    lowOnly: z.boolean().optional(),
  }),
  handler: async (ctx, i) => {
    const where = [isNull(stockItem.deletedAt), eq(stockItem.active, true)];
    if (i.q) {
      const p = `%${i.q.replace(/[\\%_]/g, "\\$&")}%`;
      where.push(
        sql`(lower(f_unaccent(${stockItem.name})) like lower(f_unaccent(${p})) or ${stockItem.code} ilike ${p} or coalesce(${stockItem.ean}, '') ilike ${p})`,
      );
    }
    if (i.category) where.push(eq(stockItem.category, i.category));
    if (i.lowOnly) where.push(eq(stockItem.belowMin, true));
    if (i.warehouseId)
      where.push(
        sql`exists (select 1 from ${stockLevel} l where l.item_id = ${stockItem.id} and l.warehouse_id = ${i.warehouseId} and l.qty <> 0)`,
      );
    const LIMIT = 1000;
    const rows = await ctx.db
      .select({
        id: stockItem.id,
        code: stockItem.code,
        name: stockItem.name,
        category: stockItem.category,
        unit: stockItem.unit,
        totalQty: stockItem.totalQty,
        minQty: stockItem.minQty,
        belowMin: stockItem.belowMin,
        avgCostMinor: stockItem.avgCostMinor,
        valueMinor: stockItem.valueMinor,
        supplierId: stockItem.supplierId,
      })
      .from(stockItem)
      .where(and(...where))
      .orderBy(asc(stockItem.category), asc(stockItem.name))
      .limit(LIMIT + 1);
    const shown = rows.slice(0, LIMIT);
    const levels = shown.length
      ? await ctx.db
          .select({
            itemId: stockLevel.itemId,
            warehouseId: stockLevel.warehouseId,
            qty: stockLevel.qty,
          })
          .from(stockLevel)
          .where(
            and(
              inArray(
                stockLevel.itemId,
                shown.map((r) => r.id),
              ),
              ne(stockLevel.qty, "0"),
            ),
          )
      : [];
    const [summary] = await ctx.db
      .select({
        items: sql<number>`count(*)::int`,
        valueMinor: sql<number>`coalesce(sum(${stockItem.valueMinor}), 0)::float`,
        low: sql<number>`count(*) filter (where ${stockItem.belowMin})::int`,
      })
      .from(stockItem)
      .where(and(isNull(stockItem.deletedAt), eq(stockItem.active, true)));
    const suppliers = await recordTitlesOf(
      ctx,
      shown.flatMap((r) => (r.supplierId ? [r.supplierId] : [])),
    );
    return maskPrices(ctx, {
      rows: shown.map((r) => ({
        ...r,
        supplierName: r.supplierId ? (suppliers[r.supplierId] ?? null) : null,
        levels: levels
          .filter((l) => l.itemId === r.id)
          .map((l) => ({ warehouseId: l.warehouseId, qty: l.qty })),
      })),
      truncated: rows.length > LIMIT,
      summary: {
        items: summary?.items ?? 0,
        valueMinor: Math.round(summary?.valueMinor ?? 0),
        low: summary?.low ?? 0,
      },
      categories: (
        await ctx.db
          .selectDistinct({ category: stockItem.category })
          .from(stockItem)
          .where(and(isNull(stockItem.deletedAt), eq(stockItem.active, true)))
      )
        .flatMap((r) => (r.category ? [r.category] : []))
        .sort((a, b) => a.localeCompare(b, "cs")),
    });
  },
});

async function recordTitlesOf(ctx: Ctx, ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const rows = await ctx.db
    .select({ id: company.id, name: company.name })
    .from(company)
    .where(inArray(company.id, [...new Set(ids)]));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

/** Stavy po umístěních a posledních 100 pohybů jedné karty. */
export const itemDetail = defineCommand({
  name: "sklad.itemDetail",
  permission: "sklad.read",
  input: z.object({ id }),
  handler: async (ctx, i, deps) => {
    await assertEntityAccess(ctx, "stock_item", i.id, "read");
    const it = await item(ctx, i.id);
    const levels = await ctx.db
      .select({
        warehouseId: stockLevel.warehouseId,
        name: warehouse.name,
        kind: warehouse.kind,
        qty: stockLevel.qty,
      })
      .from(stockLevel)
      .innerJoin(warehouse, eq(warehouse.id, stockLevel.warehouseId))
      .where(and(eq(stockLevel.itemId, i.id), ne(stockLevel.qty, "0")))
      .orderBy(asc(warehouse.name));
    const moves = await ctx.db
      .select({
        docId: stockDoc.id,
        number: stockDoc.number,
        type: stockDoc.type,
        date: stockDoc.date,
        qty: stockDocLine.qty,
        unitCost: stockDocLine.unitCost,
        totalMinor: stockDocLine.totalMinor,
        warehouseId: stockDoc.warehouseId,
        targetWarehouseId: stockDoc.targetWarehouseId,
        jobId: stockDoc.jobId,
        supplierId: stockDoc.supplierId,
      })
      .from(stockDocLine)
      .innerJoin(stockDoc, eq(stockDoc.id, stockDocLine.docId))
      .where(and(eq(stockDocLine.itemId, i.id), isNull(stockDoc.deletedAt)))
      .orderBy(desc(stockDoc.date), desc(stockDoc.createdAt))
      .limit(100);
    const whNames = Object.fromEntries(
      (await ctx.db.select({ id: warehouse.id, name: warehouse.name }).from(warehouse)).map((w) => [
        w.id,
        w.name,
      ]),
    );
    const jobs = await visibleRecordTitles(
      ctx,
      deps.registry,
      "job",
      moves.flatMap((m) => (m.jobId ? [m.jobId] : [])),
    );
    const suppliers = await recordTitlesOf(
      ctx,
      moves.flatMap((m) => (m.supplierId ? [m.supplierId] : [])),
    );
    return maskPrices(ctx, {
      unit: it.unit,
      totalQty: it.totalQty,
      minQty: it.minQty,
      avgCostMinor: it.avgCostMinor,
      valueMinor: it.valueMinor,
      levels,
      moves: moves.map((m) => ({
        ...m,
        warehouse: whNames[m.warehouseId] ?? "—",
        target: m.targetWarehouseId ? (whNames[m.targetWarehouseId] ?? "—") : null,
        job: m.jobId ? (jobs[m.jobId] ?? null) : null,
        supplier: m.supplierId ? (suppliers[m.supplierId] ?? null) : null,
      })),
    });
  },
});

/** Zásoby na jednom umístění. */
export const warehouseStock = defineCommand({
  name: "sklad.warehouseStock",
  permission: "sklad.read",
  input: z.object({ id }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "warehouse", i.id, "read");
    const rows = await ctx.db
      .select({
        itemId: stockItem.id,
        code: stockItem.code,
        name: stockItem.name,
        unit: stockItem.unit,
        qty: stockLevel.qty,
        avgCostMinor: stockItem.avgCostMinor,
        valueMinor: sql<number>`round(${stockLevel.qty} * ${stockItem.avgCost})::float`,
      })
      .from(stockLevel)
      .innerJoin(stockItem, eq(stockItem.id, stockLevel.itemId))
      .where(
        and(eq(stockLevel.warehouseId, i.id), ne(stockLevel.qty, "0"), isNull(stockItem.deletedAt)),
      )
      .orderBy(asc(stockItem.name));
    return maskPrices(
      ctx,
      rows.map((r) => ({ ...r, valueMinor: Math.round(r.valueMinor) })),
    );
  },
});

/** Řádky dokladu. */
export const docLines = defineCommand({
  name: "sklad.doc",
  permission: "sklad.read",
  input: z.object({ id }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "stock_doc", i.id, "read");
    const [doc] = await ctx.db.select().from(stockDoc).where(eq(stockDoc.id, i.id));
    if (!doc) throw new NotFoundError();
    const lines = await ctx.db
      .select({
        id: stockDocLine.id,
        itemId: stockItem.id,
        code: stockItem.code,
        name: stockItem.name,
        unit: stockItem.unit,
        qty: stockDocLine.qty,
        unitCost: stockDocLine.unitCost,
        totalMinor: stockDocLine.totalMinor,
      })
      .from(stockDocLine)
      .innerJoin(stockItem, eq(stockItem.id, stockDocLine.itemId))
      .where(eq(stockDocLine.docId, i.id))
      .orderBy(asc(stockItem.name));
    return maskPrices(ctx, { type: doc.type, totalMinor: doc.totalMinor, lines });
  },
});

/** Příjemky k objednávce (kolik se kdy přijalo). */
export const orderDetail = defineCommand({
  name: "sklad.order",
  permission: "sklad.read",
  input: z.object({ id }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "purchase_order", i.id, "read");
    const [po] = await ctx.db.select().from(purchaseOrder).where(eq(purchaseOrder.id, i.id));
    if (!po) throw new NotFoundError();
    const lines = await ctx.db
      .select({
        id: purchaseOrderLine.id,
        itemId: stockItem.id,
        code: stockItem.code,
        name: stockItem.name,
        unit: stockItem.unit,
        qty: purchaseOrderLine.qty,
        receivedQty: purchaseOrderLine.receivedQty,
        unitPriceMinor: purchaseOrderLine.unitPriceMinor,
      })
      .from(purchaseOrderLine)
      .innerJoin(stockItem, eq(stockItem.id, purchaseOrderLine.itemId))
      .where(eq(purchaseOrderLine.orderId, i.id))
      .orderBy(asc(stockItem.name));
    const receipts = await ctx.db
      .select({
        id: stockDoc.id,
        number: stockDoc.number,
        date: stockDoc.date,
        totalMinor: stockDoc.totalMinor,
        supplierDocNo: stockDoc.supplierDocNo,
      })
      .from(stockDoc)
      .where(eq(stockDoc.purchaseOrderId, i.id))
      .orderBy(desc(stockDoc.date));
    return maskPrices(ctx, { status: po.status, warehouseId: po.warehouseId, lines, receipts });
  },
});

/** Řádky inventury s aktuálním stavem (stav se bere v okamžiku uzavření, ne založení). */
export const countDetail = defineCommand({
  name: "sklad.count",
  permission: "sklad.read",
  input: z.object({ id }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "stock_count", i.id, "read");
    const [count] = await ctx.db.select().from(stockCount).where(eq(stockCount.id, i.id));
    if (!count) throw new NotFoundError();
    const lines = await ctx.db
      .select({
        id: stockCountLine.id,
        itemId: stockItem.id,
        code: stockItem.code,
        name: stockItem.name,
        unit: stockItem.unit,
        expectedQty: stockCountLine.expectedQty,
        countedQty: stockCountLine.countedQty,
        currentQty: sql<string>`coalesce((select l.qty from ${stockLevel} l where l.item_id = ${stockItem.id} and l.warehouse_id = ${count.warehouseId}), 0)`,
      })
      .from(stockCountLine)
      .innerJoin(stockItem, eq(stockItem.id, stockCountLine.itemId))
      .where(eq(stockCountLine.countId, i.id))
      .orderBy(asc(stockItem.name));
    return { status: count.status, warehouseId: count.warehouseId, lines };
  },
});

/** Čistá spotřeba materiálu na zakázce (výdej − vratky). */
export const jobMaterial = defineCommand({
  name: "sklad.jobMaterial",
  permission: "sklad.read",
  input: z.object({ jobId: id }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    const rows = await ctx.db
      .select({
        itemId: stockItem.id,
        code: stockItem.code,
        name: stockItem.name,
        unit: stockItem.unit,
        qty: sql<string>`sum(case when ${stockDoc.type} = 'issue' then ${stockDocLine.qty} else -${stockDocLine.qty} end)`,
        valueMinor: sql<number>`sum(case when ${stockDoc.type} = 'issue' then ${stockDocLine.totalMinor} else -${stockDocLine.totalMinor} end)::float`,
      })
      .from(stockDocLine)
      .innerJoin(stockDoc, eq(stockDoc.id, stockDocLine.docId))
      .innerJoin(stockItem, eq(stockItem.id, stockDocLine.itemId))
      .where(and(eq(stockDoc.jobId, i.jobId), inArray(stockDoc.type, ["issue", "return"])))
      .groupBy(stockItem.id, stockItem.code, stockItem.name, stockItem.unit)
      .orderBy(asc(stockItem.name));
    // ceny zakázky vidí jen držitel ekonomiky (montér ví, co vydal, ne kolik to stálo)
    const priced = can(ctx, "zakazky.economics");
    const lines = rows
      .map((r) => ({ ...r, valueMinor: priced ? Math.round(r.valueMinor) : 0 }))
      .filter((r) => toMilli(r.qty) !== 0);
    return { lines, totalMinor: lines.reduce((a, l) => a + l.valueMinor, 0) };
  },
});

/* ---------- doklady ---------- */

const lineInput = z.object({
  itemId: id,
  qty: qtyInput,
  unitPriceMinor: minorInput.nullish(),
});

export const post = defineCommand({
  name: "sklad.post",
  permission: ANY_STOCK_WRITE,
  input: z.object({
    type: z.enum(DOC_TYPES),
    date: dateInput,
    warehouseId: id,
    targetWarehouseId: id.nullish(),
    supplierId: id.nullish(),
    jobId: id.nullish(),
    supplierDocNo: z.string().trim().max(60).nullish(),
    note: z.string().trim().max(500).nullish(),
    lines: z.array(lineInput).min(1, "Přidejte alespoň jednu položku.").max(500),
  }),
  handler: async (ctx, i) => {
    if (!can(ctx, DOC_PERMISSION[i.type])) throw new PermissionError();
    if (i.date > todayIso()) throw new UserError("Doklad nemůže mít datum v budoucnu.");
    const posted = await inTx(ctx, async (c) => {
      const doc = await postDoc(c, i);
      if (i.type === "issue" || i.type === "transfer" || i.type === "adjustment")
        await notifyLowStock(c, doc.itemIds);
      return doc;
    });
    return maskPrices(ctx, {
      id: posted.id,
      number: posted.number,
      totalMinor: posted.totalMinor,
    });
  },
});

/* ---------- objednávky ---------- */

export const orderCreate = defineCommand({
  name: "sklad.order.create",
  permission: "sklad.write",
  input: z.object({
    supplierId: id,
    warehouseId: id,
    jobId: id.nullish(),
    expectedDate: dateInput.nullish(),
    note: z.string().trim().max(500).nullish(),
    send: z.boolean(),
    lines: z
      .array(
        z.object({
          itemId: id,
          qty: qtyInput,
          unitPriceMinor: minorInput.nullish(),
        }),
      )
      .min(1, "Přidejte alespoň jednu položku.")
      .max(300),
  }),
  handler: async (ctx, i) =>
    engineCall(() =>
      inTx(ctx, async (c) => {
        const [supplier] = await c.db
          .select({ id: company.id })
          .from(company)
          .where(and(eq(company.id, i.supplierId), isNull(company.deletedAt)));
        if (!supplier) throw new UserError("Dodavatel neexistuje.");
        const [wh] = await c.db
          .select({ id: warehouse.id })
          .from(warehouse)
          .where(
            and(
              eq(warehouse.id, i.warehouseId),
              isNull(warehouse.deletedAt),
              eq(warehouse.active, true),
            ),
          );
        if (!wh) throw new UserError("Umístění pro příjem neexistuje.");
        if (i.jobId) await assertEntityAccess(c, "job", i.jobId, "read");

        const merged = new Map<string, { qty: number; price: number | null }>();
        for (const l of i.lines) {
          const q = toMilli(l.qty);
          if (q <= 0) throw new StockError("Množství musí být kladné.");
          const cur = merged.get(l.itemId);
          merged.set(l.itemId, {
            qty: (cur?.qty ?? 0) + q,
            price: l.unitPriceMinor ?? cur?.price ?? null,
          });
        }
        const found = await c.db
          .select({ id: stockItem.id })
          .from(stockItem)
          .where(and(inArray(stockItem.id, [...merged.keys()]), isNull(stockItem.deletedAt)));
        if (found.length !== merged.size) throw new UserError("Některá skladová karta neexistuje.");

        const date = todayIso();
        const number = await nextNumber(c.db, "sklad.objednavka", new Date(`${date}T12:00:00`));
        const [po] = await c.db
          .insert(purchaseOrder)
          .values({
            number,
            supplierId: i.supplierId,
            warehouseId: i.warehouseId,
            jobId: i.jobId ?? null,
            expectedDate: i.expectedDate ?? null,
            note: i.note || null,
            status: i.send ? "sent" : "draft",
            date,
            createdBy: c.actor.userId,
            updatedBy: c.actor.userId,
          })
          .returning({ id: purchaseOrder.id });
        await c.db.insert(purchaseOrderLine).values(
          [...merged].map(([itemId, l]) => ({
            orderId: po!.id,
            itemId,
            qty: fromMilli(l.qty),
            unitPriceMinor: l.price,
          })),
        );
        await recordAudit(c, {
          action: "create",
          entityType: "purchase_order",
          entityId: po!.id,
          summary: `${number} · ${merged.size} položek${i.send ? " · odesláno" : ""}`,
        });
        return { id: po!.id, number };
      }),
    ),
});

async function loadOrder(c: Ctx, orderId: string) {
  const [po] = await c.db
    .select()
    .from(purchaseOrder)
    .where(and(eq(purchaseOrder.id, orderId), isNull(purchaseOrder.deletedAt)))
    .for("update");
  if (!po) throw new NotFoundError("Objednávka nenalezena.");
  return po;
}

export const orderSetStatus = defineCommand({
  name: "sklad.order.setStatus",
  permission: "sklad.write",
  input: z.object({ id, status: z.enum(["sent", "cancelled"]) }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      const po = await loadOrder(c, i.id);
      if (i.status === "sent" && po.status !== "draft")
        throw new UserError("Odeslat jde jen koncept objednávky.");
      if (i.status === "cancelled" && (po.status === "received" || po.status === "cancelled"))
        throw new UserError(
          po.status === "received"
            ? "Přijatou objednávku nejde zrušit."
            : "Objednávka už je zrušená.",
        );
      await c.db
        .update(purchaseOrder)
        .set({ status: i.status, updatedBy: c.actor.userId })
        .where(eq(purchaseOrder.id, i.id));
      await auditChange(c, {
        entityType: "purchase_order",
        entityId: i.id,
        before: { Stav: po.status },
        after: { Stav: i.status },
        summary: i.status === "sent" ? "Objednávka odeslána" : "Objednávka zrušena",
      });
    }),
});

/** Příjem objednávky (i částečný): zaúčtuje příjemku, zvýší přijaté množství a přepočítá stav objednávky. */
export const orderReceive = defineCommand({
  name: "sklad.order.receive",
  permission: "sklad.write",
  input: z.object({
    id,
    supplierDocNo: z.string().trim().max(60).nullish(),
    lines: z
      .array(z.object({ lineId: id, qty: qtyInput, unitPriceMinor: minorInput.nullish() }))
      .max(300),
  }),
  handler: async (ctx, i) =>
    engineCall(async () => {
      const posted = await inTx(ctx, async (c) => {
        const po = await loadOrder(c, i.id);
        if (!["draft", "sent", "partial"].includes(po.status))
          throw new UserError("Tuto objednávku už nejde přijmout.");
        const poLines = await c.db
          .select()
          .from(purchaseOrderLine)
          .where(eq(purchaseOrderLine.orderId, i.id));
        const take = i.lines.filter((l) => toMilli(l.qty) > 0);
        if (!take.length) throw new UserError("Zadejte přijaté množství.");

        const lines = take.map((l) => {
          const pl = poLines.find((x) => x.id === l.lineId);
          if (!pl) throw new UserError("Neplatný řádek objednávky.");
          return {
            lineId: l.lineId,
            itemId: pl.itemId,
            qty: l.qty,
            unitPriceMinor: l.unitPriceMinor ?? pl.unitPriceMinor,
          };
        });
        const doc = await postDoc(c, {
          type: "receipt",
          date: todayIso(),
          warehouseId: po.warehouseId,
          supplierId: po.supplierId,
          purchaseOrderId: po.id,
          supplierDocNo: i.supplierDocNo ?? null,
          lines,
        });
        for (const l of lines)
          await c.db
            .update(purchaseOrderLine)
            .set({
              receivedQty: sql`${purchaseOrderLine.receivedQty} + ${fromMilli(toMilli(l.qty))}::numeric`,
            })
            .where(eq(purchaseOrderLine.id, l.lineId));
        const updated = await c.db
          .select()
          .from(purchaseOrderLine)
          .where(eq(purchaseOrderLine.orderId, i.id));
        const complete = updated.every((l) => toMilli(l.receivedQty) >= toMilli(l.qty));
        const status = complete ? "received" : "partial";
        await c.db
          .update(purchaseOrder)
          .set({ status, updatedBy: c.actor.userId })
          .where(eq(purchaseOrder.id, i.id));
        await auditChange(c, {
          entityType: "purchase_order",
          entityId: i.id,
          before: { Stav: po.status },
          after: { Stav: status },
          summary: `Příjem ${doc.number}`,
        });
        return doc;
      });
      return maskPrices(ctx, {
        id: posted.id,
        number: posted.number,
        totalMinor: posted.totalMinor,
      });
    }),
});

/* ---------- inventura ---------- */

export const countStart = defineCommand({
  name: "sklad.count.start",
  permission: "sklad.inventory",
  input: z.object({ warehouseId: id }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      const [wh] = await c.db
        .select({ id: warehouse.id, active: warehouse.active })
        .from(warehouse)
        .where(and(eq(warehouse.id, i.warehouseId), isNull(warehouse.deletedAt)));
      if (!wh) throw new UserError("Umístění neexistuje.");
      const [open] = await c.db
        .select({ id: stockCount.id })
        .from(stockCount)
        .where(
          and(
            eq(stockCount.warehouseId, i.warehouseId),
            eq(stockCount.status, "open"),
            isNull(stockCount.deletedAt),
          ),
        );
      if (open) return { id: open.id, created: false };
      const levels = await c.db
        .select()
        .from(stockLevel)
        .where(eq(stockLevel.warehouseId, i.warehouseId));
      const number = await nextNumber(c.db, "sklad.inventura");
      const [count] = await c.db
        .insert(stockCount)
        .values({
          number,
          warehouseId: i.warehouseId,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning({ id: stockCount.id });
      if (levels.length)
        await c.db
          .insert(stockCountLine)
          .values(
            levels.map((l) => ({ countId: count!.id, itemId: l.itemId, expectedQty: l.qty })),
          );
      await recordAudit(c, {
        action: "create",
        entityType: "stock_count",
        entityId: count!.id,
        summary: `Inventura ${number} · ${levels.length} položek`,
      });
      return { id: count!.id, created: true };
    }),
});

async function openCount(c: Ctx, countId: string) {
  const [count] = await c.db
    .select()
    .from(stockCount)
    .where(and(eq(stockCount.id, countId), isNull(stockCount.deletedAt)))
    .for("update");
  if (!count) throw new NotFoundError("Inventura nenalezena.");
  if (count.status !== "open") throw new UserError("Inventura už je uzavřená.");
  return count;
}

export const countSaveLine = defineCommand({
  name: "sklad.count.saveLine",
  permission: "sklad.inventory",
  input: z.object({ lineId: id, counted: qtyInput.nullable() }),
  handler: async (ctx, i) =>
    engineCall(() =>
      inTx(ctx, async (c) => {
        const [line] = await c.db
          .select()
          .from(stockCountLine)
          .where(eq(stockCountLine.id, i.lineId));
        if (!line) throw new NotFoundError();
        await openCount(c, line.countId);
        let counted: string | null = null;
        if (i.counted !== null && String(i.counted).trim() !== "") {
          const milli = toMilli(i.counted);
          if (milli < 0) throw new StockError("Množství nesmí být záporné.");
          counted = fromMilli(milli);
        }
        await c.db
          .update(stockCountLine)
          .set({ countedQty: counted })
          .where(eq(stockCountLine.id, i.lineId));
      }),
    ),
});

/** Přidá do otevřené inventury položku, která v systému na umístění není (nalezená zásoba). */
export const countAddLine = defineCommand({
  name: "sklad.count.addLine",
  permission: "sklad.inventory",
  input: z.object({ countId: id, itemId: id }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      await openCount(c, i.countId);
      await item(c, i.itemId);
      const [dup] = await c.db
        .select({ id: stockCountLine.id })
        .from(stockCountLine)
        .where(and(eq(stockCountLine.countId, i.countId), eq(stockCountLine.itemId, i.itemId)));
      if (dup) throw new UserError("Položka už v inventuře je.");
      await c.db
        .insert(stockCountLine)
        .values({ countId: i.countId, itemId: i.itemId, expectedQty: "0" });
    }),
});

/** Uzavře inventuru a rozdíly (napočítáno − aktuální stav) zaúčtuje inventurním dokladem. */
export const countClose = defineCommand({
  name: "sklad.count.close",
  permission: "sklad.inventory",
  input: z.object({ id }),
  handler: async (ctx, i) => {
    const res = await engineCall(() =>
      inTx(ctx, async (c) => {
        const count = await openCount(c, i.id);
        const lines = await c.db
          .select()
          .from(stockCountLine)
          .where(eq(stockCountLine.countId, i.id));
        if (lines.some((l) => l.countedQty === null))
          throw new UserError("U všech položek zapište napočítané množství (i nulu).");
        const levels = await c.db
          .select()
          .from(stockLevel)
          .where(eq(stockLevel.warehouseId, count.warehouseId));
        const current = new Map(levels.map((l) => [l.itemId, toMilli(l.qty)]));
        const diffs = lines
          .map((l) => ({
            itemId: l.itemId,
            qty: fromMilli(toMilli(l.countedQty!) - (current.get(l.itemId) ?? 0)),
          }))
          .filter((d) => toMilli(d.qty) !== 0);
        let docNumber: string | null = null;
        let itemIds: string[] = [];
        if (diffs.length) {
          const doc = await postDoc(c, {
            type: "adjustment",
            date: todayIso(),
            warehouseId: count.warehouseId,
            countId: count.id,
            note: `Inventura ${count.number}`,
            lines: diffs,
          });
          docNumber = doc.number;
          itemIds = doc.itemIds;
        }
        if (itemIds.length) await notifyLowStock(c, itemIds);
        await c.db
          .update(stockCount)
          .set({ status: "closed", closedAt: new Date(), updatedBy: c.actor.userId })
          .where(eq(stockCount.id, i.id));
        await auditChange(c, {
          entityType: "stock_count",
          entityId: i.id,
          before: { Stav: "open" },
          after: { Stav: "closed" },
          summary: `Uzavřena inventura ${count.number}${docNumber ? `, rozdíly ${docNumber}` : " bez rozdílů"}`,
        });
        return { docNumber, itemIds };
      }),
    );
    return { docNumber: res.docNumber };
  },
});

export const commands = [
  options,
  overview,
  itemDetail,
  warehouseStock,
  docLines,
  orderDetail,
  countDetail,
  jobMaterial,
  post,
  orderCreate,
  orderSetStatus,
  orderReceive,
  countStart,
  countSaveLine,
  countAddLine,
  countClose,
];
