import "server-only";
import type { DashboardEnv } from "@rebar/core/dashboards";
import { WIDGET_PRESETS } from "@rebar/prehled/presets";
import { NotFoundError, PermissionError, type Ctx } from "@rebar/core/rbac";
import { assertCommandPermission } from "./command-gate";
import { collectDashboard } from "./dashboard";
import { getServices } from "./services";

/** Úkol z odpovědi příkazu `ukoly.list` (jen pole, která widget potřebuje; modul se neimportuje). */
type ListedTask = {
  id: string;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  assigneeName: string | null;
  company: { title: string | null } | null;
  jobNumber: string | null;
  job: { title: string | null } | null;
};

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

const subtitleOf = (t: ListedTask): string =>
  [
    t.dueTime ? `v ${t.dueTime}` : null,
    t.company?.title ?? null,
    t.jobNumber ? `${t.jobNumber}${t.job?.title ? ` ${t.job.title}` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Moje úkoly pro widget „Úkoly na dnes“: dnes a po termínu (pohled `today` modulu úkolů). S `includeDelegated` přibudou
 * úkoly, které jsem zadal já a řeší je jiný, s termínem do dneška. Bez zapnutého modulu nebo oprávnění je seznam prázdný.
 */
async function myTasks(
  ctx: Ctx,
  opts: { includeDelegated: boolean; limit: number },
): Promise<
  {
    id: string;
    title: string;
    dueDate: string | null;
    subtitle?: string;
    href?: string;
    delegated?: boolean;
  }[]
> {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
  const list = async (view: "today" | "delegated") => {
    try {
      const r = (await runModuleCommand(ctx, "ukoly.list", {
        view,
        scope: "mine",
        limit: 50,
        includeSubtasks: true,
      })) as { rows: ListedTask[] };
      return r.rows;
    } catch (e) {
      if (e instanceof NotFoundError || e instanceof PermissionError) return [];
      throw e;
    }
  };
  const own = (await list("today")).map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate,
    subtitle: subtitleOf(t),
    href: `/ukoly?ukol=${t.id}`,
  }));
  const delegated = opts.includeDelegated
    ? (await list("delegated"))
        .filter((t) => t.dueDate && t.dueDate <= today)
        .map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate,
          subtitle: [`řeší ${t.assigneeName ?? "nikdo"}`, subtitleOf(t)]
            .filter(Boolean)
            .join(" · "),
          href: `/ukoly?ukol=${t.id}`,
          delegated: true,
        }))
    : [];
  return [...own, ...delegated]
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, opts.limit)
    .map(({ subtitle, ...t }) => ({ ...t, ...(subtitle ? { subtitle } : {}) }));
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
      myTasks,
    },
    presets: WIDGET_PRESETS,
  };
}

/** Nástěnky jsou zapnuté v konfiguraci klienta (`dashboards.enabled`). */
export const dashboardsEnabled = () => getServices().runtime.config.dashboards.enabled;
export const exportsEnabled = () => getServices().runtime.config.exports.enabled;
