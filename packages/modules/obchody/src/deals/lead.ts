import { and, eq, isNull } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { schema } from "@rebar/core/db";
import { emitDomain } from "@rebar/core/events";
import { indexRecord } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx, UserError, type Ctx } from "@rebar/core/rbac";
import type { CreateDealFromLeadInput } from "../api";
import { deal } from "../schema";
import { DEAL_PIPELINE } from "../shared";
import { dealSnap, loadStage } from "./common";
import { enterStage } from "./history";

/**
 * Založí obchod z Meta leadu (volá `reklama` z ingestu `leads`). Idempotentní podle `meta.leadgenId`: druhé volání
 * vrátí existující obchod (`created=false`) a nic nezapíše, i při souběhu (unikátní index). Obchod padá do fáze
 * z mapování formuláře (musí patřit do pipeline obchodů), má zdroj Meta, kampaň, sadu a reklamu a je „neotevřený“
 * (zvýrazněný na boardu, dokud ho někdo neotevře, R-42). Vlastníka a služby bere z mapování.
 */
export async function createDealFromLead(
  ctx: Ctx,
  deps: ModuleDeps,
  input: CreateDealFromLeadInput,
): Promise<{ dealId: string; created: boolean }> {
  return inTx(ctx, async (c) => {
    const existing = async () => {
      const [r] = await c.db
        .select({ id: deal.id })
        .from(deal)
        .where(eq(deal.metaLeadgenId, input.meta.leadgenId));
      return r?.id ?? null;
    };
    const found = await existing();
    if (found) return { dealId: found, created: false };

    const stage = await loadStage(c.db, input.formMapping.stageId);
    if (!stage || stage.pipelineId !== input.formMapping.pipelineId)
      throw new UserError("Fáze z mapování formuláře nepatří do zadané pipeline obchodů.");
    const [pl] = await c.db
      .select({ entityType: schema.pipeline.entityType })
      .from(schema.pipeline)
      .where(and(eq(schema.pipeline.id, stage.pipelineId), isNull(schema.pipeline.deletedAt)));
    if (pl?.entityType !== DEAL_PIPELINE.entityType)
      throw new UserError("Pipeline z mapování formuláře není pipeline obchodů.");

    const now = new Date();
    const [row] = await c.db
      .insert(deal)
      .values({
        title: input.title,
        companyId: input.companyId,
        personId: input.personId,
        stageId: stage.id,
        stageEnteredAt: now,
        result: "open",
        weightedMinor: null,
        services: input.formMapping.services,
        ownerId: input.formMapping.ownerId,
        source: "meta",
        sourceDetail: input.meta.campaignName ?? null,
        metaCampaignId: input.meta.campaignId ?? null,
        metaAdsetId: input.meta.adsetId ?? null,
        metaAdId: input.meta.adId ?? null,
        metaLeadgenId: input.meta.leadgenId,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const again = await existing();
      if (again) return { dealId: again, created: false };
      throw new UserError("Obchod z leadu se nepodařilo založit.");
    }
    await enterStage(c.db, {
      dealId: row.id,
      fromStageId: null,
      toStageId: stage.id,
      at: now,
      byUserId: c.actor.userId,
    });
    await recordAudit(c, {
      action: "create",
      entityType: "deal",
      entityId: row.id,
      summary: row.title,
      entityTitle: row.title,
      changes: [
        { field: "Název", old: null, new: row.title },
        { field: "Zdroj", old: null, new: "Meta (formulář)" },
        ...(input.meta.campaignName
          ? [{ field: "Detail zdroje", old: null, new: input.meta.campaignName }]
          : []),
      ],
    });
    const def = deps.registry.get("deal");
    if (def) await indexRecord(c.db, { def } as never, row as unknown as Record<string, unknown>);
    await emitDomain(
      c,
      "deal.created",
      { deal: dealSnap(row) },
      { entity: { type: "deal", id: row.id, isPrivate: row.isPrivate } },
    );
    return { dealId: row.id, created: true };
  });
}
