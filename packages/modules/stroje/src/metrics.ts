import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { clampLimit, scopedEntity } from "@rebar/core/dashboards";
import { defineDashboardMetric } from "@rebar/core/module-server";
import { monthRange, todayIso } from "@rebar/core/time";
import { deadlinesFor, deadlineState, intervalDue } from "./fleet";
import { availableHours, machineUtilizationPct } from "./metrics-calc";
import { asset, assetInterval, assetLog } from "./schema";

const num = (v: unknown) => Number(v ?? 0);

/** Pojmenované metriky nástěnek modulu Stroje. Čtou jen stroje v rozsahu aktéra. */
export const dashboardMetrics = [
  defineDashboardMetric({
    key: "stroje.utilization",
    label: "Využití strojů",
    description:
      "Po strojích: motohodiny z knihy provozu děleno dostupnými pracovními hodinami v období (pracovní dny bez svátků × 8 h, jen do dneška). Počítají se stroje měřené v motohodinách; vozidla měřená v km nemají hodiny nasazení. Bez zvoleného období se bere tento měsíc.",
    format: "percent",
    shape: "series",
    permissions: ["stroje.read"],
    supports: { period: true, job: true },
    compute: async (ctx, input, deps) => {
      const range =
        input.from && input.to
          ? { from: input.from, to: input.to }
          : monthRange(input.today.slice(0, 7));
      const scope = await scopedEntity(ctx, deps, "asset");
      const available = availableHours(range, input.today);
      const used = sql<number>`coalesce(sum(${assetLog.amount}), 0)::float8`;
      const rows = await ctx.db
        .select({ id: asset.id, name: asset.name, h: used })
        .from(asset)
        .leftJoin(
          assetLog,
          and(
            eq(assetLog.assetId, asset.id),
            isNull(assetLog.deletedAt),
            sql`${assetLog.date} between ${range.from}::date and ${range.to}::date`,
            input.jobId ? eq(assetLog.jobId, input.jobId) : undefined,
          ),
        )
        .where(and(scope.where, eq(asset.meter, "mth"), ne(asset.status, "retired")))
        .groupBy(asset.id, asset.name)
        .limit(500);
      const ranked = rows
        .map((r) => ({ id: r.id, name: r.name, pct: machineUtilizationPct(num(r.h), available) }))
        .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.name.localeCompare(b.name, "cs"))
        .slice(0, clampLimit(input.limit));
      return {
        kind: "series",
        categories: ranked.map((r) => ({ key: r.id, label: r.name, href: scope.href(r.id) })),
        series: [{ key: "utilization", label: "Využití", values: ranked.map((r) => r.pct) }],
      };
    },
  }),
  defineDashboardMetric({
    key: "stroje.service_due",
    label: "Stroje s blížícím se termínem",
    description:
      "Počet strojů a vozidel (bez vyřazených), které mají STK, pojištění, dálniční známku nebo servisní interval po termínu či do 30 dní.",
    format: "number",
    shape: "scalar",
    permissions: ["stroje.read"],
    compute: async (ctx, input, deps) => {
      const scope = await scopedEntity(ctx, deps, "asset");
      const assets = await ctx.db
        .select()
        .from(asset)
        .where(and(scope.where, ne(asset.status, "retired")))
        .limit(2000);
      if (!assets.length) return { kind: "scalar", value: 0 };
      const intervals = await ctx.db
        .select()
        .from(assetInterval)
        .where(
          and(
            inArray(
              assetInterval.assetId,
              assets.map((a) => a.id),
            ),
            isNull(assetInterval.deletedAt),
          ),
        )
        .limit(10_000);
      const byAsset = new Map<string, typeof intervals>();
      for (const iv of intervals) byAsset.set(iv.assetId, [...(byAsset.get(iv.assetId) ?? []), iv]);
      const today = input.today || todayIso();
      let n = 0;
      for (const a of assets) {
        const dueDeadline = deadlinesFor(a.kind).some((d) => {
          const t = deadlineState(a[d.key], today).tone;
          return t === "overdue" || t === "soon";
        });
        const dueInterval = (byAsset.get(a.id) ?? []).some((iv) => {
          const t = intervalDue(
            {
              everyMeter: iv.everyMeter,
              everyMonths: iv.everyMonths,
              lastDate: iv.lastDate,
              lastMeter: iv.lastMeter === null ? null : Number(iv.lastMeter),
            },
            Number(a.meterValue),
            today,
          ).tone;
          return t === "overdue" || t === "soon";
        });
        if (dueDeadline || dueInterval) n++;
      }
      return { kind: "scalar", value: n };
    },
  }),
];
