import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { visibleRecordTitles } from "@rebar/core/entities";
import { requireScope, UserError, type Ctx } from "@rebar/core/rbac";
import { job as jobTable } from "@rebar/zakazky/schema";
import { payment } from "../schema";
import type {
  IncomeByPersonRow,
  IncomeByTypeRow,
  ReportsResult,
  RetainerIncomeRow,
  TopClientRow,
} from "../contract";
import type { FinDeps } from "./deps";
import { loadAllocations, paymentScope, type PayRec } from "./model";
import { privateScope } from "./private";
import { loadPeople, today, uniq } from "./util";

type Basis = "paid" | "issued";

/** Měsíc, do kterého platba patří v přehledech: základ `paid` datum úhrady, `issued` datum vystavení (jinak druhé, jinak období). */
export function incomeMonth(
  p: Pick<PayRec, "paidOn" | "issuedOn" | "periodMonth">,
  basis: Basis,
): string | null {
  const d = basis === "paid" ? (p.paidOn ?? p.issuedOn) : (p.issuedOn ?? p.paidOn);
  return d ? d.slice(0, 7) : (p.periodMonth ?? null);
}

/** Platby vstupující do příjmů (zaplacené, na základě `issued` i vystavené), viditelné aktérovi, volitelně bez soukromých. */
export async function incomePayments(
  ctx: Ctx,
  basis: Basis,
  includePrivate: boolean,
  extra?: ReturnType<typeof eq>,
): Promise<PayRec[]> {
  const statuses = basis === "paid" ? (["paid"] as const) : (["paid", "issued"] as const);
  return ctx.db
    .select()
    .from(payment)
    .where(
      and(
        isNull(payment.deletedAt),
        inArray(payment.status, [...statuses]),
        paymentScope(ctx),
        includePrivate ? undefined : sql`not ${payment.isPrivate}`,
        extra,
      ),
    );
}

/** `finance.reports`: příjmy podle osoby po měsících, podle typu zakázky, top 10 klientů a měsíční příjem z retainerů (FIN-19). */
export async function reports(
  ctx: Ctx,
  deps: FinDeps,
  input: { year?: number | undefined; includePrivate: boolean; basis: Basis },
): Promise<ReportsResult> {
  if (requireScope(ctx, "finance.read") !== "all")
    throw new UserError("Přehledy smí číst jen ten, kdo vidí všechny platby.");
  const year = input.year ?? Number(today().slice(0, 4));
  const ys = String(year);
  const all = await incomePayments(ctx, input.basis, input.includePrivate);
  const inYear = all.filter((p) => incomeMonth(p, input.basis)?.startsWith(ys));
  const allocs = await loadAllocations(
    ctx.db,
    inYear.map((p) => p.id),
  );

  const byPerson = new Map<string, number[]>();
  const totalsByMonth = Array<number>(12).fill(0);
  for (const p of inYear) {
    const mi = Number(incomeMonth(p, input.basis)!.slice(5, 7)) - 1;
    for (const a of allocs.get(p.id) ?? []) {
      const row = byPerson.get(a.userId) ?? Array<number>(12).fill(0);
      row[mi]! += a.amountMinor;
      byPerson.set(a.userId, row);
      totalsByMonth[mi]! += a.amountMinor;
    }
  }
  const incomeRows: IncomeByPersonRow[] = [...byPerson].map(([userId, monthly]) => ({
    userId,
    monthly,
    totalMinor: monthly.reduce((s, x) => s + x, 0),
  }));

  const jobs = new Map(
    (inYear.length
      ? await ctx.db
          .select({ id: jobTable.id, type: jobTable.type })
          .from(jobTable)
          .where(
            and(
              inArray(jobTable.id, uniq(inYear.map((p) => p.jobId))),
              privateScope(ctx, jobTable),
            ),
          )
      : []
    ).map((j) => [j.id, j.type]),
  );
  const byType = new Map<string, IncomeByTypeRow>();
  for (const p of inYear) {
    const type = (p.jobId ? jobs.get(p.jobId) : undefined) ?? "recurring";
    const row = byType.get(type) ?? {
      type: type as IncomeByTypeRow["type"],
      amountMinor: 0,
      count: 0,
      byPerson: {},
    };
    row.amountMinor += p.amountMinor;
    row.count++;
    for (const a of allocs.get(p.id) ?? [])
      row.byPerson[a.userId] = (row.byPerson[a.userId] ?? 0) + a.amountMinor;
    byType.set(type, row);
  }

  const byClient = new Map<string, TopClientRow>();
  for (const p of inYear) {
    if (!p.companyId) continue;
    const row = byClient.get(p.companyId) ?? {
      companyId: p.companyId,
      companyName: null,
      amountMinor: 0,
      count: 0,
    };
    row.amountMinor += p.amountMinor;
    row.count++;
    byClient.set(p.companyId, row);
  }
  const top = [...byClient.values()].sort((a, b) => b.amountMinor - a.amountMinor).slice(0, 10);
  const titles = await visibleRecordTitles(
    ctx,
    deps.registry,
    "company",
    top.map((t) => t.companyId),
  );
  for (const t of top) t.companyName = titles[t.companyId] ?? null;

  // měsíční příjem z retainerů: podle měsíce, za který platba je (zaplaceno vs. zbývá vystavit či zaplatit)
  const retainers = await ctx.db
    .select()
    .from(payment)
    .where(
      and(
        isNull(payment.deletedAt),
        eq(payment.kind, "retainer"),
        inArray(payment.status, ["planned", "issued", "paid"]),
        paymentScope(ctx),
        input.includePrivate ? undefined : sql`not ${payment.isPrivate}`,
        sql`${payment.periodMonth} like ${`${ys}-%`}`,
      ),
    );
  const retainerIncome: RetainerIncomeRow[] = Array.from({ length: 12 }, (_, i) => ({
    month: `${ys}-${String(i + 1).padStart(2, "0")}`,
    paidMinor: 0,
    openMinor: 0,
    count: 0,
  }));
  for (const p of retainers) {
    const row = retainerIncome[Number(p.periodMonth!.slice(5, 7)) - 1]!;
    if (p.status === "paid") row.paidMinor += p.amountMinor;
    else row.openMinor += p.amountMinor;
    row.count++;
  }

  return {
    year,
    basis: input.basis,
    includePrivate: input.includePrivate,
    incomeByPerson: {
      rows: incomeRows,
      totalsByMonth,
      totalMinor: totalsByMonth.reduce((s, x) => s + x, 0),
    },
    incomeByType: [...byType.values()].sort((a, b) => b.amountMinor - a.amountMinor),
    topClients: top,
    retainerIncome,
    people: await loadPeople(ctx.db, [
      ...incomeRows.map((r) => r.userId),
      ...[...byType.values()].flatMap((r) => Object.keys(r.byPerson)),
    ]),
  };
}
