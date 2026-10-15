"use server";

import { z } from "zod";
import { reprocessInbound } from "@rebar/core/ingest";
import { retryAllFailed, retryDelivery } from "@rebar/core/webhooks";
import { defineAction } from "@/server/request";
import { getServices } from "@/server/services";

/*
  Server actions stránky Nastavení → Systém: jen ruční opakování chybných věcí (doručení webhooků, příchozí události
  z n8n). Vše vyžaduje vlastníka (`settings.manage`); samotné funkce jádra navíc hlídají `settings.integrations`.
  Nic tu neposílá e-maily ani upozornění.
*/

const PERMISSION = "settings.manage";
const id = z.uuid();

/** Znovu odešle jedno chybné doručení webhooku (hned); vrací výsledek pokusu. */
export const retrySystemDeliveryAction = defineAction({
  permission: PERMISSION,
  input: z.object({ id }),
  handler: async (ctx, i) =>
    (await retryDelivery(ctx, { cipher: getServices().cipher }, i.id)) ?? null,
});

/** Vrátí všechna chybná doručení do fronty (odešle je worker do minuty); vrací jejich počet. */
export const retryAllSystemDeliveriesAction = defineAction({
  permission: PERMISSION,
  input: z.object({}),
  handler: async (ctx) => ({ count: await retryAllFailed(ctx) }),
});

/** Znovu zpracuje selhanou příchozí událost z n8n z uloženého těla; vrací, zda se povedlo. */
export const reprocessSystemInboundAction = defineAction({
  permission: PERMISSION,
  input: z.object({ id }),
  handler: async (_ctx, i) => {
    const s = getServices();
    const r = await reprocessInbound(
      { db: s.db, ingests: s.collected.ingests, deps: s.moduleDeps },
      i.id,
    );
    return { ok: r.status === 200 };
  },
});
