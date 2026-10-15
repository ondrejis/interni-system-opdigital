import { and, eq, inArray, isNull } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx, UserError, type Ctx } from "@rebar/core/rbac";
import type { PhaseChangeResult, PhasePreview } from "../contract";
import { job, jobPhase } from "../schema";
import { emitPhaseChanged, emitPhaseCompleted } from "./events";
import { assertJobWrite } from "./guard";
import { loadJob, loadPhases, type JobRow, type PhaseRow } from "./lookups";
import {
  firstOpenPhase,
  isLastPhase,
  planPhaseChange,
  planPhaseComplete,
  type PhaseLite,
} from "./phase-plan";
import { tasksOf } from "./services";

const lite = (p: PhaseRow): PhaseLite => ({
  id: p.id,
  position: p.position,
  status: p.status,
  role: p.role,
});

/** Marketing po úvodní fázi: na fázi „Retainer“ se nepřechází klikem, ale volbou Pokračovat na retainer. */
function retainerBlocked(j: JobRow, phase: Pick<PhaseRow, "role">): boolean {
  return (
    phase.role === "retainer" &&
    j.type === "marketing" &&
    j.billingModel === "intro_then_retainer" &&
    j.marketingStage !== "retainer"
  );
}

const BLOCK_MESSAGE =
  "Na fázi Retainer se přechází volbou „Pokračovat na retainer“ po vyhodnocení úvodní fáze.";

function assertOpen(j: JobRow): void {
  if (j.status === "done" || j.status === "cancelled")
    throw new UserError("Zakázka je uzavřená. Nejdřív ji znovu otevřete změnou stavu.");
}

/** Najde cílovou fázi podle id, nebo podle názvu (první nehotová, jinak první se shodným názvem). */
function pickTarget(
  phases: PhaseRow[],
  input: { phaseId?: string | undefined; phaseName?: string | undefined },
): PhaseRow {
  if (input.phaseId) {
    const p = phases.find((x) => x.id === input.phaseId);
    if (!p) throw new UserError("Fáze nepatří k této zakázce.");
    return p;
  }
  const name = (input.phaseName ?? "").trim().toLowerCase();
  const matches = phases.filter((x) => x.name.trim().toLowerCase() === name);
  const p = matches.find((x) => x.status !== "done") ?? matches[0];
  if (!p) throw new UserError(`Zakázka nemá fázi „${input.phaseName}“.`);
  return p;
}

type ApplyOptions = {
  deps?: ModuleDeps | undefined;
  completeOpenTasks?: boolean | undefined;
  /** Fáze, která má být aktuální po změně (`null` = ponechat aktuální). */
  current: PhaseRow | null;
  /** Fáze, na kterou má ukazovat aktuální fáze zakázky, aniž by se měnil její stav (poslední dokončená fáze). */
  pointTo?: PhaseRow | null;
  completing: PhaseRow[];
  reopening: PhaseRow[];
  summary: string;
};

/**
 * Provede plán změny fází: dokončí a znovu otevře fáze, nastaví aktuální, zapíše audit a vyšle události
 * (`project.phase_completed` za každou dokončenou fázi, `project.phase_changed` při změně aktuální). Volat v transakci.
 */
async function applyPhaseChange(
  c: Ctx,
  j: JobRow,
  all: PhaseRow[],
  o: ApplyOptions,
): Promise<PhaseChangeResult> {
  let completedTasks = 0;
  if (o.completeOpenTasks && o.completing.length && o.deps) {
    const tasks = tasksOf(o.deps);
    if (tasks)
      completedTasks = (
        await tasks.completeOpenInPhases(c, {
          jobId: j.id,
          phaseIds: o.completing.map((p) => p.id),
        })
      ).completed;
  }
  const now = new Date();
  const stamp = { updatedBy: c.actor.userId };
  if (o.completing.length)
    await c.db
      .update(jobPhase)
      .set({ status: "done", completedAt: now, ...stamp })
      .where(
        inArray(
          jobPhase.id,
          o.completing.map((p) => p.id),
        ),
      );
  if (o.reopening.length)
    await c.db
      .update(jobPhase)
      .set({ status: "not_started", completedAt: null, ...stamp })
      .where(
        inArray(
          jobPhase.id,
          o.reopening.map((p) => p.id),
        ),
      );
  const fromPhaseId = j.currentPhaseId;
  const toPhaseId = o.current?.id ?? o.pointTo?.id ?? fromPhaseId;
  if (o.current && (o.current.status !== "in_progress" || o.current.completedAt))
    await c.db
      .update(jobPhase)
      .set({ status: "in_progress", completedAt: null, ...stamp })
      .where(eq(jobPhase.id, o.current.id));
  if (fromPhaseId !== toPhaseId)
    await c.db
      .update(job)
      .set({ currentPhaseId: toPhaseId, ...stamp })
      .where(eq(job.id, j.id));

  const after: JobRow = { ...j, currentPhaseId: toPhaseId };
  const completedIds = o.completing.map((p) => p.id);
  const doneNow = new Set(completedIds);
  const lites = all.map((p) => ({
    ...lite(p),
    status: doneNow.has(p.id) ? ("done" as const) : p.status,
  }));
  await recordAudit(c, {
    action: "update",
    entityType: "job",
    entityId: j.id,
    summary: o.summary,
    entityTitle: `${j.number} ${j.title}`,
    isPrivate: j.isPrivate,
    changes: [
      {
        field: "Aktuální fáze",
        old: all.find((p) => p.id === fromPhaseId)?.name ?? null,
        new: all.find((p) => p.id === toPhaseId)?.name ?? null,
      },
    ],
  });
  for (const p of o.completing) await emitPhaseCompleted(c, after, p, isLastPhase(lites, p.id));
  if (fromPhaseId !== toPhaseId) await emitPhaseChanged(c, after, fromPhaseId, toPhaseId);
  return { completedPhaseIds: completedIds, currentPhaseId: toPhaseId, completedTasks };
}

/**
 * Nastaví aktuální fázi zakázky (klik na pás fází, přetažení na boardu): dřívější nehotové fáze se dokončí (R-38),
 * pozdější hotové nebo rozpracované se vrátí do stavu Nezahájená, cílová je rozpracovaná. S `completeOpenTasks`
 * se dokončí i otevřené úkoly uzavíraných fází (služba `tasks`).
 */
export async function setCurrentPhaseImpl(
  ctx: Ctx,
  deps: ModuleDeps,
  input: {
    jobId: string;
    phaseId?: string | undefined;
    phaseName?: string | undefined;
    completeOpenTasks?: boolean | undefined;
  },
): Promise<PhaseChangeResult> {
  return inTx(ctx, async (c) => {
    const j = await loadJob(c, input.jobId, { lock: true });
    await assertJobWrite(c, j);
    assertOpen(j);
    const phases = await loadPhases(c.db, j.id);
    const target = pickTarget(phases, input);
    if (retainerBlocked(j, target)) throw new UserError(BLOCK_MESSAGE);
    const plan = planPhaseChange(phases.map(lite), target.id)!;
    const byId = new Map(phases.map((p) => [p.id, p]));
    const unchanged =
      j.currentPhaseId === target.id &&
      target.status === "in_progress" &&
      !plan.completing.length &&
      !plan.reopening.length;
    if (unchanged) return { completedPhaseIds: [], currentPhaseId: target.id, completedTasks: 0 };
    return applyPhaseChange(c, j, phases, {
      deps,
      completeOpenTasks: input.completeOpenTasks,
      current: target,
      completing: plan.completing.map((p) => byId.get(p.id)!),
      reopening: plan.reopening.map((p) => byId.get(p.id)!),
      summary: `Fáze: ${target.name}`,
    });
  });
}

/**
 * Dokončí fázi (i všechny dřívější nehotové) a posune aktuální fázi na další nehotovou. U marketingu před
 * rozhodnutím o retaineru se na fázi Retainer nepřechází (aktuální zůstane dokončená fáze).
 */
export async function completePhaseImpl(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { jobId: string; phaseId: string; completeOpenTasks?: boolean | undefined },
): Promise<PhaseChangeResult> {
  return inTx(ctx, async (c) => {
    const j = await loadJob(c, input.jobId, { lock: true });
    await assertJobWrite(c, j);
    assertOpen(j);
    const phases = await loadPhases(c.db, j.id);
    const target = pickTarget(phases, { phaseId: input.phaseId });
    if (target.status === "done") throw new UserError("Fáze je už dokončená.");
    const byId = new Map(phases.map((p) => [p.id, p]));
    const plan = planPhaseComplete(phases.map(lite), target.id)!;
    const currentPhase = j.currentPhaseId ? byId.get(j.currentPhaseId) : undefined;
    // aktuální fáze je už dál než dokončovaná: pás se nehýbe
    const keepCurrent =
      !!currentPhase && currentPhase.position > target.position && currentPhase.status !== "done";
    let next = !keepCurrent && plan.next ? byId.get(plan.next.id)! : null;
    if (next && retainerBlocked(j, next)) next = null;
    return applyPhaseChange(c, j, phases, {
      deps,
      completeOpenTasks: input.completeOpenTasks,
      current: next,
      pointTo: next || keepCurrent ? null : target,
      completing: plan.completing.map((p) => byId.get(p.id)!),
      reopening: [],
      summary: `Dokončena fáze: ${target.name}`,
    });
  });
}

/**
 * Přesune zakázku do fáze s danou rolí bez kontroly „Retainer jen volbou“ (volá `setMarketingStage` po rozhodnutí).
 * Vrací `false`, když taková fáze není.
 */
export async function moveToRoleTx(c: Ctx, j: JobRow, role: "retainer"): Promise<boolean> {
  const phases = await loadPhases(c.db, j.id);
  const target = phases.find((p) => p.role === role);
  if (!target) return false;
  const plan = planPhaseChange(phases.map(lite), target.id)!;
  if (j.currentPhaseId === target.id && target.status === "in_progress") return true;
  const byId = new Map(phases.map((p) => [p.id, p]));
  await applyPhaseChange(c, j, phases, {
    current: target,
    completing: plan.completing.map((p) => byId.get(p.id)!),
    reopening: plan.reopening.map((p) => byId.get(p.id)!),
    summary: `Fáze: ${target.name}`,
  });
  return true;
}

/**
 * Náhled před změnou fáze: které fáze se dokončí a kolik mají otevřených úkolů (dotaz „dokončit i její otevřené
 * úkoly?“), které se vrátí do stavu Nezahájená a zda je přechod zakázaný.
 */
export async function previewPhaseChangeImpl(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { jobId: string; phaseId: string },
): Promise<PhasePreview> {
  const j = await loadJob(ctx, input.jobId);
  const phases = await loadPhases(ctx.db, j.id);
  const target = pickTarget(phases, { phaseId: input.phaseId });
  const plan = planPhaseChange(phases.map(lite), target.id)!;
  const byId = new Map(phases.map((p) => [p.id, p]));
  const tasks = tasksOf(deps);
  let perPhase: Record<string, number> | null = null;
  if (tasks && plan.completing.length)
    perPhase = await tasks.openCountsByPhase(ctx, {
      jobId: j.id,
      phaseIds: plan.completing.map((p) => p.id),
    });
  let total: number | null = null;
  if (perPhase) total = Object.values(perPhase).reduce((a, b) => a + b, 0);
  else if (tasks && plan.completing.length)
    total = (await tasks.openCounts(ctx, { jobId: j.id })).open;
  else if (tasks) total = 0;
  return {
    target: { id: target.id, name: target.name },
    completing: plan.completing.map((p) => ({
      id: p.id,
      name: byId.get(p.id)!.name,
      openTasks: perPhase ? (perPhase[p.id] ?? 0) : null,
    })),
    reopening: plan.reopening.map((p) => ({ id: p.id, name: byId.get(p.id)!.name })),
    totalOpenTasks: total,
    blockedReason: retainerBlocked(j, target) ? BLOCK_MESSAGE : null,
  };
}

/** Vstup úpravy seznamu fází (`zakazky.phases.edit`). */
export type PhaseEdit = {
  id?: string | undefined;
  name: string;
  role: "intro_evaluation" | "retainer" | null;
  plannedStart?: string | null | undefined;
  plannedEnd?: string | null | undefined;
};

/**
 * Přepíše seznam fází zakázky: pořadí, názvy, role a plánovaná data; fáze, které v seznamu chybí, se odeberou
 * (do koše); nové vzniknou jako nezahájené. Zmizela-li aktuální fáze, aktuální se stane první nehotová. Každou
 * zvláštní roli smí mít nejvýš jedna fáze.
 */
export async function editPhasesImpl(
  ctx: Ctx,
  input: { jobId: string; phases: PhaseEdit[] },
): Promise<{ phaseIds: string[]; currentPhaseId: string | null }> {
  return inTx(ctx, async (c) => {
    const j = await loadJob(c, input.jobId, { lock: true });
    await assertJobWrite(c, j);
    const existing = await loadPhases(c.db, j.id);
    const byId = new Map(existing.map((p) => [p.id, p]));
    const seen = new Set<string>();
    for (const p of input.phases) {
      if (!p.id) continue;
      if (!byId.has(p.id)) throw new UserError("Fáze nepatří k této zakázce.");
      if (seen.has(p.id)) throw new UserError("Fáze je v seznamu dvakrát.");
      seen.add(p.id);
    }
    const roles = input.phases.map((p) => p.role).filter((r) => !!r);
    if (new Set(roles).size !== roles.length)
      throw new UserError("Každou zvláštní roli smí mít nejvýš jedna fáze.");

    const removed = existing.filter((p) => !seen.has(p.id));
    if (removed.length)
      await c.db
        .update(jobPhase)
        .set({ deletedAt: new Date(), deletedBy: c.actor.userId, updatedBy: c.actor.userId })
        .where(
          inArray(
            jobPhase.id,
            removed.map((p) => p.id),
          ),
        );

    const ids: string[] = [];
    const now = { updatedBy: c.actor.userId };
    for (const [position, p] of input.phases.entries()) {
      if (p.id) {
        await c.db
          .update(jobPhase)
          .set({
            name: p.name,
            position,
            role: p.role,
            plannedStart: p.plannedStart ?? null,
            plannedEnd: p.plannedEnd ?? null,
            ...now,
          })
          .where(eq(jobPhase.id, p.id));
        ids.push(p.id);
      } else {
        const [row] = await c.db
          .insert(jobPhase)
          .values({
            jobId: j.id,
            name: p.name,
            position,
            role: p.role,
            plannedStart: p.plannedStart ?? null,
            plannedEnd: p.plannedEnd ?? null,
            isPrivate: j.isPrivate,
            visibilitySource: "inherited",
            createdBy: c.actor.userId,
            ...now,
          })
          .returning({ id: jobPhase.id });
        ids.push(row!.id);
      }
    }

    let currentId = j.currentPhaseId;
    if (currentId && !ids.includes(currentId)) {
      const rest = (await loadPhases(c.db, j.id)).map(lite);
      currentId = firstOpenPhase(rest)?.id ?? null;
      await c.db
        .update(job)
        .set({ currentPhaseId: currentId, ...now })
        .where(eq(job.id, j.id));
      if (currentId && j.status === "active")
        await c.db
          .update(jobPhase)
          .set({ status: "in_progress", ...now })
          .where(and(eq(jobPhase.id, currentId), isNull(jobPhase.completedAt)));
      await emitPhaseChanged(c, { ...j, currentPhaseId: currentId }, j.currentPhaseId, currentId);
    } else if (!currentId && ids.length) {
      const first = (await loadPhases(c.db, j.id)).map(lite);
      currentId = firstOpenPhase(first)?.id ?? null;
      if (currentId) {
        await c.db
          .update(job)
          .set({ currentPhaseId: currentId, ...now })
          .where(eq(job.id, j.id));
        await emitPhaseChanged(c, { ...j, currentPhaseId: currentId }, null, currentId);
      }
    }
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: j.id,
      summary: "Upraveny fáze zakázky",
      entityTitle: `${j.number} ${j.title}`,
      isPrivate: j.isPrivate,
      changes: [
        {
          field: "Fáze",
          old: existing.map((p) => p.name).join(" → "),
          new: input.phases.map((p) => p.name).join(" → "),
        },
      ],
    });
    return { phaseIds: ids, currentPhaseId: currentId };
  });
}
