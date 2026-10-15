import type { ProjectSnap } from "@rebar/core/contracts";
import { emitDomain } from "@rebar/core/events";
import type { Ctx } from "@rebar/core/rbac";
import type { CompleteReason, PhaseRole } from "../shared";
import type { job, jobPhase } from "../schema";

type JobRow = typeof job.$inferSelect;
type PhaseRow = typeof jobPhase.$inferSelect;

/** Snímek zakázky pro události `project.*` (nikdy celý řádek). */
export function projectSnap(j: JobRow): ProjectSnap {
  return {
    id: j.id,
    number: j.number,
    title: j.title,
    type: j.type,
    companyId: j.companyId,
    ownerId: j.ownerId,
    startDate: j.startDate,
    dueDate: j.dueDate,
  };
}

const entity = (j: JobRow) => ({ type: "job", id: j.id, isPrivate: j.isPrivate });

/** Vyšle `project.created` (Disk založí složku zakázky; webhook pro n8n). */
export async function emitCreated(ctx: Ctx, j: JobRow): Promise<void> {
  await emitDomain(ctx, "project.created", { project: projectSnap(j) }, { entity: entity(j) });
}

/** Vyšle `project.phase_changed` při změně aktuální fáze. */
export async function emitPhaseChanged(
  ctx: Ctx,
  j: JobRow,
  fromPhaseId: string | null,
  toPhaseId: string | null,
): Promise<void> {
  await emitDomain(
    ctx,
    "project.phase_changed",
    { project: projectSnap(j), fromPhaseId, toPhaseId },
    { entity: entity(j) },
  );
}

/** Vyšle `project.phase_completed` (finance po vyhodnocení úvodní fáze nastaví rozhodnutí). */
export async function emitPhaseCompleted(
  ctx: Ctx,
  j: JobRow,
  phase: Pick<PhaseRow, "id" | "name" | "role">,
  isLast: boolean,
): Promise<void> {
  await emitDomain(
    ctx,
    "project.phase_completed",
    {
      jobId: j.id,
      phaseId: phase.id,
      name: phase.name,
      role: (phase.role as PhaseRole | null) ?? null,
      type: j.type,
      marketingStage: j.marketingStage,
      isLast,
    },
    { entity: entity(j) },
  );
}

/** Vyšle `project.completed` při dokončení nebo zrušení zakázky. */
export async function emitCompleted(ctx: Ctx, j: JobRow, reason: CompleteReason): Promise<void> {
  await emitDomain(
    ctx,
    "project.completed",
    { project: projectSnap(j), reason },
    { entity: entity(j) },
  );
}
