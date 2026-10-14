import { and, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@rebar/core/db";
import { NotFoundError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { job, jobStageHistory } from "@rebar/zakazky/schema";
import { crmActivity } from "../../schema";
import { effectiveProbabilityPct, isOpenDeal, isRotting, weightedValueMinor } from "../logic";

/** Odvozené údaje CRM zakázky, které `recomputeJobCrm` uloží do sloupců `job.crm_*`. */
export type JobCrmState = {
  stageEnteredAt: Date | null;
  nextActivityAt: Date | null;
  lastActivityAt: Date | null;
  openActivities: number;
  overdueActivities: number;
  rotting: boolean;
  weightedMinor: number;
  /** Platná pravděpodobnost (přepsání na zakázce, jinak stavu) v procentech. */
  probabilityPct: number;
};

const sameTime = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * Přepočítá `crm_*` sloupce zakázky z aktivit (`crm_activity`), historie stavů a stavu pipeline: čas vstupu do stavu,
 * nejbližší otevřená a poslední dokončená aktivita, počty otevřených a zpožděných, hnití a váženou hodnotu.
 * Levné a idempotentní (bez změny nic nezapíše; `updated_at` zakázky nemění). Volá ho každý, kdo mění aktivity nebo
 * stav, jako poslední krok své transakce, a denní úloha hnití. Oprávnění nekontroluje volající.
 */
export async function recomputeJobCrm(
  ctx: Ctx,
  jobId: string,
  now: Date = new Date(),
): Promise<JobCrmState> {
  const [row] = await ctx.db
    .select()
    .from(job)
    .where(and(eq(job.id, jobId), isNull(job.deletedAt)));
  if (!row) throw new NotFoundError("Zakázka nenalezena.");
  const [stage] = await ctx.db
    .select({
      probabilityPct: schema.pipelineStage.probabilityPct,
      rottingDays: schema.pipelineStage.rottingDays,
    })
    .from(schema.pipelineStage)
    .where(eq(schema.pipelineStage.id, row.stageId));

  const [open] = await ctx.db
    .select({ enteredAt: jobStageHistory.enteredAt })
    .from(jobStageHistory)
    .where(and(eq(jobStageHistory.jobId, jobId), isNull(jobStageHistory.leftAt)))
    .orderBy(sql`${jobStageHistory.enteredAt} desc`)
    .limit(1);
  const stageEnteredAt = open?.enteredAt ?? row.crmStageEnteredAt ?? null;

  const nowIso = now.toISOString();
  // celodenní aktivita (`all_day`) je po termínu až od dalšího dne, ostatní po uplynutí času
  const [agg] = await ctx.db
    .select({
      open: sql<number>`count(*) filter (where ${crmActivity.doneAt} is null)::int`,
      overdue: sql<number>`count(*) filter (where ${crmActivity.doneAt} is null and ${crmActivity.dueAt} is not null and (case when ${crmActivity.allDay} then (${crmActivity.dueAt} at time zone 'Europe/Prague')::date < (${nowIso}::timestamptz at time zone 'Europe/Prague')::date else ${crmActivity.dueAt} < ${nowIso}::timestamptz end))::int`,
      next: sql<Date | null>`min(${crmActivity.dueAt}) filter (where ${crmActivity.doneAt} is null)`.mapWith(
        crmActivity.dueAt,
      ),
      last: sql<Date | null>`max(${crmActivity.doneAt})`.mapWith(crmActivity.doneAt),
    })
    .from(crmActivity)
    .where(and(eq(crmActivity.jobId, jobId), isNull(crmActivity.deletedAt)));
  const nextActivityAt = agg?.next ?? null;
  const lastActivityAt = agg?.last ?? null;
  const openActivities = agg?.open ?? 0;
  const overdueActivities = agg?.overdue ?? 0;

  const probabilityPct = effectiveProbabilityPct(
    { phase: row.phase, crmProbabilityPct: row.crmProbabilityPct },
    stage,
  );
  const weightedMinor = weightedValueMinor(row.valueMinor, probabilityPct);
  // hnije jen otevřený obchod, který není v archivu
  const rotting =
    isOpenDeal(row.phase) && !row.crmArchivedAt
      ? isRotting({ stageEnteredAt, lastActivityAt, rottingDays: stage?.rottingDays ?? null }, now)
      : false;

  const state: JobCrmState = {
    stageEnteredAt,
    nextActivityAt,
    lastActivityAt,
    openActivities,
    overdueActivities,
    rotting,
    weightedMinor,
    probabilityPct,
  };
  const same =
    sameTime(row.crmStageEnteredAt, stageEnteredAt) &&
    sameTime(row.crmNextActivityAt, nextActivityAt) &&
    sameTime(row.crmLastActivityAt, lastActivityAt) &&
    row.crmOpenActivities === openActivities &&
    row.crmOverdueActivities === overdueActivities &&
    row.crmRotting === rotting &&
    row.crmWeightedMinor === weightedMinor;
  if (!same)
    await ctx.db
      .update(job)
      .set({
        crmStageEnteredAt: stageEnteredAt,
        crmNextActivityAt: nextActivityAt,
        crmLastActivityAt: lastActivityAt,
        crmOpenActivities: openActivities,
        crmOverdueActivities: overdueActivities,
        crmRotting: rotting,
        crmWeightedMinor: weightedMinor,
        // odvozená čísla nejsou úprava záznamu (jinak by hlášení „záznam mezitím někdo změnil“ chodilo bez příčiny)
        updatedAt: sql`${job.updatedAt}`,
      })
      .where(eq(job.id, jobId));
  return state;
}

/**
 * Přepočítá CRM sloupce všech nesmazaných zakázek (po nasazení nebo změně pravděpodobností stavů); po dávkách.
 * Vrací počet zpracovaných zakázek.
 */
export async function recomputeAllJobsCrm(ctx: Ctx, now: Date = new Date()): Promise<number> {
  const ids = await ctx.db.select({ id: job.id }).from(job).where(isNull(job.deletedAt));
  for (const { id } of ids) await recomputeJobCrm(ctx, id, now);
  return ids.length;
}
