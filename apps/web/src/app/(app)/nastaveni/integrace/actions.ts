"use server";

import { z } from "zod";
import { reprocessInbound, rotateIngestSecret } from "@rebar/core/ingest";
import {
  createEndpoint,
  deleteEndpoint,
  retryAllFailed,
  retryDelivery,
  rotateEndpointSecret,
  sendTestDelivery,
  updateEndpoint,
  getDeliveryPayload,
} from "@rebar/core/webhooks";
import { defineAction } from "@/server/request";
import { getServices } from "@/server/services";

/*
  Server actions stránky Nastavení → Integrace. Oprávnění `settings.integrations` kontroluje i samotná služba v jádru;
  `permission` zde jen zkrátí zbytečné zpracování. Tajemství (webhooku, příchozích požadavků) se vrací jen z akcí, které
  je vytvářejí nebo vyměňují, a stránka je ukáže jednou.
*/

const PERMISSION = "settings.integrations";
const id = z.uuid();
const endpointInput = z.object({
  name: z.string().max(200),
  url: z.string().max(2000),
  events: z.array(z.string().max(80)).max(60),
  includePrivate: z.boolean(),
});

/** Přidá webhook; vrací tajemství podpisu (zobrazí se jen teď). */
export const createEndpointAction = defineAction({
  permission: PERMISSION,
  input: endpointInput,
  handler: (ctx, i) => createEndpoint(ctx, getServices().cipher, i),
});

/** Upraví webhook (adresa, události, soukromá data, zapnutí). */
export const updateEndpointAction = defineAction({
  permission: PERMISSION,
  input: endpointInput.extend({ id, active: z.boolean() }),
  handler: async (ctx, { id: endpointId, ...rest }) => {
    await updateEndpoint(ctx, endpointId, rest);
  },
});

/** Vymění tajemství podpisu webhooku; vrací nové (zobrazí se jen teď). */
export const rotateEndpointSecretAction = defineAction({
  permission: PERMISSION,
  input: z.object({ id }),
  handler: (ctx, i) => rotateEndpointSecret(ctx, getServices().cipher, i.id),
});

/** Smaže webhook. */
export const deleteEndpointAction = defineAction({
  permission: PERMISSION,
  input: z.object({ id }),
  handler: async (ctx, i) => {
    await deleteEndpoint(ctx, i.id);
  },
});

/** „Odeslat test“: zkušební požadavek hned, bez opakování; vrací výsledek pro zobrazení. */
export const testEndpointAction = defineAction({
  permission: PERMISSION,
  input: z.object({ id }),
  handler: (ctx, i) => sendTestDelivery(ctx, { cipher: getServices().cipher }, i.id),
});

/** Ručně znovu odešle chybné doručení (hned) a vrací výsledek. */
export const retryDeliveryAction = defineAction({
  permission: PERMISSION,
  input: z.object({ id }),
  handler: async (ctx, i) => (await retryDelivery(ctx, { cipher: getServices().cipher }, i.id)) ?? null,
});

/** Vrátí všechna chybná doručení (volitelně jednoho webhooku) do fronty; odešle je worker. Vrací jejich počet. */
export const retryAllFailedAction = defineAction({
  permission: PERMISSION,
  input: z.object({ endpointId: id.optional() }),
  handler: async (ctx, i) => ({ count: await retryAllFailed(ctx, { endpointId: i.endpointId }) }),
});

/** Tělo doručené zprávy ke kontrole (soukromé jen s oprávněním `private.read`). */
export const deliveryPayloadAction = defineAction({
  permission: PERMISSION,
  input: z.object({ id }),
  handler: async (ctx, i) => ({ json: JSON.stringify(await getDeliveryPayload(ctx, i.id), null, 2) }),
});

/** Nové tajemství příchozích požadavků; vrací ho (zobrazí se jen teď). Staré platí 24 h, nebo skončí hned. */
export const rotateIngestSecretAction = defineAction({
  permission: PERMISSION,
  input: z.object({ revokeOld: z.boolean() }),
  handler: (ctx, i) => rotateIngestSecret(ctx, getServices().cipher, { revokeOld: i.revokeOld }),
});

/** Znovu zpracuje selhanou příchozí událost z uloženého těla; vrací, zda se povedlo (důvod je v seznamu). */
export const reprocessInboundAction = defineAction({
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
