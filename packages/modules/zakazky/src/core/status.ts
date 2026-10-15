import { and, eq } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx, UserError, type Ctx } from "@rebar/core/rbac";
import type { CompletePreview, CompleteResult } from "../contract";
import { job, jobPhase } from "../schema";
import { JOB_STATUS_LABELS, todayPrague, type CompleteReason, type JobStatusCode } from "../shared";
import { emitCompleted } from "./events";
import { assertJobWrite } from "./guard";
import { companyNames, loadJob, otherLiveJobs, type JobRow } from "./lookups";
import { openTaskCount, unpaidPaymentCount } from "./services";

async function counts(c: Ctx, deps: ModuleDeps, j: JobRow): Promise<CompletePreview> {
  const [tasks, unpaid, others, names] = await Promise.all([
    openTaskCount(c, deps, j.id),
    unpaidPaymentCount(c, deps, j.id),
    otherLiveJobs(c, j.companyId, j.id),
    companyNames(c, [j.companyId]),
  ]);
  return {
    openTasks: tasks?.open ?? 0,
    unpaidPayments: unpaid ?? 0,
    clientHasOtherActiveJob: others > 0,
    clientId: j.companyId,
    clientName: names.get(j.companyId) ?? null,
  };
}

/** Co zůstalo otevřené u zakázky (otevřené úkoly, neuhrazené platby, další živá zakázka klienta); nic nemění. */
export async function previewCompleteImpl(
  ctx: Ctx,
  deps: ModuleDeps,
  jobId: string,
): Promise<CompletePreview> {
  const j = await loadJob(ctx, jobId);
  return counts(ctx, deps, j);
}

/** Do jakého stavu vede důvod ukončení. */
export const statusOfReason = (reason: CompleteReason): JobStatusCode =>
  reason === "cancelled" ? "cancelled" : "done";

/**
 * Dokončí nebo zruší zakázku (`finished` a `retainer_ended` = Dokončená, `cancelled` = Zrušená). Nezablokuje: otevřené
 * úkoly a neuhrazené platby jen vrátí, aby je UI ukázalo. Retainer ukončený přepne marketing do stavu Ukončeno.
 * Vyšle `project.completed`.
 */
export async function completeJobImpl(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { jobId: string; reason: CompleteReason },
): Promise<CompleteResult> {
  return inTx(ctx, async (c) => {
    const j = await loadJob(c, input.jobId, { lock: true });
    await assertJobWrite(c, j);
    if (j.status === "done" || j.status === "cancelled")
      throw new UserError("Zakázka je už uzavřená.");
    const status = statusOfReason(input.reason);
    const info = await counts(c, deps, j);
    const stage =
      input.reason === "retainer_ended" && j.type === "marketing" ? "ended" : j.marketingStage;
    const [after] = await c.db
      .update(job)
      .set({ status, completedAt: new Date(), marketingStage: stage, updatedBy: c.actor.userId })
      .where(eq(job.id, j.id))
      .returning();
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: j.id,
      summary: input.reason === "cancelled" ? "Zakázka zrušena" : "Zakázka dokončena",
      entityTitle: `${j.number} ${j.title}`,
      isPrivate: j.isPrivate,
      changes: [
        { field: "Stav", old: JOB_STATUS_LABELS[j.status], new: JOB_STATUS_LABELS[status] },
      ],
    });
    await emitCompleted(c, after!, input.reason);
    return { ...info, status, reason: input.reason };
  });
}

/**
 * Změní stav zakázky. Přechod do Dokončená nebo Zrušená jde přes `completeJobImpl` (důvod `finished` / `cancelled`);
 * znovuotevření uzavřené zakázky smaže datum dokončení a zahájí aktuální fázi.
 */
export async function setStatusImpl(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { jobId: string; status: JobStatusCode },
): Promise<{ status: JobStatusCode; closed: false } | ({ closed: true } & CompleteResult)> {
  if (input.status === "done" || input.status === "cancelled") {
    const out = await completeJobImpl(ctx, deps, {
      jobId: input.jobId,
      reason: input.status === "done" ? "finished" : "cancelled",
    });
    return { ...out, closed: true };
  }
  return inTx(ctx, async (c) => {
    const j = await loadJob(c, input.jobId, { lock: true });
    await assertJobWrite(c, j);
    if (j.status === input.status) return { status: j.status, closed: false as const };
    const reopened = j.status === "done" || j.status === "cancelled";
    await c.db
      .update(job)
      .set({
        status: input.status,
        ...(reopened ? { completedAt: null } : {}),
        updatedBy: c.actor.userId,
      })
      .where(eq(job.id, j.id));
    if (input.status === "active" && j.currentPhaseId)
      await c.db
        .update(jobPhase)
        .set({ status: "in_progress", updatedBy: c.actor.userId })
        .where(and(eq(jobPhase.id, j.currentPhaseId), eq(jobPhase.status, "not_started")));
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: j.id,
      summary: reopened
        ? "Zakázka znovu otevřena"
        : `Stav zakázky: ${JOB_STATUS_LABELS[input.status]}`,
      entityTitle: `${j.number} ${j.title}`,
      isPrivate: j.isPrivate,
      changes: [
        { field: "Stav", old: JOB_STATUS_LABELS[j.status], new: JOB_STATUS_LABELS[input.status] },
      ],
    });
    return { status: input.status, closed: false as const };
  });
}

/**
 * Po ukončení zakázky: klient přejde do stavu Bývalý (služba `clients`, zdroj `job_ended`). Jen když klient nemá
 * jinou živou zakázku; bez zapnutého modulu Klienti je to chyba, ne tiché nic.
 */
export async function setClientFormerImpl(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { jobId: string; reason?: string | undefined; endedOn?: string | undefined },
): Promise<{ changed: boolean }> {
  return inTx(ctx, async (c) => {
    const j = await loadJob(c, input.jobId);
    await assertJobWrite(c, j);
    const clients = deps.services.optional("clients");
    if (!clients) throw new UserError("Modul Klienti není zapnutý.");
    if (await otherLiveJobs(c, j.companyId, j.id))
      throw new UserError("Klient má další aktivní zakázku, jako bývalý ho označit nejde.");
    const out = await clients.setStatus(c, {
      companyId: j.companyId,
      status: "former",
      ...(input.reason ? { reason: input.reason } : {}),
      endedOn: input.endedOn ?? todayPrague(),
      source: "job_ended",
    });
    return { changed: out.changed };
  });
}
