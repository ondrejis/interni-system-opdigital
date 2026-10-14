import type { PhaseTransitionHook } from "@rebar/core/entities";
import { recomputeJobCrm } from "./deals/recompute";
import { checkFieldRules } from "./field-rules";

/** Údaje zakázky, po jejichž změně se přepočítají odvozené hodnoty CRM (stav, cena, pravděpodobnost, archiv). */
const TRACKED = ["stageId", "phase", "valueMinor", "crmProbabilityPct", "crmArchivedAt"] as const;

/**
 * Hook CRM nad zakázkou (`phaseHooks` modulu):
 *  - `checkStage`: pravidla kvality polí „povinné od stavu“ při každé změně stavu, i uvnitř jedné fáze
 *  - `afterChange`: po změně stavu, ceny, pravděpodobnosti nebo archivu přepočítá `crm_*` sloupce zakázky
 *    (vstup do stavu, vážená hodnota, hnití). Při založení zakázky běží také (`before` je prázdné).
 */
export const crmHooks: PhaseTransitionHook[] = [
  {
    id: "crm.deal",
    entity: "job",
    to: ["*"],
    checkStage: (ctx, row, change) => checkFieldRules(ctx.db, row, change),
    afterChange: async (ctx, before, after) => {
      if (!TRACKED.some((k) => before[k] !== after[k])) return;
      await recomputeJobCrm(ctx, String(after.id));
    },
  },
];
