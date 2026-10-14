/**
 * Veřejné rozhraní oblasti „approvals“ pro ostatní oblasti a moduly (serverový kód, funkce s `ctx`).
 * Ostatní se na oblast odkazují jen přes `approvalsApi` z `@rebar/zakazky/server`, ne přes cesty do složky.
 *
 * Postup pro modul, který doklad vlastní (objednávky, přijaté faktury, změny, soupisy):
 *  1. při startu modulu `registerHandler(docType, { onDecision, onReopen, describe? })`,
 *  2. při odeslání doklad přepne do stavu „ke schválení“ a zavolá `requestApproval`,
 *  3. výsledek rozhodnutí (i automatické schválení pod limitem) přijde do `onDecision` v téže transakci:
 *     handler zapíše stav dokladu (`approved` + `lockedAt`, nebo zpět do konceptu / `rejected`) a udělá důsledky,
 *  4. úpravy dokladu chrání `assertUnlocked`, vrácení do konceptu dělá `reopen` (volá `onReopen`).
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { auditChange, recordAudit } from "@rebar/core/audit";
import { schema } from "@rebar/core/db";
import { notify } from "@rebar/core/notifications";
import { inTx, NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { APPROVAL_APPROVED, APPROVAL_REJECTED, APPROVAL_REQUEST } from "../notifications";
import { approval, approvalRule, job, jobMember } from "../schema";
import {
  APPROVAL_DOC_LABEL,
  APPROVAL_DOC_TYPES,
  APPROVE_ALL_PERMISSION,
  DEFAULT_RULES,
  mayApproveAll,
  mayDecide,
  pickRule,
  type ApprovalDocType,
  type HeldPermissions,
  type RuleLike,
} from "./rules";

export { APPROVAL_DOC_LABEL, APPROVAL_DOC_TYPES } from "./rules";
export type { ApprovalDocType } from "./rules";

/** Co handler dostane při rozhodnutí o dokladu (schválení, zamítnutí, automatické schválení). */
export type ApprovalDecision = {
  approvalId: string;
  docId: string;
  jobId: string | null;
  /** Částka dokladu bez DPH v haléřích (tak, jak ji doklad poslal). */
  amountMinor: number;
  approved: boolean;
  comment: string | null;
  /** Kdo rozhodl (`null` = automatické schválení pod limitem). */
  decidedBy: string | null;
  /** Doklad se schválil sám, protože nespadá pod žádné pravidlo (pod limitem). */
  automatic: boolean;
};

export type ApprovalHandler = {
  /**
   * Rozhodnutí o dokladu, v téže transakci. Schváleno: doklad do stavu `approved` + `lockedAt`, důsledky.
   * Zamítnuto: doklad do stavu `rejected` (nebo zpět do konceptu), bez zámku.
   */
  onDecision: (ctx: Ctx, d: ApprovalDecision) => Promise<void>;
  /** Vrácení do konceptu (`reopen`): doklad do konceptu, `lockedAt = null`, případně zpětný dopad schválení. */
  onReopen?: (ctx: Ctx, d: { docId: string; jobId: string | null }) => Promise<void>;
  /** Popisky dokladů pro frontu a upozornění (`VP-3 Dodatečné rozvody`). */
  describe?: (ctx: Ctx, docIds: string[]) => Promise<Record<string, { label: string }>>;
};

const g = globalThis as { __approvalHandlers?: Map<string, ApprovalHandler> };
const handlers = () => (g.__approvalHandlers ??= new Map());

/** Zaregistruje handler typu dokladu. Globální registr (Next bundluje route handlery zvlášť); opakovaná registrace přepíše. */
export function registerHandler(docType: ApprovalDocType, handler: ApprovalHandler): void {
  handlers().set(docType, handler);
}

export function getHandler(docType: string): ApprovalHandler | undefined {
  return handlers().get(docType);
}

function heldOf(ctx: Ctx): HeldPermissions {
  // `unrestricted` (systém) nemá mapu oprávnění, `mayDecide` ho pozná podle příznaku.
  return ctx.actor.permissions;
}

async function jobOwnerIds(db: Ctx["db"], jobId: string | null): Promise<string[]> {
  if (!jobId) return [];
  const [j] = await db.select({ managerId: job.managerId }).from(job).where(eq(job.id, jobId));
  const members = await db
    .select({ userId: jobMember.userId })
    .from(jobMember)
    .where(eq(jobMember.jobId, jobId));
  return [j?.managerId, ...members.map((m) => m.userId)].filter((u): u is string => !!u);
}

/** Zajistí výchozí pravidla (jen když tabulka nikdy nic neobsahovala; smazaná pravidla se nevracejí). */
export async function ensureDefaultRules(ctx: Ctx): Promise<void> {
  const [row] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(approvalRule);
  if ((row?.n ?? 0) > 0) return;
  await inTx(ctx, async (c) => {
    await c.db.execute(sql`select pg_advisory_xact_lock(hashtext('approval_rule_seed'))`);
    const [again] = await c.db.select({ n: sql<number>`count(*)::int` }).from(approvalRule);
    if ((again?.n ?? 0) > 0) return;
    await c.db.insert(approvalRule).values(
      DEFAULT_RULES.map((r) => ({
        docType: r.docType,
        minAmountMinor: r.minAmountMinor,
        approverPermission: r.approverPermission,
        createdBy: c.actor.userId,
      })),
    );
  });
}

/** Uživatelé, kteří smí o dokladu rozhodnout (kromě `exclude`, pokud není držitelem `approve_all`). */
async function eligibleApprovers(
  ctx: Ctx,
  rule: RuleLike | null,
  jobId: string | null,
  exclude: string | null,
): Promise<string[]> {
  const rows = await ctx.db
    .select({
      id: schema.user.id,
      isSystem: schema.role.isSystem,
      permission: schema.rolePermission.permission,
      scope: schema.rolePermission.scope,
    })
    .from(schema.user)
    .innerJoin(schema.role, eq(schema.user.roleId, schema.role.id))
    .leftJoin(schema.rolePermission, eq(schema.rolePermission.roleId, schema.role.id))
    .where(and(isNull(schema.user.deletedAt), eq(schema.user.active, true)));
  const byUser = new Map<string, { system: boolean; held: Map<string, "all" | "own"> }>();
  for (const r of rows) {
    const u = byUser.get(r.id) ?? { system: r.isSystem, held: new Map() };
    if (r.permission) u.held.set(r.permission, r.scope as "all" | "own");
    byUser.set(r.id, u);
  }
  const owners = await jobOwnerIds(ctx.db, jobId);
  const out: string[] = [];
  for (const [id, u] of byUser) {
    const held = u.system ? new Map([[APPROVE_ALL_PERMISSION, "all" as const]]) : u.held;
    if (!mayDecide({ rule, held, userId: id, jobOwnerIds: owners })) continue;
    if (id === exclude && !mayApproveAll(held)) continue;
    out.push(id);
  }
  return out;
}

async function activeRules(ctx: Ctx): Promise<RuleLike[]> {
  await ensureDefaultRules(ctx);
  const rows = await ctx.db
    .select()
    .from(approvalRule)
    .where(isNull(approvalRule.deletedAt))
    .orderBy(asc(approvalRule.minAmountMinor));
  return rows.map((r) => ({
    id: r.id,
    docType: r.docType,
    minAmountMinor: r.minAmountMinor,
    approverPermission: r.approverPermission,
    approverId: r.approverId,
    active: r.active,
  }));
}

async function describeDoc(ctx: Ctx, docType: string, docId: string): Promise<string> {
  const h = getHandler(docType);
  const d = await h?.describe?.(ctx, [docId]).catch(() => undefined);
  return d?.[docId]?.label ?? APPROVAL_DOC_LABEL[docType as ApprovalDocType] ?? docType;
}

/** Číslo zakázky do textu upozornění; doklad bez zakázky (přijatá faktura) ho nemá. */
async function jobNumber(ctx: Ctx, jobId: string | null): Promise<string | null> {
  if (!jobId) return null;
  const [j] = await ctx.db.select({ number: job.number }).from(job).where(eq(job.id, jobId));
  return j?.number ?? null;
}

export type RequestApprovalInput = {
  docType: ApprovalDocType;
  docId: string;
  jobId: string | null;
  /** Částka dokladu bez DPH v haléřích (u méněprací záporná, posuzuje se v absolutní hodnotě). */
  amountMinor: number;
};

/**
 * Pošle doklad ke schválení. Vyhodnotí pravidla (nejvyšší pravidlo, jehož limit nepřevyšuje částku); bez pravidla
 * nebo pod nejnižším limitem se doklad schválí hned (handler dostane `onDecision` s `automatic: true`).
 * Dřívější otevřená žádost k témuž dokladu se zruší. Volat v transakci dokladu, jako poslední krok odeslání.
 */
export async function requestApproval(
  ctx: Ctx,
  input: RequestApprovalInput,
): Promise<{ status: "approved" | "pending"; approvalId: string }> {
  if (!APPROVAL_DOC_TYPES.includes(input.docType))
    throw new UserError("Neznámý typ dokladu ke schválení.");
  if (!Number.isSafeInteger(input.amountMinor)) throw new UserError("Neplatná částka dokladu.");
  return inTx(ctx, async (c) => {
    await c.db
      .update(approval)
      .set({ status: "cancelled", decidedAt: new Date(), comment: "Nahrazeno novou žádostí." })
      .where(
        and(
          eq(approval.docType, input.docType),
          eq(approval.docId, input.docId),
          eq(approval.status, "pending"),
        ),
      );
    const rules = await activeRules(c);
    const rule = pickRule(rules, input.docType, input.amountMinor);
    const label = await describeDoc(c, input.docType, input.docId);
    const [row] = await c.db
      .insert(approval)
      .values({
        docType: input.docType,
        docId: input.docId,
        jobId: input.jobId,
        amountMinor: input.amountMinor,
        status: rule ? "pending" : "approved",
        requestedBy: c.actor.userId,
        decidedAt: rule ? null : new Date(),
        comment: rule ? null : "Schváleno automaticky (částka pod limitem).",
        ruleId: rule?.id ?? null,
      })
      .returning({ id: approval.id });
    const approvalId = row!.id;
    if (input.jobId)
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: input.jobId,
        summary: rule
          ? `${label}: odesláno ke schválení (${formatMinor(input.amountMinor)})`
          : `${label}: schváleno automaticky (${formatMinor(input.amountMinor)})`,
      });
    if (!rule) {
      await getHandler(input.docType)?.onDecision(c, {
        approvalId,
        docId: input.docId,
        jobId: input.jobId,
        amountMinor: input.amountMinor,
        approved: true,
        comment: null,
        decidedBy: null,
        automatic: true,
      });
      return { status: "approved" as const, approvalId };
    }
    const approvers = await eligibleApprovers(c, rule, input.jobId, c.actor.userId);
    const number = await jobNumber(c, input.jobId);
    // záznamem je žádost (ne zakázka): schvalovatel nemusí zakázku smět číst, přesto má o dokladu rozhodnout
    await notify(c.db, APPROVAL_REQUEST, {
      params: {
        kind: APPROVAL_DOC_LABEL[input.docType],
        number,
        document: label,
        amount: formatMinor(input.amountMinor),
      },
      to: { approvers },
      record: { type: "approval", id: approvalId },
      actorId: c.actor.userId,
    });
    return { status: "pending" as const, approvalId };
  });
}

export type DecideInput = { approve: boolean; comment?: string | null | undefined };

/**
 * Rozhodne o žádosti. Kontroluje, že aktér smí o dokladu rozhodnout (limit, zakázka) a že neschvaluje vlastní doklad
 * (bez `zakazky.approve_all`). Souběh dvou rozhodnutí: druhé se zamkne na řádku žádosti a skončí „už vyřízeno“.
 */
export async function decide(
  ctx: Ctx,
  approvalId: string,
  input: DecideInput,
): Promise<{ status: "approved" | "rejected" }> {
  const comment = input.comment?.trim() || null;
  if (!input.approve && !comment) throw new UserError("Napište důvod zamítnutí.");
  return inTx(ctx, async (c) => {
    const [row] = await c.db
      .select()
      .from(approval)
      .where(eq(approval.id, approvalId))
      .for("update");
    if (!row) throw new NotFoundError("Žádost o schválení nenalezena.");
    if (row.status !== "pending") throw new UserError("O této žádosti už bylo rozhodnuto.");
    const owners = await jobOwnerIds(c.db, row.jobId);
    const rule = row.ruleId ? ((await ruleById(c, row.ruleId)) ?? null) : null;
    const held = heldOf(c);
    const unrestricted = c.actor.unrestricted;
    if (
      !mayDecide({
        rule,
        held,
        userId: c.actor.userId,
        unrestricted,
        jobOwnerIds: owners,
      })
    )
      throw new PermissionError(
        "Tento doklad nemůžete schválit: překračuje váš limit nebo nepatří k vaší zakázce.",
      );
    if (
      row.requestedBy &&
      row.requestedBy === c.actor.userId &&
      input.approve &&
      !mayApproveAll(held, unrestricted)
    )
      throw new UserError(
        "Vlastní doklad nemůžete schválit. Požádejte o schválení někoho s oprávněním schvalovat bez limitu.",
      );
    await c.db
      .update(approval)
      .set({
        status: input.approve ? "approved" : "rejected",
        decidedBy: c.actor.userId,
        decidedAt: new Date(),
        comment,
      })
      .where(eq(approval.id, approvalId));
    const label = await describeDoc(c, row.docType, row.docId);
    if (row.jobId)
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: row.jobId,
        summary: `${label}: ${input.approve ? "schváleno" : "zamítnuto"} (${formatMinor(row.amountMinor)})${comment ? `, ${comment}` : ""}`,
      });
    await getHandler(row.docType)?.onDecision(c, {
      approvalId,
      docId: row.docId,
      jobId: row.jobId,
      amountMinor: row.amountMinor,
      approved: input.approve,
      comment,
      decidedBy: c.actor.userId,
      automatic: false,
    });
    if (row.requestedBy && row.requestedBy !== c.actor.userId) {
      const number = await jobNumber(c, row.jobId);
      await notify(c.db, input.approve ? APPROVAL_APPROVED : APPROVAL_REJECTED, {
        params: { number, document: label, comment },
        to: { requester: [row.requestedBy] },
        record: row.jobId ? { type: "job", id: row.jobId } : null,
        url: row.jobId ? `/zakazky/${row.jobId}` : "/zakazky/schvalovani",
        actorId: c.actor.userId,
      });
    }
    return { status: input.approve ? ("approved" as const) : ("rejected" as const) };
  });
}

async function ruleById(ctx: Ctx, id: string): Promise<RuleLike | null> {
  const [r] = await ctx.db.select().from(approvalRule).where(eq(approvalRule.id, id));
  return r
    ? {
        id: r.id,
        docType: r.docType,
        minAmountMinor: r.minAmountMinor,
        approverPermission: r.approverPermission,
        approverId: r.approverId,
        active: r.active,
      }
    : null;
}

/** Doklad nesmí být zamčený. Vyhodí `UserError` s důvodem; volat na začátku každé úpravy dokladu. */
export function assertUnlocked(
  row: { lockedAt?: Date | string | null | undefined },
  label: string,
): void {
  if (row.lockedAt)
    throw new UserError(`${label}: doklad je schválený a zamčený, vraťte ho do konceptu.`);
}

/**
 * Vrátí doklad do konceptu: otevřené žádosti zruší, zavolá `onReopen` handleru (ten uvolní `lockedAt` a stav) a zapíše audit.
 * Schválený doklad smí vrátit jen držitel `zakazky.approve_all`; čekající doklad i ten, kdo ho odeslal (vzít zpět).
 */
export async function reopen(
  ctx: Ctx,
  docType: ApprovalDocType,
  docId: string,
  opts: { reason?: string | null } = {},
): Promise<void> {
  const handler = getHandler(docType);
  if (!handler?.onReopen) throw new UserError("Tento doklad nejde vrátit do konceptu.");
  await inTx(ctx, async (c) => {
    const [last] = await c.db
      .select()
      .from(approval)
      .where(
        and(
          eq(approval.docType, docType),
          eq(approval.docId, docId),
          inArray(approval.status, ["pending", "approved"]),
        ),
      )
      .orderBy(desc(approval.requestedAt))
      .limit(1);
    const all = mayApproveAll(heldOf(c), c.actor.unrestricted);
    const own = last?.status === "pending" && last.requestedBy === c.actor.userId;
    if (!all && !own)
      throw new PermissionError(
        "Schválený doklad může vrátit do konceptu jen ten, kdo schvaluje bez limitu.",
      );
    if (all && c.actor.permissions.get(APPROVE_ALL_PERMISSION) === "own" && last?.jobId) {
      const owners = await jobOwnerIds(c.db, last.jobId);
      if (!c.actor.userId || !owners.includes(c.actor.userId))
        throw new PermissionError("Doklad nepatří k vaší zakázce.");
    }
    await c.db
      .update(approval)
      .set({
        status: "cancelled",
        decidedAt: new Date(),
        comment: opts.reason?.trim() || "Vráceno do konceptu.",
      })
      .where(
        and(
          eq(approval.docType, docType),
          eq(approval.docId, docId),
          eq(approval.status, "pending"),
        ),
      );
    // dřívější schválení po vrácení do konceptu neplatí (zůstane v historii jako zrušené)
    await c.db
      .update(approval)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(approval.docType, docType),
          eq(approval.docId, docId),
          eq(approval.status, "approved"),
        ),
      );
    const jobId = last?.jobId ?? null;
    await handler.onReopen!(c, { docId, jobId });
    const label = await describeDoc(c, docType, docId);
    if (jobId)
      await auditChange(c, {
        entityType: "job",
        entityId: jobId,
        before: { [label]: last?.status === "approved" ? "schváleno (zamčeno)" : "ke schválení" },
        after: { [label]: "koncept" },
        summary: `${label}: vráceno do konceptu${opts.reason ? `, ${opts.reason}` : ""}`,
      });
  });
}

export type ApprovalState = {
  approvalId: string | null;
  jobId: string | null;
  status: "none" | "pending" | "approved" | "rejected" | "cancelled";
  requestedBy: string | null;
  requestedAt: Date | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  comment: string | null;
  /** Aktér smí o čekající žádosti rozhodnout. */
  canDecide: boolean;
  /** Aktér smí doklad vrátit do konceptu. */
  canReopen: boolean;
};

/** Stav schvalování dokladu pro UI (poslední žádost, co smí aktér udělat). */
export async function getState(
  ctx: Ctx,
  docType: ApprovalDocType,
  docId: string,
): Promise<ApprovalState> {
  const [last] = await ctx.db
    .select()
    .from(approval)
    .where(and(eq(approval.docType, docType), eq(approval.docId, docId)))
    .orderBy(desc(approval.requestedAt))
    .limit(1);
  if (!last)
    return {
      approvalId: null,
      jobId: null,
      status: "none",
      requestedBy: null,
      requestedAt: null,
      decidedBy: null,
      decidedAt: null,
      comment: null,
      canDecide: false,
      canReopen: false,
    };
  const owners = await jobOwnerIds(ctx.db, last.jobId);
  const rule = last.ruleId ? await ruleById(ctx, last.ruleId) : null;
  const held = heldOf(ctx);
  const unrestricted = ctx.actor.unrestricted;
  const decidable =
    last.status === "pending" &&
    mayDecide({ rule, held, userId: ctx.actor.userId, unrestricted, jobOwnerIds: owners }) &&
    !(last.requestedBy === ctx.actor.userId && !mayApproveAll(held, unrestricted));
  const all = mayApproveAll(held, unrestricted);
  return {
    approvalId: last.id,
    jobId: last.jobId,
    status: last.status as ApprovalState["status"],
    requestedBy: last.requestedBy,
    requestedAt: last.requestedAt,
    decidedBy: last.decidedBy,
    decidedAt: last.decidedAt,
    comment: last.comment,
    canDecide: decidable,
    canReopen:
      !!getHandler(docType)?.onReopen &&
      ((last.status === "approved" && all) ||
        (last.status === "pending" && (all || last.requestedBy === ctx.actor.userId))),
  };
}
