import { and, gt, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { defineModuleJob, type AttentionItem, type ModuleServer } from "@rebar/core/module-server";
import { inTx, scopeOf, systemCtx } from "@rebar/core/rbac";
import { job } from "../schema";
import { recomputeJobSummary } from "./api";
import { commands } from "./commands";

/** Fáze, ve kterých zakázka ještě nese náklady a souhrn se přepočítává i bez ruční změny. */
const ACTIVE_PHASES = ["preparation", "execution", "handover", "warranty", "paused"];

/**
 * Oblast „costs“ modulu Zakázky (ADR 015): Náklady a párování: ruční náklady, přiřazení automatických nákladů na oddíly, plán vs skutečnost, souhrn zakázky.
 * Do této složky píše jen její vlastník; ostatní oblasti volají jen to, co odsud exportuje `api.ts`.
 */
export const area: ModuleServer = {
  commands,
  attention: [
    async (ctx) => {
      // jen kdo vidí ekonomiku všech zakázek (majitel, kancelář)
      if (scopeOf(ctx, "zakazky.economics") !== "all") return [];
      const rows = await ctx.db
        .select({ id: job.id, number: job.number, title: job.title, n: job.sumUnpairedCount })
        .from(job)
        .where(
          and(
            isNull(job.deletedAt),
            gt(job.sumUnpairedCount, 0),
            inArray(job.phase, ["execution", "handover", "warranty"]),
          ),
        )
        .limit(8);
      return rows.map((r): AttentionItem => ({
        id: `unpaired-costs-${r.id}`,
        module: "zakazky",
        severity: "warning",
        title: `${r.number}: nespárované náklady (${r.n})`,
        detail: `${r.title} · přiřaďte je k oddílu rozpočtu, jinak nejde spočítat plán vs skutečnost`,
        href: `/zakazky/${r.id}?tab=naklady`,
      }));
    },
  ],
  jobs: [
    // Docházka, sklad a stroje se mění mimo zakázky, proto se souhrn jednou denně srovná se živými daty.
    defineModuleJob({
      name: "zakazky.summary.refresh",
      schema: z.object({}),
      cron: "20 3 * * *",
      retryLimit: 1,
      async handler(deps) {
        const jobs = await deps.db
          .select({ id: job.id })
          .from(job)
          // + zakázky, jejichž souhrn nikdy nikdo nepočítal (založené před zavedením souhrnu, přenesené migrací):
          // bez toho by uzavřená zakázka ukazovala v seznamu nuly, dokud ji někdo neotevře
          .where(
            and(isNull(job.deletedAt), or(inArray(job.phase, ACTIVE_PHASES), isNull(job.sumAt))),
          );
        const ctx = systemCtx(deps.db);
        for (const j of jobs) {
          try {
            await inTx(ctx, (c) => recomputeJobSummary(c, j.id));
          } catch {
            // jedna rozbitá zakázka nesmí zastavit ostatní
          }
        }
      },
    }),
  ],
};
