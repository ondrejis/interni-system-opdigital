import { eq } from "drizzle-orm";
import type { MarketingStage } from "@rebar/core/contracts";
import { recordAudit } from "@rebar/core/audit";
import { inTx, UserError, type Ctx } from "@rebar/core/rbac";
import { job } from "../schema";
import { MARKETING_STAGE_LABELS } from "../shared";
import { loadJob } from "./lookups";
import { moveToRoleTx } from "./phases";

/**
 * Nastaví fázi marketingové zakázky (`intro` → `decision` → `retainer` → `ended`); volá finance po vyhodnocení
 * úvodní fáze a po rozhodnutí klienta. Stav `retainer` přesune zakázku do fáze s rolí Retainer (dřívější fáze se
 * dokončí). Ukončení zakázky (`ended`) zůstává na volajícím: `completeJob` s důvodem `retainer_ended`.
 * Oprávnění k úpravě řeší volající příkaz (finance), tady se kontroluje jen viditelnost zakázky.
 */
export async function setMarketingStageImpl(
  ctx: Ctx,
  jobId: string,
  stage: MarketingStage,
): Promise<void> {
  await inTx(ctx, async (c) => {
    const j = await loadJob(c, jobId, { lock: true });
    if (j.type !== "marketing") throw new UserError("Fázi marketingu má jen marketingová zakázka.");
    if (j.marketingStage === stage) return;
    await c.db
      .update(job)
      .set({ marketingStage: stage, updatedBy: c.actor.userId })
      .where(eq(job.id, j.id));
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: j.id,
      summary: `Marketing: ${MARKETING_STAGE_LABELS[stage]}`,
      entityTitle: `${j.number} ${j.title}`,
      isPrivate: j.isPrivate,
      changes: [
        {
          field: "Fáze marketingu",
          old: j.marketingStage ? MARKETING_STAGE_LABELS[j.marketingStage] : null,
          new: MARKETING_STAGE_LABELS[stage],
        },
      ],
    });
    if (stage === "retainer") await moveToRoleTx(c, { ...j, marketingStage: stage }, "retainer");
  });
}
