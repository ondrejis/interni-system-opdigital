import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getLookup, getPipeline } from "@rebar/core/config-data";
import { scopedEntity, tryScopedEntity } from "@rebar/core/dashboards";
import { schema } from "@rebar/core/db";
import { defineCommand } from "@rebar/core/module-server";
import { can } from "@rebar/core/rbac";
import { company } from "@rebar/kontakty/schema";
import { job } from "@rebar/zakazky/schema";
import { inquiry } from "../../schema";
import { daysInStage } from "../logic";
import { openDealWhere } from "../views/scope";
import type { TodayData } from "./logic";

/** Číselníky poptávek (stejné klíče jako v `server.ts`; tady zvlášť, aby oblast nezáviselo na kořeni modulu). */
const SOURCE_LOOKUP = "inquiry.source";
const LOST_LOOKUP = "inquiry.lost_reason";

/** Nejvíc řádků jedné sekce; zbytek ukáže odkaz na celý seznam. */
const LIMIT = 25;

/**
 * Data stránky „Moje dnešní práce“ (`crm.today`): (b) moje otevřené obchody bez další aktivity (zhnilé a nejdéle
 * ve stavu první), (c) nové poptávky ve schránce (nejdéle čekající první). Dnešní a zpožděné aktivity bere stránka
 * z komponenty `ActivityList`. Obchody a poptávky se čtou v rozsahu aktéra; cena nabídky jen s `zakazky.economics`.
 */
export const todayCommand = defineCommand({
  name: "crm.today",
  permission: "poptavky.read",
  input: z.object({}),
  handler: async (ctx, _input, deps): Promise<TodayData> => {
    const me = ctx.actor.userId;
    let noActivity: TodayData["noActivity"] = null;
    const jobScope =
      me && can(ctx, "zakazky.read") ? await tryScopedEntity(ctx, deps, "job") : null;
    if (jobScope && me) {
      const money = jobScope.entity.byKey.has("sumContract");
      const where = and(
        jobScope.where,
        openDealWhere({ managerId: me }),
        eq(job.crmOpenActivities, 0),
      );
      const [count] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(job)
        .where(where);
      const rows = await ctx.db
        .select({
          id: job.id,
          number: job.number,
          title: job.title,
          companyName: company.name,
          stageName: schema.pipelineStage.name,
          stageColor: schema.pipelineStage.color,
          phase: job.phase,
          value: money ? job.sumContractMinor : sql<number>`0`,
          rotting: job.crmRotting,
          stageEntered: job.crmStageEnteredAt,
          expected: job.expectedCloseDate,
        })
        .from(job)
        .leftJoin(company, eq(company.id, job.companyId))
        .leftJoin(schema.pipelineStage, eq(schema.pipelineStage.id, job.stageId))
        .where(where)
        .orderBy(desc(job.crmRotting), asc(job.crmStageEnteredAt), asc(job.number))
        .limit(LIMIT);
      noActivity = {
        total: count?.n ?? 0,
        rows: rows.map((r) => ({
          id: r.id,
          number: r.number,
          title: r.title,
          companyName: r.companyName ?? null,
          stageName: r.stageName ?? null,
          stageColor: r.stageColor ?? null,
          phase: r.phase,
          valueMinor: money ? Number(r.value) : null,
          rotting: r.rotting,
          daysInStage: daysInStage(r.stageEntered),
          expectedCloseDate: r.expected,
        })),
      };
    }

    const inboxScope = await scopedEntity(ctx, deps, "inquiry");
    const pipeline = await getPipeline(ctx.db, "inquiry", "default");
    const open = (pipeline?.stages ?? []).filter((s) => s.kind === "open").map((s) => s.id);
    let inbox: TodayData["inbox"] = null;
    if (open.length) {
      const where = and(
        inboxScope.where,
        inArray(inquiry.stageId, open),
        isNull(inquiry.convertedJobId),
      );
      const [count] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(inquiry)
        .where(where);
      const rows = await ctx.db
        .select({
          id: inquiry.id,
          title: inquiry.title,
          contactName: inquiry.contactName,
          companyName: inquiry.companyName,
          phone: inquiry.contactPhone,
          email: inquiry.contactEmail,
          source: inquiry.source,
          value: inquiry.expectedValueMinor,
          message: inquiry.message,
          ownerName: schema.user.name,
          createdAt: inquiry.createdAt,
          nextStep: inquiry.nextStep,
          nextStepAt: inquiry.nextStepAt,
        })
        .from(inquiry)
        .leftJoin(schema.user, eq(schema.user.id, inquiry.ownerId))
        .where(where)
        .orderBy(asc(inquiry.createdAt))
        .limit(LIMIT);
      const sources = new Map(
        (await getLookup(ctx.db, SOURCE_LOOKUP)).map((s) => [s.value, s.label]),
      );
      const lostReasons = (await getLookup(ctx.db, LOST_LOOKUP)).map((r) => ({
        value: r.value,
        label: r.label,
      }));
      inbox = {
        total: count?.n ?? 0,
        rows: rows.map((r) => ({
          id: r.id,
          title: r.title,
          contactName: r.contactName ?? null,
          companyName: r.companyName ?? null,
          phone: r.phone ?? null,
          email: r.email ?? null,
          source: r.source ? (sources.get(r.source) ?? r.source) : null,
          valueMinor: r.value,
          message: r.message ? r.message.slice(0, 160) : null,
          ownerName: r.ownerName ?? null,
          createdAt: r.createdAt.toISOString(),
          nextStep: r.nextStep ?? null,
          nextStepAt: r.nextStepAt ?? null,
        })),
        lostReasons,
        canConvert: can(ctx, "poptavky.convert"),
        canWrite: can(ctx, "poptavky.write"),
      };
    }
    return { noActivity, inbox };
  },
});
