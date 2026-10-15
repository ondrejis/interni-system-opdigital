import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { ClientTabProvider } from "@rebar/core/contracts";
import {
  defineDashboardMetric,
  type AttentionProvider,
  type CalendarLayerProvider,
  type DashboardMetricDef,
  type NavBadgeDef,
  type PrivatePathDef,
  type WidgetProvider,
} from "@rebar/core/module-server";
import { scopeOf } from "@rebar/core/rbac";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { task } from "../schema";
import { OPEN_STATUSES } from "./constants";
import { taskEnd, normalizeTime } from "./logic/due";
import { overdueCond } from "./queries";
import { visibleTasks } from "./scope";

/*
  Příspěvky modulu do míst, která modul neovládá: metriky a dlaždice přehledu, „vyžaduje pozornost“, odznak u položky
  navigace, vrstva kalendáře a karta klienta. Všechny čtou tabulku `task` ručně, proto jdou přes `visibleTasks`
  (soukromé záznamy a rozsah „jen moje“) a jsou vyjmenované v `privatePaths` (canary test soukromí, D §5.4).
*/

/** Bez `ukoly.read` poskytovatelé nic nevrací (nevyhazují chybu: přehled a navigace běží i pro role bez úkolů). */
const noRead = (ctx: Parameters<typeof visibleTasks>[0]) => !scopeOf(ctx, "ukoly.read");

const open = () => inArray(task.status, [...OPEN_STATUSES]);
const mine = (userId: string | null) => (userId ? eq(task.assigneeId, userId) : sql`false`);

async function countWhere(
  ctx: Parameters<typeof visibleTasks>[0],
  ...conds: (ReturnType<typeof sql> | undefined)[]
) {
  if (noRead(ctx)) return 0;
  const [r] = await ctx.db
    .select({ n: count() })
    .from(task)
    .where(and(visibleTasks(ctx), open(), ...conds));
  return r?.n ?? 0;
}

/** Počet otevřených úkolů přidělených aktérovi s termínem dnes (bez těch, které jsou už po termínu dnem). */
export async function todayCount(
  ctx: Parameters<typeof visibleTasks>[0],
  userId?: string | null,
  now = new Date(),
) {
  const uid = userId === undefined ? ctx.actor.userId : userId;
  const today = todayIso("Europe/Prague", now);
  return countWhere(ctx, mine(uid), sql`${task.dueDate} = ${today}::date`);
}

/** Počet otevřených úkolů aktéra po termínu. */
export async function overdueCount(
  ctx: Parameters<typeof visibleTasks>[0],
  userId?: string | null,
  now = new Date(),
) {
  const uid = userId === undefined ? ctx.actor.userId : userId;
  return countWhere(ctx, mine(uid), overdueCond(now));
}

/* ---------- metriky pro nástěnky ---------- */

export const metrics: DashboardMetricDef[] = [
  defineDashboardMetric({
    key: "ukoly.today",
    label: "Úkoly na dnes",
    description: "Otevřené úkoly přidělené uživateli s termínem dnes.",
    format: "number",
    shape: "scalar",
    permissions: ["ukoly.read"],
    supports: { person: true },
    compute: async (ctx, input) => ({
      kind: "scalar",
      value: await todayCount(ctx, input.userId ?? ctx.actor.userId),
    }),
  }),
  defineDashboardMetric({
    key: "ukoly.overdue",
    label: "Úkoly po termínu",
    description: "Otevřené úkoly přidělené uživateli, které jsou po termínu.",
    format: "number",
    shape: "scalar",
    permissions: ["ukoly.read"],
    supports: { person: true },
    compute: async (ctx, input) => ({
      kind: "scalar",
      value: await overdueCount(ctx, input.userId ?? ctx.actor.userId),
    }),
  }),
  defineDashboardMetric({
    key: "ukoly.open",
    label: "Otevřené úkoly",
    description: "Všechny otevřené úkoly přidělené uživateli (i bez termínu).",
    format: "number",
    shape: "scalar",
    permissions: ["ukoly.read"],
    supports: { person: true, job: true },
    compute: async (ctx, input) => {
      const uid = input.userId ?? ctx.actor.userId;
      return {
        kind: "scalar",
        value: await countWhere(
          ctx,
          mine(uid),
          input.jobId ? eq(task.jobId, input.jobId) : undefined,
        ),
      };
    },
  }),
];

/* ---------- dlaždice, pozornost, odznak ---------- */

/** Dlaždice „Úkoly na dnes“ (s upozorněním na úkoly po termínu). */
export const widget: WidgetProvider = async (ctx) => {
  if (noRead(ctx)) return [];
  const [today, overdue] = await Promise.all([todayCount(ctx), overdueCount(ctx)]);
  return [
    {
      id: "ukoly.today",
      module: "ukoly",
      title: "Úkoly na dnes",
      value: String(today),
      ...(overdue > 0 ? { hint: `Po termínu: ${overdue}` } : {}),
      href: "/ukoly",
      tone: overdue > 0 ? "danger" : today > 0 ? "default" : "success",
      order: 10,
    },
  ];
};

/** „Vyžaduje pozornost“: nejstarší úkoly po termínu přidělené aktérovi. */
export const attention: AttentionProvider = async (ctx) => {
  if (noRead(ctx)) return [];
  const me = ctx.actor.userId;
  if (!me) return [];
  const rows = await ctx.db
    .select({ id: task.id, title: task.title, dueDate: task.dueDate })
    .from(task)
    .where(and(visibleTasks(ctx), mine(me), overdueCond(new Date())))
    .orderBy(asc(task.dueDate))
    .limit(5);
  return rows.map((r) => ({
    id: `ukoly.overdue.${r.id}`,
    module: "ukoly",
    severity: "warning" as const,
    title: r.title,
    detail: `Termín ${r.dueDate}`,
    href: `/ukoly/vse/${r.id}`,
  }));
};

/** Odznak u „Moje úkoly“: počet úkolů po termínu. */
export const badge: NavBadgeDef = {
  href: "/ukoly",
  tone: "danger",
  count: (ctx) => overdueCount(ctx),
};

/* ---------- vrstva kalendáře ---------- */

/** Vrstva „Úkoly s termínem“: otevřené úkoly aktéra s datem v rozsahu (s časem a délkou, nebo na celý den). */
export const calendarLayer: CalendarLayerProvider = {
  key: "ukoly",
  label: "Úkoly s termínem",
  color: "#6366f1",
  items: async (ctx, range) => {
    if (noRead(ctx)) return [];
    const me = ctx.actor.userId;
    if (!me) return [];
    const rows = await ctx.db
      .select()
      .from(task)
      .where(
        and(
          visibleTasks(ctx),
          open(),
          mine(me),
          sql`${task.dueDate} >= ${range.from.slice(0, 10)}::date and ${task.dueDate} <= ${range.to.slice(0, 10)}::date`,
        ),
      )
      .orderBy(asc(task.dueDate), sql`${task.dueTime} asc nulls last`)
      .limit(500);
    return rows.map((r) => {
      const time = normalizeTime(r.dueTime);
      const end =
        time && !r.allDay
          ? taskEnd({ dueDate: r.dueDate!, dueTime: time, durationMin: r.durationMin })
          : null;
      return {
        id: `task:${r.id}`,
        layer: "ukoly",
        title: r.title,
        start: time && !r.allDay ? `${r.dueDate}T${time}` : r.dueDate!,
        ...(end ? { end: `${end.date}T${end.time}` } : {}),
        allDay: !time || r.allDay,
        href: `/ukoly/vse/${r.id}`,
      };
    });
  },
};

/* ---------- karta klienta ---------- */

/** Příspěvek ke kartě klienta: počet úkolů v záložce, souhrn a „poslední aktivita“ v tabulce klientů. */
export const clientCard: ClientTabProvider = {
  async tabCounts(ctx, companyId) {
    if (noRead(ctx)) return {};
    const [r] = await ctx.db
      .select({ n: count() })
      .from(task)
      .where(and(visibleTasks(ctx), eq(task.companyId, companyId), isNull(task.parentId)));
    return { ukoly: r?.n ?? 0 };
  },
  async summary(ctx, companyId) {
    if (noRead(ctx)) return {};
    const now = new Date();
    const [r] = await ctx.db
      .select({
        open: sql<number>`count(*) filter (where ${open()})::int`,
        overdue: sql<number>`count(*) filter (where ${overdueCond(now)})::int`,
        last: sql<Date | null>`max(${task.completedAt}) filter (where ${eq(task.status, "done")})`,
      })
      .from(task)
      .where(and(visibleTasks(ctx), eq(task.companyId, companyId), isNull(task.parentId)));
    return {
      tasks: { open: r?.open ?? 0, overdue: r?.overdue ?? 0 },
      lastActivityAt: r?.last ? new Date(r.last).toISOString() : null,
    };
  },
  async listMetrics(ctx, companyIds) {
    if (noRead(ctx)) return {};
    if (!companyIds.length) return {};
    const rows = await ctx.db
      .select({
        companyId: task.companyId,
        last: sql<Date | null>`max(${task.completedAt})`,
      })
      .from(task)
      .where(and(visibleTasks(ctx), inArray(task.companyId, companyIds), eq(task.status, "done")))
      .groupBy(task.companyId);
    return Object.fromEntries(
      rows.map((r) => [
        r.companyId!,
        { lastActivityAt: r.last ? new Date(r.last).toISOString() : null },
      ]),
    );
  },
};

/* ---------- test soukromí ---------- */

/** Ruční čtecí cesty modulu pro canary test soukromí (D §5.4): musí je vyjmenovat všechny. */
export const privatePaths: PrivatePathDef[] = [
  { name: "ukoly.metric.today", run: (ctx) => todayCount(ctx) },
  { name: "ukoly.metric.overdue", run: (ctx) => overdueCount(ctx) },
  { name: "ukoly.widget.today", run: (ctx, deps) => widget(ctx, deps) },
  { name: "ukoly.attention", run: (ctx, deps) => attention(ctx, deps) },
  { name: "ukoly.navBadge", run: (ctx, deps) => badge.count(ctx, deps) },
  {
    name: "ukoly.calendarLayer",
    run: (ctx, deps) =>
      calendarLayer.items(
        ctx,
        { from: addDaysIso(todayIso(), -60), to: addDaysIso(todayIso(), 365) },
        deps,
      ),
  },
  {
    name: "ukoly.service.overdueJobIds",
    run: (ctx, deps) => deps.services.get("tasks").overdueJobIds(ctx),
  },
  {
    name: "ukoly.clientCard.summary",
    run: async (ctx) => {
      const [c] = await ctx.db
        .select({ id: task.companyId })
        .from(task)
        .where(and(isNotNullCompany(), ne(task.status, "canceled")))
        .limit(1);
      return c?.id ? clientCard.summary!(ctx, c.id) : null;
    },
  },
  { name: "ukoly.dealActivity", run: (ctx) => dealActivitySample(ctx) },
];

function isNotNullCompany() {
  return sql`${task.companyId} is not null`;
}

/** Vzorek toho, co se zapisuje do systémových polí obchodu: počítá jen sdílené úkoly. */
async function dealActivitySample(ctx: Parameters<typeof visibleTasks>[0]) {
  return ctx.db
    .select({ id: task.id, title: task.title, dealId: task.dealId, completedAt: task.completedAt })
    .from(task)
    .where(and(visibleTasks(ctx), or(eq(task.status, "done"), open())))
    .orderBy(desc(task.updatedAt))
    .limit(20);
}
