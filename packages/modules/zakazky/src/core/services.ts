import type { RetainerSetup, ServiceMap } from "@rebar/core/contracts";
import type { ModuleDeps } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";

/*
  Volitelné služby ostatních modulů (D §2.3) z pohledu zakázek. Služba může chybět (modul není zapnutý nebo ještě
  není hotový), proto se všude používá `optional` a chybějící služba znamená „neznámo“ (`null`) nebo „nic neudělat“.
*/

/**
 * Rozšíření služby `tasks` o práci s úkoly po fázích. Kontrakt `ServiceMap.tasks` je zmrazený; dokud ho architekt
 * nerozšíří (žádost v `docs/opsys/ZADOSTI.md`), použije se jen, když ho služba nabízí. Bez něj se zná jen celkový
 * počet otevřených úkolů zakázky a „dokončit otevřené úkoly“ se nevykoná.
 */
export type TasksPhaseExtension = {
  /** Počet otevřených úkolů po fázích (klíč = id fáze zakázky). */
  openCountsByPhase(
    ctx: Ctx,
    input: { jobId: string; phaseIds: string[] },
  ): Promise<Record<string, number>>;
  /** Dokončí otevřené úkoly daných fází; vrací, kolik jich bylo. */
  completeOpenInPhases(
    ctx: Ctx,
    input: { jobId: string; phaseIds: string[] },
  ): Promise<{ completed: number }>;
  /** Otevřené úkoly zakázky pro uložení hotové zakázky jako šablony. */
  listForTemplate(
    ctx: Ctx,
    input: { jobId: string },
  ): Promise<
    {
      phaseId: string | null;
      title: string;
      typeKey: string;
      priority: "none" | "low" | "medium" | "high" | "urgent";
      assigneeId: string | null;
      dueDate: string | null;
      estimateMin: number | null;
      description: string | null;
    }[]
  >;
};

/** Rozšíření služby `finance` o retainer při založení zakázky („Rovnou retainer“, R-36). */
export type FinanceRetainerExtension = { retainer?: RetainerSetup };

/** Služba `tasks` včetně volitelného rozšíření po fázích, nebo `undefined`. */
export const tasksOf = (deps: ModuleDeps) =>
  deps.services.optional("tasks") as
    (ServiceMap["tasks"] & Partial<TasksPhaseExtension>) | undefined;

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
