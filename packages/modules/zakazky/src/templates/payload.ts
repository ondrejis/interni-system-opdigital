import { and, asc, eq, isNull } from "drizzle-orm";
import type { Ctx } from "@rebar/core/rbac";
import type { ModuleDeps } from "@rebar/core/module-server";
import {
  templatePayload,
  type TemplateListItem,
  type TemplatePayloadData,
  type TemplateSummary,
  type TemplateView,
} from "../contract";
import { loadJob, loadPhases, type TemplateRow } from "../core/lookups";
import { tasksOf } from "../core/services";
import { jobMember } from "../schema";
import { daysBetween } from "../shared";

/** Souhrn obsahu šablony pro seznam (počty a součet plánovaných plateb). */
export function summarizePayload(p: TemplatePayloadData): TemplateSummary {
  return {
    phases: p.phases.length,
    tasks: p.tasks.length,
    payments: p.payments.length,
    paymentsMinor: p.payments.reduce((sum, x) => sum + x.amountMinor, 0),
  };
}

/** Řádek seznamu šablon z řádku tabulky. */
export function templateItem(r: TemplateRow): TemplateListItem {
  const payload = templatePayload.parse(r.payload);
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    description: r.description,
    defaultBillingModel: r.defaultBillingModel,
    isDefault: r.isDefault,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    summary: summarizePayload(payload),
  };
}

/** Šablona i s obsahem (editor). */
export function templateView(r: TemplateRow): TemplateView {
  return { ...templateItem(r), payload: templatePayload.parse(r.payload) };
}

/**
 * Obsah šablony z hotové zakázky: fáze s posuny a délkami od startu (bez konkrétních dat), a když to služba `tasks`
 * umí, otevřené úkoly s termíny jako počet dní od startu a pravidlem řešitele (vlastník, vedoucí, konkrétní uživatel,
 * nikdo). Platby se do šablony neukládají.
 */
export async function payloadFromJob(
  c: Ctx,
  deps: ModuleDeps,
  jobId: string,
  opts: { includeTasks: boolean },
): Promise<TemplatePayloadData> {
  const j = await loadJob(c, jobId);
  const phases = await loadPhases(c.db, jobId);
  const base =
    j.startDate ??
    phases
      .map((p) => p.plannedStart)
      .filter((d): d is string => !!d)
      .sort()[0] ??
    null;
  const out: TemplatePayloadData = {
    v: 1,
    phases: phases.map((p) => ({
      name: p.name,
      role: p.role,
      offsetDays: base && p.plannedStart ? Math.max(daysBetween(base, p.plannedStart), 0) : 0,
      durationDays:
        p.plannedStart && p.plannedEnd
          ? Math.max(daysBetween(p.plannedStart, p.plannedEnd) + 1, 0)
          : 0,
    })),
    tasks: [],
    payments: [],
  };
  const tasks = tasksOf(deps);
  if (opts.includeTasks && tasks) {
    const lead = (
      await c.db
        .select({ userId: jobMember.userId })
        .from(jobMember)
        .where(
          and(eq(jobMember.jobId, jobId), eq(jobMember.role, "lead"), isNull(jobMember.deletedAt)),
        )
        .orderBy(asc(jobMember.createdAt))
        .limit(1)
    )[0]?.userId;
    const index = new Map(phases.map((p, i) => [p.id, i]));
    const items = await tasks.listForTemplate(c, { jobId });
    out.tasks = items.map((t) => ({
      phaseIndex: t.phaseId ? (index.get(t.phaseId) ?? 0) : 0,
      title: t.title,
      typeKey: t.typeKey,
      priority: t.priority,
      assignee:
        t.assigneeId === null
          ? { rule: "none" as const }
          : t.assigneeId === j.ownerId
            ? { rule: "owner" as const }
            : t.assigneeId === lead
              ? { rule: "lead" as const }
              : { rule: "user" as const, userId: t.assigneeId },
      dueOffsetDays:
        base && t.dueDate && daysBetween(base, t.dueDate) >= 0
          ? daysBetween(base, t.dueDate)
          : null,
      estimateMin: t.estimateMin,
      description: t.description,
    }));
  }
  return templatePayload.parse(out);
}
