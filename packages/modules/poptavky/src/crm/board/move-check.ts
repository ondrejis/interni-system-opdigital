import { and, eq, isNull } from "drizzle-orm";
import { getPipeline } from "@rebar/core/config-data";
import {
  assertEntityAccess,
  phaseHooksFor,
  stageHooksFor,
  type PhaseTransition,
} from "@rebar/core/entities";
import { NotFoundError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { isPhaseKey, transitionProblem } from "@rebar/zakazky/phases";
import { job } from "@rebar/zakazky/schema";
import { missingRequiredFields } from "../field-rules";
import { problemFields, type MoveCheck, type MoveProblem } from "./logic";

/**
 * Kontrola přesunu zakázky do stavu bez zápisu (stejné kontroly, které pustí přechod): povolený přechod fází, kontroly
 * hooků přechodu a povinná pole „od stavu“. U každého problému se podle známých pravidel určí pole, které stačí doplnit,
 * aby UI nabídlo vyplnění rovnou, ne jen větu. Cílem je `stageId`, nebo první stav fáze `toPhase`.
 * Oprávnění: čtení zakázky.
 */
export async function checkMove(
  ctx: Ctx,
  jobId: string,
  to: { stageId?: string | undefined; toPhase?: string | undefined },
): Promise<MoveCheck> {
  await assertEntityAccess(ctx, "job", jobId, "read");
  const [row] = await ctx.db
    .select()
    .from(job)
    .where(and(eq(job.id, jobId), isNull(job.deletedAt)));
  if (!row) throw new NotFoundError("Zakázka nenalezena.");
  const pipeline = await getPipeline(ctx.db, "job", "default");
  const stages = pipeline?.stages ?? [];
  const target = to.stageId
    ? stages.find((s) => s.id === to.stageId)
    : stages.find((s) => s.phase === to.toPhase);
  if (!target)
    return {
      target: { id: "", name: "", phase: to.toPhase ?? null },
      problems: [
        { message: "Cílový stav v nastavení zakázek neexistuje.", attr: null, label: null },
      ],
    };
  const info = { id: target.id, name: target.name, phase: target.phase ?? null };
  const record = row as Record<string, unknown>;
  const problems: MoveProblem[] = [];
  const from = isPhaseKey(row.phase) ? row.phase : "inquiry";
  const toPhase = isPhaseKey(target.phase) ? target.phase : from;
  if (target.id === row.stageId) return { target: info, problems };

  if (toPhase !== from) {
    const why = transitionProblem(
      from,
      toPhase,
      isPhaseKey(row.pausedFrom) ? row.pausedFrom : null,
    );
    if (why) problems.push({ message: why, attr: null, label: null });
    else {
      const t: PhaseTransition = { from, to: toPhase };
      for (const h of phaseHooksFor("job", t)) {
        const message = await h.check?.(ctx, record, t);
        if (message) problems.push({ message, ...problemFields(message) });
      }
    }
  }
  const change = {
    fromStageId: String(row.stageId),
    toStageId: target.id,
    fromPhase: from,
    toPhase,
  };
  // ostatní kontroly změny stavu (hooky jiných modulů); pravidla polí vyhodnotí strukturovaně následující krok
  for (const h of stageHooksFor("job")) {
    if (h.id === "crm.deal") continue;
    const message = await h.checkStage?.(ctx, record, change);
    if (message) problems.push({ message, ...problemFields(message) });
  }
  const { missing } = await missingRequiredFields(ctx.db, record, change);
  for (const m of missing)
    problems.push({
      message: `Vyplňte pole „${m.label}“.`,
      attr: m.attr,
      label: m.label,
    });
  return { target: info, problems };
}
