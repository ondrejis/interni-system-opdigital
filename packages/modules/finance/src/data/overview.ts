import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { can, NotFoundError, type Ctx } from "@rebar/core/rbac";
import { job as jobTable } from "@rebar/zakazky/schema";
import { retainer } from "../schema";
import { summarizePayments, validateSplitRules } from "../logic";
import type { ClientFinanceOverview, JobFinanceOverview } from "../contract";
import type { FinDeps } from "./deps";
import { loadJob } from "./jobs";
import { canSeePrivate, isPrivateRecord, privateScope } from "./private";
import { toLogicRule, toRuleView } from "./model";
import { loadRules } from "./rules";
import { retainerView, loadActiveRetainer } from "./retainer";
import { toRows } from "./rows";
import { selectPayments } from "./payments";
import { loadPeople, thisMonth, today } from "./util";
import { addMonthsIso } from "@rebar/core/time";

const totalsOf = (rows: Awaited<ReturnType<typeof toRows>>["rows"], t: string) =>
  summarizePayments(
    rows.map((r) => ({
      status: r.status,
      dueOn: r.dueOn,
      issuedOn: r.issuedOn,
      kind: r.kind,
      amountMinor: r.amountMinor,
      issuerId: r.issuerId ?? "",
      allocations: r.allocations,
    })),
    t,
  );

/** `finance.job.overview`: záložka Finance v detailu zakázky. */
export async function jobOverview(
  ctx: Ctx,
  deps: FinDeps,
  jobId: string,
): Promise<JobFinanceOverview> {
  const job = await loadJob(ctx, jobId);
  if (!job) throw new NotFoundError("Zakázka nenalezena.");
  const recs = await selectPayments(ctx, {
    dateField: "effective",
    overdueOnly: false,
    includePrivate: true,
    jobId,
    sort: "createdAt",
    direction: "asc",
  });
  const { rows, people } = await toRows(ctx, deps, recs);
  const rules = await loadRules(ctx, jobId);
  const ret = await loadActiveRetainer(ctx, jobId);
  const peopleAll = {
    ...people,
    ...(await loadPeople(ctx.db, [
      ...rules.map((r) => r.userId),
      ret?.issuerId,
      ret?.firstIssuerId,
    ])),
  };
  return {
    job: {
      id: job.id,
      number: job.number,
      title: job.title,
      type: job.type,
      companyId: job.companyId,
      status: job.status,
      billingModel: job.billingModel,
      marketingStage: job.marketingStage,
      isPrivate: job.isPrivate,
    },
    rules: rules.map(toRuleView),
    ruleIssues: validateSplitRules(rules.map(toLogicRule)),
    payments: rows,
    totals: totalsOf(rows, today()),
    retainer: ret ? retainerView(ret) : null,
    decisionPending: job.type === "marketing" && job.marketingStage === "decision" && !ret,
    canWrite: can(ctx, "finance.payments_write"),
    canEditSplit: can(ctx, "finance.splits_edit"),
    people: peopleAll,
  };
}

/** Aktivní měsíční retainery firmy (jen viditelné zakázky). */
export async function activeRetainersOf(ctx: Ctx, companyIds: readonly string[]) {
  if (!companyIds.length) return [];
  return ctx.db
    .select({
      r: retainer,
      jobNumber: jobTable.number,
      jobTitle: jobTable.title,
      companyId: jobTable.companyId,
    })
    .from(retainer)
    .innerJoin(jobTable, eq(jobTable.id, retainer.jobId))
    .where(
      and(
        inArray(jobTable.companyId, [...companyIds]),
        eq(retainer.active, true),
        isNull(retainer.deletedAt),
        isNull(jobTable.deletedAt),
        sql`(${retainer.toMonth} is null or ${retainer.toMonth} >= ${thisMonth()})`,
        sql`${jobTable.status} not in ('done','cancelled')`,
        privateScope(ctx, jobTable),
      ),
    );
}

/** `finance.client.overview`: záložka Finance na kartě klienta. */
export async function clientOverview(
  ctx: Ctx,
  deps: FinDeps,
  input: { companyId: string; year?: number | undefined },
): Promise<ClientFinanceOverview> {
  // soukromá firma se aktérovi bez `private.read` tváří jako neexistující (firma zámek na zakázky nekaskáduje)
  if (!canSeePrivate(ctx) && (await isPrivateRecord(ctx.db, "company", input.companyId)))
    throw new NotFoundError("Klient nenalezen.");
  const t = today();
  const year = input.year ?? Number(t.slice(0, 4));
  const recs = await selectPayments(ctx, {
    dateField: "effective",
    overdueOnly: false,
    includePrivate: true,
    companyId: input.companyId,
    sort: "createdAt",
    direction: "desc",
  });
  const { rows, people } = await toRows(ctx, deps, recs);
  const paid = rows.filter((r) => r.status === "paid");
  const sum = (xs: typeof paid) => xs.reduce((s, r) => s + r.amountMinor, 0);
  const from12 = addMonthsIso(t, -12);
  const unpaid = rows.filter((r) => r.status === "issued");
  const retainers = await activeRetainersOf(ctx, [input.companyId]);
  return {
    companyId: input.companyId,
    year,
    paidYearMinor: sum(paid.filter((r) => (r.paidOn ?? "").startsWith(String(year)))),
    paid12mMinor: sum(paid.filter((r) => (r.paidOn ?? "") >= from12)),
    paidTotalMinor: sum(paid),
    unpaidCount: unpaid.length,
    unpaidMinor: sum(unpaid),
    retainers: retainers.map((x) => ({
      ...retainerView(x.r),
      jobNumber: x.jobNumber,
      jobTitle: x.jobTitle,
    })),
    payments: rows,
    totals: totalsOf(rows, t),
    people,
  };
}
