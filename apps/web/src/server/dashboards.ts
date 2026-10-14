import "server-only";
import type { DashboardEnv } from "@rebar/core/dashboards";
import { collectDashboard } from "./dashboard";
import { getServices } from "./services";

/**
 * Prostředí pro vyhodnocení widgetů nástěnek: registr entit, metriky zapnutých modulů a vestavěné zdroje
 * („Vyžaduje pozornost“, dlaždice modulů). Vše se skládá jen ze zapnutých modulů.
 */
export function getDashboardEnv(): DashboardEnv {
  const s = getServices();
  return {
    registry: s.registry,
    deps: s.moduleDeps,
    metrics: new Map(s.collected.dashboardMetrics.map((m) => [m.key, m])),
    builtins: {
      attention: async (ctx) => (await collectDashboard(ctx)).attention,
      tiles: async (ctx) => (await collectDashboard(ctx)).widgets,
    },
  };
}

/** Nástěnky jsou zapnuté v konfiguraci klienta (`dashboards.enabled`). */
export const dashboardsEnabled = () => getServices().runtime.config.dashboards.enabled;
export const exportsEnabled = () => getServices().runtime.config.exports.enabled;
