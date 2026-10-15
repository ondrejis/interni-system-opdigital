import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { emitDomain } from "@rebar/core/events";
import { indexRecord } from "@rebar/core/entities";
import { can, inTx, NotFoundError, UserError, type Ctx } from "@rebar/core/rbac";
import { job as jobTable } from "@rebar/zakazky/schema";
import { paymentEntity } from "../entities";
import { payment } from "../schema";
import {
  effectiveSplitRules,
  ruleMonthFor,
  summarizePayments,
  validateSplitRules,
  type Allocation,
  type ValidationIssue,
} from "../logic";
import type { PaymentDetail, PaymentMutation, PaymentRow, RecalcResult } from "../contract";
import { paymentChanges, auditPayment } from "./audit";
import type { FinDeps } from "./deps";
import { loadJob } from "./jobs";
import {
  freshId,
  loadAllocations,
  paymentScope,
  paymentSnap,
  toLogicRule,
  type PayRec,
} from "./model";
import {
  commitPlan,
  computePlan,
  loadState,
  lockJob,
  namesOf,
  toChanges,
  writeAllocations,
  type JobState,
  type Plan,
} from "./plan";
import { syncPrivate } from "./private";
import { loadRules } from "./rules";
import { toRows } from "./rows";
import { assertUsers, guarded, loadPeople, today } from "./util";

type Kind = PayRec["kind"];
type Status = PayRec["status"];

/** Vyhodí `UserError`, když stav platby nedává smysl (chybí číslo faktury, datum úhrady před vystavením…). */
export function checkPaymentState(p: PayRec): void {
  if (p.kind === "retainer" && !p.periodMonth)
    throw new UserError("U retaineru vyplňte měsíc, za který platba je.");
  if (p.status === "issued" || p.status === "paid") {
    if (!p.invoiceNumber?.trim()) throw new UserError("Vyplňte číslo faktury.");
    if (!p.issuedOn) throw new UserError("Vyplňte datum vystavení.");
    if (p.dueOn && p.dueOn < p.issuedOn)
      throw new UserError("Splatnost nemůže být před datem vystavení.");
  }
  if (p.status === "paid") {
    if (!p.paidOn) throw new UserError("Vyplňte datum úhrady.");
    if (p.issuedOn && p.paidOn < p.issuedOn)
      throw new UserError("Datum úhrady nemůže být před datem vystavení.");
  }
}

/** Nový řádek platby s výchozími hodnotami. */
export function newPayRec(
  c: Ctx,
  v: Partial<PayRec> & Pick<PayRec, "description" | "amountMinor">,
): PayRec {
  const now = new Date();
  return {
    id: freshId(),
    jobId: null,
    companyId: null,
    kind: "one_off",
    periodMonth: null,
    issuerId: null,
    status: "planned",
    invoiceNumber: null,
    invoiceUrl: null,
    issuedOn: null,
    dueOn: null,
    paidOn: null,
    allocationMode: "rules",
    source: "manual",
    retainerId: null,
    note: null,
    isPrivate: false,
    visibilitySource: "own",
    createdAt: now,
    updatedAt: now,
    createdBy: c.actor.userId,
    updatedBy: c.actor.userId,
    deletedAt: null,
    deletedBy: null,
    deletedBatch: null,
    ...v,
  };
}

/** Vloží novou platbu (řádek, zámek, hledání, historie, událost `payment.created`); podíly zapisuje volající. */
export async function insertPayment(
  c: Ctx,
  rec: PayRec,
  allocs: Allocation[],
  names: Record<string, string>,
) {
  await c.db.insert(payment).values(rec);
  if (rec.isPrivate) await syncPrivate(c.db, "payment", rec.id, true);
  await indexRecord(c.db, { def: paymentEntity }, rec as unknown as Record<string, unknown>);
  await auditPayment(c, "create", rec, rec.description, paymentChanges(null, rec, names));
  await emitDomain(
    c,
    "payment.created",
    { payment: paymentSnap(rec, allocs) },
    { entity: { type: "payment", id: rec.id, isPrivate: rec.isPrivate } },
  );
}

async function withJob<T>(
  ctx: Ctx,
  jobId: string,
  fn: (c: Ctx, st: JobState) => Promise<T>,
): Promise<T> {
  return inTx(ctx, async (c) => {
    const job = await loadJob(c, jobId);
    if (!job) throw new NotFoundError("Zakázka nenalezena.");
    await lockJob(c, jobId);
    return fn(c, await loadState(c, job));
  });
}

async function loadPayment(c: Ctx, id: string): Promise<PayRec> {
  const [rec] = await c.db
    .select()
    .from(payment)
    .where(and(eq(payment.id, id), isNull(payment.deletedAt), paymentScope(c)));
  if (!rec) throw new NotFoundError("Platba nenalezena.");
  return rec;
}

async function mutationResult(
  c: Ctx,
  deps: FinDeps,
  recId: string,
  plan: Plan | null,
  recalculated: number,
  extraAllocs?: Allocation[],
): Promise<PaymentMutation> {
  const [rec] = await c.db.select().from(payment).where(eq(payment.id, recId));
  const allocs = await loadAllocations(c.db, [recId]);
  if (extraAllocs) allocs.set(recId, extraAllocs);
  const { rows, people } = await toRows(c, deps, [rec!], allocs);
  return {
    status: "ok",
    payment: rows[0]!,
    people,
    warnings: plan?.warnings ?? [],
    recalculated,
  };
}

/**
 * Společný zápis změny platby: výpočet rozdělení celé zakázky, potvrzení u zaplacených plateb, zápis řádku, podílů,
 * historie a událostí. `st` je `null` u platby bez zakázky (Fakturoid; podíl má jen ten, kdo fakturuje).
 */
async function saveChange(
  c: Ctx,
  deps: FinDeps,
  st: JobState | null,
  prev: PayRec,
  next: PayRec,
  o: { manual?: Allocation[] | undefined; confirm: boolean; summary: string },
): Promise<PaymentMutation> {
  checkPaymentState(next);
  let plan: Plan | null = null;
  if (st) {
    plan = computePlan(
      st,
      {
        payments: st.payments.map((p) => (p.id === prev.id ? next : p)),
        rules: st.rules.map(toLogicRule),
        ...(o.manual ? { manual: new Map([[prev.id, o.manual]]) } : {}),
      },
      today(),
    );
    if (plan.confirm.length && !o.confirm)
      return { status: "needs_confirmation", changes: toChanges(plan) };
  }
  const names = plan ? await namesOf(c, plan) : {};
  const people = await loadPeople(c.db, [prev.issuerId, next.issuerId]);
  for (const p of Object.values(people)) names[p.id] = p.firstName;
  await c.db
    .update(payment)
    .set({
      description: next.description,
      kind: next.kind,
      periodMonth: next.periodMonth,
      amountMinor: next.amountMinor,
      issuerId: next.issuerId,
      status: next.status,
      invoiceNumber: next.invoiceNumber,
      invoiceUrl: next.invoiceUrl,
      issuedOn: next.issuedOn,
      dueOn: next.dueOn,
      paidOn: next.paidOn,
      allocationMode: next.allocationMode,
      note: next.note,
      updatedBy: c.actor.userId,
    })
    .where(eq(payment.id, prev.id));
  const changes = paymentChanges(prev, next, names);
  if (changes.length) await auditPayment(c, "update", next, o.summary, changes);
  await indexRecord(c.db, { def: paymentEntity }, next as unknown as Record<string, unknown>);
  let recalculated = 0;
  let own: Allocation[] | undefined;
  if (plan) recalculated = await commitPlan(c, plan, names, new Set([prev.id]));
  else if (next.issuerId) {
    own = [{ userId: next.issuerId, amountMinor: next.amountMinor }];
    await writeAllocations(c, next.id, own);
  }
  const entry = plan?.entries.find((e) => e.rec.id === prev.id);
  const allocs = entry?.after ?? own ?? (await loadAllocations(c.db, [prev.id])).get(prev.id) ?? [];
  const snap = paymentSnap(
    next,
    allocs.filter((a) => a.amountMinor > 0),
  );
  const entity = { type: "payment", id: next.id, isPrivate: next.isPrivate };
  if (prev.status !== next.status) {
    await emitDomain(
      c,
      "payment.status_changed",
      { paymentId: next.id, from: prev.status, to: next.status },
      { entity },
    );
    if (next.status === "paid") await emitDomain(c, "payment.paid", { payment: snap }, { entity });
  }
  return mutationResult(c, deps, next.id, plan, recalculated);
}

/** `finance.payment.create`: ruční založení platby zakázky (plánovaná, nebo rovnou vystavená či zaplacená). */
export function createPayment(
  ctx: Ctx,
  deps: FinDeps,
  input: {
    jobId: string;
    description: string;
    kind: Exclude<Kind, "recurring">;
    amountMinor: number;
    issuerId: string;
    periodMonth?: string | null | undefined;
    issuedOn?: string | null | undefined;
    dueOn?: string | null | undefined;
    note?: string | null | undefined;
    status: "planned" | "issued" | "paid";
    invoiceNumber?: string | null | undefined;
    invoiceUrl?: string | null | undefined;
    paidOn?: string | null | undefined;
    allocations?: Allocation[] | undefined;
    confirmRecalc: boolean;
  },
): Promise<PaymentMutation> {
  return guarded(() =>
    withJob(ctx, input.jobId, async (c, st) => {
      if (input.allocations && !can(c, "finance.splits_edit"))
        throw new UserError("Ruční rozdělení smí zadat jen ten, kdo upravuje rozdělení plateb.");
      await assertUsers(c.db, [input.issuerId, ...(input.allocations ?? []).map((a) => a.userId)]);
      const t = today();
      const rec = newPayRec(c, {
        jobId: st.job.id,
        companyId: st.job.companyId,
        description: input.description,
        kind: input.kind,
        amountMinor: input.amountMinor,
        issuerId: input.issuerId,
        periodMonth: input.periodMonth ?? null,
        status: input.status,
        invoiceNumber: input.invoiceNumber?.trim() || null,
        invoiceUrl: input.invoiceUrl?.trim() || null,
        issuedOn: input.issuedOn ?? (input.status === "planned" ? null : t),
        dueOn: input.dueOn ?? null,
        paidOn: input.status === "paid" ? (input.paidOn ?? t) : null,
        allocationMode: input.allocations ? "manual" : "rules",
        note: input.note?.trim() || null,
        isPrivate: st.job.isPrivate,
        visibilitySource: st.job.isPrivate ? "inherited" : "own",
      });
      checkPaymentState(rec);
      const plan = computePlan(
        st,
        {
          payments: [...st.payments, rec],
          rules: st.rules.map(toLogicRule),
          ...(input.allocations ? { manual: new Map([[rec.id, input.allocations]]) } : {}),
        },
        t,
      );
      if (plan.confirm.length && !input.confirmRecalc)
        return { status: "needs_confirmation", changes: toChanges(plan) } satisfies PaymentMutation;
      const names = await namesOf(c, plan, [input.issuerId]);
      const mine = plan.entries.find((e) => e.rec.id === rec.id)!;
      await insertPayment(c, rec, mine.after, names);
      const recalculated = await commitPlan(c, plan, names, new Set([rec.id]));
      return mutationResult(c, deps, rec.id, plan, recalculated);
    }),
  );
}

/** `finance.payment.update`: úprava platby; změna částky, fakturujícího nebo dat přepočítá rozdělení (FIN-13). */
export function updatePayment(
  ctx: Ctx,
  deps: FinDeps,
  input: {
    id: string;
    description?: string | undefined;
    kind?: Exclude<Kind, "recurring"> | undefined;
    amountMinor?: number | undefined;
    issuerId?: string | undefined;
    periodMonth?: string | null | undefined;
    issuedOn?: string | null | undefined;
    dueOn?: string | null | undefined;
    paidOn?: string | null | undefined;
    invoiceNumber?: string | null | undefined;
    invoiceUrl?: string | null | undefined;
    note?: string | null | undefined;
    allocations?: Allocation[] | undefined;
    resetAllocation?: boolean | undefined;
    confirmRecalc: boolean;
  },
): Promise<PaymentMutation> {
  return guarded(() =>
    inTx(ctx, async (c) => {
      const first = await loadPayment(c, input.id);
      const run = async (st: JobState | null) => {
        const prev = st ? (st.payments.find((p) => p.id === input.id) ?? first) : first;
        const onlyText = Object.keys(input).every((k) =>
          ["id", "description", "note", "invoiceUrl", "confirmRecalc"].includes(k),
        );
        if (prev.status === "canceled" && !onlyText)
          throw new UserError(
            "Zrušenou platbu nejde upravit. Nejdřív ji vraťte do stavu Plánovaná.",
          );
        if (input.allocations && !can(c, "finance.splits_edit"))
          throw new UserError("Ruční rozdělení smí zadat jen ten, kdo upravuje rozdělení plateb.");
        if (input.issuerId || input.allocations)
          await assertUsers(c.db, [
            input.issuerId,
            ...(input.allocations ?? []).map((a) => a.userId),
          ]);
        const has = <K extends keyof typeof input>(k: K) => input[k] !== undefined;
        const next: PayRec = {
          ...prev,
          ...(has("description") ? { description: input.description!.trim() } : {}),
          ...(has("kind") ? { kind: input.kind! } : {}),
          ...(has("amountMinor") ? { amountMinor: input.amountMinor! } : {}),
          ...(has("issuerId") ? { issuerId: input.issuerId! } : {}),
          ...(has("periodMonth") ? { periodMonth: input.periodMonth ?? null } : {}),
          ...(has("issuedOn") ? { issuedOn: input.issuedOn ?? null } : {}),
          ...(has("dueOn") ? { dueOn: input.dueOn ?? null } : {}),
          ...(has("paidOn") ? { paidOn: input.paidOn ?? null } : {}),
          ...(has("invoiceNumber") ? { invoiceNumber: input.invoiceNumber?.trim() || null } : {}),
          ...(has("invoiceUrl") ? { invoiceUrl: input.invoiceUrl?.trim() || null } : {}),
          ...(has("note") ? { note: input.note?.trim() || null } : {}),
        };
        if (input.allocations) next.allocationMode = "manual";
        else if (input.resetAllocation) next.allocationMode = "rules";
        else if (prev.allocationMode === "manual" && next.amountMinor !== prev.amountMinor)
          throw new UserError(
            "Platba je rozdělená ručně. Při změně částky zadejte nové rozdělení, nebo ji vraťte k pravidlům.",
          );
        if (next.status === "planned" && next.paidOn) next.paidOn = null;
        return saveChange(c, deps, st, prev, next, {
          manual: input.allocations,
          confirm: input.confirmRecalc,
          summary: "Platba upravena",
        });
      };
      if (!first.jobId) return run(null);
      const job = await loadJob(c, first.jobId);
      if (!job) throw new NotFoundError("Zakázka nenalezena.");
      await lockJob(c, job.id);
      return run(await loadState(c, job));
    }),
  );
}

const TRANSITIONS: Record<Status, Status[]> = {
  planned: ["issued", "paid", "canceled"],
  issued: ["planned", "paid", "canceled"],
  paid: ["issued"],
  canceled: ["planned"],
};

/** `finance.payment.transition`: Plánovaná → Vystavená → Zaplacená, Zrušená, i zpět o stupeň. */
export function transitionPayment(
  ctx: Ctx,
  deps: FinDeps,
  input: {
    id: string;
    to: Status;
    invoiceNumber?: string | null | undefined;
    invoiceUrl?: string | null | undefined;
    issuedOn?: string | null | undefined;
    dueOn?: string | null | undefined;
    paidOn?: string | null | undefined;
    confirmRecalc: boolean;
  },
): Promise<PaymentMutation> {
  return guarded(() =>
    inTx(ctx, async (c) => {
      const first = await loadPayment(c, input.id);
      let st: JobState | null = null;
      if (first.jobId) {
        const job = await loadJob(c, first.jobId);
        if (!job) throw new NotFoundError("Zakázka nenalezena.");
        await lockJob(c, job.id);
        st = await loadState(c, job);
      }
      const prev = st?.payments.find((p) => p.id === input.id) ?? first;
      if (prev.status === input.to) throw new UserError("Platba už v tomto stavu je.");
      if (!TRANSITIONS[prev.status].includes(input.to))
        throw new UserError("Tento přechod stavu platby není povolený.");
      const t = today();
      const next: PayRec = { ...prev, status: input.to };
      if (input.to === "issued" || input.to === "paid") {
        next.invoiceNumber = input.invoiceNumber?.trim() || prev.invoiceNumber;
        next.invoiceUrl = input.invoiceUrl?.trim() || prev.invoiceUrl;
        next.issuedOn = input.issuedOn ?? prev.issuedOn ?? t;
        if (input.dueOn !== undefined) next.dueOn = input.dueOn;
      }
      if (input.to === "paid") next.paidOn = input.paidOn ?? t;
      else next.paidOn = null;
      if (input.to === "planned") {
        next.invoiceNumber = null;
        next.invoiceUrl = null;
      }
      return saveChange(c, deps, st, prev, next, {
        confirm: input.confirmRecalc,
        summary: `Stav platby změněn na „${{ planned: "Plánovaná", issued: "Vystavená", paid: "Zaplacená", canceled: "Zrušená" }[input.to]}“`,
      });
    }),
  );
}

/** `finance.payment.overrideAllocation`: ruční přepis rozdělení jedné platby, nebo návrat k pravidlům (`null`). */
export function overrideAllocation(
  ctx: Ctx,
  deps: FinDeps,
  input: { id: string; allocations: Allocation[] | null; confirmRecalc: boolean },
): Promise<PaymentMutation> {
  return guarded(() =>
    inTx(ctx, async (c) => {
      const first = await loadPayment(c, input.id);
      if (!first.jobId) throw new UserError("Platba bez zakázky se nerozděluje.");
      const job = await loadJob(c, first.jobId);
      if (!job) throw new NotFoundError("Zakázka nenalezena.");
      await lockJob(c, job.id);
      const st = await loadState(c, job);
      const prev = st.payments.find((p) => p.id === input.id) ?? first;
      if (prev.status === "canceled") throw new UserError("Zrušenou platbu nejde rozdělit.");
      if (input.allocations)
        await assertUsers(
          c.db,
          input.allocations.map((a) => a.userId),
        );
      const next: PayRec = { ...prev, allocationMode: input.allocations ? "manual" : "rules" };
      return saveChange(c, deps, st, prev, next, {
        manual: input.allocations ?? undefined,
        confirm: input.confirmRecalc,
        summary: input.allocations ? "Rozdělení přepsáno ručně" : "Rozdělení vráceno k pravidlům",
      });
    }),
  );
}

/** `finance.payment.recalc`: přepočítá rozdělení všech plateb zakázky podle pravidel. */
export function recalcJob(
  ctx: Ctx,
  input: { jobId: string; confirmRecalc: boolean },
): Promise<RecalcResult> {
  return guarded(() =>
    withJob(ctx, input.jobId, async (c, st) => {
      const plan = computePlan(
        st,
        { payments: st.payments, rules: st.rules.map(toLogicRule) },
        today(),
      );
      if (plan.confirm.length && !input.confirmRecalc)
        return { status: "needs_confirmation", changes: toChanges(plan) } satisfies RecalcResult;
      const recalculated = await commitPlan(c, plan, await namesOf(c, plan));
      return { status: "ok", warnings: plan.warnings, recalculated } satisfies RecalcResult;
    }),
  );
}

/* ---------- čtení ---------- */

type ListInput = {
  period?: { from?: string | undefined; to?: string | undefined } | undefined;
  dateField: "effective" | "issued" | "paid" | "due";
  statuses?: Status[] | undefined;
  kinds?: Kind[] | undefined;
  issuerId?: string | undefined;
  jobType?: "web" | "marketing" | "systemy" | undefined;
  companyId?: string | undefined;
  jobId?: string | undefined;
  overdueOnly: boolean;
  search?: string | undefined;
  includePrivate: boolean;
  sort: "createdAt" | "description" | "amountMinor" | "status" | "dueOn" | "issuedOn" | "paidOn";
  direction: "asc" | "desc";
  limit: number;
  offset: number;
};

/** Platby viditelné aktérovi podle filtrů (bez stránkování, nejvýš 5 000). */
export async function selectPayments(
  ctx: Ctx,
  input: Omit<ListInput, "sort" | "direction" | "limit" | "offset"> &
    Partial<Pick<ListInput, "sort" | "direction">>,
): Promise<PayRec[]> {
  const dateCol =
    input.dateField === "issued"
      ? payment.issuedOn
      : input.dateField === "paid"
        ? payment.paidOn
        : input.dateField === "due"
          ? payment.dueOn
          : sql<string>`coalesce(${payment.paidOn}, ${payment.issuedOn}, ${payment.dueOn})`;
  const conds: (SQL | undefined)[] = [isNull(payment.deletedAt), paymentScope(ctx)];
  if (input.period?.from) conds.push(sql`${dateCol} >= ${input.period.from}`);
  if (input.period?.to) conds.push(sql`${dateCol} <= ${input.period.to}`);
  if (input.statuses?.length) conds.push(inArray(payment.status, input.statuses));
  if (input.kinds?.length) conds.push(inArray(payment.kind, input.kinds));
  if (input.issuerId) conds.push(eq(payment.issuerId, input.issuerId));
  if (input.companyId) conds.push(eq(payment.companyId, input.companyId));
  if (input.jobId) conds.push(eq(payment.jobId, input.jobId));
  if (input.jobType)
    conds.push(
      inArray(
        payment.jobId,
        ctx.db.select({ id: jobTable.id }).from(jobTable).where(eq(jobTable.type, input.jobType)),
      ),
    );
  if (input.overdueOnly)
    conds.push(and(eq(payment.status, "issued"), sql`${payment.dueOn} < ${today()}`));
  if (!input.includePrivate) conds.push(sql`not ${payment.isPrivate}`);
  if (input.search) {
    const q = `%${input.search.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(payment.description, q), ilike(payment.invoiceNumber, q)));
  }
  const col = {
    createdAt: payment.createdAt,
    description: payment.description,
    amountMinor: payment.amountMinor,
    status: payment.status,
    dueOn: payment.dueOn,
    issuedOn: payment.issuedOn,
    paidOn: payment.paidOn,
  }[input.sort ?? "createdAt"];
  return ctx.db
    .select()
    .from(payment)
    .where(and(...conds))
    .orderBy((input.direction ?? "desc") === "asc" ? asc(col) : desc(col), desc(payment.createdAt))
    .limit(5000);
}

/** `finance.payment.list`: seznam plateb s filtry a součty přes celou vyfiltrovanou sadu (FIN-12). */
export async function listPayments(ctx: Ctx, deps: FinDeps, input: ListInput) {
  const recs = await selectPayments(ctx, input);
  const allocs = await loadAllocations(
    ctx.db,
    recs.map((r) => r.id),
  );
  const t = today();
  const totals = summarizePayments(
    recs.map((p) => ({
      status: p.status,
      dueOn: p.dueOn,
      issuedOn: p.issuedOn,
      kind: p.kind,
      amountMinor: p.amountMinor,
      issuerId: p.issuerId ?? "",
      allocations: allocs.get(p.id) ?? [],
    })),
    t,
  );
  const page = recs.slice(input.offset, input.offset + input.limit);
  const { rows, people } = await toRows(ctx, deps, page, allocs);
  return { rows, total: recs.length, totals, people };
}

/** `finance.payment.get`: detail platby s použitými pravidly a upozorněními. */
export async function getPayment(ctx: Ctx, deps: FinDeps, id: string): Promise<PaymentDetail> {
  const rec = await loadPayment(ctx, id);
  const { rows, people } = await toRows(ctx, deps, [rec]);
  let appliedRuleIds: string[] = [];
  let warnings: ValidationIssue[] = [];
  if (rec.jobId && rec.status !== "canceled") {
    const logic = (await loadRules(ctx, rec.jobId)).map(toLogicRule);
    warnings = validateSplitRules(logic);
    appliedRuleIds = effectiveSplitRules(logic, rec.kind, ruleMonthFor(rec, today())).flatMap(
      (r) => (r.id ? [r.id] : []),
    );
  }
  return { payment: rows[0] as PaymentRow, appliedRuleIds, warnings, people };
}
