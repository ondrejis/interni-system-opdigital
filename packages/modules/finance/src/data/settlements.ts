import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { inTx, NotFoundError, requireScope, UserError, type Ctx } from "@rebar/core/rbac";
import { payment, settlement } from "../schema";
import {
  balance,
  describeBalance,
  formatMoney,
  type BalancePayment,
  type PersonLabel,
} from "../logic";
import type {
  BalanceMonthsResult,
  BalanceView,
  People,
  PersonBalanceRow,
  SettlementListResult,
  SettlementRow,
} from "../contract";
import type { FinDeps } from "./deps";
import { loadAllocations } from "./model";
import { toRows } from "./rows";
import { balanceBasisOf } from "./settings";
import { assertUsers, guarded, isoOf, loadPeople } from "./util";

type SetRec = typeof settlement.$inferSelect;

const settlementRow = (s: SetRec): SettlementRow => ({
  id: s.id,
  fromUserId: s.fromUserId,
  toUserId: s.toUserId,
  amountMinor: s.amountMinor,
  settledOn: s.settledOn,
  method: s.method,
  reference: s.reference,
  note: s.note,
  canceledAt: isoOf(s.canceledAt),
  createdAt: isoOf(s.createdAt) ?? "",
});

/** Vyrovnání je věc obou partnerů: vyžaduje čtení financí v rozsahu „vše“. */
function requireAll(ctx: Ctx): void {
  if (requireScope(ctx, "finance.read") !== "all")
    throw new UserError("Vyrovnání smí číst jen ten, kdo vidí všechny platby.");
}

async function loadSettlements(ctx: Ctx): Promise<SetRec[]> {
  return ctx.db
    .select()
    .from(settlement)
    .where(isNull(settlement.deletedAt))
    .orderBy(desc(settlement.settledOn), desc(settlement.createdAt));
}

/**
 * Platby, které vstupují do salda: nezrušené, se zakázkou, nesoukromé a bez druhu `recurring` (FIN-18); soukromé jsou
 * vyloučené pro všechny, i pro vlastníka. Základ `paid` bere jen zaplacené, `issued` i vystavené.
 */
async function loadBalancePayments(
  ctx: Ctx,
  basis: "paid" | "issued",
): Promise<{ payments: BalancePayment[]; ids: string[] }> {
  const recs = await ctx.db
    .select()
    .from(payment)
    .where(
      and(
        isNull(payment.deletedAt),
        sql`${payment.jobId} is not null`,
        sql`not ${payment.isPrivate}`,
        sql`${payment.kind} <> 'recurring'`,
        inArray(payment.status, basis === "paid" ? ["paid"] : ["paid", "issued"]),
      ),
    );
  const allocs = await loadAllocations(
    ctx.db,
    recs.map((r) => r.id),
  );
  return {
    ids: recs.map((r) => r.id),
    payments: recs.map((p) => ({
      id: p.id,
      status: p.status,
      kind: p.kind,
      amountMinor: p.amountMinor,
      issuerId: p.issuerId ?? "",
      periodMonth: p.periodMonth,
      issuedOn: p.issuedOn,
      paidOn: p.paidOn,
      isPrivate: p.isPrivate,
      allocations: allocs.get(p.id) ?? [],
    })),
  };
}

const labelsOf = (people: People): Record<string, PersonLabel> =>
  Object.fromEntries(Object.values(people).map((p) => [p.id, { name: p.firstName }]));

/** `finance.balance`: hlavní číslo vyrovnání, dluhy dvojic, souhrn za osobu a zapsaná vyrovnání. */
export async function getBalance(
  ctx: Ctx,
  deps: FinDeps,
  input: { basis?: "paid" | "issued" | undefined },
): Promise<BalanceView> {
  requireAll(ctx);
  const basis = input.basis ?? (await balanceBasisOf(ctx.db, deps));
  const { payments } = await loadBalancePayments(ctx, basis);
  const sets = await loadSettlements(ctx);
  const result = balance(
    payments,
    sets.map((s) => ({
      id: s.id,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      amountMinor: s.amountMinor,
      settledOn: s.settledOn,
      canceledAt: isoOf(s.canceledAt),
    })),
    { basis },
  );
  const people = await loadPeople(ctx.db, [
    ...payments.flatMap((p) => [p.issuerId, ...p.allocations.map((a) => a.userId)]),
    ...sets.flatMap((s) => [s.fromUserId, s.toUserId]),
  ]);
  const totals = new Map<string, PersonBalanceRow>();
  for (const m of result.months)
    for (const uid of new Set([...Object.keys(m.invoiced), ...Object.keys(m.entitled)])) {
      const t = totals.get(uid) ?? {
        userId: uid,
        invoicedMinor: 0,
        entitledMinor: 0,
        differenceMinor: 0,
      };
      t.invoicedMinor += m.invoiced[uid] ?? 0;
      t.entitledMinor += m.entitled[uid] ?? 0;
      t.differenceMinor = t.invoicedMinor - t.entitledMinor;
      totals.set(uid, t);
    }
  return {
    basis,
    headlineText: describeBalance(result, labelsOf(people)),
    headline: result.headline,
    pairs: result.pairs,
    grossPairs: result.grossPairs,
    settlementsApplied: result.settlementsApplied,
    perPerson: [...totals.values()],
    suggestedSettlement: result.headline
      ? {
          fromUserId: result.headline.debtorId,
          toUserId: result.headline.creditorId,
          amountMinor: result.headline.amountMinor,
        }
      : null,
    settlements: sets.map(settlementRow),
    people,
  };
}

/** `finance.balance.months`: měsíční rozpis a (s `month`) konkrétní platby měsíce. */
export async function getBalanceMonths(
  ctx: Ctx,
  deps: FinDeps,
  input: { basis?: "paid" | "issued" | undefined; month?: string | undefined },
): Promise<BalanceMonthsResult> {
  requireAll(ctx);
  const basis = input.basis ?? (await balanceBasisOf(ctx.db, deps));
  const { payments } = await loadBalancePayments(ctx, basis);
  const result = balance(payments, [], { basis });
  let rows = null;
  let rowPeople: People = {};
  if (input.month) {
    const m = result.months.find((x) => x.month === input.month);
    const ids = new Set(m?.paymentIds ?? []);
    const recs = ids.size
      ? await ctx.db
          .select()
          .from(payment)
          .where(inArray(payment.id, [...ids]))
      : [];
    const out = await toRows(ctx, deps, recs);
    rows = out.rows;
    rowPeople = out.people;
  }
  const people = await loadPeople(ctx.db, [
    ...payments.flatMap((p) => [p.issuerId, ...p.allocations.map((a) => a.userId)]),
    ...Object.keys(rowPeople),
  ]);
  return { basis, months: result.months, payments: rows, people };
}

/** `finance.settlement.list`: zapsaná vyrovnání. */
export async function listSettlements(
  ctx: Ctx,
  input: { includeCanceled: boolean; limit: number },
): Promise<SettlementListResult> {
  requireAll(ctx);
  const sets = (await loadSettlements(ctx))
    .filter((s) => input.includeCanceled || !s.canceledAt)
    .slice(0, input.limit);
  return {
    rows: sets.map(settlementRow),
    people: await loadPeople(
      ctx.db,
      sets.flatMap((s) => [s.fromUserId, s.toUserId]),
    ),
  };
}

/** `finance.settlement.create`: zapíše vyrovnání (kdo, komu, kolik, kdy, jak, číslo dokladu). */
export function createSettlement(
  ctx: Ctx,
  input: {
    fromUserId: string;
    toUserId: string;
    amountMinor: number;
    settledOn: string;
    method: "invoice" | "transfer" | "offset";
    reference?: string | null | undefined;
    note?: string | null | undefined;
  },
): Promise<SettlementRow> {
  return guarded(() =>
    inTx(ctx, async (c) => {
      const people = await assertUsers(c.db, [input.fromUserId, input.toUserId]);
      const [rec] = await c.db
        .insert(settlement)
        .values({
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          amountMinor: input.amountMinor,
          settledOn: input.settledOn,
          method: input.method,
          reference: input.reference?.trim() || null,
          note: input.note?.trim() || null,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning();
      const from = people[input.fromUserId]!.firstName;
      const to = people[input.toUserId]!.firstName;
      await recordAudit(c, {
        action: "create",
        entityType: "settlement",
        entityId: rec!.id,
        summary: `Vyrovnání ${from} → ${to} ${formatMoney(rec!.amountMinor)}`,
        entityTitle: `${from} → ${to}`,
        changes: [
          { field: "Od", old: null, new: from },
          { field: "Komu", old: null, new: to },
          { field: "Částka", old: null, new: formatMoney(rec!.amountMinor) },
          { field: "Datum", old: null, new: rec!.settledOn },
          { field: "Způsob", old: null, new: rec!.method },
          { field: "Číslo dokladu", old: null, new: rec!.reference },
        ],
      });
      return settlementRow(rec!);
    }),
  );
}

/** `finance.settlement.cancel`: storno vyrovnání (záznam zůstane, přestane se počítat). */
export function cancelSettlement(
  ctx: Ctx,
  input: { id: string; reason?: string | undefined },
): Promise<SettlementRow> {
  return inTx(ctx, async (c) => {
    const [cur] = await c.db
      .select()
      .from(settlement)
      .where(and(eq(settlement.id, input.id), isNull(settlement.deletedAt)));
    if (!cur) throw new NotFoundError("Vyrovnání nenalezeno.");
    if (cur.canceledAt) throw new UserError("Vyrovnání už je stornované.");
    const now = new Date();
    const [rec] = await c.db
      .update(settlement)
      .set({
        canceledAt: now,
        note:
          [cur.note, input.reason?.trim() ? `Storno: ${input.reason.trim()}` : null]
            .filter(Boolean)
            .join("\n") || null,
        updatedBy: c.actor.userId,
      })
      .where(eq(settlement.id, cur.id))
      .returning();
    await recordAudit(c, {
      action: "update",
      entityType: "settlement",
      entityId: cur.id,
      summary: "Vyrovnání stornováno",
      entityTitle: `Vyrovnání ${formatMoney(cur.amountMinor)}`,
      changes: [{ field: "Stornováno", old: null, new: now.toISOString() }],
    });
    return settlementRow(rec!);
  });
}
