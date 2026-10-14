import { and, asc, eq, isNull } from "drizzle-orm";
import { schema } from "@rebar/core/db";
import { createTask } from "@rebar/core/collab";
import { can, NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import {
  assertEditable,
  auditJob,
  createVersion,
  ensureDefaultObject,
  isEmptyVersion,
  latestOffer,
  listVersions,
  loadStructure,
  lockJobRow,
  lockVersionRow,
  nextSectionPosition,
  pickCurrent,
  recomputeSummary,
  realizationOf,
  type SectionRow,
  type VersionRow,
} from "../budget/service";
import {
  job,
  budgetCalcLine,
  budgetItem,
  budgetObject,
  budgetSection,
  jobMember,
  jobTemplate,
} from "../schema";
import {
  templatePayload,
  type ItemTemplate,
  type SectionTemplate,
  type TemplatePayload,
} from "./payload";

export type BuildOptions = {
  versionId?: string | null;
  withPrices: boolean;
  includeBudget: boolean;
  includeTasks: boolean;
  includeRoles: boolean;
};

const DAY = 86_400_000;
const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);

/** Kostra zakázky pro šablonu: rozpočet bez položek vzniklých změnami, otevřené úkoly a role týmu. */
export async function buildPayloadFromJob(
  c: Ctx,
  jobId: string,
  o: BuildOptions,
): Promise<TemplatePayload> {
  const [j] = await c.db
    .select()
    .from(job)
    .where(and(eq(job.id, jobId), isNull(job.deletedAt)));
  if (!j) throw new NotFoundError("Zakázka nenalezena.");
  const payload: TemplatePayload = { v: 1, budget: null, tasks: [], roles: [] };

  if (o.includeBudget) {
    const versions = await listVersions(c, jobId);
    const v = o.versionId ? versions.find((x) => x.id === o.versionId) : pickCurrent(versions);
    if (o.versionId && !v) throw new NotFoundError("Verze rozpočtu nenalezena.");
    if (v) {
      const st = await loadStructure(c, v.id);
      const calc = st.items.length
        ? await c.db.select().from(budgetCalcLine).orderBy(asc(budgetCalcLine.position))
        : [];
      const calcBy = new Map<string, typeof calc>();
      for (const l of calc)
        (calcBy.get(l.itemId) ?? calcBy.set(l.itemId, []).get(l.itemId)!).push(l);
      const itemTpl = (i: (typeof st.items)[number]): ItemTemplate => ({
        code: i.code,
        title: i.title,
        kind: i.kind as ItemTemplate["kind"],
        unit: i.unit,
        quantity: i.originalQuantity ?? i.quantity,
        unitCostMinor: o.withPrices ? (i.originalUnitCostMinor ?? i.unitCostMinor) : 0,
        unitPriceMinor: o.withPrices ? (i.originalUnitPriceMinor ?? i.unitPriceMinor) : 0,
        vatRateBp: i.vatRateBp,
        spec: i.spec,
        note: i.note,
        calc: (calcBy.get(i.id) ?? []).map((l) => ({
          variable: l.variable,
          description: l.description,
          formula: l.formula,
        })),
      });
      const secTpl = (s: SectionRow): SectionTemplate => ({
        code: s.code,
        title: s.title,
        costCategory: s.costCategory,
        items: st.items.filter((i) => i.sectionId === s.id && !i.changeId).map(itemTpl),
        children: st.sections
          .filter((x) => x.parentId === s.id && x.objectId === s.objectId)
          .map(secTpl),
      });
      payload.budget = {
        withPrices: o.withPrices,
        objects: st.objects.map((ob) => ({
          code: ob.code,
          title: ob.title,
          isDefault: ob.isDefault,
          sections: st.sections.filter((s) => s.objectId === ob.id && !s.parentId).map(secTpl),
        })),
      };
    }
  }

  if (o.includeTasks) {
    const tasks = await c.db
      .select()
      .from(schema.task)
      .where(
        and(
          eq(schema.task.entityType, "job"),
          eq(schema.task.entityId, jobId),
          isNull(schema.task.doneAt),
          isNull(schema.task.deletedAt),
        ),
      )
      .orderBy(asc(schema.task.createdAt));
    payload.tasks = tasks.map((t) => ({
      title: t.title,
      description: t.description,
      daysFromStart:
        j.startDate && t.dueDate && days(j.startDate, t.dueDate) >= 0
          ? days(j.startDate, t.dueDate)
          : null,
      priority: t.priority,
    }));
  }

  if (o.includeRoles) {
    const members = await c.db
      .select({ role: jobMember.role })
      .from(jobMember)
      .where(eq(jobMember.jobId, jobId));
    payload.roles = [
      ...new Set(members.map((m) => m.role?.trim()).filter((r): r is string => !!r)),
    ];
  }
  return payload;
}

async function insertSections(
  c: Ctx,
  v: VersionRow,
  objectId: string,
  parentId: string | null,
  list: readonly SectionTemplate[],
  withPrices: boolean,
  counter: { sections: number; items: number },
) {
  for (const s of list) {
    const [row] = await c.db
      .insert(budgetSection)
      .values({
        versionId: v.id,
        objectId,
        parentId,
        code: s.code,
        title: s.title,
        costCategory: s.costCategory,
        position: await nextSectionPosition(c, objectId, parentId),
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning({ id: budgetSection.id });
    counter.sections++;
    for (const [n, i] of s.items.entries()) {
      const [it] = await c.db
        .insert(budgetItem)
        .values({
          versionId: v.id,
          sectionId: row!.id,
          position: n,
          code: i.code,
          title: i.title,
          kind: i.kind,
          unit: i.unit,
          quantity: i.quantity,
          unitCostMinor: withPrices ? i.unitCostMinor : 0,
          unitPriceMinor: withPrices ? i.unitPriceMinor : 0,
          vatRateBp: i.vatRateBp,
          spec: i.spec,
          note: i.note,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning({ id: budgetItem.id });
      counter.items++;
      if (i.calc.length)
        await c.db.insert(budgetCalcLine).values(
          i.calc.map((l, p) => ({
            itemId: it!.id,
            position: p,
            variable: l.variable,
            description: l.description,
            formula: l.formula,
          })),
        );
    }
    await insertSections(c, v, objectId, row!.id, s.children, withPrices, counter);
  }
}

/** Do které verze se šablona vloží: prázdná nabídka, jinak prázdná realizace; bez verze se založí podle fáze. */
async function targetVersion(c: Ctx, jobId: string, phase: string, versionId?: string | null) {
  if (versionId) return lockVersionRow(c, versionId);
  const offer = await latestOffer(c, jobId);
  const real = await realizationOf(c, jobId);
  const preferOffer = phase === "inquiry" || phase === "offer";
  const existing = preferOffer ? (offer ?? real) : (real ?? offer);
  if (existing) return lockVersionRow(c, existing.id);
  const kind = phase === "inquiry" || phase === "offer" ? "offer" : "realization";
  return createVersion(c, { jobId, kind });
}

export type ApplyTemplateResult = {
  versionId: string | null;
  sections: number;
  items: number;
  tasks: number;
  roles: string[];
};

/**
 * Použije šablonu na zakázku. Rozpočet se vloží jen do prázdné verze (jinak chyba); úkoly a role se založí jen
 * jednou, dokud zakázka nemá `templateId`. Volající ověřuje oprávnění.
 */
export async function applyTemplateTx(
  c: Ctx,
  jobId: string,
  templateId: string,
  opts: { versionId?: string | null; initial?: boolean } = {},
): Promise<ApplyTemplateResult> {
  const j = await lockJobRow(c, jobId);
  const [tpl] = await c.db
    .select()
    .from(jobTemplate)
    .where(and(eq(jobTemplate.id, templateId), isNull(jobTemplate.deletedAt)));
  if (!tpl) throw new NotFoundError("Šablona nenalezena.");
  const payload = templatePayload.parse(tpl.payload);
  const [row] = await c.db.select().from(job).where(eq(job.id, jobId));
  const out: ApplyTemplateResult = { versionId: null, sections: 0, items: 0, tasks: 0, roles: [] };

  if (payload.budget && payload.budget.objects.some((o) => o.sections.length)) {
    const v = await targetVersion(c, jobId, j.phase, opts.versionId);
    assertEditable(v);
    if (!(await isEmptyVersion(c, v.id)))
      throw new UserError(
        "Rozpočet už obsahuje oddíly nebo položky. Šablonu lze použít jen do prázdného rozpočtu.",
      );
    out.versionId = v.id;
    const counter = { sections: 0, items: 0 };
    let position = 1;
    for (const o of payload.budget.objects) {
      let objectId: string;
      if (o.isDefault) objectId = (await ensureDefaultObject(c, v.id)).id;
      else {
        const [created] = await c.db
          .insert(budgetObject)
          .values({
            versionId: v.id,
            code: o.code,
            title: o.title,
            position: position++,
            createdBy: c.actor.userId,
            updatedBy: c.actor.userId,
          })
          .returning({ id: budgetObject.id });
        objectId = created!.id;
      }
      await insertSections(c, v, objectId, null, o.sections, payload.budget.withPrices, counter);
    }
    out.sections = counter.sections;
    out.items = counter.items;
  }

  // úkoly a role se zakládají jednou; při vzniku zakázky ze šablony (`initial`) vždy
  if (opts.initial || !row?.templateId) {
    const assignee = row?.managerId && can(c, "tasks.assign") ? row.managerId : c.actor.userId;
    for (const t of payload.tasks) {
      const due =
        t.daysFromStart !== null && row?.startDate
          ? new Date(Date.parse(`${row.startDate}T12:00:00Z`) + t.daysFromStart * DAY)
              .toISOString()
              .slice(0, 10)
          : null;
      await createTask(c, {
        title: t.title,
        description: t.description,
        priority: t.priority,
        dueDate: due,
        assigneeId: assignee,
        entityType: "job",
        entityId: jobId,
      });
      out.tasks++;
    }
    for (const r of payload.roles) {
      await createTask(c, {
        title: `Obsadit roli v týmu: ${r}`,
        priority: "normal",
        assigneeId: assignee,
        entityType: "job",
        entityId: jobId,
      });
      out.roles.push(r);
    }
    await c.db.update(job).set({ templateId, updatedBy: c.actor.userId }).where(eq(job.id, jobId));
  }

  await auditJob(
    c,
    jobId,
    `Použita šablona „${tpl.name}“ (oddílů ${out.sections}, položek ${out.items}, úkolů ${out.tasks + out.roles.length})`,
  );
  await recomputeSummary(c, jobId);
  return out;
}
