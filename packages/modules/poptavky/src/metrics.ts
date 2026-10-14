import { and, eq, gte, lt, sql } from "drizzle-orm";
import { schema } from "@rebar/core/db";
import { dayRangeInstants, pct1, scopedEntity } from "@rebar/core/dashboards";
import { defineDashboardMetric } from "@rebar/core/module-server";
import { inquiry } from "./schema";

/** Pojmenované metriky nástěnek modulu Poptávky. Čtou jen poptávky v rozsahu aktéra. */
export const dashboardMetrics = [
  defineDashboardMetric({
    key: "poptavky.conversion",
    label: "Úspěšnost poptávek",
    description:
      "Podíl vyhraných poptávek z uzavřených (vyhraných a prohraných), v procentech. Období se vztahuje k datu přijetí poptávky (datum uzavření systém neeviduje). Otevřené poptávky se nepočítají.",
    format: "percent",
    shape: "scalar",
    permissions: ["poptavky.read"],
    supports: { period: true, person: true },
    compute: async (ctx, input, deps) => {
      const scope = await scopedEntity(ctx, deps, "inquiry");
      const range =
        input.from && input.to ? dayRangeInstants({ from: input.from, to: input.to }) : null;
      const [r] = await ctx.db
        .select({
          won: sql<number>`count(*) filter (where ${schema.pipelineStage.kind} = 'won')::int`,
          lost: sql<number>`count(*) filter (where ${schema.pipelineStage.kind} = 'lost')::int`,
        })
        .from(inquiry)
        .innerJoin(schema.pipelineStage, eq(schema.pipelineStage.id, inquiry.stageId))
        .where(
          and(
            scope.where,
            range ? gte(inquiry.createdAt, range.start) : undefined,
            range ? lt(inquiry.createdAt, range.end) : undefined,
            input.userId ? eq(inquiry.ownerId, input.userId) : undefined,
          ),
        );
      const won = Number(r?.won ?? 0);
      const lost = Number(r?.lost ?? 0);
      return { kind: "scalar", value: pct1(won, won + lost) };
    },
  }),
];
