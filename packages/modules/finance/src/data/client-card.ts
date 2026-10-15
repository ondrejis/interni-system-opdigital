import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ClientListMetrics, ClientSummary, ClientTabProvider } from "@rebar/core/contracts";
import { can, type Ctx } from "@rebar/core/rbac";
import { addMonthsIso } from "@rebar/core/time";
import { payment } from "../schema";
import { paymentScope } from "./model";
import { activeRetainersOf } from "./overview";
import { num, today } from "./util";

/** Zaplaceno od data (včetně) podle firem; chybějící firmy mají 0. Jen platby viditelné aktérovi. */
export async function paidSince(
  ctx: Ctx,
  companyIds: readonly string[],
  from: string | null,
): Promise<Record<string, number>> {
  const out = Object.fromEntries(companyIds.map((id) => [id, 0]));
  if (!companyIds.length) return out;
  const rows = await ctx.db
    .select({
      companyId: payment.companyId,
      sum: sql<number>`coalesce(sum(${payment.amountMinor}), 0)`,
    })
    .from(payment)
    .where(
      and(
        inArray(payment.companyId, [...companyIds]),
        eq(payment.status, "paid"),
        isNull(payment.deletedAt),
        paymentScope(ctx),
        from ? sql`${payment.paidOn} >= ${from}` : undefined,
      ),
    )
    .groupBy(payment.companyId);
  for (const r of rows) if (r.companyId) out[r.companyId] = num(r.sum);
  return out;
}

/** Příspěvek financí ke kartě klienta: počet plateb záložky, finanční souhrn a příjem 12 měsíců do seznamu klientů. */
export const clientCardProvider: ClientTabProvider = {
  async tabCounts(ctx, companyId) {
    if (!can(ctx, "finance.read")) return {};
    const [r] = await ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(payment)
      .where(and(eq(payment.companyId, companyId), isNull(payment.deletedAt), paymentScope(ctx)));
    return { finance: num(r?.n) };
  },
  async summary(ctx, companyId): Promise<Partial<ClientSummary>> {
    if (!can(ctx, "finance.read")) return {};
    const from12 = addMonthsIso(today(), -12);
    const total = (await paidSince(ctx, [companyId], null))[companyId] ?? 0;
    const last12 = (await paidSince(ctx, [companyId], from12))[companyId] ?? 0;
    const [u] = await ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(payment)
      .where(
        and(
          eq(payment.companyId, companyId),
          eq(payment.status, "issued"),
          isNull(payment.deletedAt),
          paymentScope(ctx),
        ),
      );
    const retainers = await activeRetainersOf(ctx, [companyId]);
    return {
      finance: {
        income12mMinor: last12,
        incomeTotalMinor: total,
        activeRetainerMinor: retainers.reduce((s, r) => s + r.r.amountMinor, 0),
        unpaidCount: num(u?.n),
      },
    };
  },
  async listMetrics(ctx, companyIds): Promise<Record<string, Partial<ClientListMetrics>>> {
    if (!can(ctx, "finance.read")) return {};
    const sums = await paidSince(ctx, companyIds, addMonthsIso(today(), -12));
    return Object.fromEntries(companyIds.map((id) => [id, { income12mMinor: sums[id] ?? 0 }]));
  },
};
