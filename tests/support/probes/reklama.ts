import { NONE, P, type Probe } from "./shared";

const PERIOD = { from: "2026-10-01", to: "2026-10-14" };

/** Vstupy příkazů: modul „reklama“. Každý příkaz modulu potřebuje záznam (`reklama.<akce>`: `P(() => ({…}), true)`). */
export const reklamaProbes: Record<string, Probe> = {
  "reklama.accounts.list": P(() => ({}), true),
  "reklama.account.detail": P(() => ({ accountId: NONE, period: PERIOD }), true),
  "reklama.campaign.detail": P(() => ({ campaignId: NONE, period: PERIOD }), true),
  "reklama.metrics": P(() => ({ period: PERIOD }), true),
  "reklama.forClient": P(() => ({ companyId: NONE, period: PERIOD }), true),
  "reklama.forJob": P(() => ({ jobId: NONE, period: PERIOD }), true),
  "reklama.account.setOwner": P(() => ({ accountId: NONE, ownerKind: "agency" }), true),
  "reklama.account.setActive": P(() => ({ accountId: NONE, active: true }), true),
  "reklama.campaign.assignJob": P(() => ({ campaignId: NONE, jobId: null }), true),
  "reklama.sync": P(() => ({}), true),
  "reklama.mappings.list": P(() => ({}), true),
  "reklama.mapping.save": P(
    () => ({ metaFormId: "1", name: "Probe", pipelineId: NONE, stageId: NONE, ownerId: NONE }),
    true,
  ),
  "reklama.mapping.delete": P(() => ({ id: NONE }), true),
  "reklama.leads.recent": P(() => ({}), true),
  "reklama.connection.get": P(() => ({}), true),
  "reklama.connection.save": P(() => ({ accessToken: "probe-token-0000" }), true),
  "reklama.connection.test": P(() => ({}), true),
  "reklama.connection.remove": P(() => ({}), true),
};
