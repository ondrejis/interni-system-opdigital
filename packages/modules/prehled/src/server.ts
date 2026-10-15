import { evaluateWidget } from "@rebar/core/dashboards";
import type { DashboardWidget } from "@rebar/core/dashboards-shared";
import { defineModuleServer, type PrivatePathDef } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";
import { dashboardMetrics, recentChanges } from "./metrics";

/*
  Ruční čtecí cesty modulu pro canary test soukromí (D §5.4). Widgety Číslo a Seznam z pohledu a Rychlé odkazy jdou
  v jádru stejnou datovou vrstvou jako seznamy (`aggregateRecords` / `queryRecords`, tedy `privateScope`), proto je tu
  zkouší vyhodnocení widgetu nad entitami, které nesou soukromé záznamy: partnerovi nesmí prozradit název ani součet.
*/

const ENTITIES = ["company", "person", "job", "deal", "task", "note", "payment", "time_entry"];

const records = (entity: string, column: string): DashboardWidget => ({
  id: "probe-seznam",
  type: "table",
  title: "Seznam",
  w: 6,
  h: 3,
  source: { kind: "records", entity, columns: [column], limit: 50 },
});
const count = (entity: string): DashboardWidget => ({
  id: "probe-cislo",
  type: "kpi",
  title: "Číslo",
  w: 3,
  h: 1,
  source: { kind: "entity", entity, agg: { fn: "count" } },
});

const widgetPaths: PrivatePathDef[] = ENTITIES.flatMap((entity) => [
  {
    name: `prehled.widget.seznam.${entity}`,
    run: async (ctx, deps) => {
      const def = deps.registry.get(entity);
      if (!def) return null;
      const env = { registry: deps.registry, deps, metrics: new Map(), cacheTtlMs: 0 };
      return evaluateWidget(ctx, env, records(entity, def.titleKey), { period: "all" });
    },
  },
  {
    name: `prehled.widget.cislo.${entity}`,
    run: async (ctx, deps) => {
      if (!deps.registry.get(entity)) return null;
      const env = { registry: deps.registry, deps, metrics: new Map(), cacheTtlMs: 0 };
      return evaluateWidget(ctx, env, count(entity), { period: "all" });
    },
  },
]);

export const privatePaths: PrivatePathDef[] = [
  { name: "prehled.metric.recent_changes", run: (ctx, deps) => recentChanges(ctx, deps) },
  {
    name: "prehled.metric.recent_changes_mine",
    run: (ctx, deps) => recentChanges(ctx, deps, { scope: "mine" }),
  },
  ...widgetPaths,
];

/** Serverová část modulu „prehled“: metriky Přehledu a ruční čtecí cesty (soukromí). */
export const server = defineModuleServer({ entities, commands, dashboardMetrics, privatePaths });
