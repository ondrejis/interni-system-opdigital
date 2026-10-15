import { eq } from "drizzle-orm";
import type { Ctx } from "@rebar/core/rbac";
import { templatePayload } from "../contract";
import { job, jobPhase } from "../schema";
import { todayPrague } from "../shared";
import { emitCreated } from "./events";
import { defaultTemplate, loadPhases, type JobRow } from "./lookups";
import { planFromTemplate } from "./plan";

/**
 * Dokončení zakázky založené obecným formulářem entity (seznam → Nový), tedy mimo `zakazky.create`: fáze z výchozí
 * šablony typu (bez úkolů a plateb, ty potřebují služby ostatních modulů, které entita nemá) a událost `project.created`.
 * Zakázka, která už fáze má, se nemění.
 */
export async function afterGenericCreate(c: Ctx, created: Record<string, unknown>): Promise<void> {
  const row = created as unknown as JobRow;
  if (!(await loadPhases(c.db, row.id)).length) {
    const tpl = await defaultTemplate(c.db, row.type);
    if (tpl) {
      const plan = planFromTemplate(templatePayload.parse(tpl.payload), {
        startDate: row.startDate ?? todayPrague(),
        ownerId: row.ownerId ?? c.actor.userId ?? "",
        leadId: null,
        otherPartnerId: null,
        billingModel: row.billingModel,
        active: row.status === "active",
      });
      if (plan.phases.length) {
        const rows = await c.db
          .insert(jobPhase)
          .values(
            plan.phases.map((p) => ({
              jobId: row.id,
              name: p.name,
              position: p.index,
              role: p.role,
              status: p.status,
              plannedStart: p.plannedStart,
              plannedEnd: p.plannedEnd,
              isPrivate: row.isPrivate,
              visibilitySource: "inherited" as const,
              createdBy: c.actor.userId,
              updatedBy: c.actor.userId,
            })),
          )
          .returning();
        const current = plan.currentPhaseIndex === null ? undefined : rows[plan.currentPhaseIndex];
        await c.db
          .update(job)
          .set({
            templateId: tpl.id,
            ...(current ? { currentPhaseId: current.id } : {}),
            ...(row.dueDate ? {} : { dueDate: plan.dueDate }),
          })
          .where(eq(job.id, row.id));
        row.templateId = tpl.id;
        row.currentPhaseId = current?.id ?? null;
      }
    }
  }
  await emitCreated(c, row);
}
