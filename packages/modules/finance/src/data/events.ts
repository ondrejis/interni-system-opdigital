import type { DomainEventHandler } from "@rebar/core/events";
import { setMarketingStage } from "@rebar/zakazky/api";

/**
 * Po dokončení fáze „Vyhodnocení úvodní fáze“ marketingové zakázky přejde zakázka do rozhodnutí (Pokračovat na retainer /
 * Ukončit). Idempotentní: jen když je zakázka ještě v úvodní fázi.
 */
export const onPhaseCompleted: DomainEventHandler<"project.phase_completed"> = async (
  ctx,
  event,
) => {
  const d = event.data;
  if (d.role !== "intro_evaluation" || d.type !== "marketing" || d.marketingStage !== "intro")
    return;
  await setMarketingStage(ctx, d.jobId, "decision");
};
