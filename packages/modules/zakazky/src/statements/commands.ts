import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { defineCommand, type AttentionProvider } from "@rebar/core/module-server";
import { inTx, NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import * as approvals from "../approvals/api";
import { realizationVersion } from "../changes/service";
import {
  approval,
  budgetObject,
  job,
  jobMember,
  workStatement,
  workStatementLine,
} from "../schema";
import { statementLabel, toThousandths } from "./calc";
import {
  accessJob,
  assertEditable,
  assertWithinBudget,
  budgetLines,
  canSeeMoney,
  computedLines,
  loadStatement,
  persistComputed,
  type ComputedLine,
} from "./service";

const PERMISSION = ["zakazky.write", "zakazky.economics"] as const;
const quantity = z
  .string()
  .trim()
  .regex(/^(\d{1,11}([.,]\d{1,3})?)?$/, "Množství zadejte jako číslo (nejvýš 3 desetinná místa).")
  .transform((v) => (v ? v.replace(",", ".") : "0"));
const dateIso = z.iso.date("Vyplňte datum.");

const serialize = (s: typeof workStatement.$inferSelect, money: boolean) => ({
  id: s.id,
  jobId: s.jobId,
  objectId: s.objectId,
  number: s.number,
  label: statementLabel(s.number),
  periodFrom: s.periodFrom,
  periodTo: s.periodTo,
  status: s.status,
  claimedMinor: money ? s.claimedMinor : null,
  approvedMinor: money ? s.approvedMinor : null,
  invoiceId: s.invoiceId,
  note: s.note,
  decidedAt: s.decidedAt ? s.decidedAt.toISOString() : null,
  lockedAt: s.lockedAt ? s.lockedAt.toISOString() : null,
});

const periodCheck = (from: string, to: string) => {
  if (from > to) throw new UserError("Začátek období nesmí být po jeho konci.");
};

export async function createStatement(
  ctx: Ctx,
  i: { jobId: string; periodFrom: string; periodTo: string; objectId?: string | null | undefined },
) {
  periodCheck(i.periodFrom, i.periodTo);
  await accessJob(ctx, i.jobId, "write");
  return inTx(ctx, async (c) => {
    const version = await realizationVersion(c.db, i.jobId);
    if (!version)
      throw new UserError("Zakázka nemá rozpočet realizace, soupis prací nejde založit.");
    await c.db.execute(sql`select pg_advisory_xact_lock(hashtext(${"statement:" + i.jobId}))`);
    const [nextRow] = await c.db
      .select({ next: sql<number>`coalesce(max(${workStatement.number}), 0)::int + 1` })
      .from(workStatement)
      .where(eq(workStatement.jobId, i.jobId));
    const number = nextRow?.next ?? 1;
    const [s] = await c.db
      .insert(workStatement)
      .values({
        jobId: i.jobId,
        objectId: i.objectId ?? null,
        number,
        periodFrom: i.periodFrom,
        periodTo: i.periodTo,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning();
    let items = await budgetLines(c, version.id);
    if (i.objectId) items = items.filter((x) => x.objectId === i.objectId);
    items = items.filter((x) => toThousandths(x.quantity) > 0);
    if (!items.length) throw new UserError("V rozpočtu realizace nejsou žádné položky k zapsání.");
    await c.db.insert(workStatementLine).values(
      items.map((x, position) => ({
        statementId: s!.id,
        itemId: x.id,
        position,
        quantityPeriod: "0",
        quantityTotal: "0",
      })),
    );
    // položky, které rozpočet už vyčerpaly jinými soupisy, v novém soupisu nejsou k ničemu
    const lines = await computedLines(c, s!);
    const full = lines.filter((l) => toThousandths(l.remainingQuantity) <= 0).map((l) => l.id);
    if (full.length && full.length < lines.length)
      await c.db.delete(workStatementLine).where(inArray(workStatementLine.id, full));
    await persistComputed(c, s!);
    await recordAudit(c, {
      action: "create",
      entityType: "job",
      entityId: i.jobId,
      summary: `Založen ${statementLabel(number).toLowerCase()} za období ${i.periodFrom} – ${i.periodTo}`,
    });
    return { id: s!.id };
  });
}

/* ---------- příkazy ---------- */

export const list = defineCommand({
  name: "zakazky.statement.list",
  permission: PERMISSION,
  input: z.object({ jobId: z.uuid() }),
  handler: async (ctx, i) => {
    await accessJob(ctx, i.jobId, "read");
    const rows = await ctx.db
      .select()
      .from(workStatement)
      .where(and(eq(workStatement.jobId, i.jobId), isNull(workStatement.deletedAt)))
      .orderBy(asc(workStatement.number));
    const filled = rows.length
      ? await ctx.db
          .select({ statementId: workStatementLine.statementId, n: count() })
          .from(workStatementLine)
          .where(
            and(
              inArray(
                workStatementLine.statementId,
                rows.map((r) => r.id),
              ),
              sql`${workStatementLine.quantityPeriod} <> 0`,
            ),
          )
          .groupBy(workStatementLine.statementId)
      : [];
    const money = canSeeMoney(ctx);
    const version = await realizationVersion(ctx.db, i.jobId);
    const objects = version
      ? await ctx.db
          .select({ id: budgetObject.id, title: budgetObject.title, code: budgetObject.code })
          .from(budgetObject)
          .where(
            and(
              eq(budgetObject.versionId, version.id),
              eq(budgetObject.isDefault, false),
              isNull(budgetObject.deletedAt),
            ),
          )
          .orderBy(asc(budgetObject.position))
      : [];
    return {
      objects,
      hasRealization: !!version,
      statements: rows.map((r) => ({
        ...serialize(r, money),
        filledCount: filled.find((f) => f.statementId === r.id)?.n ?? 0,
      })),
      money,
    };
  },
});

export const get = defineCommand({
  name: "zakazky.statement.get",
  permission: PERMISSION,
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => {
    const s = await loadStatement(ctx, i.id);
    await accessJob(ctx, s.jobId, "read");
    const money = canSeeMoney(ctx);
    let canWrite = true;
    try {
      await accessJob(ctx, s.jobId, "write");
    } catch {
      canWrite = false;
    }
    const lines = await computedLines(ctx, s);
    const editable = canWrite && !s.lockedAt && (s.status === "draft" || s.status === "rejected");
    return {
      statement: serialize(
        { ...s, claimedMinor: money ? lines.reduce((a, l) => a + l.amountPeriodMinor, 0) : 0 },
        money,
      ),
      lines: lines.map((l: ComputedLine) => ({
        id: l.id,
        itemId: l.itemId,
        code: l.code,
        title: l.title,
        sectionTitle: l.sectionTitle,
        unit: l.unit,
        budgetQuantity: l.budgetQuantity,
        previousQuantity: l.previousQuantity,
        quantityPeriod: l.quantityPeriod,
        quantityTotal: l.quantityTotal,
        percent: l.percent,
        remainingQuantity: l.remainingQuantity,
        over: l.over,
        unitPriceMinor: money ? l.unitPriceMinor : null,
        amountPeriodMinor: money ? l.amountPeriodMinor : null,
        amountTotalMinor: money ? l.amountTotalMinor : null,
      })),
      editable,
      canSubmit: editable && lines.some((l) => toThousandths(l.quantityPeriod) > 0),
      money,
    };
  },
});

export const create = defineCommand({
  name: "zakazky.statement.create",
  permission: PERMISSION,
  input: z.object({
    jobId: z.uuid(),
    periodFrom: dateIso,
    periodTo: dateIso,
    objectId: z.uuid().nullish(),
  }),
  handler: (ctx, i) => createStatement(ctx, i),
});

export const save = defineCommand({
  name: "zakazky.statement.save",
  permission: PERMISSION,
  input: z.object({
    id: z.uuid(),
    periodFrom: dateIso,
    periodTo: dateIso,
    note: z.string().trim().max(2000).nullish(),
  }),
  handler: async (ctx, i) => {
    periodCheck(i.periodFrom, i.periodTo);
    await inTx(ctx, async (c) => {
      const s = await loadStatement(c, i.id, { lock: true });
      await accessJob(c, s.jobId, "write");
      assertEditable(s);
      await c.db
        .update(workStatement)
        .set({
          periodFrom: i.periodFrom,
          periodTo: i.periodTo,
          note: i.note || null,
          updatedBy: c.actor.userId,
        })
        .where(eq(workStatement.id, i.id));
    });
    return { id: i.id };
  },
});

/** Zadání provedeného množství za období po položkách (dávka, aby šlo uložit celou tabulku najednou). */
export const lineSet = defineCommand({
  name: "zakazky.statement.line.set",
  permission: PERMISSION,
  input: z.object({
    statementId: z.uuid(),
    lines: z
      .array(z.object({ itemId: z.uuid(), quantityPeriod: quantity }))
      .min(1)
      .max(500),
  }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      const s = await loadStatement(c, i.statementId, { lock: true });
      await accessJob(c, s.jobId, "write");
      assertEditable(s);
      const existing = await c.db
        .select({ id: workStatementLine.id, itemId: workStatementLine.itemId })
        .from(workStatementLine)
        .where(eq(workStatementLine.statementId, s.id));
      for (const l of i.lines) {
        const row = existing.find((e) => e.itemId === l.itemId);
        if (!row) throw new NotFoundError("Položka není v tomto soupisu.");
        await c.db
          .update(workStatementLine)
          .set({ quantityPeriod: l.quantityPeriod.replace(",", ".") || "0" })
          .where(eq(workStatementLine.id, row.id));
      }
      const lines = await computedLines(c, s);
      assertWithinBudget(lines);
      const claimed = await persistComputed(c, s);
      return { claimedMinor: canSeeMoney(c) ? claimed : null };
    }),
});

export const remove = defineCommand({
  name: "zakazky.statement.delete",
  permission: PERMISSION,
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const s = await loadStatement(c, i.id, { lock: true });
      await accessJob(c, s.jobId, "write");
      assertEditable(s);
      await c.db
        .update(workStatement)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(workStatement.id, i.id));
      await recordAudit(c, {
        action: "delete",
        entityType: "job",
        entityId: s.jobId,
        summary: `Smazán ${statementLabel(s.number).toLowerCase()}`,
      });
    });
  },
});

export const submit = defineCommand({
  name: "zakazky.statement.submit",
  permission: PERMISSION,
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      const s = await loadStatement(c, i.id, { lock: true });
      await accessJob(c, s.jobId, "write");
      assertEditable(s);
      const lines = await computedLines(c, s);
      if (!lines.some((l) => toThousandths(l.quantityPeriod) > 0))
        throw new UserError("Zadejte provedené množství alespoň u jedné položky.");
      assertWithinBudget(lines);
      const claimed = await persistComputed(c, s);
      await c.db
        .update(workStatement)
        .set({ status: "submitted", approvedMinor: claimed, updatedBy: c.actor.userId })
        .where(eq(workStatement.id, s.id));
      const r = await approvals.requestApproval(c, {
        docType: "statement",
        docId: s.id,
        jobId: s.jobId,
        amountMinor: claimed,
      });
      return { ...r, claimedMinor: canSeeMoney(c) ? claimed : null };
    }),
});

/** Schvalovatel může před schválením snížit schválenou částku (nad nárokovanou nejde). */
export const setApproved = defineCommand({
  name: "zakazky.statement.setApproved",
  permission: ["zakazky.approve", "zakazky.approve_all"],
  input: z.object({ id: z.uuid(), approvedMinor: z.number().int().min(0).max(9_000_000_000_000) }),
  handler: async (ctx, i) =>
    inTx(ctx, async (c) => {
      const s = await loadStatement(c, i.id, { lock: true });
      await accessJob(c, s.jobId, "read");
      if (s.status !== "submitted")
        throw new UserError("Schválenou částku jde upravit jen u soupisu ke schválení.");
      const state = await approvals.getState(c, "statement", s.id);
      if (!state.canDecide) throw new UserError("O tomto soupisu nemůžete rozhodovat.");
      if (i.approvedMinor > s.claimedMinor)
        throw new UserError(
          `Schválená částka nesmí přesáhnout nárokovanou (${formatMinor(s.claimedMinor)}).`,
        );
      await c.db
        .update(workStatement)
        .set({ approvedMinor: i.approvedMinor, updatedBy: c.actor.userId })
        .where(eq(workStatement.id, s.id));
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: s.jobId,
        summary: `${statementLabel(s.number)}: schválená částka upravena na ${formatMinor(i.approvedMinor)} (nárokováno ${formatMinor(s.claimedMinor)})`,
      });
      return { approvedMinor: i.approvedMinor };
    }),
});

export const decide = defineCommand({
  name: "zakazky.statement.decide",
  permission: ["zakazky.approve", "zakazky.approve_all"],
  input: z.object({
    id: z.uuid(),
    approve: z.boolean(),
    comment: z.string().trim().max(1000).nullish(),
  }),
  handler: async (ctx, i) => {
    const s = await loadStatement(ctx, i.id);
    await accessJob(ctx, s.jobId, "read");
    const [open] = await ctx.db
      .select({ id: approval.id })
      .from(approval)
      .where(
        and(
          eq(approval.docType, "statement"),
          eq(approval.docId, i.id),
          eq(approval.status, "pending"),
        ),
      )
      .orderBy(desc(approval.requestedAt))
      .limit(1);
    if (!open) throw new UserError("Soupis nečeká na schválení.");
    return approvals.decide(ctx, open.id, { approve: i.approve, comment: i.comment });
  },
});

export const reopen = defineCommand({
  name: "zakazky.statement.reopen",
  permission: PERMISSION,
  input: z.object({ id: z.uuid(), reason: z.string().trim().max(500).nullish() }),
  handler: async (ctx, i) => {
    const s = await loadStatement(ctx, i.id);
    await accessJob(ctx, s.jobId, "write");
    await approvals.reopen(ctx, "statement", i.id, { reason: i.reason ?? null });
  },
});

export const commands = [
  list,
  get,
  create,
  save,
  lineSet,
  remove,
  submit,
  setApproved,
  decide,
  reopen,
];

/** Zamítnuté soupisy čekají na opravu: vidí je tým zakázky. */
export const attention: AttentionProvider = async (ctx) => {
  const me = ctx.actor.userId;
  if (!me) return [];
  const rows = await ctx.db
    .select({
      id: workStatement.id,
      jobId: workStatement.jobId,
      number: workStatement.number,
      jobNumber: job.number,
    })
    .from(workStatement)
    .innerJoin(job, eq(job.id, workStatement.jobId))
    .where(
      and(
        eq(workStatement.status, "rejected"),
        isNull(workStatement.deletedAt),
        isNull(job.deletedAt),
        sql`(${job.managerId} = ${me} or exists (select 1 from ${jobMember} where ${jobMember.jobId} = ${job.id} and ${jobMember.userId} = ${me}))`,
      ),
    )
    .limit(10);
  return rows.map((r) => ({
    id: `statement-rejected-${r.id}`,
    module: "zakazky",
    severity: "warning" as const,
    title: `${r.jobNumber}: zamítnutý ${statementLabel(r.number).toLowerCase()}`,
    detail: "Opravte provedené množství a odešlete znovu.",
    href: `/zakazky/${r.jobId}?tab=fakturace&statement=${r.id}`,
  }));
};
