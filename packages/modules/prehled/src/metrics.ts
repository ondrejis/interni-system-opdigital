import { defineDashboardMetric, type DashboardMetricDef } from "@rebar/core/module-server";
import type { ModuleDeps } from "@rebar/core/module-server";
import { queryHistory } from "@rebar/core/history";
import type { ListItem } from "@rebar/core/dashboards-shared";
import type { Ctx } from "@rebar/core/rbac";

/*
  Metriky modulu „prehled“. Poslední změny čtou historii výhradně přes `queryHistory`, která každý dotaz na `audit_log`
  vede přes `auditReadScope(ctx)`: partner nevidí změny soukromých záznamů (ani bývalých soukromých) a bezpečnostní
  události vidí jen své (D §5.1). Skrytá pole a částky podle oprávnění vynechá `visibleAudit` uvnitř.
*/

const VERB: Record<string, string> = {
  create: "Založeno",
  update: "Upraveno",
  delete: "Smazáno",
  restore: "Obnoveno",
  visibility_changed: "Změněna viditelnost",
  reorder: "Změněno pořadí",
};

export const RECENT_CHANGES_LIMIT = 8;

/** Poslední změny sdílených záznamů (všech, nebo jen mých). */
export async function recentChanges(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "registry">,
  opts: { scope: "mine" | "all"; limit?: number } = { scope: "all" },
): Promise<ListItem[]> {
  const limit = Math.min(20, Math.max(1, opts.limit ?? RECENT_CHANGES_LIMIT));
  if (opts.scope === "mine" && !ctx.actor.userId) return [];
  // výběr s rezervou: změny cizích typů záznamů (nástěnky, pohledy) a opakované úpravy téhož záznamu se vynechají
  const page = await queryHistory(ctx, deps.registry, {
    category: "data",
    limit: Math.min(200, limit * 5),
    ...(opts.scope === "mine" && ctx.actor.userId ? { actorId: ctx.actor.userId } : {}),
  });
  const seen = new Set<string>();
  const out: ListItem[] = [];
  for (const i of page.items) {
    if (i.state === "none" || !deps.registry.get(i.entityType)) continue;
    const key = `${i.entityType}:${i.entityId}:${i.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: i.id,
      title: `${i.entityLabel}: ${i.entityTitle ?? i.summary ?? "záznam"}`,
      subtitle: `${VERB[i.action] ?? i.action} · ${i.actor}`,
      ...(i.href ? { href: i.href } : {}),
      date: i.at.slice(0, 10),
      ...(i.action === "delete" ? { tone: "warning" as const } : {}),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export const dashboardMetrics: DashboardMetricDef[] = [
  defineDashboardMetric({
    key: "prehled.recent_changes",
    label: "Poslední změny",
    description:
      "Co se v systému naposledy dělo: poslední změny záznamů, které smíte vidět (soukromé záznamy Ondřeje partner nevidí).",
    format: "number",
    shape: "list",
    permissions: ["activity.read"],
    params: [
      {
        key: "scope",
        label: "Čí změny",
        type: "select",
        choices: [
          { value: "all", label: "Vše" },
          { value: "mine", label: "Jen moje" },
        ],
        default: "all",
      },
    ],
    compute: async (ctx, input, deps) => ({
      kind: "list",
      items: await recentChanges(ctx, deps, {
        scope: input.params.scope === "mine" ? "mine" : "all",
        limit: input.limit,
      }),
      emptyText: "Zatím žádné změny.",
    }),
  }),
];
