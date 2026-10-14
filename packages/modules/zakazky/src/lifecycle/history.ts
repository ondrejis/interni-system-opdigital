import { and, eq, isNull, sql } from "drizzle-orm";
import type { Ctx } from "@rebar/core/rbac";
import { job, jobStageHistory } from "../schema";

/**
 * Zapíše vstup zakázky do stavu: uzavře otevřený řádek historie (`left_at`) a založí nový. Nastaví také
 * `job.crm_stage_entered_at` (dny ve stavu, hnití) a zruší ruční přepsání pravděpodobnosti, protože platí pro stav,
 * ve kterém vzniklo (`keepProbability`: přepsání zadané touž úpravou se ponechá). Úprava zakázky tím nemění
 * `updated_at` (je to odvozený údaj, ne úprava záznamu). Vrací okamžik vstupu.
 */
export async function recordStageEntry(
  ctx: Ctx,
  jobId: string,
  stage: { id: string; phase: string | null },
  opts: { keepProbability?: boolean } = {},
): Promise<Date> {
  const now = new Date();
  await ctx.db
    .update(jobStageHistory)
    .set({ leftAt: now })
    .where(and(eq(jobStageHistory.jobId, jobId), isNull(jobStageHistory.leftAt)));
  await ctx.db.insert(jobStageHistory).values({
    jobId,
    stageId: stage.id,
    phase: stage.phase,
    enteredAt: now,
    changedBy: ctx.actor.userId,
  });
  await ctx.db
    .update(job)
    .set({
      crmStageEnteredAt: now,
      ...(opts.keepProbability ? {} : { crmProbabilityPct: null }),
      updatedAt: sql`${job.updatedAt}`,
    })
    .where(eq(job.id, jobId));
  return now;
}
