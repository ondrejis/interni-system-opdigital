import { asc, eq } from "drizzle-orm";
import { schema } from "@rebar/core/db";
import type { Ctx } from "@rebar/core/rbac";
import { jobStageHistory } from "@rebar/zakazky/schema";
import { daysSince } from "../logic";

/** Jeden pobyt zakázky ve stavu (pás fází, časová osa, konverze a rychlost obchodu). */
export type StageHistoryRow = {
  id: string;
  stageId: string;
  stageName: string;
  stageColor: string;
  /** Fáze stavu v době vstupu. */
  phase: string | null;
  enteredAt: Date;
  /** Prázdné u aktuálního stavu. */
  leftAt: Date | null;
  changedBy: string | null;
  /** Celé kalendářní dny ve stavu (u aktuálního do dneška), v pražském čase. */
  days: number;
  /** Stav je dnes smazaný (historie zůstává). */
  stageDeleted: boolean;
};

/**
 * Historie stavů zakázky od nejstaršího po aktuální. Oprávnění nekontroluje (volající ověří přístup k zakázce).
 */
export async function stageHistory(
  ctx: Ctx,
  jobId: string,
  now: Date = new Date(),
): Promise<StageHistoryRow[]> {
  const rows = await ctx.db
    .select({
      id: jobStageHistory.id,
      stageId: jobStageHistory.stageId,
      stageName: schema.pipelineStage.name,
      stageColor: schema.pipelineStage.color,
      stageDeletedAt: schema.pipelineStage.deletedAt,
      phase: jobStageHistory.phase,
      enteredAt: jobStageHistory.enteredAt,
      leftAt: jobStageHistory.leftAt,
      changedBy: jobStageHistory.changedBy,
    })
    .from(jobStageHistory)
    .innerJoin(schema.pipelineStage, eq(schema.pipelineStage.id, jobStageHistory.stageId))
    .where(eq(jobStageHistory.jobId, jobId))
    .orderBy(asc(jobStageHistory.enteredAt), asc(jobStageHistory.id));
  return rows.map((r) => ({
    id: r.id,
    stageId: r.stageId,
    stageName: r.stageName,
    stageColor: r.stageColor,
    phase: r.phase,
    enteredAt: r.enteredAt,
    leftAt: r.leftAt,
    changedBy: r.changedBy,
    days: Math.max(0, daysSince(r.enteredAt, r.leftAt ?? now)),
    stageDeleted: r.stageDeletedAt !== null,
  }));
}
