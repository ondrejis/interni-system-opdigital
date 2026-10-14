import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { defaultVatRateBp } from "@rebar/core/config-data";
import { defineCommand, type AttentionProvider } from "@rebar/core/module-server";
import { inTx, NotFoundError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import * as approvals from "../approvals/api";
import { approval, job, jobChange, jobChangeLine, jobMember } from "../schema";
import {
  CHANGE_LINE_KINDS,
  changeLabel,
  lineImpact,
  toThousandths,
  type ChangeLineKind,
} from "./calc";
import {
  accessJob,
  assertEditable,
  changeLines,
  labelOf,
  loadChange,
  realizationItems,
  realizationSections,
  realizationVersion,
  rebaseChange,
  refreshTotals,
} from "./service";

const money = z.number().int().min(0).max(9_000_000_000_000);
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,11}([.,]\d{1,3})?$/, "Množství zadejte jako číslo (nejvýš 3 desetinná místa).")
  .transform((v) => v.replace(",", "."));

const serialize = (c: typeof jobChange.$inferSelect) => ({
  id: c.id,
  jobId: c.jobId,
  number: c.number,
  label: labelOf(c),
  title: c.title,
  description: c.description,
  reason: c.reason,
  status: c.status,
  amountMinor: c.amountMinor,
  costImpactMinor: c.costImpactMinor,
  objectId: c.objectId,
  decidedAt: c.decidedAt,
  decidedBy: c.decidedBy,
  appliedAt: c.appliedAt ? c.appliedAt.toISOString() : null,
  lockedAt: c.lockedAt ? c.lockedAt.toISOString() : null,
});

/** Založí koncept změny (číslo VP/MP-n v rámci zakázky). Volá příkaz i `changesApi.createDraft`. */
export async function createDraftChange(
  ctx: Ctx,
  input: { jobId: string; title?: string | undefined; itemId?: string | undefined },
) {
  await accessJob(ctx, input.jobId, "write");
  return inTx(ctx, async (c) => {
    await c.db.execute(sql`select pg_advisory_xact_lock(hashtext(${"job_change:" + input.jobId}))`);
    const [nextRow] = await c.db
      .select({ next: sql<number>`coalesce(max(${jobChange.number}), 0)::int + 1` })
      .from(jobChange)
      .where(eq(jobChange.jobId, input.jobId));
    const number = nextRow?.next ?? 1;
    const [r] = await c.db
      .insert(jobChange)
      .values({
        jobId: input.jobId,
        number,
        title: input.title?.trim() || "Nová změna",
        amountMinor: 0,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning({ id: jobChange.id });
    await recordAudit(c, {
      action: "create",
      entityType: "job",
      entityId: input.jobId,
      summary: `Založena změna ${changeLabel(number, 0)}`,
    });
    if (input.itemId)
      await saveLine(c, {
        changeId: r!.id,
        kind: "qty",
        itemId: input.itemId,
      });
    return { id: r!.id };
  });
}

type LineInput = {
  changeId: string;
  id?: string | undefined;
  kind: ChangeLineKind;
  itemId?: string | null | undefined;
  sectionId?: string | null | undefined;
  title?: string | undefined;
  unit?: string | undefined;
  itemKind?: string | undefined;
  /** Nové množství (u `qty`), množství nové položky (u `add`). U `qty` bez hodnoty se předvyplní stávající. */
  quantityAfter?: string | undefined;
  unitCostMinor?: number | undefined;
  unitPriceMinor?: number | undefined;
  vatRateBp?: number | undefined;
};

async function saveLine(ctx: Ctx, i: LineInput) {
  const change = await loadChange(ctx, i.changeId, { lock: true });
  await accessJob(ctx, change.jobId, "write");
  assertEditable(change);
  const version = await realizationVersion(ctx.db, change.jobId);

  let values: Omit<typeof jobChangeLine.$inferInsert, "changeId" | "position">;
  if (i.kind === "add") {
    const q = i.quantityAfter ?? "0";
    if (toThousandths(q) <= 0) throw new UserError("Zadejte množství nové položky.");
    if (!i.title?.trim()) throw new UserError("Popište novou položku.");
    let sectionId: string | null = null;
    if (i.sectionId) {
      const sections = version ? await realizationSections(ctx.db, version.id) : [];
      if (!sections.some((s) => s.id === i.sectionId))
        throw new UserError("Oddíl rozpočtu nepatří k této zakázce.");
      sectionId = i.sectionId;
    }
    values = {
      kind: "add",
      itemId: null,
      sectionId,
      title: i.title.trim(),
      unit: i.unit?.trim() || "ks",
      itemKind: i.itemKind || "other",
      quantityBefore: "0",
      quantityAfter: q,
      unitCostMinor: i.unitCostMinor ?? 0,
      unitPriceMinor: i.unitPriceMinor ?? 0,
      vatRateBp:
        i.vatRateBp ?? (await defaultVatRateBp(ctx.db, new Date().toISOString().slice(0, 10))),
    };
  } else {
    if (!version)
      throw new UserError("Zakázka nemá rozpočet realizace, změnit jde jen novou položkou.");
    if (!i.itemId) throw new UserError("Vyberte položku rozpočtu.");
    const item = (await realizationItems(ctx.db, version.id)).find((x) => x.id === i.itemId);
    if (!item) throw new UserError("Položka není v rozpočtu realizace této zakázky.");
    const q = i.kind === "remove" ? "0" : (i.quantityAfter ?? item.quantity);
    if (i.kind === "qty" && toThousandths(q) === toThousandths(item.quantity) && i.quantityAfter)
      throw new UserError("Nové množství je stejné jako stávající.");
    values = {
      kind: i.kind,
      itemId: item.id,
      sectionId: item.sectionId,
      title: item.title,
      unit: item.unit,
      itemKind: item.kind,
      quantityBefore: item.quantity,
      quantityAfter: q,
      unitCostMinor: item.unitCostMinor,
      unitPriceMinor: item.unitPriceMinor,
      vatRateBp: item.vatRateBp,
    };
  }
  const impact = lineImpact({
    kind: values.kind as ChangeLineKind,
    quantityBefore: values.quantityBefore ?? "0",
    quantityAfter: values.quantityAfter ?? "0",
    unitCostMinor: values.unitCostMinor ?? 0,
    unitPriceMinor: values.unitPriceMinor ?? 0,
  });
  const existing = await changeLines(ctx.db, change.id);
  if (values.itemId && existing.some((l) => l.itemId === values.itemId && l.id !== i.id))
    throw new UserError("Tato položka už ve změně je, upravte stávající řádek.");
  let id = i.id;
  if (id) {
    const [r] = await ctx.db
      .update(jobChangeLine)
      .set({ ...values, ...impact })
      .where(and(eq(jobChangeLine.id, id), eq(jobChangeLine.changeId, change.id)))
      .returning({ id: jobChangeLine.id });
    if (!r) throw new NotFoundError("Řádek změny nenalezen.");
  } else {
    const [r] = await ctx.db
      .insert(jobChangeLine)
      .values({
        ...values,
        ...impact,
        changeId: change.id,
        position: existing.reduce((m, l) => Math.max(m, l.position + 1), 0),
      })
      .returning({ id: jobChangeLine.id });
    id = r!.id;
  }
  await refreshTotals(ctx, change.id);
  return { id };
}

/* ---------- příkazy ---------- */

export const list = defineCommand({
  name: "zakazky.change.list",
  permission: "zakazky.economics",
  input: z.object({ jobId: z.uuid() }),
  handler: async (ctx, i) => {
    await accessJob(ctx, i.jobId, "read");
    const rows = await ctx.db
      .select()
      .from(jobChange)
      .where(and(eq(jobChange.jobId, i.jobId), isNull(jobChange.deletedAt)))
      .orderBy(asc(jobChange.number));
    const counts = rows.length
      ? await ctx.db
          .select({ changeId: jobChangeLine.changeId, n: count() })
          .from(jobChangeLine)
          .where(
            inArray(
              jobChangeLine.changeId,
              rows.map((r) => r.id),
            ),
          )
          .groupBy(jobChangeLine.changeId)
      : [];
    const sum = (status: string) =>
      rows.filter((r) => r.status === status).reduce((a, r) => a + r.amountMinor, 0);
    return {
      changes: rows.map((r) => ({
        ...serialize(r),
        lineCount: counts.find((c) => c.changeId === r.id)?.n ?? 0,
      })),
      totals: {
        approvedMinor: sum("approved"),
        pendingMinor: sum("sent"),
        draftMinor: sum("draft"),
      },
    };
  },
});

export const get = defineCommand({
  name: "zakazky.change.get",
  permission: "zakazky.economics",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => {
    const change = await loadChange(ctx, i.id);
    await accessJob(ctx, change.jobId, "read");
    const [lines, state, version] = await Promise.all([
      changeLines(ctx.db, change.id),
      approvals.getState(ctx, "change", change.id),
      realizationVersion(ctx.db, change.jobId),
    ]);
    let canWrite = true;
    try {
      await accessJob(ctx, change.jobId, "write");
    } catch {
      canWrite = false;
    }
    const editable =
      canWrite && !change.lockedAt && (change.status === "draft" || change.status === "rejected");
    return {
      change: serialize(change),
      lines: lines.map((l) => ({
        id: l.id,
        kind: l.kind,
        itemId: l.itemId,
        sectionId: l.sectionId,
        title: l.title,
        unit: l.unit,
        itemKind: l.itemKind,
        quantityBefore: l.quantityBefore,
        quantityAfter: l.quantityAfter,
        unitCostMinor: l.unitCostMinor,
        unitPriceMinor: l.unitPriceMinor,
        vatRateBp: l.vatRateBp,
        priceImpactMinor: l.priceImpactMinor,
        costImpactMinor: l.costImpactMinor,
      })),
      approval: {
        ...state,
        requestedAt: state.requestedAt?.toISOString() ?? null,
        decidedAt: state.decidedAt?.toISOString() ?? null,
      },
      editable,
      canSubmit: editable && lines.length > 0,
      hasRealization: !!version,
    };
  },
});

/** Položky a oddíly realizační verze pro výběr v editoru změny. */
export const items = defineCommand({
  name: "zakazky.change.items",
  permission: "zakazky.economics",
  input: z.object({ jobId: z.uuid() }),
  handler: async (ctx, i) => {
    await accessJob(ctx, i.jobId, "read");
    const version = await realizationVersion(ctx.db, i.jobId);
    if (!version) return { versionId: null, sections: [], items: [] };
    const [sections, its] = await Promise.all([
      realizationSections(ctx.db, version.id),
      realizationItems(ctx.db, version.id),
    ]);
    return { versionId: version.id, sections, items: its };
  },
});

export const create = defineCommand({
  name: "zakazky.change.create",
  permission: "zakazky.economics",
  input: z.object({
    jobId: z.uuid(),
    title: z.string().trim().max(200).optional(),
    itemId: z.uuid().optional(),
  }),
  handler: (ctx, i) => createDraftChange(ctx, i),
});

/** Stejné jako `create`; název, který volá rozpočet („Nová změna z řádku rozpočtu“). */
export const createDraft = defineCommand({
  name: "zakazky.changes.createDraft",
  permission: ["zakazky.economics", "zakazky.budget"],
  input: z.object({ jobId: z.uuid(), itemId: z.uuid().optional() }),
  handler: (ctx, i) => createDraftChange(ctx, i),
});

export const save = defineCommand({
  name: "zakazky.change.save",
  permission: "zakazky.economics",
  input: z.object({
    id: z.uuid(),
    title: z.string().trim().min(2, "Vyplňte název.").max(200),
    description: z.string().trim().max(2000).nullish(),
    reason: z.string().trim().max(1000).nullish(),
  }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const change = await loadChange(c, i.id, { lock: true });
      await accessJob(c, change.jobId, "write");
      assertEditable(change);
      await c.db
        .update(jobChange)
        .set({
          title: i.title,
          description: i.description || null,
          reason: i.reason || null,
          updatedBy: c.actor.userId,
        })
        .where(eq(jobChange.id, i.id));
    });
    return { id: i.id };
  },
});

export const lineSave = defineCommand({
  name: "zakazky.change.line.save",
  permission: "zakazky.economics",
  input: z.object({
    changeId: z.uuid(),
    id: z.uuid().optional(),
    kind: z.enum(CHANGE_LINE_KINDS),
    itemId: z.uuid().nullish(),
    sectionId: z.uuid().nullish(),
    title: z.string().trim().max(300).optional(),
    unit: z.string().trim().max(12).optional(),
    itemKind: z.string().trim().max(20).optional(),
    quantityAfter: quantity.optional(),
    unitCostMinor: money.optional(),
    unitPriceMinor: money.optional(),
    vatRateBp: z.number().int().min(0).max(10000).optional(),
  }),
  handler: (ctx, i) => inTx(ctx, (c) => saveLine(c, i)),
});

export const lineDelete = defineCommand({
  name: "zakazky.change.line.delete",
  permission: "zakazky.economics",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const [line] = await c.db.select().from(jobChangeLine).where(eq(jobChangeLine.id, i.id));
      if (!line) throw new NotFoundError("Řádek změny nenalezen.");
      const change = await loadChange(c, line.changeId, { lock: true });
      await accessJob(c, change.jobId, "write");
      assertEditable(change);
      await c.db.delete(jobChangeLine).where(eq(jobChangeLine.id, i.id));
      await refreshTotals(c, change.id);
    });
  },
});

export const remove = defineCommand({
  name: "zakazky.change.delete",
  permission: "zakazky.economics",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const change = await loadChange(c, i.id, { lock: true });
      await accessJob(c, change.jobId, "write");
      assertEditable(change);
      await c.db
        .update(jobChange)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(jobChange.id, i.id));
      await recordAudit(c, {
        action: "delete",
        entityType: "job",
        entityId: change.jobId,
        summary: `Smazána změna ${labelOf(change)} ${change.title}`,
      });
    });
  },
});

/** Odešle změnu ke schválení: srovná řádky s rozpočtem, přepočte částku a požádá o schválení. */
export const submit = defineCommand({
  name: "zakazky.change.submit",
  permission: "zakazky.economics",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      const change = await loadChange(c, i.id, { lock: true });
      await accessJob(c, change.jobId, "write");
      assertEditable(change);
      const lines = await changeLines(c.db, change.id);
      if (!lines.length) throw new UserError("Přidejte do změny alespoň jeden řádek.");
      const totals = await rebaseChange(c, change);
      await c.db
        .update(jobChange)
        .set({ status: "sent", updatedBy: c.actor.userId })
        .where(eq(jobChange.id, change.id));
      const result = await approvals.requestApproval(c, {
        docType: "change",
        docId: change.id,
        jobId: change.jobId,
        amountMinor: totals.priceMinor,
      });
      return { ...result, amountMinor: totals.priceMinor };
    }),
});

/** Rozhodnutí o změně (obálka nad `approvalsApi.decide`; oprávnění a limit hlídá schvalování). */
export const decide = defineCommand({
  name: "zakazky.change.decide",
  permission: ["zakazky.approve", "zakazky.approve_all"],
  input: z.object({
    id: z.uuid(),
    approve: z.boolean(),
    comment: z.string().trim().max(1000).nullish(),
  }),
  handler: async (ctx, i) => {
    const change = await loadChange(ctx, i.id);
    await accessJob(ctx, change.jobId, "read");
    const [open] = await ctx.db
      .select({ id: approval.id })
      .from(approval)
      .where(
        and(
          eq(approval.docType, "change"),
          eq(approval.docId, i.id),
          eq(approval.status, "pending"),
        ),
      )
      .orderBy(desc(approval.requestedAt))
      .limit(1);
    if (!open) throw new UserError("Změna nečeká na schválení.");
    return approvals.decide(ctx, open.id, { approve: i.approve, comment: i.comment });
  },
});

export const reopen = defineCommand({
  name: "zakazky.change.reopen",
  permission: "zakazky.economics",
  input: z.object({ id: z.uuid(), reason: z.string().trim().max(500).nullish() }),
  handler: async (ctx, i) => {
    const change = await loadChange(ctx, i.id);
    await accessJob(ctx, change.jobId, "write");
    await approvals.reopen(ctx, "change", i.id, { reason: i.reason ?? null });
  },
});

export const commands = [
  list,
  get,
  items,
  create,
  createDraft,
  save,
  lineSave,
  lineDelete,
  remove,
  submit,
  decide,
  reopen,
];

/** Zamítnuté změny (čekají na opravu) vidí v přehledu vedoucí zakázky a ti, kdo smějí měnit ekonomiku. */
export const attention: AttentionProvider = async (ctx) => {
  if (!scopeOf(ctx, "zakazky.economics")) return [];
  const me = ctx.actor.userId;
  if (!me) return [];
  const rows = await ctx.db
    .select({
      id: jobChange.id,
      jobId: jobChange.jobId,
      number: jobChange.number,
      amount: jobChange.amountMinor,
      title: jobChange.title,
      jobNumber: job.number,
    })
    .from(jobChange)
    .innerJoin(job, eq(job.id, jobChange.jobId))
    .where(
      and(
        eq(jobChange.status, "rejected"),
        isNull(jobChange.deletedAt),
        isNull(job.deletedAt),
        sql`(${job.managerId} = ${me} or exists (select 1 from ${jobMember} where ${jobMember.jobId} = ${job.id} and ${jobMember.userId} = ${me}))`,
      ),
    )
    .limit(10);
  return rows.map((r) => ({
    id: `change-rejected-${r.id}`,
    module: "zakazky",
    severity: "warning" as const,
    title: `${r.jobNumber}: zamítnutá změna ${changeLabel(r.number, r.amount)}`,
    detail: `${r.title}, ${formatMinor(r.amount)}`,
    href: `/zakazky/${r.jobId}?tab=zmeny&change=${r.id}`,
  }));
};
