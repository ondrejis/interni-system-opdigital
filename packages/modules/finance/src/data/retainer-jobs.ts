import { z } from "zod";
import { defineModuleJob } from "@rebar/core/module-server";
import { sourceCtx } from "@rebar/core/rbac";
import { generateAllRetainers } from "./retainer";

/** Měsíční úloha: každý 1. v 5:00 založí plánované platby „Retainer MM/RRRR“ (ZAK-15); idempotentní. */
export const retainerGenerateJob = defineModuleJob({
  name: "finance.retainer.generate",
  schema: z.object({}),
  cron: "0 5 1 * *",
  retryLimit: 5,
  handler: async (deps) => {
    await generateAllRetainers(sourceCtx(deps.db, "job", "Retainer"), deps);
  },
});

/** Denní záloha téže úlohy: dožene zameškaný měsíc (výpadek, pozdní spuštění). Výsledek je stejný, nic se nezdvojí. */
export const retainerCatchupJob = defineModuleJob({
  name: "finance.retainer.catchup",
  schema: z.object({}),
  cron: "30 5 * * *",
  retryLimit: 3,
  handler: async (deps) => {
    await generateAllRetainers(sourceCtx(deps.db, "job", "Retainer"), deps);
  },
});
