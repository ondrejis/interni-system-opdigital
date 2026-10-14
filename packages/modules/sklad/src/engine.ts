import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { assertEntityAccess } from "@rebar/core/entities";
import { nextNumber } from "@rebar/core/numbering";
import { notify } from "@rebar/core/notifications";
import { formatMinor } from "@rebar/core/shared";
import { NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { SKLAD_LOW } from "./notifications";
import { stockDoc, stockDocLine, stockItem, stockLevel, warehouse } from "./schema";
import {
  DOC_SERIES,
  DOC_TYPE_INFO,
  StockError,
  assertDocShape,
  formatQty,
  fromMilli,
  isOutgoing,
  lineTotalMinor,
  mergeLines,
  round,
  toMilli,
  weightedAverage,
  type RawLine,
  type StockDocType,
} from "./stock-math";

/**
 * Skladové jádro — jediné místo, které mění stavy zásob (`stock_level`, `stock_item.total_qty`) a průměrné ceny.
 * Volá se uvnitř transakce (`inTx`), takže doklad, pohyb zásob, číslo z řady i audit jsou jedna atomická změna.
 */

export type PostDocInput = {
  type: StockDocType;
  date: string;
  warehouseId: string;
  targetWarehouseId?: string | null;
  supplierId?: string | null;
  jobId?: string | null;
  purchaseOrderId?: string | null;
  countId?: string | null;
  supplierDocNo?: string | null;
  note?: string | null;
  /** Množství kladné; jen u inventurního rozdílu se znaménkem. `unitPriceMinor` jen u příjemky (bez DPH). */
  lines: RawLine[];
};

export type PostedDoc = {
  id: string;
  number: string;
  totalMinor: number;
  itemIds: string[];
};

/** Překládá chybu čisté logiky na hlášku pro uživatele. */
export async function engineCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StockError) throw new UserError(err.message);
    throw err;
  }
}

async function levelOf(c: Ctx, itemId: string, warehouseId: string): Promise<number> {
  const [row] = await c.db
    .select({ qty: stockLevel.qty })
    .from(stockLevel)
    .where(and(eq(stockLevel.itemId, itemId), eq(stockLevel.warehouseId, warehouseId)));
  return row ? toMilli(row.qty) : 0;
}

async function addLevel(c: Ctx, itemId: string, warehouseId: string, deltaMilli: number) {
  const delta = fromMilli(deltaMilli);
  await c.db
    .insert(stockLevel)
    .values({ itemId, warehouseId, qty: delta })
    .onConflictDoUpdate({
      target: [stockLevel.itemId, stockLevel.warehouseId],
      set: { qty: sql`${stockLevel.qty} + ${delta}::numeric` },
    });
}

/** Čisté vydání na zakázku (výdej − vratky) pro položku, v tisícinách. */
export async function netIssuedMilli(c: Ctx, jobId: string, itemId: string): Promise<number> {
  const [row] = await c.db
    .select({
      net: sql<string>`coalesce(sum(case when ${stockDoc.type} = 'issue' then ${stockDocLine.qty} else -${stockDocLine.qty} end), 0)`,
    })
    .from(stockDocLine)
    .innerJoin(stockDoc, eq(stockDocLine.docId, stockDoc.id))
    .where(
      and(
        eq(stockDoc.jobId, jobId),
        eq(stockDocLine.itemId, itemId),
        inArray(stockDoc.type, ["issue", "return"]),
      ),
    );
  return toMilli(row?.net ?? "0");
}

/**
 * Jednotková cena, za kterou byl položka na zakázku vydaná a ještě nevrácená: (hodnota výdejů − hodnota vratek) / čisté
 * množství. Vratka se oceňuje touto cenou (ne dnešním průměrem skladu), takže vratka zakázku zbaví přesně toho, co ji
 * výdej stál. `null`, když cenu nejde určit (nic nevydáno, nulová hodnota při nenulovém množství).
 */
export async function netIssuedUnitCost(
  c: Ctx,
  jobId: string,
  itemId: string,
): Promise<number | null> {
  const [row] = await c.db
    .select({
      qty: sql<string>`coalesce(sum(case when ${stockDoc.type} = 'issue' then ${stockDocLine.qty} else -${stockDocLine.qty} end), 0)`,
      value: sql<string>`coalesce(sum(case when ${stockDoc.type} = 'issue' then ${stockDocLine.qty} * ${stockDocLine.unitCost} else -${stockDocLine.qty} * ${stockDocLine.unitCost} end), 0)`,
    })
    .from(stockDocLine)
    .innerJoin(stockDoc, eq(stockDocLine.docId, stockDoc.id))
    .where(
      and(
        eq(stockDoc.jobId, jobId),
        eq(stockDocLine.itemId, itemId),
        inArray(stockDoc.type, ["issue", "return"]),
      ),
    );
  const qty = Number(row?.qty ?? 0);
  const value = Number(row?.value ?? 0);
  if (!(qty > 0) || value < 0) return null;
  return round(value / qty);
}

async function assertWarehouse(c: Ctx, id: string, label: string) {
  const [w] = await c.db
    .select({ id: warehouse.id, active: warehouse.active })
    .from(warehouse)
    .where(and(eq(warehouse.id, id), isNull(warehouse.deletedAt)));
  if (!w) throw new UserError(`${label}: umístění neexistuje.`);
  if (!w.active) throw new UserError(`${label}: umístění je vyřazené z provozu.`);
}

/** Zakázka musí existovat a aktér ji musí smět vidět. Bez modulu Zakázky se na zakázku vydat nedá. */
async function assertJob(c: Ctx, jobId: string) {
  try {
    await assertEntityAccess(c, "job", jobId, "read");
  } catch (err) {
    if (err instanceof NotFoundError) throw new UserError("Zakázka neexistuje.");
    if (err instanceof PermissionError)
      throw new UserError("Výdej a vratka na zakázku vyžadují zapnutý modul Zakázky.");
    throw err;
  }
}

/** Zaúčtuje doklad. Volejte uvnitř transakce (`inTx`). Vrací id, číslo a dotčené položky. */
export async function postDoc(c: Ctx, input: PostDocInput): Promise<PostedDoc> {
  return engineCall(async () => {
    assertDocShape(input);
    const lines = mergeLines(input.type, input.lines);
    await assertWarehouse(c, input.warehouseId, "Umístění");
    if (input.type === "transfer") await assertWarehouse(c, input.targetWarehouseId!, "Cíl");
    if (input.jobId && (input.type === "issue" || input.type === "return"))
      await assertJob(c, input.jobId);

    // pevné pořadí zámků položek, aby se souběžné doklady nezablokovaly navzájem
    lines.sort((a, b) => (a.itemId < b.itemId ? -1 : 1));
    const number = await nextNumber(
      c.db,
      DOC_SERIES[input.type],
      new Date(`${input.date}T12:00:00`),
    );

    const rows: { itemId: string; qty: string; unitCost: string; totalMinor: number }[] = [];
    // vratky, u kterých nešla zjistit původní cena výdeje (vrací se za průměrnou cenu skladu)
    const averagePriced: string[] = [];
    for (const l of lines) {
      const [item] = await c.db
        .select()
        .from(stockItem)
        .where(and(eq(stockItem.id, l.itemId), isNull(stockItem.deletedAt)))
        .for("update");
      if (!item) throw new StockError("Položka skladu neexistuje.");
      if (!item.active && input.type !== "adjustment")
        throw new StockError(`${item.name}: skladová karta je vyřazená.`);

      if (isOutgoing(input.type, l.qtyMilli)) {
        const available = await levelOf(c, l.itemId, input.warehouseId);
        const need = Math.abs(l.qtyMilli);
        if (need > available)
          throw new StockError(
            `${item.name}: na umístění je jen ${formatQty(fromMilli(available))} ${item.unit}, požadováno ${formatQty(fromMilli(need))}.`,
          );
      }
      if (input.type === "return") {
        const net = await netIssuedMilli(c, input.jobId!, l.itemId);
        if (l.qtyMilli > net)
          throw new StockError(
            `${item.name}: na zakázku bylo vydáno jen ${formatQty(fromMilli(Math.max(net, 0)))} ${item.unit}.`,
          );
      }

      let unitCost = Number(item.avgCost);
      if (input.type === "return") {
        // vratka za původní cenu výdeje; průměr skladu se přepočte, jako by se zboží za tu cenu přijalo
        const issued = await netIssuedUnitCost(c, input.jobId!, l.itemId);
        if (issued === null) {
          averagePriced.push(item.name);
        } else {
          const avg = weightedAverage(toMilli(item.totalQty), unitCost, l.qtyMilli, issued);
          await c.db
            .update(stockItem)
            .set({ avgCost: String(avg), updatedBy: c.actor.userId })
            .where(eq(stockItem.id, item.id));
          unitCost = issued;
        }
      }
      if (input.type === "receipt") {
        const price = l.unitPriceMinor ?? item.lastPriceMinor;
        if (price == null || price < 0) throw new StockError(`${item.name}: zadejte nákupní cenu.`);
        const avg = weightedAverage(toMilli(item.totalQty), unitCost, l.qtyMilli, price);
        await c.db
          .update(stockItem)
          .set({ avgCost: String(avg), lastPriceMinor: price, updatedBy: c.actor.userId })
          .where(eq(stockItem.id, item.id));
        unitCost = price;
      }

      // pohyb zásob
      let netChange = 0;
      switch (input.type) {
        case "receipt":
        case "return":
          await addLevel(c, l.itemId, input.warehouseId, l.qtyMilli);
          netChange = l.qtyMilli;
          break;
        case "issue":
          await addLevel(c, l.itemId, input.warehouseId, -l.qtyMilli);
          netChange = -l.qtyMilli;
          break;
        case "transfer":
          await addLevel(c, l.itemId, input.warehouseId, -l.qtyMilli);
          await addLevel(c, l.itemId, input.targetWarehouseId!, l.qtyMilli);
          break;
        case "adjustment":
          await addLevel(c, l.itemId, input.warehouseId, l.qtyMilli);
          netChange = l.qtyMilli;
          break;
      }
      if (netChange !== 0)
        await c.db
          .update(stockItem)
          .set({
            totalQty: sql`${stockItem.totalQty} + ${fromMilli(netChange)}::numeric`,
            updatedBy: c.actor.userId,
          })
          .where(eq(stockItem.id, item.id));

      rows.push({
        itemId: l.itemId,
        qty: fromMilli(l.qtyMilli),
        unitCost: String(round(unitCost)),
        totalMinor: lineTotalMinor(l.qtyMilli, unitCost),
      });
    }

    const totalMinor = rows.reduce((a, r) => a + r.totalMinor, 0);
    const [doc] = await c.db
      .insert(stockDoc)
      .values({
        number,
        type: input.type,
        date: input.date,
        warehouseId: input.warehouseId,
        targetWarehouseId: input.type === "transfer" ? input.targetWarehouseId! : null,
        supplierId: input.supplierId ?? null,
        jobId: input.jobId ?? null,
        purchaseOrderId: input.purchaseOrderId ?? null,
        countId: input.countId ?? null,
        supplierDocNo: input.supplierDocNo?.trim() || null,
        note:
          [
            input.note?.trim(),
            averagePriced.length
              ? `Původní cena výdeje není známá, vráceno za průměrnou cenu: ${averagePriced.join(", ")}.`
              : null,
          ]
            .filter(Boolean)
            .join(" ") || null,
        totalMinor,
        lineCount: rows.length,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning({ id: stockDoc.id });
    await c.db.insert(stockDocLine).values(rows.map((r) => ({ ...r, docId: doc!.id })));

    const label = DOC_TYPE_INFO[input.type].label;
    await recordAudit(c, {
      action: "create",
      entityType: "stock_doc",
      entityId: doc!.id,
      summary: `${label} ${number} · ${rows.length} položek · ${formatMinor(totalMinor)}`,
    });
    if (input.jobId && (input.type === "issue" || input.type === "return"))
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: input.jobId,
        summary: `${input.type === "issue" ? "Vydán materiál" : "Vrácen materiál"} ${number} · ${formatMinor(totalMinor)}`,
      });

    return { id: doc!.id, number, totalMinor, itemIds: rows.map((r) => r.itemId) };
  });
}

/**
 * Po výdeji, převodu nebo inventuře: položky, které spadly pod minimum, oznámí skladníkům (nejvýš jednou denně na
 * položku, to hlídá událost). Volá se uvnitř transakce s dokladem: upozornění vznikne s ním (nikdy se neodesílá hned),
 * takže doklad ani neshodí, ani nezdrží.
 */
export async function notifyLowStock(c: Ctx, itemIds: readonly string[]): Promise<void> {
  if (!itemIds.length) return;
  const low = await c.db
    .select({
      id: stockItem.id,
      code: stockItem.code,
      name: stockItem.name,
      unit: stockItem.unit,
      totalQty: stockItem.totalQty,
      minQty: stockItem.minQty,
    })
    .from(stockItem)
    .where(
      and(
        inArray(stockItem.id, [...itemIds]),
        eq(stockItem.belowMin, true),
        eq(stockItem.active, true),
      ),
    )
    .orderBy(asc(stockItem.name));
  for (const item of low)
    await notify(c.db, SKLAD_LOW, {
      params: {
        name: item.name,
        code: item.code,
        onHand: `${formatQty(item.totalQty)} ${item.unit}`,
        minimum: `${formatQty(item.minQty)} ${item.unit}`,
      },
      record: { id: item.id },
      actorId: c.actor.userId,
    });
}
