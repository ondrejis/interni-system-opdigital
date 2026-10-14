/**
 * Veřejné rozhraní oblasti „received“ modulu Fakturace (serverový kód, funkce s `ctx`); ostatní se odkazují přes
 * `receivedApi` z `@rebar/fakturace/server`.
 *  - `costLinesForJob`: řádky schválených a uhrazených přijatých faktur zakázky (základ bez DPH) ve tvaru nákladů.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { CostLine } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";
import { company } from "@rebar/kontakty/schema";
import { receivedInvoice, receivedInvoiceLine } from "../schema";
import { COST_STATES } from "./calc";

export async function costLinesForJob(ctx: Ctx, jobId: string): Promise<CostLine[]> {
  const rows = await ctx.db
    .select({
      line: receivedInvoiceLine,
      inv: receivedInvoice,
      supplier: company.name,
    })
    .from(receivedInvoiceLine)
    .innerJoin(receivedInvoice, eq(receivedInvoice.id, receivedInvoiceLine.invoiceId))
    .leftJoin(company, eq(company.id, receivedInvoice.supplierId))
    .where(
      and(
        eq(receivedInvoice.jobId, jobId),
        inArray(receivedInvoice.state, [...COST_STATES]),
        isNull(receivedInvoice.deletedAt),
      ),
    )
    .orderBy(
      asc(receivedInvoice.issueDate),
      asc(receivedInvoice.number),
      asc(receivedInvoiceLine.position),
    );
  return rows.map(({ line, inv, supplier }): CostLine => ({
    category: line.category,
    label: `${inv.number}: ${line.description}`,
    amountMinor: line.netMinor,
    source: "faktura_prijata",
    ref: line.id,
    date: inv.issueDate ?? inv.taxableDate ?? inv.receivedDate ?? undefined,
    supplier: inv.supplier?.name ?? supplier ?? undefined,
    href: `/fakturace/prijate/${inv.id}`,
    sectionId: line.sectionId,
    itemId: line.itemId,
    orderId: inv.orderId,
  }));
}
