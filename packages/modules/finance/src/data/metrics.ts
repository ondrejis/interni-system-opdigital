import { and, eq, isNull, sql } from "drizzle-orm";
import {
  defineDashboardMetric,
  type AttentionProvider,
  type DashboardMetricDef,
  type NavBadgeDef,
  type WidgetProvider,
} from "@rebar/core/module-server";
import { can, scopeOf, type Ctx } from "@rebar/core/rbac";
import { job } from "@rebar/zakazky/schema";
import { payment, retainer } from "../schema";
import { describeBalance, formatMoney } from "../logic";
import { loadAllocations, paymentScope } from "./model";
import { privateScope } from "./private";
import { reports } from "./reports";
import { getBalance } from "./settlements";
import { loadPeople, num, thisMonth, today } from "./util";
import { monthRange } from "@rebar/core/time";

const TYPE_LABELS: Record<string, string> = {
  web: "Web",
  marketing: "Marketing",
  systemy: "Systémy",
  recurring: "Opakované (Fakturoid)",
};

/** Počet a součet vystavených nezaplacených plateb (a těch po splatnosti) viditelných aktérovi. */
export async function unpaidStats(
  ctx: Ctx,
): Promise<{ count: number; amountMinor: number; overdueCount: number; overdueMinor: number }> {
  const [r] = await ctx.db
    .select({
      count: sql<number>`count(*)`,
      amount: sql<number>`coalesce(sum(${payment.amountMinor}), 0)`,
      overdueCount: sql<number>`count(*) filter (where ${payment.dueOn} < ${today()})`,
      overdueMinor: sql<number>`coalesce(sum(${payment.amountMinor}) filter (where ${payment.dueOn} < ${today()}), 0)`,
    })
    .from(payment)
    .where(and(eq(payment.status, "issued"), isNull(payment.deletedAt), paymentScope(ctx)));
  return {
    count: num(r?.count),
    amountMinor: num(r?.amount),
    overdueCount: num(r?.overdueCount),
    overdueMinor: num(r?.overdueMinor),
  };
}

/** Součet zaplacených plateb s datem úhrady v období; `userId` = jen podíl té osoby. */
async function paidIncome(
  ctx: Ctx,
  from: string,
  to: string,
  userId: string | null,
): Promise<number> {
  const recs = await ctx.db
    .select()
    .from(payment)
    .where(
      and(
        eq(payment.status, "paid"),
        isNull(payment.deletedAt),
        paymentScope(ctx),
        sql`${payment.paidOn} between ${from} and ${to}`,
      ),
    );
  if (!userId) return recs.reduce((s, p) => s + p.amountMinor, 0);
  const allocs = await loadAllocations(
    ctx.db,
    recs.map((r) => r.id),
  );
  return recs.reduce(
    (s, p) =>
      s +
      (allocs.get(p.id) ?? [])
        .filter((a) => a.userId === userId)
        .reduce((x, a) => x + a.amountMinor, 0),
    0,
  );
}

const READ = ["finance.read"];

/** Metriky nástěnek modulu „finance“: příjmy, saldo, nezaplacené platby, retainery a přehledy. */
export const financeMetrics: DashboardMetricDef[] = buildMetrics();

function buildMetrics(): DashboardMetricDef[] {
  const scalar = (
    key: string,
    label: string,
    description: string,
    format: "money" | "number",
    compute: DashboardMetricDef["compute"],
    supports?: DashboardMetricDef["supports"],
    params?: DashboardMetricDef["params"],
  ) =>
    defineDashboardMetric({
      key,
      label,
      description,
      format,
      shape: "scalar",
      permissions: READ,
      ...(supports ? { supports } : {}),
      ...(params ? { params } : {}),
      compute,
    });
  const yearOf = (to: string | null) => Number((to ?? today()).slice(0, 4));
  const privParam = {
    key: "includePrivate",
    label: "Včetně soukromých",
    type: "boolean" as const,
    default: false,
  };
  return [
    scalar(
      "finance.income_month",
      "Příjmy tento měsíc",
      "Součet plateb zaplacených v období (výchozí aktuální měsíc); „můj podíl“ počítá jen podíl přihlášeného.",
      "money",
      async (ctx, input) => {
        const range = monthRange(thisMonth());
        const from = input.from ?? range.from;
        const to = input.to ?? range.to;
        const mine =
          input.params.view === "mine" ? (input.userId ?? ctx.actor.userId) : input.userId;
        return { kind: "scalar", value: await paidIncome(ctx, from, to, mine) };
      },
      { period: true, person: true },
      [
        {
          key: "view",
          label: "Zobrazení",
          type: "select",
          choices: [
            { value: "total", label: "Celkem" },
            { value: "mine", label: "Můj podíl" },
          ],
          default: "total",
        },
      ],
    ),
    scalar(
      "finance.balance",
      "Saldo vyrovnání",
      "Kolik partner dluží vám (kladné), nebo vy partnerovi (záporné); soukromé zakázky se nepočítají.",
      "money",
      async (ctx, input, deps) => {
        if (scopeOf(ctx, "finance.read") !== "all") return { kind: "scalar", value: null };
        const b = await getBalance(ctx, deps, {});
        const me = input.userId ?? ctx.actor.userId;
        const h = b.headline;
        if (!h) return { kind: "scalar", value: 0 };
        return {
          kind: "scalar",
          value:
            h.creditorId === me
              ? h.amountMinor
              : h.debtorId === me
                ? -h.amountMinor
                : h.amountMinor,
        };
      },
    ),
    scalar(
      "finance.unpaid",
      "Nezaplacené platby",
      "Součet vystavených a dosud nezaplacených plateb.",
      "money",
      async (ctx) => ({ kind: "scalar", value: (await unpaidStats(ctx)).amountMinor }),
    ),
    scalar(
      "finance.unpaid_count",
      "Nezaplacené platby (počet)",
      "Počet vystavených a dosud nezaplacených plateb.",
      "number",
      async (ctx) => ({ kind: "scalar", value: (await unpaidStats(ctx)).count }),
    ),
    scalar(
      "finance.overdue_count",
      "Platby po splatnosti",
      "Počet vystavených plateb po splatnosti.",
      "number",
      async (ctx) => ({ kind: "scalar", value: (await unpaidStats(ctx)).overdueCount }),
    ),
    scalar(
      "finance.retainers",
      "Retainery (měsíčně)",
      "Součet měsíčních částek aktivních retainerů na běžících zakázkách.",
      "money",
      async (ctx) => {
        const all = await activeRetainersAll(ctx);
        return { kind: "scalar", value: all.reduce((s, r) => s + r.amountMinor, 0) };
      },
    ),
    scalar(
      "finance.retainers_count",
      "Aktivní retainery",
      "Počet aktivních retainerů.",
      "number",
      async (ctx) => ({ kind: "scalar", value: (await activeRetainersAll(ctx)).length }),
    ),
    defineDashboardMetric({
      key: "finance.income_by_person",
      label: "Příjmy podle osoby po měsících",
      description:
        "Podíly z plateb zaplacených v roce (rok z konce období, výchozí letošní), po měsících.",
      format: "money",
      shape: "series",
      permissions: READ,
      supports: { period: true },
      params: [privParam],
      compute: async (ctx, input, deps) => {
        const r = await reports(ctx, deps, {
          year: yearOf(input.to),
          includePrivate: input.params.includePrivate === true,
          basis: "paid",
        });
        return {
          kind: "series",
          categories: r.incomeByPerson.totalsByMonth.map((_, i) => ({
            key: `${r.year}-${String(i + 1).padStart(2, "0")}`,
            label: `${String(i + 1).padStart(2, "0")}/${r.year}`,
          })),
          series: r.incomeByPerson.rows.map((row) => ({
            key: row.userId,
            label: r.people[row.userId]?.firstName ?? "?",
            values: row.monthly,
          })),
        };
      },
    }),
    defineDashboardMetric({
      key: "finance.income_by_type",
      label: "Příjmy podle typu zakázky",
      description: "Zaplacené platby v roce podle typu zakázky.",
      format: "money",
      shape: "series",
      permissions: READ,
      supports: { period: true },
      params: [privParam],
      compute: async (ctx, input, deps) => {
        const r = await reports(ctx, deps, {
          year: yearOf(input.to),
          includePrivate: input.params.includePrivate === true,
          basis: "paid",
        });
        return {
          kind: "series",
          categories: r.incomeByType.map((t) => ({
            key: t.type,
            label: TYPE_LABELS[t.type] ?? t.type,
          })),
          series: [
            { key: "amount", label: "Příjem", values: r.incomeByType.map((t) => t.amountMinor) },
          ],
        };
      },
    }),
    defineDashboardMetric({
      key: "finance.top_clients",
      label: "Nejlepší klienti",
      description: "Klienti s nejvyšším zaplaceným objemem v roce.",
      format: "money",
      shape: "series",
      permissions: READ,
      supports: { period: true },
      params: [privParam],
      compute: async (ctx, input, deps) => {
        const r = await reports(ctx, deps, {
          year: yearOf(input.to),
          includePrivate: input.params.includePrivate === true,
          basis: "paid",
        });
        const top = r.topClients.slice(0, Math.max(1, Math.min(10, input.limit)));
        return {
          kind: "series",
          categories: top.map((t) => ({ key: t.companyId, label: t.companyName ?? "Klient" })),
          series: [{ key: "amount", label: "Zaplaceno", values: top.map((t) => t.amountMinor) }],
        };
      },
    }),
  ];
}

/** Aktivní retainery viditelné aktérovi (všech klientů). */
async function activeRetainersAll(ctx: Ctx) {
  return ctx.db
    .select({ amountMinor: retainer.amountMinor })
    .from(retainer)
    .innerJoin(job, eq(job.id, retainer.jobId))
    .where(
      and(
        eq(retainer.active, true),
        isNull(retainer.deletedAt),
        isNull(job.deletedAt),
        sql`(${retainer.toMonth} is null or ${retainer.toMonth} >= ${thisMonth()})`,
        sql`${job.status} not in ('done','cancelled')`,
        privateScope(ctx, job),
      ),
    );
}

/** Odznak u položky Finance: počet vystavených plateb po splatnosti (R-40, FIN-11); soukromé jen vlastníkovi. */
export const overdueBadge: NavBadgeDef = {
  href: "/finance",
  tone: "danger",
  count: async (ctx) => (can(ctx, "finance.read") ? (await unpaidStats(ctx)).overdueCount : 0),
};

/** Dlaždice přehledu: saldo a nezaplacené platby. */
export const financeWidgets: WidgetProvider = async (ctx, deps) => {
  {
    if (!can(ctx, "finance.read")) return [];
    const out = [];
    const u = await unpaidStats(ctx);
    out.push({
      id: "finance.unpaid",
      module: "finance",
      title: "Nezaplacené platby",
      value: formatMoney(u.amountMinor),
      hint: u.overdueCount ? `${u.overdueCount} po splatnosti` : `${u.count} vystavených`,
      href: "/finance",
      tone: u.overdueCount ? ("danger" as const) : ("default" as const),
      order: 30,
    });
    if (scopeOf(ctx, "finance.read") === "all") {
      const b = await getBalance(ctx, deps, {});
      const people = await loadPeople(
        ctx.db,
        b.headline ? [b.headline.debtorId, b.headline.creditorId] : [],
      );
      out.push({
        id: "finance.balance",
        module: "finance",
        title: "Saldo vyrovnání",
        value: describeBalance(
          { headline: b.headline },
          Object.fromEntries(Object.values(people).map((p) => [p.id, { name: p.firstName }])),
        ),
        href: "/finance/vyrovnani",
        tone: "default" as const,
        order: 31,
      });
    }
    return out;
  }
};

/** „Vyžaduje pozornost“: vystavené platby po splatnosti. */
export const overdueAttention: AttentionProvider = async (ctx) => {
  if (!can(ctx, "finance.read")) return [];
  const rows = await ctx.db
    .select()
    .from(payment)
    .where(
      and(
        eq(payment.status, "issued"),
        isNull(payment.deletedAt),
        paymentScope(ctx),
        sql`${payment.dueOn} < ${today()}`,
      ),
    )
    .limit(10);
  return rows.map((p) => ({
    id: `finance.overdue.${p.id}`,
    module: "finance",
    severity: "danger" as const,
    title: `${p.description} je po splatnosti`,
    detail: `${formatMoney(p.amountMinor)}, splatnost ${p.dueOn}`,
    href: "/finance",
  }));
};
