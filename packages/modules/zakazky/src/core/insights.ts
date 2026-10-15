import { asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { ClientTabProvider, EmailVarsProvider } from "@rebar/core/contracts";
import { countActive, type DeleteBlocker } from "@rebar/core/entities";
import {
  defineDashboardMetric,
  type AttentionItem,
  type AttentionProvider,
  type CalendarLayerProvider,
  type DashboardMetricDef,
  type ModuleDeps,
  type PrivatePathDef,
  type WidgetProvider,
} from "@rebar/core/module-server";
import { can, NotFoundError, type Ctx } from "@rebar/core/rbac";
import { visibleJobs } from "../access";
import { job } from "../schema";
import { JOB_STATUSES, JOB_STATUS_LABELS, JOB_STATUS_COLORS, todayPrague } from "../shared";
import { boardImpl } from "./detail";
import { getJobBriefsImpl } from "./briefs";
import { loadJob } from "./lookups";

const OPEN = sql`${job.status} in ('planned', 'active', 'paused')`;

/** Zakázka ve skluzu a důvod: termín prošel (`due`), nebo má úkoly po termínu (`tasks`). */
export type SlippingJob = {
  id: string;
  number: string;
  title: string;
  dueDate: string | null;
  reason: "due" | "tasks";
};

/**
 * Zakázky ve skluzu, které aktér smí vidět: živé zakázky po termínu a živé zakázky s úkoly po termínu (služba
 * `tasks`). Čte přes `visibleJobs`, takže soukromé a cizí (rozsah „jen moje“) se nepočítají.
 */
export async function slippingJobs(
  ctx: Ctx,
  deps: ModuleDeps,
  today = todayPrague(),
): Promise<SlippingJob[]> {
  const byDue = await ctx.db
    .select({ id: job.id, number: job.number, title: job.title, dueDate: job.dueDate })
    .from(job)
    .where(visibleJobs(ctx, OPEN, sql`${job.dueDate} < ${today}`))
    .orderBy(asc(job.dueDate));
  const out: SlippingJob[] = byDue.map((r) => ({ ...r, reason: "due" as const }));
  const tasks = deps.services.optional("tasks");
  const ids = tasks ? await tasks.overdueJobIds(ctx) : [];
  const known = new Set(out.map((r) => r.id));
  const rest = ids.filter((id) => !known.has(id));
  if (rest.length) {
    const more = await ctx.db
      .select({ id: job.id, number: job.number, title: job.title, dueDate: job.dueDate })
      .from(job)
      .where(visibleJobs(ctx, OPEN, inArray(job.id, rest)));
    out.push(...more.map((r) => ({ ...r, reason: "tasks" as const })));
  }
  return out;
}

/** Počty zakázek podle stavu (jen viditelné). */
async function countsByStatus(ctx: Ctx): Promise<Record<string, number>> {
  const rows = await ctx.db
    .select({ status: job.status, n: sql<number>`count(*)::int` })
    .from(job)
    .where(visibleJobs(ctx))
    .groupBy(job.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/** Metriky pro nástěnky: zakázky ve skluzu (číslo) a zakázky podle stavu (graf). */
export const dashboardMetrics: readonly DashboardMetricDef[] = [
  defineDashboardMetric({
    key: "zakazky.slipping",
    label: "Zakázky ve skluzu",
    description: "Živé zakázky po termínu nebo s úkoly po termínu.",
    format: "number",
    shape: "scalar",
    permissions: ["zakazky.read"],
    compute: async (ctx, input, deps) => ({
      kind: "scalar",
      value: (await slippingJobs(ctx, deps, input.today)).length,
    }),
  }),
  defineDashboardMetric({
    key: "zakazky.by_status",
    label: "Zakázky podle stavu",
    description: "Počet zakázek v každém stavu.",
    format: "number",
    shape: "series",
    permissions: ["zakazky.read"],
    compute: async (ctx) => {
      const counts = await countsByStatus(ctx);
      return {
        kind: "series",
        categories: JOB_STATUSES.map((s) => ({
          key: s,
          label: JOB_STATUS_LABELS[s],
          color: JOB_STATUS_COLORS[s],
        })),
        series: [
          {
            key: "count",
            label: "Zakázky",
            values: JOB_STATUSES.map((s) => counts[s] ?? 0),
          },
        ],
      };
    },
  }),
];

/** Dlaždice přehledu: zakázky ve skluzu a aktivní zakázky. */
export const widgets: readonly WidgetProvider[] = [
  async (ctx, deps) => {
    if (!can(ctx, "zakazky.read")) return [];
    const [slipping, counts] = await Promise.all([slippingJobs(ctx, deps), countsByStatus(ctx)]);
    return [
      {
        id: "zakazky.active",
        module: "zakazky",
        title: "Aktivní zakázky",
        value: String(counts.active ?? 0),
        href: "/zakazky",
        order: 20,
      },
      {
        id: "zakazky.slipping",
        module: "zakazky",
        title: "Zakázky ve skluzu",
        value: String(slipping.length),
        hint: slipping.length ? "po termínu nebo s úkoly po termínu" : undefined,
        href: "/zakazky",
        tone: slipping.length ? "danger" : "default",
        order: 21,
      },
    ];
  },
];

/** „Vyžaduje pozornost“: zakázky ve skluzu (nejvýš deset, od nejstarších termínů). */
export const attention: readonly AttentionProvider[] = [
  async (ctx, deps): Promise<AttentionItem[]> => {
    const rows = await slippingJobs(ctx, deps);
    return rows.slice(0, 10).map((r) => ({
      id: `zakazky.slipping.${r.id}`,
      module: "zakazky",
      severity: "warning",
      title: `${r.number} ${r.title}`,
      detail: r.reason === "due" ? `Termín ${r.dueDate} už prošel.` : "Má úkoly po termínu.",
      href: `/zakazky/${r.id}`,
    }));
  },
];

/** Kalendářní vrstva „Termíny zakázek“: termíny živých zakázek v rozsahu. */
export const calendarLayers: readonly CalendarLayerProvider[] = [
  {
    key: "zakazky.deadlines",
    label: "Termíny zakázek",
    color: "orange",
    items: async (ctx, range) => {
      const rows = await ctx.db
        .select({ id: job.id, number: job.number, title: job.title, dueDate: job.dueDate })
        .from(job)
        .where(
          visibleJobs(
            ctx,
            OPEN,
            gte(job.dueDate, range.from.slice(0, 10)),
            lte(job.dueDate, range.to.slice(0, 10)),
          ),
        )
        .orderBy(asc(job.dueDate));
      return rows.map((r) => ({
        id: `zakazky.deadline.${r.id}`,
        layer: "zakazky.deadlines",
        title: `Termín: ${r.number} ${r.title}`,
        start: r.dueDate!,
        allDay: true,
        color: "orange",
        href: `/zakazky/${r.id}`,
      }));
    },
  },
];

/** Příspěvek ke kartě klienta: počet zakázek v záložce, souhrn na Přehledu a sloupec „Aktivní zakázky“. */
export const clientCard: ClientTabProvider = {
  async tabCounts(ctx, companyId) {
    const [r] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(job)
      .where(visibleJobs(ctx, eq(job.companyId, companyId)));
    return { zakazky: r?.n ?? 0 };
  },
  async summary(ctx, companyId) {
    const [r] = await ctx.db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${job.status} = 'active')::int`,
      })
      .from(job)
      .where(visibleJobs(ctx, eq(job.companyId, companyId)));
    return { jobs: { active: r?.active ?? 0, total: r?.total ?? 0 } };
  },
  async listMetrics(ctx, companyIds) {
    if (!companyIds.length) return {};
    const rows = await ctx.db
      .select({
        companyId: job.companyId,
        active: sql<number>`count(*) filter (where ${job.status} = 'active')::int`,
      })
      .from(job)
      .where(visibleJobs(ctx, inArray(job.companyId, [...companyIds])))
      .groupBy(job.companyId);
    const out: Record<string, { activeJobs: number }> = {};
    for (const id of companyIds) out[id] = { activeJobs: 0 };
    for (const r of rows) out[r.companyId] = { activeJobs: r.active };
    return out;
  },
};

/** Proměnné šablon e-mailů pro zakázku: `{zakazka}` (číslo a název) a `{cislo_zakazky}`. */
export const emailVars: EmailVarsProvider = {
  entityType: "job",
  vars: [
    { key: "zakazka", label: "Zakázka (číslo a název)" },
    { key: "cislo_zakazky", label: "Číslo zakázky" },
  ],
  async resolve(ctx, id): Promise<Record<string, string>> {
    try {
      const j = await loadJob(ctx, id);
      return { zakazka: `${j.number} ${j.title}`, cislo_zakazky: j.number };
    } catch (e) {
      if (e instanceof NotFoundError) return {};
      throw e;
    }
  },
};

/** Co brání smazání firmy: nesmazané zakázky klienta. */
export const deleteBlockers: DeleteBlocker[] = [
  {
    id: "zakazky.company-jobs",
    entity: "company",
    noun: ["zakázku", "zakázky", "zakázek"],
    count: (ctx, id) => countActive(ctx, job, eq(job.companyId, id)),
  },
];

/** Ruční čtecí cesty pro test soukromí (D §5.4): každá vrací, co by aktér viděl. */
export const privatePaths: readonly PrivatePathDef[] = [
  {
    name: "zakazky.metric.slipping",
    run: async (ctx, deps) => slippingJobs(ctx, deps),
  },
  {
    name: "zakazky.metric.by_status",
    run: async (ctx) => countsByStatus(ctx),
  },
  {
    name: "zakazky.widgets",
    run: async (ctx, deps) => Promise.all(widgets.map((w) => w(ctx, deps))),
  },
  {
    name: "zakazky.attention",
    run: async (ctx, deps) => Promise.all(attention.map((a) => a(ctx, deps))),
  },
  {
    name: "zakazky.calendar.deadlines",
    run: async (ctx, deps) =>
      calendarLayers[0]!.items(ctx, { from: "2000-01-01", to: "2100-01-01" }, deps),
  },
  {
    name: "zakazky.board",
    run: async (ctx, deps) => boardImpl(ctx, deps, { by: "status", includeClosed: true }),
  },
  {
    name: "zakazky.clientCard",
    run: async (ctx) => {
      const ids = (
        await ctx.db
          .selectDistinct({ id: job.companyId })
          .from(job)
          .where(sql`true`)
          .limit(200)
      ).map((r) => r.id);
      const out: unknown[] = [];
      for (const id of ids) {
        out.push(await clientCard.tabCounts!(ctx, id), await clientCard.summary!(ctx, id));
      }
      out.push(await clientCard.listMetrics!(ctx, ids));
      return out;
    },
  },
  {
    name: "zakazky.emailVars",
    run: async (ctx) => {
      const ids = (await ctx.db.select({ id: job.id }).from(job).limit(200)).map((r) => r.id);
      return Promise.all(ids.map((id) => emailVars.resolve(ctx, id)));
    },
  },
  {
    name: "zakazky.api.briefs",
    run: async (ctx) => {
      const ids = (await ctx.db.select({ id: job.id }).from(job).limit(200)).map((r) => r.id);
      return getJobBriefsImpl(ctx, ids);
    },
  },
];
