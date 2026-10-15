import { and, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { newId } from "@rebar/core/db";
import type { Executor } from "@rebar/core/db";
import type { PaymentSnap, SplitRuleInput } from "@rebar/core/contracts";
import { can, scopeOf, type Ctx } from "@rebar/core/rbac";
import { payment, paymentAllocation, type splitRule } from "../schema";
import {
  paymentDueState,
  type Allocation,
  type PaymentForAllocation,
  type SplitRule,
} from "../logic";
import type { PaymentRow, SplitRuleView } from "../contract";
import { privateScope } from "./private";
import { isoOf } from "./util";

/** Řádek platby z databáze. */
export type PayRec = typeof payment.$inferSelect;
/** Řádek pravidla rozdělení z databáze. */
export type RuleRec = typeof splitRule.$inferSelect;

/** Pravidlo z databáze jako vstup čisté logiky. */
export const toLogicRule = (r: RuleRec): SplitRule => ({
  id: r.id,
  userId: r.userId,
  mode: r.mode,
  percent: r.percent,
  fixedMinor: r.fixedMinor,
  appliesTo: r.appliesTo as SplitRule["appliesTo"],
  validFromMonth: r.validFromMonth,
  validToMonth: r.validToMonth,
  position: r.position,
});

/** Pravidlo z databáze ve tvaru pro UI a nastavení. */
export const toRuleView = (r: RuleRec): SplitRuleView => ({
  id: r.id,
  position: r.position,
  userId: r.userId,
  mode: r.mode,
  ...(r.percent !== null ? { percent: Number(r.percent) } : {}),
  ...(r.fixedMinor !== null ? { fixedMinor: r.fixedMinor } : {}),
  appliesTo: r.appliesTo as SplitRuleView["appliesTo"],
  validFrom: r.validFromMonth,
  validTo: r.validToMonth,
});

/** Vstup pravidla (z nastavení, retaineru, příkazu) jako pravidlo čisté logiky (pořadí = `position`). */
export const inputToLogicRule = (r: SplitRuleInput, position: number): SplitRule => ({
  userId: r.userId,
  mode: r.mode,
  percent: r.percent ?? null,
  fixedMinor: r.fixedMinor ?? null,
  appliesTo: r.appliesTo === "recurring" ? "all" : r.appliesTo,
  validFromMonth: r.validFrom ?? null,
  validToMonth: r.validTo ?? null,
  position,
});

/** Pravidlo z databáze jako `SplitRuleInput` (bez id). */
export const ruleToInput = (r: RuleRec): SplitRuleInput => {
  const { id: _id, position: _p, ...rest } = toRuleView(r);
  return rest;
};

/** Platba (řádek + její podíly) jako vstup rozdělení; ruční podíly jen u `allocationMode = manual`. */
export function toForAllocation(
  p: PayRec,
  allocs: ReadonlyMap<string, Allocation[]>,
): PaymentForAllocation & { id: string } {
  return {
    id: p.id,
    kind: p.kind,
    amountMinor: p.amountMinor,
    issuerId: p.issuerId ?? "",
    status: p.status,
    periodMonth: p.periodMonth,
    issuedOn: p.issuedOn,
    createdAt: p.createdAt.toISOString(),
    allocationMode: p.allocationMode,
    manualAllocations: p.allocationMode === "manual" ? (allocs.get(p.id) ?? []) : null,
  };
}

/** Snímek platby pro doménové události. */
export const paymentSnap = (p: PayRec, allocations: Allocation[]): PaymentSnap => ({
  id: p.id,
  jobId: p.jobId,
  companyId: p.companyId,
  kind: p.kind,
  amountMinor: p.amountMinor,
  issuerId: p.issuerId,
  status: p.status,
  invoiceNumber: p.invoiceNumber,
  issuedOn: p.issuedOn,
  dueOn: p.dueOn,
  paidOn: p.paidOn,
  allocations: allocations.map((a) => ({ userId: a.userId, amountMinor: a.amountMinor })),
});

/** Viditelnost plateb aktéra: soukromé jen vlastníkovi; při rozsahu „jen moje“ platby, které fakturuje nebo z nich má podíl. */
export function paymentScope(ctx: Ctx): SQL | undefined {
  const conds: SQL[] = [];
  const priv = privateScope(ctx, payment);
  if (priv) conds.push(priv);
  if (scopeOf(ctx, "finance.read") === "own") {
    const me = ctx.actor.userId;
    conds.push(
      me
        ? sql`(${payment.issuerId} = ${me} or exists (select 1 from payment_allocation pa where pa.payment_id = ${payment.id} and pa.user_id = ${me} and pa.deleted_at is null))`
        : sql`false`,
    );
  }
  return conds.length ? and(...conds) : undefined;
}

/** Smí aktér číst finance? (`finance.read` v jakémkoli rozsahu). */
export const canReadFinance = (ctx: Ctx): boolean => can(ctx, "finance.read");

/** Podíly platby podle id (nesmazané řádky). */
export async function loadAllocations(
  db: Executor,
  paymentIds: readonly string[],
): Promise<Map<string, Allocation[]>> {
  const out = new Map<string, Allocation[]>();
  if (!paymentIds.length) return out;
  const rows = await db
    .select({
      paymentId: paymentAllocation.paymentId,
      userId: paymentAllocation.userId,
      amountMinor: paymentAllocation.amountMinor,
    })
    .from(paymentAllocation)
    .where(
      and(
        inArray(paymentAllocation.paymentId, [...paymentIds]),
        isNull(paymentAllocation.deletedAt),
      ),
    );
  for (const r of rows) {
    const list = out.get(r.paymentId) ?? [];
    list.push({ userId: r.userId, amountMinor: r.amountMinor });
    out.set(r.paymentId, list);
  }
  return out;
}

/** Nově vytvořené id (UUID v7). */
export const freshId = (): string => newId();

/** Řádek platby pro UI (bez jmen zakázky a klienta; ty doplní `rows.ts`). */
export function baseRow(
  p: PayRec,
  allocs: Allocation[],
  today: string,
): Omit<PaymentRow, "jobNumber" | "jobTitle" | "jobType" | "companyName"> {
  return {
    id: p.id,
    jobId: p.jobId,
    companyId: p.companyId,
    description: p.description,
    kind: p.kind,
    periodMonth: p.periodMonth,
    amountMinor: p.amountMinor,
    issuerId: p.issuerId,
    status: p.status,
    invoiceNumber: p.invoiceNumber,
    invoiceUrl: p.invoiceUrl,
    issuedOn: p.issuedOn,
    dueOn: p.dueOn,
    paidOn: p.paidOn,
    allocationMode: p.allocationMode,
    source: p.source,
    retainerId: p.retainerId,
    note: p.note,
    isPrivate: p.isPrivate,
    dueState: paymentDueState(p, today),
    allocations: allocs,
    createdAt: isoOf(p.createdAt) ?? "",
  };
}
