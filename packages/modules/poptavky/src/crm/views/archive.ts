import { and, desc, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getLookup } from "@rebar/core/config-data";
import { scopedEntity } from "@rebar/core/dashboards";
import { schema } from "@rebar/core/db";
import { defineCommand } from "@rebar/core/module-server";
import { company } from "@rebar/kontakty/schema";
import { job } from "@rebar/zakazky/schema";
import { LOST_REASON_LOOKUP } from "@rebar/zakazky/server";
import { WON_DEAL_PHASES } from "../logic";
import { parseOwner } from "./forecast";
import { ARCHIVE_SCOPES, type ArchivePage, type ArchiveScope } from "./logic";

const NONE = "00000000-0000-0000-0000-000000000000";

/** Podmínka rozsahu archivu nad tabulkou zakázek. */
export function archiveScopeWhere(scope: ArchiveScope): SQL {
  const archived = isNotNull(job.crmArchivedAt);
  const lost = eq(job.phase, "lost");
  const won = inArray(job.phase, [...WON_DEAL_PHASES]);
  switch (scope) {
    case "archived":
      return archived;
    case "lost":
      return lost;
    case "won":
      return won;
    case "all":
      return or(archived, lost, won)!;
    default:
      return or(archived, lost)!;
  }
}

/**
 * Archiv obchodů (`crm.archive.list`): archivované a uzavřené (prohrané s důvodem ztráty, vyhrané) zakázky v rozsahu aktéra,
 * od nejnovějších. Vstup: `owner` (`all`, `me`, id), `scope` (`closed` = archivované a prohrané, `archived`, `lost`, `won`,
 * `all`), `q` (hledání v názvu a čísle), `limit` a `offset`. Znovuotevření a vrácení z archivu dělají příkazy
 * `crm.deal.reopen` a `crm.deal.unarchive`.
 */
export const archiveListCommand = defineCommand({
  name: "crm.archive.list",
  permission: "zakazky.read",
  input: z.object({
    owner: z.string().max(40).default("all"),
    scope: z.enum(ARCHIVE_SCOPES).default("closed"),
    q: z.string().trim().max(100).optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).max(100_000).default(0),
  }),
  handler: async (ctx, input, deps): Promise<ArchivePage> => {
    const owner = parseOwner(input.owner);
    const scope = await scopedEntity(ctx, deps, "job");
    const money = scope.entity.byKey.has("sumContract");
    const pattern = input.q ? `%${input.q.replace(/[\\%_]/g, "\\$&")}%` : null;
    const where = and(
      scope.where,
      archiveScopeWhere(input.scope),
      owner === "all"
        ? undefined
        : eq(job.managerId, owner === "me" ? (ctx.actor.userId ?? NONE) : owner),
      pattern
        ? sql`(lower(f_unaccent(${job.title})) like lower(f_unaccent(${pattern})) escape '\\' or lower(f_unaccent(${job.number})) like lower(f_unaccent(${pattern})) escape '\\')`
        : undefined,
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
        phase: job.phase,
        stageName: schema.pipelineStage.name,
        stageColor: schema.pipelineStage.color,
        managerName: schema.user.name,
        value: money ? job.sumContractMinor : sql<number>`0`,
        lostReason: job.lostReason,
        lostNote: job.crmLostNote,
        archivedAt: job.crmArchivedAt,
        phaseChangedAt: job.phaseChangedAt,
        wonAt: job.wonAt,
      })
      .from(job)
      .leftJoin(company, eq(company.id, job.companyId))
      .leftJoin(schema.user, eq(schema.user.id, job.managerId))
      .leftJoin(schema.pipelineStage, eq(schema.pipelineStage.id, job.stageId))
      .where(where)
      .orderBy(
        sql`greatest(coalesce(${job.crmArchivedAt}, 'epoch'::timestamptz), coalesce(${job.phaseChangedAt}, 'epoch'::timestamptz)) desc`,
        desc(job.number),
      )
      .limit(input.limit)
      .offset(input.offset);

    const reasons = new Map(
      (await getLookup(ctx.db, LOST_REASON_LOOKUP)).map((r) => [r.value, r.label]),
    );
    return {
      total: count?.n ?? 0,
      money,
      rows: rows.map((r) => ({
        id: r.id,
        number: r.number,
        title: r.title,
        companyName: r.companyName ?? null,
        phase: r.phase,
        stageName: r.stageName ?? null,
        stageColor: r.stageColor ?? null,
        managerName: r.managerName ?? null,
        valueMinor: money ? Number(r.value) : null,
        lostReason: r.lostReason ? (reasons.get(r.lostReason) ?? r.lostReason) : null,
        lostNote: r.lostNote ?? null,
        archivedAt: r.archivedAt?.toISOString() ?? null,
        closedAt:
          r.phase === "lost"
            ? (r.phaseChangedAt?.toISOString() ?? null)
            : (r.wonAt ?? r.phaseChangedAt?.toISOString() ?? null),
      })),
    };
  },
});
