import { and, eq, isNull } from "drizzle-orm";
import type { ClientTabProvider } from "@rebar/core/contracts";
import {
  defineDashboardMetric,
  type DashboardMetricInput,
  type DashboardMetricResult,
  type PrivatePathDef,
  type WidgetProvider,
} from "@rebar/core/module-server";
import { scopeOf, type Ctx } from "@rebar/core/rbac";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { adAccount } from "../schema";
import { metricsFor } from "./queries";

/*
  Metriky nástěnek (widgety „Leady a CPL“), dlaždice přehledu a příspěvek ke kartě klienta (počet kampaní pro záložku
  „Reklama“). Výpočty jdou přes `queries.ts`, které respektují soukromé obchody; každé čtení má záznam v `privatePaths`.
*/

const PERM = ["reklama.read"] as const;
const czk = (minor: number) =>
  `${new Intl.NumberFormat("cs-CZ").format(Math.round(minor / 100))} Kč`;

function periodOf(input: Pick<DashboardMetricInput, "from" | "to" | "today">) {
  const to = input.to ?? input.today;
  return { from: input.from ?? addDaysIso(to, -29), to };
}

const scopeOfInput = (input: DashboardMetricInput) => (input.jobId ? { jobId: input.jobId } : {});

async function totals(ctx: Ctx, input: DashboardMetricInput) {
  return (await metricsFor(ctx, { scope: scopeOfInput(input), period: periodOf(input) })).totals;
}

const scalar = (value: number | null): DashboardMetricResult => ({ kind: "scalar", value });

/** Pojmenované metriky nástěnek (`reklama.*`); bez období je to posledních 30 dní. */
export const adMetrics = [
  defineDashboardMetric({
    key: "reklama.leads_cpl",
    label: "Leady z reklam po dnech",
    description:
      "Leady podle Mety a leady, které opravdu dorazily do OPSYS (obchody se zdrojem Meta), po dnech.",
    format: "number",
    shape: "series",
    permissions: PERM,
    supports: { period: true, job: true },
    compute: async (ctx, input) => {
      const { daily } = await metricsFor(ctx, {
        scope: scopeOfInput(input),
        period: periodOf(input),
      });
      return {
        kind: "series",
        categories: daily.map((d) => ({ key: d.date, label: d.date })),
        series: [
          { key: "leadsMeta", label: "Leady Meta", values: daily.map((d) => d.leadsMeta) },
          { key: "leadsOpsys", label: "Leady OPSYS", values: daily.map((d) => d.leadsOpsys) },
        ],
      };
    },
  }),
  defineDashboardMetric({
    key: "reklama.leads",
    label: "Leady z reklam",
    description: "Počet leadů podle Mety za období.",
    format: "number",
    shape: "scalar",
    permissions: PERM,
    supports: { period: true, job: true },
    compute: async (ctx, input) => scalar((await totals(ctx, input)).leadsMeta),
  }),
  defineDashboardMetric({
    key: "reklama.cpl",
    label: "Cena za lead (CPL)",
    description: "Útrata na reklamy dělená počtem leadů podle Mety.",
    format: "money",
    shape: "scalar",
    permissions: PERM,
    supports: { period: true, job: true },
    compute: async (ctx, input) => scalar((await totals(ctx, input)).cplMinor),
  }),
  defineDashboardMetric({
    key: "reklama.spend",
    label: "Útrata na reklamy",
    format: "money",
    shape: "scalar",
    permissions: PERM,
    supports: { period: true, job: true },
    compute: async (ctx, input) => scalar((await totals(ctx, input)).spendMinor),
  }),
  defineDashboardMetric({
    key: "reklama.cost_per_won",
    label: "Náklad na vyhraný obchod",
    description: "Útrata na reklamy dělená počtem vyhraných obchodů z leadů za období.",
    format: "money",
    shape: "scalar",
    permissions: PERM,
    supports: { period: true, job: true },
    compute: async (ctx, input) => scalar((await totals(ctx, input)).costPerWonMinor),
  }),
];

/** Dlaždice přehledu: útrata a leady za posledních 30 dní. */
export const adWidgets: WidgetProvider = async (ctx) => {
  if (!scopeOf(ctx, "reklama.read")) return [];
  const today = todayIso();
  const { totals: t } = await metricsFor(ctx, {
    period: { from: addDaysIso(today, -29), to: today },
  });
  if (!t.spendMinor && !t.leadsMeta) return [];
  return [
    {
      id: "reklama.leads",
      module: "reklama",
      title: "Leady z reklam (30 dní)",
      value: String(t.leadsMeta),
      hint: `útrata ${czk(t.spendMinor)}${t.cplMinor !== null ? ` · CPL ${czk(t.cplMinor)}` : ""}`,
      href: "/reklama",
      ...(t.leadsMeta > t.leadsOpsys ? { tone: "warning" as const } : {}),
      order: 40,
    },
  ];
};

/** Počet kampaní klienta pro záložku „Reklama“ na kartě klienta (účty klienta a kampaně jeho zakázek). */
export const adClientCard: ClientTabProvider = {
  tabCounts: async (ctx, companyId) => {
    if (!scopeOf(ctx, "reklama.read")) return {};
    const { campaigns } = await metricsFor(ctx, {
      scope: { companyId },
      period: { from: todayIso(), to: todayIso() },
    });
    return { reklama: campaigns.length };
  },
};

/** Ruční čtecí cesty pro canary test soukromí (D §5.4). */
export const adPrivatePaths: readonly PrivatePathDef[] = [
  {
    name: "reklama.dashboardMetrics",
    run: async (ctx, deps) => {
      const today = todayIso();
      const input: DashboardMetricInput = {
        from: addDaysIso(today, -29),
        to: today,
        jobId: null,
        userId: null,
        bucket: null,
        limit: 50,
        params: {},
        today,
      };
      return Promise.all(adMetrics.map((m) => m.compute(ctx, input, deps)));
    },
  },
  { name: "reklama.widgets", run: (ctx, deps) => adWidgets(ctx, deps) },
  {
    name: "reklama.clientCard",
    run: async (ctx) => {
      const rows = await ctx.db
        .select({ id: adAccount.companyId })
        .from(adAccount)
        .where(and(isNull(adAccount.deletedAt), eq(adAccount.ownerKind, "client")));
      return Promise.all(rows.flatMap((r) => (r.id ? [adClientCard.tabCounts?.(ctx, r.id)] : [])));
    },
  },
];
