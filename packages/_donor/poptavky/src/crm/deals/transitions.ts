import { and, desc, eq, isNull } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { getLookup } from "@rebar/core/config-data";
import { resolveEntity, updateRecord, assertEntityAccess } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx, NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { PHASES, allowedNext, isPhaseKey, transitionProblem } from "@rebar/zakazky/phases";
import { job, jobStageHistory } from "@rebar/zakazky/schema";
import { LOST_REASON_LOOKUP, lifecycleApi } from "@rebar/zakazky/server";
import { isOpenDeal } from "../logic";
import { recomputeJobCrm } from "./recompute";

/** Co obaly přechodů potřebují od aplikace: registr entit (přechod jde vždy přes entitu `job`, takže platí hooky). */
export type DealDeps = Pick<ModuleDeps, "registry">;

type JobRow = typeof job.$inferSelect;

async function loadJob(ctx: Ctx, jobId: string): Promise<JobRow> {
  const [row] = await ctx.db
    .select()
    .from(job)
    .where(and(eq(job.id, jobId), isNull(job.deletedAt)));
  if (!row) throw new NotFoundError("Zakázka nenalezena.");
  return row;
}

/** Změna zakázky přes entitu (`beforeUpdate` → hooky přechodu → zápis → `afterUpdate`), tedy stejná cesta jako `zakazky.transition`. */
async function updateJob(ctx: Ctx, deps: DealDeps, jobId: string, patch: Record<string, unknown>) {
  const def = deps.registry.get("job");
  if (!def) throw new UserError("Modul Zakázky není zapnutý.");
  return updateRecord(ctx, deps.registry, await resolveEntity(ctx.db, def), jobId, patch);
}

const phaseLabel = (p: unknown) => (isPhaseKey(p) ? PHASES[p].label : String(p));

/** Výsledek přechodu obchodu: zakázka, nová fáze a stav. */
export type DealResult = { jobId: string; phase: string; stageId: string };

/**
 * Výhra: obchod (zakázka ve fázi poptávka nebo nabídka) přejde z kteréhokoli stavu do první přípravy. Probíhají
 * kontroly a akce hooků přechodu (pravidla kvality polí).
 */
export async function winDeal(ctx: Ctx, jobId: string, deps: DealDeps): Promise<DealResult> {
  return inTx(ctx, async (c) => {
    await assertEntityAccess(c, "job", jobId, "write");
    const row = await loadJob(c, jobId);
    if (!isOpenDeal(row.phase)) {
      if (row.phase === "lost")
        throw new UserError("Prohranou zakázku nejdřív znovu otevřete, potom ji jde vyhrát.");
      throw new UserError(`Zakázka už je vyhraná (fáze ${phaseLabel(row.phase)}).`);
    }
    const stage = await lifecycleApi.stageForTransition(c.db, "preparation");
    await updateJob(c, deps, jobId, { stage: stage.id });
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: jobId,
      summary: `Obchod vyhrán: ${row.number} ${row.title}`,
    });
    return { jobId, phase: "preparation", stageId: stage.id };
  });
}

/** Vstup prohry: klíč důvodu z číselníku a volitelná poznámka. */
export type LoseInput = { reasonKey: string; note?: string | null | undefined };

/**
 * Prohra: z kterékoli fáze, ze které to lifecycle dovoluje (poptávka až realizace), do prvního stavu fáze „prohráno“.
 * Důvod musí být z číselníku `job.lost_reason`, poznámka je volitelná.
 */
export async function loseDeal(
  ctx: Ctx,
  jobId: string,
  input: LoseInput,
  deps: DealDeps,
): Promise<DealResult> {
  return inTx(ctx, async (c) => {
    await assertEntityAccess(c, "job", jobId, "write");
    const reasons = await getLookup(c.db, LOST_REASON_LOOKUP);
    if (!reasons.some((r) => r.value === input.reasonKey))
      throw new UserError("Vyberte důvod prohry ze seznamu.");
    const row = await loadJob(c, jobId);
    if (row.phase === "lost") throw new UserError("Zakázka už je prohraná.");
    const from = isPhaseKey(row.phase) ? row.phase : "inquiry";
    const problem = transitionProblem(
      from,
      "lost",
      isPhaseKey(row.pausedFrom) ? row.pausedFrom : null,
    );
    if (problem) throw new UserError(problem);
    const stage = await lifecycleApi.stageForTransition(c.db, "lost");
    const note = input.note?.trim() ? input.note.trim().slice(0, 2000) : null;
    await updateJob(c, deps, jobId, {
      stage: stage.id,
      lostReason: input.reasonKey,
      crmLostNote: note,
    });
    const label = reasons.find((r) => r.value === input.reasonKey)?.label ?? input.reasonKey;
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: jobId,
      summary: `Obchod prohrán: ${row.number} ${row.title} (${label})`,
    });
    return { jobId, phase: "lost", stageId: stage.id };
  });
}

/** Fáze, ve kterých jde obchod znovu otevřít: prohraný, nebo vyhraný, dokud se nezačala realizace. */
const REOPENABLE = ["lost", "preparation"] as const;

/**
 * Stav, do kterého se znovuotevřený obchod vrátí: poslední stav z historie, který patří do fáze, kam se z aktuální fáze
 * smí (prohráno: poptávka nebo nabídka; vyhráno: nabídka) a existuje dál. Bez takového stavu první stav povolené fáze.
 */
async function reopenTarget(c: Ctx, row: JobRow): Promise<{ id: string; phase: string }> {
  const from = isPhaseKey(row.phase) ? row.phase : "inquiry";
  const allowed = allowedNext(from, null).filter((p) => p === "inquiry" || p === "offer");
  const stages = await lifecycleApi.jobStages(c.db);
  const history = await c.db
    .select({ stageId: jobStageHistory.stageId })
    .from(jobStageHistory)
    .where(eq(jobStageHistory.jobId, row.id))
    .orderBy(desc(jobStageHistory.enteredAt), desc(jobStageHistory.id));
  for (const h of history) {
    const s = stages.find((x) => x.id === h.stageId);
    if (s && s.phase && s.id !== row.stageId && allowed.includes(s.phase as "inquiry" | "offer"))
      return { id: s.id, phase: s.phase };
  }
  for (const phase of allowed) {
    const s = stages.find((x) => x.phase === phase);
    if (s) return { id: s.id, phase };
  }
  throw new UserError("V nastavení zakázek chybí stav pro znovuotevření obchodu.");
}

/**
 * Znovuotevření prohraného (nebo právě vyhraného) obchodu: vrátí ho do původního stavu podle historie. Důvod prohry
 * i poznámka se vymažou (dělá je přechod z fáze „prohráno“).
 */
export async function reopenDeal(ctx: Ctx, jobId: string, deps: DealDeps): Promise<DealResult> {
  return inTx(ctx, async (c) => {
    await assertEntityAccess(c, "job", jobId, "write");
    const row = await loadJob(c, jobId);
    if (!(REOPENABLE as readonly string[]).includes(row.phase)) {
      if (isOpenDeal(row.phase)) throw new UserError("Obchod je otevřený, není co znovu otevírat.");
      throw new UserError(
        `Zakázku ve fázi ${phaseLabel(row.phase)} už znovu otevřít nejde. Vyhraný obchod jde vrátit jen do zahájení realizace.`,
      );
    }
    const target = await reopenTarget(c, row);
    await updateJob(c, deps, jobId, { stage: target.id });
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: jobId,
      summary: `Obchod znovu otevřen: ${row.number} ${row.title}`,
    });
    return { jobId, phase: target.phase, stageId: target.id };
  });
}

/** Archivace: zakázka zmizí z nástěnky a seznamů (vrací ji pohled Archiv a odarchivování). Fázi ani stav nemění. */
export async function archiveDeal(
  ctx: Ctx,
  jobId: string,
): Promise<{ jobId: string; archivedAt: Date }> {
  return inTx(ctx, async (c) => {
    await assertEntityAccess(c, "job", jobId, "write");
    const row = await loadJob(c, jobId);
    if (row.crmArchivedAt) throw new UserError("Zakázka už je archivovaná.");
    const archivedAt = new Date();
    await c.db
      .update(job)
      .set({ crmArchivedAt: archivedAt, updatedBy: c.actor.userId })
      .where(eq(job.id, jobId));
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: jobId,
      summary: `Zakázka archivována: ${row.number} ${row.title}`,
      changes: [{ field: "Archivováno", old: null, new: archivedAt.toISOString() }],
    });
    await recomputeJobCrm(c, jobId);
    return { jobId, archivedAt };
  });
}

/** Vrátí archivovanou zakázku zpět na nástěnku a do seznamů. */
export async function unarchiveDeal(ctx: Ctx, jobId: string): Promise<{ jobId: string }> {
  return inTx(ctx, async (c) => {
    await assertEntityAccess(c, "job", jobId, "write");
    const row = await loadJob(c, jobId);
    if (!row.crmArchivedAt) throw new UserError("Zakázka není archivovaná.");
    await c.db
      .update(job)
      .set({ crmArchivedAt: null, updatedBy: c.actor.userId })
      .where(eq(job.id, jobId));
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: jobId,
      summary: `Zakázka vrácena z archivu: ${row.number} ${row.title}`,
      changes: [{ field: "Archivováno", old: row.crmArchivedAt.toISOString(), new: null }],
    });
    await recomputeJobCrm(c, jobId);
    return { jobId };
  });
}
