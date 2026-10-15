import type { RetainerSetup, ServiceMap } from "@rebar/core/contracts";
import type { ModuleDeps } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";

/*
  Volitelné služby ostatních modulů (D §2.3) z pohledu zakázek. Služba může chybět (modul není zapnutý nebo ještě
  není hotový), proto se všude používá `optional` a chybějící služba znamená „neznámo“ (`null`) nebo „nic neudělat“.
*/

/** Rozšíření služby `finance` o retainer při založení zakázky („Rovnou retainer“, R-36). */
export type FinanceRetainerExtension = { retainer?: RetainerSetup };

/** Služba `tasks` (včetně počtů a dokončování po fázích), nebo `undefined`, když modul Úkoly není zapnutý. */
export const tasksOf = (deps: ModuleDeps): ServiceMap["tasks"] | undefined =>
  deps.services.optional("tasks");

/** Vstup `finance.initJobFinance` rozšířený o retainer. */
export type InitJobFinanceInput = Parameters<ServiceMap["finance"]["initJobFinance"]>[1] &
  FinanceRetainerExtension;

/** Počet otevřených úkolů zakázky, nebo `null`, když modul Úkoly není zapnutý. */
export async function openTaskCount(
  ctx: Ctx,
  deps: ModuleDeps,
  jobId: string,
): Promise<{ open: number; overdue: number } | null> {
  const tasks = tasksOf(deps);
  return tasks ? tasks.openCounts(ctx, { jobId }) : null;
}

/** Počet neuhrazených plateb zakázky, nebo `null`, když modul Finance není zapnutý. */
export async function unpaidPaymentCount(
  ctx: Ctx,
  deps: ModuleDeps,
  jobId: string,
): Promise<number | null> {
  const finance = deps.services.optional("finance");
  return finance ? finance.unpaidCount(ctx, { jobId }) : null;
}
