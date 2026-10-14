import type { Ctx } from "@rebar/core/rbac";
import * as budget from "../budget/api";
import * as costs from "../costs/api";

/**
 * Volání cizích oblastí (rozpočet, náklady) přes jejich `api.ts`. Funkce, které oblast zatím nevystavila,
 * se přeskočí, aby šla změna vyvíjet a testovat nezávisle; po dodání rozhraní se přeskočení nikdy nestane.
 */
type Fn = (ctx: Ctx, ...args: string[]) => Promise<unknown>;
const call = async (mod: unknown, name: string, ctx: Ctx, ...args: string[]): Promise<boolean> => {
  const fn = (mod as Record<string, Fn | undefined>)[name];
  if (typeof fn !== "function") return false;
  await fn(ctx, ...args);
  return true;
};

/** Propíše řádky schválené změny do realizační verze rozpočtu. `false` = rozpočet tuto funkci nemá. */
export const applyChangeLines = (ctx: Ctx, changeId: string) =>
  call(budget, "applyChangeLines", ctx, changeId);

/** Vrátí propsané řádky (vrácení schválené změny do konceptu). `false` = rozpočet tuto funkci nemá. */
export const revertChangeLines = (ctx: Ctx, changeId: string) =>
  call(budget, "revertChangeLines", ctx, changeId);

/** Přepočítá souhrn zakázky (smluvní cena = původní + schválené změny). */
export const recomputeJobSummary = (ctx: Ctx, jobId: string) =>
  call(costs, "recomputeJobSummary", ctx, jobId);
