import { z } from "zod";
import { defineModuleJob } from "@rebar/core/module-server";
import { UserError } from "@rebar/core/rbac";
import type { SyncSummary } from "../contract";
import { syncMeta } from "./sync";

/*
  Denní stažení dat z Meta (REK-07): `reklama.sync.daily` každý den v 6:00 (Europe/Prague). Přepíše dnešek a posledních
  7 dní (viz `syncMeta`). Bez napojení na Meta úloha nic nedělá (není co stahovat), chyba všech účtů znamená opakování
  (pg-boss), chyba části účtů ne (je vidět u účtu jako `last_sync_error`).
*/

/** Úloha na pozadí: denní synchronizace s Meta Ads. */
export const syncDailyJob = defineModuleJob({
  name: "reklama.sync.daily",
  schema: z.object({ accountId: z.uuid().optional() }),
  cron: "0 6 * * *",
  retryLimit: 3,
  handler: async (deps, data) => {
    let summary: SyncSummary;
    try {
      summary = await syncMeta(deps.db, deps, { accountId: data.accountId });
    } catch (err) {
      if (err instanceof UserError) return; // Meta není napojená
      throw err;
    }
    if (summary.errors.length && summary.accounts === 0)
      throw new Error(`Synchronizace Meta selhala: ${summary.errors[0]!.message}`);
  },
});

/** Úlohy modulu „reklama“. */
export const jobs = [syncDailyJob];
