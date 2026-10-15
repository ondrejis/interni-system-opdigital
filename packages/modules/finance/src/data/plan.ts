import { and, asc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { type Ctx } from "@rebar/core/rbac";
import { payment, paymentAllocation, splitRule } from "../schema";
import {
  allocateJob,
  allocationsDiffer,
  type Allocation,
  type SplitRule,
  type ValidationIssue,
} from "../logic";
import type { AllocationChange } from "../contract";
import { auditPayment, describeAllocations } from "./audit";
import type { JobInfo } from "./jobs";
import { loadAllocations, toForAllocation, toLogicRule, type PayRec, type RuleRec } from "./model";
import { loadPeople } from "./util";

/** Stav financí zakázky načtený pod zámkem (platby, jejich podíly a pravidla). */
export type JobState = {
  job: JobInfo;
  payments: PayRec[];
  allocs: Map<string, Allocation[]>;
  rules: RuleRec[];
};

/** Zamkne finance zakázky do konce transakce (změny plateb a pravidel jedné zakázky se řadí za sebou). */
export async function lockJob(c: Ctx, jobId: string): Promise<void> {
  await c.db.execute(sql`select pg_advisory_xact_lock(hashtext(${`finance.job.${jobId}`}))`);
}

/** Načte platby (nesmazané, všech stavů), podíly a pravidla zakázky. Volat po `lockJob`. */
export async function loadState(c: Ctx, job: JobInfo): Promise<JobState> {
  const payments = await c.db
    .select()
    .from(payment)
    .where(and(eq(payment.jobId, job.id), isNull(payment.deletedAt)));
  const rules = await c.db
    .select()
    .from(splitRule)
    .where(and(eq(splitRule.jobId, job.id), isNull(splitRule.deletedAt)))
    .orderBy(asc(splitRule.position), asc(splitRule.createdAt));
  const allocs = await loadAllocations(
    c.db,
    payments.map((p) => p.id),
  );
  return { job, payments, allocs, rules };
}

/** Jedna platba v plánu přepočtu. */
export type PlanEntry = {
  rec: PayRec;
  /** Stav před změnou (`null` = platba je nová). */
  prevStatus: PayRec["status"] | null;
  before: Allocation[] | null;
  after: Allocation[];
  /** Podíly se liší od uložených (nebo je platba nová) a musí se zapsat. */
  changed: boolean;
};

/** Výsledek výpočtu: co se přepíše a co z toho vyžaduje potvrzení (změna rozdělení už zaplacené platby). */
export type Plan = {
  entries: PlanEntry[];
  warnings: ValidationIssue[];
  /** Změny zaplacených plateb (FIN-13). */
  confirm: PlanEntry[];
};

/**
 * Spočítá rozdělení všech plateb zakázky pro budoucí stav (`next`) a porovná ho s uloženým (`prev`). Nic nezapisuje.
 * `manual` jsou nově zadané ruční podíly (jinak se u ručně rozdělených plateb použijí uložené).
 */
export function computePlan(
  prev: JobState,
  next: { payments: PayRec[]; rules: SplitRule[]; manual?: ReadonlyMap<string, Allocation[]> },
  today: string,
): Plan {
  const manualAllocs = new Map(prev.allocs);
  for (const [id, a] of next.manual ?? []) manualAllocs.set(id, a);
  const results = allocateJob(
    next.payments.map((p) => toForAllocation(p, manualAllocs)),
    next.rules,
    { today },
  );
  const prevStatus = new Map(prev.payments.map((p) => [p.id, p.status]));
  const warnings: ValidationIssue[] = [];
  const seen = new Set<string>();
  const entries: PlanEntry[] = [];
  for (const rec of next.payments) {
    const res = results.get(rec.id);
    if (!res) continue; // zrušená platba se nepřepočítává
    for (const w of res.warnings) {
      const k = `${w.code}|${w.message}`;
      if (!seen.has(k)) {
        seen.add(k);
        warnings.push(w);
      }
    }
    const before = prev.allocs.get(rec.id) ?? null;
    entries.push({
      rec,
      prevStatus: prevStatus.get(rec.id) ?? null,
      before,
      after: res.allocations,
      changed: before === null || allocationsDiffer(before, res.allocations),
    });
  }
  return {
    entries,
    warnings,
    confirm: entries.filter((e) => e.changed && e.before !== null && e.prevStatus === "paid"),
  };
}

/** Změny zaplacených plateb ve tvaru pro dialog potvrzení. */
export const toChanges = (plan: Plan): AllocationChange[] =>
  plan.confirm.map((e) => ({
    paymentId: e.rec.id,
    description: e.rec.description,
    status: e.rec.status,
    before: e.before ?? [],
    after: e.after.filter((a) => a.amountMinor > 0),
  }));

/** Přepíše podíly jedné platby (smaže osoby, které už podíl nemají, ostatní doplní nebo upraví). */
export async function writeAllocations(
  c: Ctx,
  paymentId: string,
  allocs: readonly Allocation[],
): Promise<void> {
  const rows = allocs.filter((a) => a.amountMinor > 0);
  const ids = rows.map((r) => r.userId);
  await c.db
    .delete(paymentAllocation)
    .where(
      and(
        eq(paymentAllocation.paymentId, paymentId),
        ids.length ? notInArray(paymentAllocation.userId, ids) : undefined,
      ),
    );
  if (!rows.length) return;
  await c.db
    .insert(paymentAllocation)
    .values(
      rows.map((r) => ({
        paymentId,
        userId: r.userId,
        amountMinor: r.amountMinor,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })),
    )
    .onConflictDoUpdate({
      target: [paymentAllocation.paymentId, paymentAllocation.userId],
      set: {
        amountMinor: sql`excluded.amount_minor`,
        deletedAt: null,
        updatedAt: new Date(),
        updatedBy: c.actor.userId,
      },
    });
}

/**
 * Zapíše změněné podíly plánu. U existujících plateb (mimo `quietIds`, které si historii píšou samy) zapíše do historie
 * „Rozdělení přepočítáno“. Vrací počet přepsaných plateb.
 */
export async function commitPlan(
  c: Ctx,
  plan: Plan,
  names: Record<string, string>,
  quietIds: ReadonlySet<string> = new Set(),
): Promise<number> {
  let n = 0;
  for (const e of plan.entries) {
    if (!e.changed) continue;
    await writeAllocations(c, e.rec.id, e.after);
    n++;
    if (e.before !== null && !quietIds.has(e.rec.id))
      await auditPayment(c, "update", e.rec, "Rozdělení přepočítáno", [
        {
          field: "Rozdělení",
          old: describeAllocations(e.before, names),
          new: describeAllocations(e.after, names),
        },
      ]);
  }
  return n;
}

/** Jména lidí z podílů plánu (do popisů v historii). */
export async function namesOf(
  c: Ctx,
  plan: Plan,
  extra: string[] = [],
): Promise<Record<string, string>> {
  const ids = new Set(extra);
  for (const e of plan.entries) {
    for (const a of e.after) ids.add(a.userId);
    for (const a of e.before ?? []) ids.add(a.userId);
    if (e.rec.issuerId) ids.add(e.rec.issuerId);
  }
  const people = await loadPeople(c.db, ids);
  return Object.fromEntries(Object.values(people).map((p) => [p.id, p.firstName]));
}

export { toLogicRule };
