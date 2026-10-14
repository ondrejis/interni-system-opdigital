import type { AttentionItem, WidgetData } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";
import { getServices } from "./services";

const SEVERITY: Record<AttentionItem["severity"], number> = { danger: 0, warning: 1, info: 2 };

/**
 * „Vyžaduje pozornost“ a dlaždice přehledu od zapnutých modulů. Každý modul dodává jen to, co smí aktér vidět
 * (hlídá si to sám podle oprávnění); chyba jednoho modulu přehled nesmí shodit.
 */
export async function collectDashboard(
  ctx: Ctx,
): Promise<{ attention: AttentionItem[]; widgets: WidgetData[] }> {
  const s = getServices();
  const settle = async <T>(
    fns: readonly ((c: Ctx, d: typeof s.moduleDeps) => Promise<T[]>)[],
  ): Promise<T[]> =>
    (await Promise.allSettled(fns.map((f) => f(ctx, s.moduleDeps)))).flatMap((r) =>
      r.status === "fulfilled" ? r.value : [],
    );
  const [attention, widgets] = await Promise.all([
    settle(s.collected.attention),
    settle(s.collected.widgets),
  ]);
  return {
    attention: attention.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity]),
    widgets: widgets.sort((a, b) => (a.order ?? 50) - (b.order ?? 50)),
  };
}
