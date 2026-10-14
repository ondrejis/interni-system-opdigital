import { can } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";

/**
 * Náklady strojů (tankování, servis), sazby a pořizovací ceny vidí jen ten, kdo stroje spravuje (`stroje.write`)
 * nebo vidí ekonomiku zakázek (`zakazky.economics`). Řidič ví, kolik načerpal, ne kolik to stálo firmu.
 */
export const canSeeCosts = (ctx: Ctx): boolean =>
  can(ctx, "stroje.write") || can(ctx, "zakazky.economics");

/** Vynuluje peněžní pole `keys` u každého řádku (pro aktéra bez práva vidět náklady). */
export function maskCosts<T extends Record<string, unknown>>(
  ctx: Ctx,
  rows: readonly T[],
  keys: readonly (keyof T)[],
): T[] {
  if (canSeeCosts(ctx)) return [...rows];
  return rows.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, null])) }));
}
