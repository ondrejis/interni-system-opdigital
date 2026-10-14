import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { usersWithPermission } from "@rebar/core/collab";
import { schema } from "@rebar/core/db";
import { assertEntityAccess } from "@rebar/core/entities";
import { defineCommand, type AttentionProvider } from "@rebar/core/module-server";
import { inTx, NotFoundError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { approval, approvalRule, job, jobMember } from "../schema";
import * as api from "./api";
import {
  APPROVAL_DOC_LABEL,
  APPROVAL_DOC_TYPES,
  APPROVE_ALL_PERMISSION,
  APPROVE_PERMISSION,
  mayApproveAll,
  mayDecide,
  type RuleLike,
} from "./rules";

const docType = z.enum(APPROVAL_DOC_TYPES);
const APPROVER = [APPROVE_PERMISSION, APPROVE_ALL_PERMISSION] as const;

type QueueItem = {
  id: string;
  docType: string;
  docTypeLabel: string;
  docId: string;
  docLabel: string;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  /** `null`, když aktér nemá oprávnění vidět peníze. */
  amountMinor: number | null;
  status: string;
  requestedByName: string | null;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  comment: string | null;
  canDecide: boolean;
  mine: boolean;
};

/** Žádosti viditelné aktérovi: ty, o kterých smí rozhodnout, a jeho vlastní. */
async function loadQueue(ctx: Ctx, status: "pending" | "decided", limit: number) {
  const rows = await ctx.db
    .select()
    .from(approval)
    .where(
      status === "pending"
        ? eq(approval.status, "pending")
        : inArray(approval.status, ["approved", "rejected"]),
    )
    .orderBy(desc(status === "pending" ? approval.requestedAt : approval.decidedAt))
    .limit(limit * 3);
  if (!rows.length) return [] as QueueItem[];

  const jobIds = [...new Set(rows.map((r) => r.jobId).filter((x): x is string => !!x))];
  const jobs = jobIds.length
    ? await ctx.db
        .select({
          id: job.id,
          number: job.number,
          title: job.title,
          managerId: job.managerId,
        })
        .from(job)
        .where(inArray(job.id, jobIds))
    : [];
  const members = jobIds.length
    ? await ctx.db
        .select({ jobId: jobMember.jobId, userId: jobMember.userId })
        .from(jobMember)
        .where(inArray(jobMember.jobId, jobIds))
    : [];
  const ownersOf = (jobId: string | null) =>
    jobId
      ? [
          jobs.find((j) => j.id === jobId)?.managerId,
          ...members.filter((m) => m.jobId === jobId).map((m) => m.userId),
        ].filter((u): u is string => !!u)
      : [];
  const ruleIds = [...new Set(rows.map((r) => r.ruleId).filter((x): x is string => !!x))];
  const rules = ruleIds.length
    ? await ctx.db.select().from(approvalRule).where(inArray(approvalRule.id, ruleIds))
    : [];
  const userIds = [
    ...new Set(rows.flatMap((r) => [r.requestedBy, r.decidedBy]).filter((x): x is string => !!x)),
  ];
  const users = userIds.length
    ? await ctx.db
        .select({ id: schema.user.id, name: schema.user.name })
        .from(schema.user)
        .where(inArray(schema.user.id, userIds))
    : [];
  const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
  const economics = !!scopeOf(ctx, "zakazky.economics");
  const me = ctx.actor.userId;

  const visible = rows
    .map((r) => {
      const rule = rules.find((x) => x.id === r.ruleId) ?? null;
      const may = mayDecide({
        rule,
        held: ctx.actor.permissions,
        userId: me,
        unrestricted: ctx.actor.unrestricted,
        jobOwnerIds: ownersOf(r.jobId),
      });
      const mine = !!me && r.requestedBy === me;
      const canDecide =
        r.status === "pending" &&
        may &&
        !(mine && !mayApproveAll(ctx.actor.permissions, ctx.actor.unrestricted));
      return { r, may, mine, canDecide };
    })
    .filter((x) => x.may || x.mine)
    .slice(0, limit);

  // popisky dokladů po typech (jeden dotaz na handler)
  const labels = new Map<string, string>();
  for (const type of new Set(visible.map((v) => v.r.docType))) {
    const ids = visible.filter((v) => v.r.docType === type).map((v) => v.r.docId);
    const d = await api
      .getHandler(type)
      ?.describe?.(ctx, ids)
      .catch(() => undefined);
    for (const [id, v] of Object.entries(d ?? {})) labels.set(`${type}:${id}`, v.label);
  }
  return visible.map(({ r, mine, canDecide }): QueueItem => {
    const j = jobs.find((x) => x.id === r.jobId);
    const typeLabel = APPROVAL_DOC_LABEL[r.docType as keyof typeof APPROVAL_DOC_LABEL] ?? r.docType;
    return {
      id: r.id,
      docType: r.docType,
      docTypeLabel: typeLabel,
      docId: r.docId,
      docLabel: labels.get(`${r.docType}:${r.docId}`) ?? typeLabel,
      jobId: r.jobId,
      jobNumber: j?.number ?? null,
      jobTitle: j?.title ?? null,
      amountMinor: economics ? r.amountMinor : null,
      status: r.status,
      requestedByName: name(r.requestedBy),
      requestedAt: r.requestedAt.toISOString(),
      decidedByName: name(r.decidedBy),
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
      comment: r.comment,
      canDecide,
      mine,
    };
  });
}

export const queue = defineCommand({
  name: "zakazky.approval.queue",
  permission: APPROVER,
  input: z.object({ status: z.enum(["pending", "decided"]).default("pending") }),
  handler: async (ctx, i) => loadQueue(ctx, i.status, i.status === "pending" ? 200 : 50),
});

export const state = defineCommand({
  name: "zakazky.approval.state",
  input: z.object({ docType, docId: z.uuid() }),
  handler: async (ctx, i) => {
    const s = await api.getState(ctx, i.docType, i.docId);
    if (s.jobId) await assertEntityAccess(ctx, "job", s.jobId, "read");
    const ids = [s.requestedBy, s.decidedBy].filter((x): x is string => !!x);
    const users = ids.length
      ? await ctx.db
          .select({ id: schema.user.id, name: schema.user.name })
          .from(schema.user)
          .where(inArray(schema.user.id, ids))
      : [];
    const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
    return {
      ...s,
      requestedByName: name(s.requestedBy),
      decidedByName: name(s.decidedBy),
      requestedAt: s.requestedAt?.toISOString() ?? null,
      decidedAt: s.decidedAt?.toISOString() ?? null,
    };
  },
});

export const decide = defineCommand({
  name: "zakazky.approval.decide",
  permission: APPROVER,
  input: z.object({
    approvalId: z.uuid(),
    approve: z.boolean(),
    comment: z.string().trim().max(1000).nullish(),
  }),
  handler: async (ctx, i) => {
    const [row] = await ctx.db
      .select({ jobId: approval.jobId })
      .from(approval)
      .where(eq(approval.id, i.approvalId));
    if (!row) throw new NotFoundError("Žádost o schválení nenalezena.");
    if (row.jobId) await assertEntityAccess(ctx, "job", row.jobId, "read");
    return api.decide(ctx, i.approvalId, { approve: i.approve, comment: i.comment });
  },
});

export const reopen = defineCommand({
  name: "zakazky.approval.reopen",
  input: z.object({ docType, docId: z.uuid(), reason: z.string().trim().max(500).nullish() }),
  handler: async (ctx, i) => {
    await api.reopen(ctx, i.docType, i.docId, { reason: i.reason ?? null });
  },
});

/* ---------- pravidla ---------- */

type RuleRow = {
  id: string;
  docType: string;
  minAmountMinor: number;
  approverPermission: string | null;
  approverId: string | null;
  approverName: string | null;
  active: boolean;
};

export const rulesList = defineCommand({
  name: "zakazky.approval.rules.list",
  permission: APPROVE_ALL_PERMISSION,
  input: z.object({}),
  handler: async (ctx) => {
    await api.ensureDefaultRules(ctx);
    const rows = await ctx.db
      .select()
      .from(approvalRule)
      .where(isNull(approvalRule.deletedAt))
      .orderBy(approvalRule.docType, approvalRule.minAmountMinor);
    const approverIds = [
      ...new Set([
        ...(await usersWithPermission(ctx.db, APPROVE_PERMISSION)),
        ...(await usersWithPermission(ctx.db, APPROVE_ALL_PERMISSION)),
        ...rows.map((r) => r.approverId).filter((x): x is string => !!x),
      ]),
    ];
    const users = approverIds.length
      ? await ctx.db
          .select({ id: schema.user.id, name: schema.user.name })
          .from(schema.user)
          .where(and(inArray(schema.user.id, approverIds), isNull(schema.user.deletedAt)))
      : [];
    return {
      rules: rows.map((r): RuleRow => ({
        id: r.id,
        docType: r.docType,
        minAmountMinor: r.minAmountMinor,
        approverPermission: r.approverPermission,
        approverId: r.approverId,
        approverName: users.find((u) => u.id === r.approverId)?.name ?? null,
        active: r.active,
      })),
      approvers: users.sort((a, b) => a.name.localeCompare(b.name, "cs")),
    };
  },
});

export const rulesSave = defineCommand({
  name: "zakazky.approval.rules.save",
  permission: APPROVE_ALL_PERMISSION,
  input: z.object({
    id: z.uuid().optional(),
    docType,
    minAmountMinor: z.number().int().min(0).max(9_000_000_000_000),
    approverPermission: z.enum(APPROVER).nullish(),
    approverId: z.uuid().nullish(),
    active: z.boolean().default(true),
  }),
  handler: async (ctx, i) => {
    return inTx(ctx, async (c) => {
      const others = await c.db
        .select()
        .from(approvalRule)
        .where(and(eq(approvalRule.docType, i.docType), isNull(approvalRule.deletedAt)));
      if (others.some((r) => r.id !== i.id && r.minAmountMinor === i.minAmountMinor))
        throw new UserError("Pro tento typ dokladu už existuje pravidlo se stejným limitem.");
      const values = {
        docType: i.docType,
        minAmountMinor: i.minAmountMinor,
        approverPermission: i.approverId ? null : (i.approverPermission ?? APPROVE_PERMISSION),
        approverId: i.approverId ?? null,
        active: i.active,
        updatedBy: c.actor.userId,
      };
      let id = i.id;
      if (id) {
        const [r] = await c.db
          .update(approvalRule)
          .set(values)
          .where(and(eq(approvalRule.id, id), isNull(approvalRule.deletedAt)))
          .returning({ id: approvalRule.id });
        if (!r) throw new NotFoundError("Pravidlo nenalezeno.");
      } else {
        const [r] = await c.db
          .insert(approvalRule)
          .values({ ...values, createdBy: c.actor.userId })
          .returning({ id: approvalRule.id });
        id = r!.id;
      }
      await recordAudit(c, {
        action: i.id ? "update" : "create",
        entityType: "approval_rule",
        entityId: id,
        summary: `Pravidlo schvalování (${APPROVAL_DOC_LABEL[i.docType]}) od ${formatMinor(i.minAmountMinor)}${i.active ? "" : ", vypnuto"}`,
      });
      return { id };
    });
  },
});

export const rulesDelete = defineCommand({
  name: "zakazky.approval.rules.delete",
  permission: APPROVE_ALL_PERMISSION,
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const [r] = await c.db
        .update(approvalRule)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(and(eq(approvalRule.id, i.id), isNull(approvalRule.deletedAt)))
        .returning();
      if (!r) throw new NotFoundError("Pravidlo nenalezeno.");
      await recordAudit(c, {
        action: "delete",
        entityType: "approval_rule",
        entityId: i.id,
        summary: `Pravidlo schvalování (${APPROVAL_DOC_LABEL[r.docType as keyof typeof APPROVAL_DOC_LABEL] ?? r.docType}) od ${formatMinor(r.minAmountMinor)} smazáno`,
      });
    });
  },
});

export const commands = [queue, state, decide, reopen, rulesList, rulesSave, rulesDelete];

/** Doklady, které čekají na schválení tímto uživatelem. */
export const attention: AttentionProvider = async (ctx) => {
  if (!scopeOf(ctx, APPROVE_PERMISSION) && !scopeOf(ctx, APPROVE_ALL_PERMISSION)) return [];
  const items = (await loadQueue(ctx, "pending", 200)).filter((x) => x.canDecide);
  if (!items.length) return [];
  const old = items.some((x) => Date.now() - Date.parse(x.requestedAt) > 3 * 86_400_000);
  return [
    {
      id: "approvals-pending",
      module: "zakazky",
      severity: old ? "warning" : "info",
      title:
        items.length === 1
          ? "1 doklad čeká na vaše schválení"
          : `${items.length} dokladů čeká na vaše schválení`,
      detail: items
        .slice(0, 3)
        .map((x) => x.docLabel)
        .join(", "),
      href: "/zakazky/schvalovani",
    },
  ];
};

export type { RuleLike };
