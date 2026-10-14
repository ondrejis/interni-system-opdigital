import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getPipeline } from "@rebar/core/config-data";
import { scopedEntity } from "@rebar/core/dashboards";
import { schema } from "@rebar/core/db";
import { defineCommand } from "@rebar/core/module-server";
import { UserError } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import { company } from "@rebar/kontakty/schema";
import { job } from "@rebar/zakazky/schema";
import { effectiveProbabilityPct, OPEN_DEAL_PHASES, WON_DEAL_PHASES } from "../logic";
import {
  buildForecastColumns,
  currentMonth,
  isMonthKey,
  windowRange,
  type ForecastDeal,
  type ForecastResult,
  type OwnerFilter,
} from "./logic";

const UUID_NONE = "00000000-0000-0000-0000-000000000000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Den výhry: datum výhry zakázky, a když chybí (zakázka vznikla rovnou ve vyhraném stavu), den změny fáze v české zóně. */
const wonDay = sql<
  string | null
>`coalesce(${job.wonAt}::text, ((${job.phaseChangedAt} at time zone 'Europe/Prague')::date)::text)`;

/** Hodnota filtru vlastníka z příkazu: `all`, `me` nebo id uživatele. Cokoli jiného je chyba. */
export function parseOwner(v: string): OwnerFilter {
  if (v === "all" || v === "me" || UUID.test(v)) return v;
  throw new UserError("Neplatný filtr vlastníka.");
}

/**
 * Prognóza obchodů po měsících (`crm.forecast`). Agregace běží na serveru nad zakázkami v rozsahu aktéra (oprávnění
 * ke čtení, rozsah „jen moje“); částky a váženou hodnotu dostane jen ten, kdo má `zakazky.economics`, jinak jsou `null`
 * a sečtou se jen počty. Nearchivované otevřené obchody (poptávka, nabídka) padají do měsíců podle předpokládaného
 * uzavření, vyhrané podle data výhry. Vstup: `owner` (`all`, `me`, id uživatele), `from` (první měsíc `YYYY-MM`,
 * výchozí aktuální) a `months` (1 až 12, výchozí 4).
 */
export const forecastCommand = defineCommand({
  name: "crm.forecast",
  permission: "zakazky.read",
  input: z.object({
    owner: z.string().max(40).default("all"),
    from: z.string().optional(),
    months: z.number().int().min(1).max(12).default(4),
  }),
  handler: async (ctx, input, deps): Promise<ForecastResult> => {
    const owner = parseOwner(input.owner);
    if (input.from !== undefined && !isMonthKey(input.from))
      throw new UserError("Měsíc musí být ve tvaru RRRR-MM.");
    const from = input.from ?? currentMonth();
    const scope = await scopedEntity(ctx, deps, "job");
    // peníze jen s oprávněním ekonomiky: atribut, který aktér nevidí, v entitě neexistuje
    const money = scope.entity.byKey.has("sumContract") && scope.entity.byKey.has("crmWeighted");
    const range = windowRange(from, input.months);
    const ownerWhere =
      owner === "all"
        ? undefined
        : eq(job.managerId, owner === "me" ? (ctx.actor.userId ?? UUID_NONE) : owner);

    const rows = await ctx.db
      .select({
        id: job.id,
        number: job.number,
        title: job.title,
        companyName: company.name,
        stageId: job.stageId,
        phase: job.phase,
        expected: job.expectedCloseDate,
        wonDay,
        value: money ? job.sumContractMinor : sql<number>`0`,
        weighted: money ? job.crmWeightedMinor : sql<number>`0`,
        probOverride: job.crmProbabilityPct,
        stageProb: schema.pipelineStage.probabilityPct,
        managerId: job.managerId,
        managerName: schema.user.name,
        rotting: job.crmRotting,
        stageEntered: job.crmStageEnteredAt,
        lastActivity: job.crmLastActivityAt,
        next: job.crmNextActivityAt,
        openActivities: job.crmOpenActivities,
      })
      .from(job)
      .leftJoin(company, eq(company.id, job.companyId))
      .leftJoin(schema.user, eq(schema.user.id, job.managerId))
      .leftJoin(schema.pipelineStage, eq(schema.pipelineStage.id, job.stageId))
      .where(
        and(
          scope.where,
          isNull(job.crmArchivedAt),
          ownerWhere,
          or(
            inArray(job.phase, [...OPEN_DEAL_PHASES]),
            and(
              inArray(job.phase, [...WON_DEAL_PHASES]),
              sql`${wonDay} >= ${range.from} and ${wonDay} <= ${range.to}`,
            ),
          ),
        ),
      )
      .limit(5000);

    const deals: ForecastDeal[] = rows.map((r) => {
      const won = (WON_DEAL_PHASES as readonly string[]).includes(r.phase);
      const value = money ? Number(r.value) : null;
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        companyName: r.companyName ?? null,
        stageId: r.stageId,
        phase: r.phase,
        closeDate: won ? r.wonDay : r.expected,
        valueMinor: value,
        weightedMinor: money ? (won ? value : Number(r.weighted)) : null,
        probabilityPct: won
          ? 100
          : effectiveProbabilityPct(
              { phase: r.phase, crmProbabilityPct: r.probOverride },
              { probabilityPct: r.stageProb },
            ),
        managerId: r.managerId,
        managerName: r.managerName ?? null,
        rotting: r.rotting,
        won,
        stageEnteredAt: r.stageEntered?.toISOString() ?? null,
        lastActivityAt: r.lastActivity?.toISOString() ?? null,
        nextActivityAt: r.next?.toISOString() ?? null,
        openActivities: r.openActivities,
      };
    });

    const pipeline = await getPipeline(ctx.db, "job", "default");
    const stages = (pipeline?.stages ?? [])
      .filter((s) => s.phase && (OPEN_DEAL_PHASES as readonly string[]).includes(s.phase))
      .map((s) => ({ id: s.id, name: s.name, color: s.color, phase: s.phase! }));

    return {
      today: todayIso(),
      from,
      months: input.months,
      money,
      columns: buildForecastColumns(deals, { from, months: input.months, money }),
      stages,
    };
  },
});
