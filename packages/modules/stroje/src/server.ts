import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@rebar/core/db";
import {
  defineModuleJob,
  defineModuleServer,
  type AttentionItem,
  type CalendarItem,
  type CostLine,
} from "@rebar/core/module-server";
import { can } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import { commands } from "./commands";
import { dashboardMetrics } from "./metrics";
import { assetEntity, defectEntity, entities } from "./entities";
import { deadlineState, deadlinesFor, formatMeter, intervalDue } from "./fleet";
import { sendDeadlineReminders, sendReservationReminders } from "./notices";
import {
  asset,
  assetDefect,
  assetFuel,
  assetInterval,
  assetLog,
  assetReservation,
  assetService,
} from "./schema";

export const server = defineModuleServer({
  entities,
  commands,
  dashboardMetrics,
  costProviders: [
    {
      key: "stroje.machines",
      // Řádek na úrovni záznamu (jízda / provoz, tankování); `ref` je id záznamu. Právo na ekonomiku hlídá zakázka.
      costs: async (ctx, jobId): Promise<CostLine[]> => {
        const uses = await ctx.db
          .select({
            id: assetLog.id,
            date: assetLog.date,
            name: asset.name,
            cost: sql<number>`(${assetLog.amount} * coalesce(${asset.internalRateMinor}, 0))::float`,
          })
          .from(assetLog)
          .innerJoin(asset, eq(asset.id, assetLog.assetId))
          .where(and(eq(assetLog.jobId, jobId), isNull(assetLog.deletedAt)))
          .orderBy(asc(assetLog.date));
        const fuels = await ctx.db
          .select({
            id: assetFuel.id,
            date: assetFuel.date,
            name: asset.name,
            net: sql<number>`(${assetFuel.totalMinor} / (1 + ${assetFuel.vatRate} / 100))::float`,
          })
          .from(assetFuel)
          .innerJoin(asset, eq(asset.id, assetFuel.assetId))
          .where(and(eq(assetFuel.jobId, jobId), isNull(assetFuel.deletedAt)))
          .orderBy(asc(assetFuel.date));
        const out: CostLine[] = [];
        for (const u of uses)
          if (Math.round(u.cost) > 0)
            out.push({
              category: "machines",
              label: `Provoz: ${u.name}`,
              amountMinor: Math.round(u.cost),
              source: "stroje",
              ref: `log:${u.id}`,
              date: u.date,
            });
        for (const f of fuels)
          if (Math.round(f.net) > 0)
            out.push({
              category: "machines",
              label: `Palivo: ${f.name}`,
              amountMinor: Math.round(f.net),
              source: "stroje",
              ref: `fuel:${f.id}`,
              date: f.date,
            });
        return out;
      },
    },
  ],
  diaryPrefill: [
    async (ctx, jobId, date) => {
      if (!can(ctx, "stroje.read")) return {};
      const rows = await ctx.db
        .select({
          name: asset.name,
          meter: asset.meter,
          amount: sql<string>`sum(${assetLog.amount})`,
          purpose: sql<string | null>`string_agg(distinct ${assetLog.purpose}, '; ')`,
        })
        .from(assetLog)
        .innerJoin(asset, eq(asset.id, assetLog.assetId))
        .where(and(eq(assetLog.jobId, jobId), eq(assetLog.date, date), isNull(assetLog.deletedAt)))
        .groupBy(asset.name, asset.meter)
        .orderBy(asc(asset.name));
      if (!rows.length) return {};
      return {
        machineRows: rows.map((r) => ({
          name: r.name,
          hours: r.meter === "mth" ? Math.round(Number(r.amount) * 10) / 10 : null,
          note:
            r.meter === "mth"
              ? (r.purpose ?? null)
              : [formatMeter(r.amount, r.meter), r.purpose].filter(Boolean).join(" · "),
        })),
        machines: rows
          .map(
            (r) =>
              `${r.name} — ${formatMeter(r.amount, r.meter)}${r.purpose ? ` (${r.purpose})` : ""}`,
          )
          .join("; "),
      };
    },
  ],
  attention: [
    async (ctx) => {
      const out: AttentionItem[] = [];
      if (!can(ctx, "stroje.write")) return out;
      const today = todayIso();
      const assets = await ctx.db
        .select()
        .from(asset)
        .where(and(isNull(asset.deletedAt), ne(asset.status, "retired")));
      const intervals = assets.length
        ? await ctx.db
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
        : [];
      let overdue = 0;
      let soon = 0;
      for (const a of assets) {
        for (const d of deadlinesFor(a.kind)) {
          const t = deadlineState(a[d.key], today).tone;
          if (t === "overdue") overdue++;
          else if (t === "soon") soon++;
        }
        for (const iv of intervals.filter((v) => v.assetId === a.id)) {
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
          if (t === "overdue") overdue++;
          else if (t === "soon") soon++;
        }
      }
      if (overdue + soon)
        out.push({
          id: "fleet-deadlines",
          module: "stroje",
          severity: overdue ? "danger" : "warning",
          title: `Termíny a servis strojů: ${overdue + soon}`,
          detail: overdue
            ? `${overdue} po termínu, ${soon} do 30 dní (STK, pojištění, známky, servis)`
            : "STK, pojištění, známka nebo servis do 30 dní",
          href: "/stroje",
        });
      const [d] = await ctx.db
        .select({
          n: sql<number>`count(*)::int`,
          blocking: sql<number>`count(*) filter (where ${assetDefect.severity} = 'blocking')::int`,
        })
        .from(assetDefect)
        .where(and(eq(assetDefect.status, "open"), isNull(assetDefect.deletedAt)));
      if (d?.n)
        out.push({
          id: "fleet-defects",
          module: "stroje",
          severity: d.blocking ? "danger" : "warning",
          title: `Závady strojů: ${d.n}`,
          detail: d.blocking ? `${d.blocking} mimo provoz` : "drobné, stroje jezdí",
          href: "/stroje/zavady",
        });
      return out;
    },
  ],
  widgets: [
    async (ctx) => {
      if (!can(ctx, "stroje.read")) return [];
      const [r] = await ctx.db
        .select({
          active: sql<number>`count(*) filter (where ${asset.status} = 'active')::int`,
          service: sql<number>`count(*) filter (where ${asset.status} = 'service')::int`,
        })
        .from(asset)
        .where(isNull(asset.deletedAt));
      return [
        {
          id: "fleet-status",
          module: "stroje",
          title: "Stroje v provozu",
          value: String(r?.active ?? 0),
          ...(r?.service ? { hint: `${r.service} v servisu nebo mimo provoz` } : {}),
          href: "/stroje",
          tone: r?.service ? ("warning" as const) : ("success" as const),
          order: 40,
        },
      ];
    },
  ],
  calendarLayers: [
    {
      key: "stroje.rezervace",
      label: "Rezervace strojů",
      color: "orange",
      items: async (ctx, range): Promise<CalendarItem[]> => {
        if (!can(ctx, "stroje.read")) return [];
        const rows = await ctx.db
          .select({
            id: assetReservation.id,
            assetId: assetReservation.assetId,
            name: asset.name,
            from: assetReservation.dateFrom,
            to: assetReservation.dateTo,
            who: schema.user.name,
          })
          .from(assetReservation)
          .innerJoin(asset, eq(asset.id, assetReservation.assetId))
          .leftJoin(schema.user, eq(schema.user.id, assetReservation.userId))
          .where(
            and(
              lte(assetReservation.dateFrom, range.to),
              gte(assetReservation.dateTo, range.from),
              isNull(assetReservation.deletedAt),
              isNull(asset.deletedAt),
            ),
          );
        return rows.map((r) => ({
          id: `res-${r.id}`,
          layer: "stroje.rezervace",
          title: r.who ? `${r.name} · ${r.who}` : r.name,
          start: r.from,
          end: r.to,
          allDay: true,
          href: `/stroje/evidence/${r.assetId}`,
        }));
      },
    },
    {
      key: "stroje.terminy",
      label: "STK, pojištění a známky",
      color: "red",
      items: async (ctx, range): Promise<CalendarItem[]> => {
        if (!can(ctx, "stroje.write")) return [];
        const rows = await ctx.db
          .select()
          .from(asset)
          .where(and(isNull(asset.deletedAt), ne(asset.status, "retired")));
        const out: CalendarItem[] = [];
        for (const a of rows)
          for (const d of deadlinesFor(a.kind)) {
            const date = a[d.key];
            if (date && date >= range.from && date <= range.to)
              out.push({
                id: `dl-${a.id}-${d.key}`,
                layer: "stroje.terminy",
                title: `${a.name}: ${d.label}`,
                start: date,
                allDay: true,
                href: `/stroje/evidence/${a.id}`,
              });
          }
        return out;
      },
    },
  ],
  jobs: [
    defineModuleJob({
      name: "stroje.deadlines",
      schema: z.object({}),
      cron: "30 6 * * *",
      retryLimit: 1,
      async handler(deps) {
        await sendDeadlineReminders(deps.db);
      },
    }),
    defineModuleJob({
      name: "stroje.reservations",
      schema: z.object({}),
      cron: "0 15 * * *",
      retryLimit: 1,
      async handler(deps) {
        await sendReservationReminders(deps.db);
      },
    }),
  ],
});

export { assetEntity, defectEntity, entities };
export { asset, assetDefect, assetFuel, assetInterval, assetLog, assetReservation, assetService };
export * from "./fleet";
export * from "./notices";
export { commands };
