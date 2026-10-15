import { defineModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";
import { hodinyMetrics } from "./metrics";
import { weekView } from "./data/read";
import { todayIso } from "@rebar/core/time";

/** Výchozí vstup metrik pro canary test soukromí. */
const metricInput = () => ({
  from: null,
  to: null,
  jobId: null,
  userId: null,
  bucket: null,
  limit: 12,
  params: {},
  today: todayIso(),
});

/** Serverová část modulu „hodiny“: entita záznamu, příkazy a metriky nástěnek. */
export const server = defineModuleServer({
  entities,
  commands,
  dashboardMetrics: hodinyMetrics,
  privatePaths: [
    { name: "hodiny.weekView", run: (ctx, deps) => weekView(ctx, deps, undefined) },
    ...hodinyMetrics.map((m) => ({
      name: m.key,
      run: (ctx: Parameters<typeof m.compute>[0], deps: Parameters<typeof m.compute>[2]) =>
        m.compute(ctx, metricInput(), deps),
    })),
  ],
});

export { timeEntryEntity, entities } from "./entities";
export { timeEntry } from "./schema";
