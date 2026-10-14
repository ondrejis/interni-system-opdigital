import { stageHooksFor } from "@rebar/core/entities";
import type { Ctx } from "@rebar/core/rbac";

/**
 * Oznámí hookům (`afterChange`), že se změnily údaje zakázky, ze kterých se počítají odvozené hodnoty CRM
 * (stav, cena, pravděpodobnost, archiv). Samostatný soubor bez dalších importů, aby ho mohl volat i přepočet souhrnu
 * zakázky (`costs`), aniž by vznikl cyklus balíčků.
 */
export async function runJobChangeHooks(
  ctx: Ctx,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  for (const h of stageHooksFor("job")) await h.afterChange?.(ctx, before, after);
}
