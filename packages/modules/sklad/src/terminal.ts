import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { defineCommand } from "@rebar/core/module-server";
import { stockItem, warehouse } from "./schema";

/** Nejvíc položek, které terminál vrátí na jedno hledání (v telefonu se stejně nelistuje celý sklad). */
const LIMIT = 30;

/**
 * Hledání skladových karet pro rychlý výdej v terminálu: název, kód nebo EAN (bez ohledu na diakritiku), jen aktivní karty
 * s množstvím na skladě. Vrací jen to, co k výdeji řemeslník potřebuje; ceny nikdy.
 */
export const terminalItems = defineCommand({
  name: "sklad.terminal.items",
  permission: ["sklad.issue", "sklad.read"],
  input: z.object({ q: z.string().trim().max(80).default("") }),
  handler: async (ctx, i) => {
    const p = `%${i.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
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
      })
      .from(stockItem)
      .where(
        and(
          isNull(stockItem.deletedAt),
          eq(stockItem.active, true),
          i.q
            ? sql`(lower(f_unaccent(${stockItem.name})) like lower(f_unaccent(${p})) or ${stockItem.code} ilike ${p} or coalesce(${stockItem.ean}, '') ilike ${p})`
            : undefined,
        ),
      )
      .orderBy(asc(stockItem.name))
      .limit(LIMIT);
    return { warehouses, items, limited: items.length === LIMIT };
  },
});
