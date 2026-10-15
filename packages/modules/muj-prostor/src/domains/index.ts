import { and, count, isNull } from "drizzle-orm";
import { defineModuleServer } from "@rebar/core/module-server";
import { can } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import { webDomain } from "../schema";
import { defaultMetricInput } from "../hosting";
import { unlessDenied } from "../hosting/client-card";
import { domainsCommands } from "./commands";
import { criticalDomainSql, loadDomainList } from "./data";
import { domainMetrics } from "./metrics";

/** Počet kritických domén (DOM-03): méně než `warn_days` dní do expirace nebo po expiraci. Bez oprávnění 0. */
export async function countCriticalDomains(
  ctx: Parameters<typeof loadDomainList>[0],
  today = todayIso(),
): Promise<number> {
  if (!can(ctx, "muj-prostor.domains")) return 0;
  const [r] = await ctx.db
    .select({ n: count() })
    .from(webDomain)
    .where(and(isNull(webDomain.deletedAt), criticalDomainSql(today)));
  return Number(r?.n ?? 0);
}

/**
 * Serverová oblast „domains“ modulu „muj-prostor“ (MPR-1): evidence domén, hromadné vložení, odznak s počtem
 * kritických domén u položky v menu a metriky widgetů Expirace a Kritické domény. Žádné e-maily ani notifikace.
 * Zapojuje ji `server.ts` přes `mergeServers`.
 */
export const area = defineModuleServer({
  commands: domainsCommands,
  dashboardMetrics: domainMetrics,
  navBadges: [
    {
      href: "/muj-prostor/domeny",
      tone: "danger",
      count: (ctx) => countCriticalDomains(ctx),
    },
  ],
  privatePaths: [
    {
      name: "muj-prostor.domains.list",
      run: (ctx, deps) => unlessDenied(() => loadDomainList(ctx, deps, todayIso())),
    },
    {
      name: "muj-prostor.domains.navBadge",
      run: (ctx) => countCriticalDomains(ctx),
    },
    ...domainMetrics.map((m) => ({
      name: m.key,
      run: (ctx: Parameters<typeof m.compute>[0], deps: Parameters<typeof m.compute>[2]) =>
        m.compute(ctx, defaultMetricInput(), deps),
    })),
  ],
});
