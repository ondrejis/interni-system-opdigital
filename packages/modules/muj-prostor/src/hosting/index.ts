import { defineModuleServer, type DashboardMetricInput } from "@rebar/core/module-server";
import { todayIso } from "@rebar/core/time";
import { clientCardProvider, companyDeleteBlockers, unlessDenied } from "./client-card";
import { hostingCommands } from "./commands";
import { loadHostingOverview, selectServices } from "./data";
import { hostingMetrics } from "./metrics";

/** Vstup metriky pro čtecí cesty (test soukromí): bez období, výchozí limit. */
export const defaultMetricInput = (): DashboardMetricInput => ({
  from: null,
  to: null,
  jobId: null,
  userId: null,
  bucket: null,
  limit: 12,
  params: {},
  today: todayIso(),
});

/**
 * Serverová oblast „hosting“ modulu „muj-prostor“ (MPR-1): evidence hostingu a údržby (souhrn, obnova), příspěvek ke
 * kartě klienta (KLI-09), metriky widgetu Retainery a blokace smazání firmy s hostingem. Zapojuje ji `server.ts`
 * přes `mergeServers`.
 */
export const area = defineModuleServer({
  commands: hostingCommands,
  dashboardMetrics: hostingMetrics,
  contributions: { clientCard: [clientCardProvider] },
  deleteBlockers: companyDeleteBlockers,
  privatePaths: [
    {
      name: "muj-prostor.hosting.overview",
      run: (ctx, deps) => unlessDenied(() => loadHostingOverview(ctx, deps, todayIso())),
    },
    ...hostingMetrics.map((m) => ({
      name: m.key,
      run: (ctx: Parameters<typeof m.compute>[0], deps: Parameters<typeof m.compute>[2]) =>
        m.compute(ctx, defaultMetricInput(), deps),
    })),
    {
      name: "muj-prostor.hosting.clientCard",
      run: (ctx) =>
        unlessDenied(async () => {
          const rows = await selectServices(ctx, { limit: 50 });
          const companies = [...new Set(rows.map((r) => r.companyId))];
          return Promise.all(companies.map((id) => clientCardProvider.tabCounts!(ctx, id)));
        }),
    },
  ],
});

export { clientCardProvider } from "./client-card";
