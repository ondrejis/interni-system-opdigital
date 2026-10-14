import { and, desc, eq, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import {
  bucketTruncSql,
  clampLimit,
  defaultForwardRange,
  entityHref,
  numberChoiceParam,
  scopedEntity,
  type Bucket,
} from "@rebar/core/dashboards";
import { defineDashboardMetric, type DashboardMetricInput } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";
import type { ModuleDeps } from "@rebar/core/module-server";
import { addDaysIso } from "@rebar/core/time";
import { company } from "@rebar/kontakty/schema";
import { alignToBuckets } from "./metrics-calc";
import { invoice, payment, receivedInvoice } from "./schema";

const READ = "fakturace.read";
/** Vystavené a neuhrazené (nebo částečně uhrazené) doklady, které se platí: bez konceptů, uhrazených a dobropisů. */
const OPEN_STATES = ["issued", "partial"];
const remaining = sql`greatest(0, ${invoice.grossMinor} - ${invoice.paidMinor})`;
const f = (v: unknown) => Number(v ?? 0);

/** Neuhrazené faktury s uplynulou splatností (podle dnešního data, ne podle příznaku, který nastavuje noční úloha). */
async function overdueWhere(ctx: Ctx, deps: ModuleDeps, input: DashboardMetricInput) {
  const scope = await scopedEntity(ctx, deps, "invoice");
  return {
    scope,
    where: and(
      scope.where,
      inArray(invoice.state, OPEN_STATES),
      ne(invoice.kind, "credit_note"),
      lt(invoice.dueDate, input.today),
      sql`${invoice.grossMinor} > ${invoice.paidMinor}`,
      input.jobId ? eq(invoice.jobId, input.jobId) : undefined,
    )!,
  };
}

/** Řada „kolik zbývá uhradit“ po koších splatnosti. */
async function cashflow(ctx: Ctx, deps: ModuleDeps, input: DashboardMetricInput) {
  const bucket: Bucket = input.bucket ?? "month";
  const range =
    input.from && input.to
      ? { from: input.from, to: input.to }
      : defaultForwardRange(input.today, bucket);
  const inv = await scopedEntity(ctx, deps, "invoice");
  const rcv = await scopedEntity(ctx, deps, "received_invoice");
  const jobOf = (col: typeof invoice.jobId | typeof receivedInvoice.jobId) =>
    input.jobId ? eq(col, input.jobId) : undefined;

  const dueKey = bucketTruncSql(invoice.dueDate, bucket);
  const planIn = await ctx.db
    .select({
      k: sql<string>`${dueKey}`,
      v: sql<number>`coalesce(sum(${invoice.grossMinor}), 0)::float8`,
    })
    .from(invoice)
    .where(
      and(
        inv.where,
        inArray(invoice.state, ["issued", "partial", "paid"]),
        ne(invoice.kind, "credit_note"),
        gte(invoice.dueDate, range.from),
        lte(invoice.dueDate, range.to),
        jobOf(invoice.jobId),
      ),
    )
    .groupBy(dueKey);

  const payKey = bucketTruncSql(payment.date, bucket);
  const actualIn = await ctx.db
    .select({
      k: sql<string>`${payKey}`,
      v: sql<number>`coalesce(sum(${payment.amountMinor}), 0)::float8`,
    })
    .from(payment)
    .innerJoin(invoice, eq(invoice.id, payment.invoiceId))
    .where(
      and(
        inv.where,
        sql`${payment.deletedAt} is null`,
        ne(invoice.kind, "credit_note"),
        gte(payment.date, range.from),
        lte(payment.date, range.to),
        jobOf(invoice.jobId),
      ),
    )
    .groupBy(payKey);

  const rcvKey = bucketTruncSql(receivedInvoice.dueDate, bucket);
  const planOut = await ctx.db
    .select({
      k: sql<string>`${rcvKey}`,
      v: sql<number>`coalesce(sum(${receivedInvoice.grossMinor}), 0)::float8`,
    })
    .from(receivedInvoice)
    .where(
      and(
        rcv.where,
        inArray(receivedInvoice.state, ["approved", "paid"]),
        gte(receivedInvoice.dueDate, range.from),
        lte(receivedInvoice.dueDate, range.to),
        jobOf(receivedInvoice.jobId),
      ),
    )
    .groupBy(rcvKey);

  const rows = (r: { k: string; v: number }[]) => r.map((x) => ({ key: x.k, value: f(x.v) }));
  const a = alignToBuckets(range, bucket, rows(planIn), rows(actualIn), rows(planOut));
  return {
    kind: "series" as const,
    categories: a.categories,
    series: [
      { key: "plan_in", label: "Plán příjmů", values: a.values[0]! },
      { key: "actual_in", label: "Skutečné příjmy", values: a.values[1]! },
      { key: "plan_out", label: "Plán výdajů", values: a.values[2]! },
    ],
  };
}

const DAYS = [7, 14, 30] as const;

/** Pojmenované metriky nástěnek modulu Fakturace (částky v haléřích). Čtou jen faktury v rozsahu aktéra. */
export const dashboardMetrics = [
  defineDashboardMetric({
    key: "fakturace.overdue",
    label: "Pohledávky po splatnosti",
    description:
      "Neuhrazený zůstatek vydaných faktur (s DPH), kterým uplynula splatnost. Dobropisy a koncepty se nepočítají.",
    format: "money",
    shape: "scalar",
    permissions: [READ],
    supports: { job: true },
    compute: async (ctx, input, deps) => {
      const { where } = await overdueWhere(ctx, deps, input);
      const [r] = await ctx.db
        .select({ v: sql<number>`coalesce(sum(${remaining}), 0)::float8` })
        .from(invoice)
        .where(where);
      return { kind: "scalar", value: f(r?.v) };
    },
  }),
  defineDashboardMetric({
    key: "fakturace.overdue_by_customer",
    label: "Pohledávky po splatnosti podle zákazníků",
    description:
      "Zákazníci s největším neuhrazeným zůstatkem po splatnosti (s DPH). Odkaz vede na zákazníka, pokud smíte číst všechny kontakty.",
    format: "money",
    shape: "series",
    permissions: [READ],
    supports: { job: true },
    compute: async (ctx, input, deps) => {
      const { where } = await overdueWhere(ctx, deps, input);
      const total = sql<number>`coalesce(sum(${remaining}), 0)::float8`;
      const rows = await ctx.db
        .select({ id: invoice.companyId, name: company.name, v: total })
        .from(invoice)
        .innerJoin(company, eq(company.id, invoice.companyId))
        .where(where)
        .groupBy(invoice.companyId, company.name)
        .orderBy(desc(total), company.name)
        .limit(clampLimit(input.limit));
      return {
        kind: "series",
        categories: rows.map((r) => {
          const href = entityHref(ctx, deps, "company", r.id);
          return { key: r.id, label: r.name, ...(href ? { href } : {}) };
        }),
        series: [{ key: "overdue", label: "Po splatnosti", values: rows.map((r) => f(r.v)) }],
      };
    },
  }),
  defineDashboardMetric({
    key: "fakturace.cashflow_plan",
    label: "Plán peněžních toků",
    description:
      "Po měsících nebo týdnech: plán příjmů (vydané faktury podle splatnosti), skutečné příjmy (úhrady podle data úhrady) a plán výdajů (schválené přijaté faktury podle splatnosti), vše s DPH. Bez zvoleného období se ukáže následujících 6 měsíců.",
    format: "money",
    shape: "series",
    permissions: [READ],
    supports: { period: true, job: true, bucket: true },
    compute: (ctx, input, deps) => cashflow(ctx, deps, input),
  }),
  defineDashboardMetric({
    key: "fakturace.due_soon",
    label: "Pohledávky se splatností v příštích dnech",
    description:
      "Neuhrazený zůstatek vydaných faktur (s DPH), které budou splatné od dneška do zvoleného počtu dní.",
    format: "money",
    shape: "scalar",
    permissions: [READ],
    supports: { job: true },
    params: [
      {
        key: "days",
        label: "Počet dní",
        type: "select",
        choices: DAYS.map((d) => ({ value: String(d), label: `${d} dní` })),
        default: "7",
      },
    ],
    compute: async (ctx, input, deps) => {
      const days = numberChoiceParam(input.params, "days", DAYS, 7);
      const scope = await scopedEntity(ctx, deps, "invoice");
      const [r] = await ctx.db
        .select({ v: sql<number>`coalesce(sum(${remaining}), 0)::float8` })
        .from(invoice)
        .where(
          and(
            scope.where,
            inArray(invoice.state, OPEN_STATES),
            ne(invoice.kind, "credit_note"),
            gte(invoice.dueDate, input.today),
            lte(invoice.dueDate, addDaysIso(input.today, days)),
            input.jobId ? eq(invoice.jobId, input.jobId) : undefined,
          ),
        );
      return { kind: "scalar", value: f(r?.v) };
    },
  }),
  defineDashboardMetric({
    key: "fakturace.received_open",
    label: "Přijaté faktury k úhradě",
    description:
      "Součet zbývající částky (s DPH) schválených přijatých faktur, které ještě nejsou uhrazené. Podklad pro účetní.",
    format: "money",
    shape: "scalar",
    permissions: [READ],
    supports: { job: true },
    compute: async (ctx, input, deps) => {
      const r = await receivedOpen(ctx, deps, input);
      return { kind: "scalar", value: r.sum };
    },
  }),
  defineDashboardMetric({
    key: "fakturace.received_open_count",
    label: "Přijaté faktury k úhradě (počet)",
    description: "Počet schválených přijatých faktur, které ještě nejsou uhrazené.",
    format: "number",
    shape: "scalar",
    permissions: [READ],
    supports: { job: true },
    compute: async (ctx, input, deps) => {
      const r = await receivedOpen(ctx, deps, input);
      return { kind: "scalar", value: r.count };
    },
  }),
  defineDashboardMetric({
    key: "fakturace.issued",
    label: "Vystaveno v období",
    description:
      "Součet základů (bez DPH) vydaných dokladů s datem vystavení v období; dobropisy jsou záporné. Koncepty se nepočítají.",
    format: "money",
    shape: "scalar",
    permissions: [READ],
    supports: { period: true, job: true },
    compute: async (ctx, input, deps) => {
      const scope = await scopedEntity(ctx, deps, "invoice");
      const [r] = await ctx.db
        .select({ v: sql<number>`coalesce(sum(${invoice.netMinor}), 0)::float8` })
        .from(invoice)
        .where(
          and(
            scope.where,
            ne(invoice.state, "draft"),
            input.from ? gte(invoice.issueDate, input.from) : undefined,
            input.to ? lte(invoice.issueDate, input.to) : undefined,
            input.jobId ? eq(invoice.jobId, input.jobId) : undefined,
          ),
        );
      return { kind: "scalar", value: f(r?.v) };
    },
  }),
];

/** Schválené neuhrazené přijaté faktury: zbývající částka a počet. */
async function receivedOpen(ctx: Ctx, deps: ModuleDeps, input: DashboardMetricInput) {
  const scope = await scopedEntity(ctx, deps, "received_invoice");
  const [r] = await ctx.db
    .select({
      sum: sql<number>`coalesce(sum(greatest(0, ${receivedInvoice.grossMinor} - ${receivedInvoice.paidMinor})), 0)::float8`,
      count: sql<number>`count(*)::int`,
    })
    .from(receivedInvoice)
    .where(
      and(
        scope.where,
        eq(receivedInvoice.state, "approved"),
        input.jobId ? eq(receivedInvoice.jobId, input.jobId) : undefined,
      ),
    );
  return { sum: f(r?.sum), count: f(r?.count) };
}
