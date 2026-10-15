import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { visibleRecordTitles } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { assertCan, type Ctx } from "@rebar/core/rbac";
import { recurringService } from "../schema";
import type { HostingOverview, ServiceRow } from "../types";
import { RENEWAL_WINDOW_DAYS, renewalState, summarizeServices } from "./logic";

/** Strop počtu služeb v jednom dotazu (evidence má desítky, ne tisíce řádků). */
export const SERVICE_LIMIT = 5000;

type Raw = typeof recurringService.$inferSelect;

/** Názvy klientů podle id; klienta, kterého aktér nesmí vidět, nebo smazaného, nahradí `null`. */
export async function companyNames(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry">,
  ids: readonly (string | null)[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  return visibleRecordTitles(ctx, deps.registry, "company", unique);
}

/** Řádek služby pro UI: popisek klienta a stav obnovy k danému dni. */
export function toServiceRow(r: Raw, names: Record<string, string>, today: string): ServiceRow {
  const { level, daysLeft } = renewalState(r.nextRenewal, r.status, today);
  return {
    id: r.id,
    companyId: r.companyId,
    companyName: names[r.companyId] ?? null,
    kind: r.kind,
    name: r.name,
    web: r.web,
    priceMinor: r.priceMinor === null ? null : Number(r.priceMinor),
    period: r.period,
    status: r.status,
    nextRenewal: r.nextRenewal,
    runsAt: r.runsAt,
    daysLeft,
    renewal: level,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Nesmazané služby (volitelně jen jednoho klienta), nejdřív podle další obnovy. */
export async function selectServices(
  ctx: Ctx,
  opts: { companyId?: string; where?: SQL; limit?: number } = {},
): Promise<Raw[]> {
  assertCan(ctx, "muj-prostor.hosting");
  return ctx.db
    .select()
    .from(recurringService)
    .where(
      and(
        isNull(recurringService.deletedAt),
        opts.companyId ? eq(recurringService.companyId, opts.companyId) : undefined,
        opts.where,
      ),
    )
    .orderBy(sql`${recurringService.nextRenewal} asc nulls last`, asc(recurringService.name))
    .limit(opts.limit ?? SERVICE_LIMIT);
}

/** Souhrn evidence hostingu a údržby a nejbližší obnovy (HOST-02). */
export async function loadHostingOverview(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry">,
  today: string,
): Promise<HostingOverview> {
  const rows = await selectServices(ctx);
  const summary = summarizeServices(
    rows.map((r) => ({
      kind: r.kind,
      period: r.period,
      status: r.status,
      priceMinor: r.priceMinor === null ? null : Number(r.priceMinor),
      nextRenewal: r.nextRenewal,
    })),
    today,
  );
  const dueRaw = rows.filter((r) => {
    const { level } = renewalState(r.nextRenewal, r.status, today, RENEWAL_WINDOW_DAYS);
    return level === "overdue" || level === "soon";
  });
  const names = await companyNames(
    ctx,
    deps,
    dueRaw.map((r) => r.companyId),
  );
  return { today, summary, due: dueRaw.map((r) => toServiceRow(r, names, today)) };
}
