import { can } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";

/**
 * Nákupní ceny, hodnota zásob a ceny dokladů vidí jen ten, kdo sklad spravuje (`sklad.write`) nebo vidí ekonomiku
 * zakázek (`zakazky.economics`). Montér a mistr ví, co vydali a kolik toho je, ne kolik to stálo.
 */
export const canSeePrices = (ctx: Ctx): boolean =>
  can(ctx, "sklad.write") || can(ctx, "zakazky.economics");

const PRICE_KEYS = new Set([
  "avgCostMinor",
  "lastPriceMinor",
  "valueMinor",
  "unitCost",
  "totalMinor",
  "unitPriceMinor",
]);

/** Vrátí kopii odpovědi, ve které jsou peněžní pole `null` (pro aktéra bez práva vidět ceny). */
export function maskPrices<T>(ctx: Ctx, value: T): T {
  if (canSeePrices(ctx)) return value;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && !(v instanceof Date))
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, PRICE_KEYS.has(k) ? null : walk(x)]),
      );
    return v;
  };
  return walk(value) as T;
}
