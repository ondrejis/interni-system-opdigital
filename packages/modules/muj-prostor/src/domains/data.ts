import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { ModuleDeps } from "@rebar/core/module-server";
import { assertCan, type Ctx } from "@rebar/core/rbac";
import { companyNames } from "../hosting/data";
import { recurringService, webDomain } from "../schema";
import type { DomainListResult, DomainRow } from "../types";
import { summarizeDomains } from "./logic";

/** Strop počtu domén v jednom dotazu. */
export const DOMAIN_LIMIT = 5000;

type Raw = typeof webDomain.$inferSelect;

/** Podmínka „kritická doména“: expirace vyplněná a méně než `warn_days` dní do ní (nebo po ní). Shoduje se s `expiryState`. */
export const criticalDomainSql = (today: string): SQL =>
  sql`${webDomain.expiresOn} is not null and (${webDomain.expiresOn} - ${today}::date) < ${webDomain.warnDays}`;

/** Řádek domény pro UI. */
export function toDomainRow(
  r: Raw,
  names: Record<string, string>,
  hosting: Record<string, string>,
): DomainRow {
  return {
    id: r.id,
    domain: r.domain,
    companyId: r.companyId,
    companyName: r.companyId ? (names[r.companyId] ?? null) : null,
    registrar: r.registrar,
    expiresOn: r.expiresOn,
    payer: r.payer,
    autoRenew: r.autoRenew,
    renewalPriceMinor: r.renewalPriceMinor === null ? null : Number(r.renewalPriceMinor),
    recurringServiceId: r.recurringServiceId,
    hostingName: r.recurringServiceId ? (hosting[r.recurringServiceId] ?? null) : null,
    warnDays: r.warnDays,
    note: r.note,
  };
}

/** Názvy hostingových služeb podle id. */
export async function serviceNames(ctx: Ctx, ids: readonly (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return {} as Record<string, string>;
  const rows = await ctx.db
    .select({ id: recurringService.id, name: recurringService.name })
    .from(recurringService)
    .where(inArray(recurringService.id, unique));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

/** Nesmazané domény (volitelně jen jednoho klienta), nejdřív podle expirace. */
export async function selectDomains(
  ctx: Ctx,
  opts: { companyId?: string; limit?: number } = {},
): Promise<Raw[]> {
  assertCan(ctx, "muj-prostor.domains");
  return ctx.db
    .select()
    .from(webDomain)
    .where(
      and(
        isNull(webDomain.deletedAt),
        opts.companyId ? eq(webDomain.companyId, opts.companyId) : undefined,
      ),
    )
    .orderBy(sql`${webDomain.expiresOn} asc nulls last`, asc(webDomain.domain))
    .limit(opts.limit ?? DOMAIN_LIMIT);
}

/** Seznam domén s popisky a souhrnem (DOM-02, DOM-03). */
export async function loadDomainList(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry">,
  today: string,
): Promise<DomainListResult> {
  const rows = await selectDomains(ctx);
  const [names, hosting] = await Promise.all([
    companyNames(
      ctx,
      deps,
      rows.map((r) => r.companyId),
    ),
    serviceNames(
      ctx,
      rows.map((r) => r.recurringServiceId),
    ),
  ]);
  return {
    today,
    rows: rows.map((r) => toDomainRow(r, names, hosting)),
    summary: summarizeDomains(
      rows.map((r) => ({ expiresOn: r.expiresOn, warnDays: r.warnDays, companyId: r.companyId })),
      today,
    ),
    truncated: rows.length >= DOMAIN_LIMIT,
  };
}
