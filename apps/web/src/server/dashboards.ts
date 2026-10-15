import "server-only";
import type { DashboardEnv } from "@rebar/core/dashboards";
import { createMyTasks } from "@rebar/prehled/my-tasks";
import { WIDGET_PRESETS } from "@rebar/prehled/presets";
import { NotFoundError, type Ctx } from "@rebar/core/rbac";
import { assertCommandPermission } from "./command-gate";
import { collectDashboard } from "./dashboard";
import { getServices } from "./services";

/**
 * Spustí příkaz zapnutého modulu jako přihlášený (stejná kontrola oprávnění jako `runCommand`). Přehled tak nikdy
 * nečte tabulky cizího modulu: úkoly, jejich viditelnost a soukromí zůstávají v modulu `ukoly`.
 */
export async function runModuleCommand(ctx: Ctx, name: string, input: unknown): Promise<unknown> {
  const s = getServices();
  const cmd = s.collected.commands.get(name);
  if (!cmd) throw new NotFoundError("Modul, který tuto akci nabízí, není zapnutý.");
  assertCommandPermission(ctx, cmd);
  return cmd.handler(ctx, cmd.input.parse(input), s.moduleDeps);
}

/**
 * Prostředí pro vyhodnocení widgetů nástěnek: registr entit, metriky zapnutých modulů a vestavěné zdroje
 * („Vyžaduje pozornost“, dlaždice modulů, moje úkoly) a katalog hotových widgetů Přehledu. Vše se skládá jen ze
 * zapnutých modulů.
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
      myTasks: createMyTasks(runModuleCommand),
    },
    presets: WIDGET_PRESETS,
  };
}

/** Nástěnky jsou zapnuté v konfiguraci klienta (`dashboards.enabled`). */
export const dashboardsEnabled = () => getServices().runtime.config.dashboards.enabled;
export const exportsEnabled = () => getServices().runtime.config.exports.enabled;
