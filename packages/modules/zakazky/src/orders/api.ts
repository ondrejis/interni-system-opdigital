/**
 * Veřejné rozhraní oblasti „orders“ pro ostatní oblasti a moduly (serverový kód, funkce s `ctx`).
 * Ostatní se na oblast odkazují jen přes `ordersApi` z `@rebar/zakazky/server`, ne přes cesty do složky.
 *  - `getOrderBrief`: stručné údaje objednávky (přijatá faktura ji porovná s fakturovanou částkou).
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Ctx } from "@rebar/core/rbac";
import { jobOrder } from "../schema";

export { orderTotals, compareWithOrder } from "./calc";

export type OrderBrief = {
  id: string;
  number: string;
  title: string;
  jobId: string;
  supplierId: string | null;
  status: string;
  /** Objednáno bez DPH v haléřích. */
  totalMinor: number;
};

export async function getOrderBrief(ctx: Ctx, id: string): Promise<OrderBrief | null> {
  const [o] = await ctx.db
    .select({
      id: jobOrder.id,
      number: jobOrder.number,
      title: jobOrder.title,
      jobId: jobOrder.jobId,
      supplierId: jobOrder.supplierId,
      status: jobOrder.status,
      totalMinor: jobOrder.totalMinor,
    })
    .from(jobOrder)
    .where(and(eq(jobOrder.id, id), isNull(jobOrder.deletedAt)));
  return o ?? null;
}
