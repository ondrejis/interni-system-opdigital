import { defineModuleServer, type DashboardMetricInput } from "@rebar/core/module-server";
import { todayIso } from "@rebar/core/time";
import { createFinanceService } from "../service";
import { clientCardProvider } from "./client-card";
import { onPhaseCompleted } from "./events";
import { retainerCatchupJob, retainerGenerateJob } from "./retainer-jobs";
import { financeMetrics, financeWidgets, overdueAttention, overdueBadge } from "./metrics";
import { listPayments } from "./payments";
import { reports } from "./reports";
import { getBalance } from "./settlements";

/** Vstup metriky pro čtecí cesty (test soukromí): bez období, výchozí limit. */
const defaultMetricInput = (): DashboardMetricInput => ({
  from: null,
  to: null,
  jobId: null,
  userId: null,
  bucket: null,
  limit: 10,
  params: {},
  today: todayIso(),
});

/**
 * Serverová oblast „data“ modulu „finance“ (FIN-B): služba `finance`, příspěvek ke kartě klienta, metriky a dlaždice
 * nástěnek, odznak po splatnosti, úlohy retaineru a obsluha událostí zakázek. Zapojuje ji `server.ts` přes `mergeServers`.
 */
export const area = defineModuleServer({
  services: { finance: createFinanceService },
  contributions: { clientCard: [clientCardProvider] },
  dashboardMetrics: financeMetrics,
  widgets: [financeWidgets],
  attention: [overdueAttention],
  navBadges: [overdueBadge],
  jobs: [retainerGenerateJob, retainerCatchupJob],
  eventHandlers: { "project.phase_completed": onPhaseCompleted },
  privatePaths: [
    ...financeMetrics.map((m) => ({
      name: m.key,
      run: (ctx: Parameters<typeof m.compute>[0], deps: Parameters<typeof m.compute>[2]) =>
        m.compute(ctx, defaultMetricInput(), deps),
    })),
    { name: "finance.widgets", run: (ctx, deps) => financeWidgets(ctx, deps) },
    { name: "finance.attention", run: (ctx, deps) => overdueAttention(ctx, deps) },
    { name: "finance.navBadge.overdue", run: (ctx, deps) => overdueBadge.count(ctx, deps) },
    {
      name: "finance.clientCard.tabCounts",
      run: async (ctx, deps) => {
        const rows = (
          await listPayments(ctx, deps, {
            dateField: "effective",
            overdueOnly: false,
            includePrivate: true,
            sort: "createdAt",
            direction: "desc",
            limit: 50,
            offset: 0,
          })
        ).rows;
        return Promise.all(
          [...new Set(rows.flatMap((r) => (r.companyId ? [r.companyId] : [])))].map((id) =>
            clientCardProvider.summary!(ctx, id),
          ),
        );
      },
    },
    { name: "finance.balance.view", run: (ctx, deps) => getBalance(ctx, deps, {}) },
    {
      name: "finance.reports",
      run: (ctx, deps) => reports(ctx, deps, { includePrivate: true, basis: "paid" }),
    },
  ],
});
