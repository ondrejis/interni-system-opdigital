import { defineNotificationEvent } from "@rebar/core/manifest";

/*
  Upozornění sledujícím zakázku (CRM, nástěnka). Čistá data bez serverových závislostí, aby je mohl číst manifest
  v prohlížeči. Vyvolává je hook `crm.followers` při změně stavu zakázky (viz `followers.ts`); příjemce je jen ten, kdo
  zakázku sleduje a smí ji číst (politika entity `job`), a ne ten, kdo změnu udělal. Odkaz otevře pop-up zakázky na nástěnce.
*/

const GROUP = "CRM";
const AUDIENCES = { followers: "Ti, kdo zakázku sledují" } as const;

/** Sledovaná zakázka se posunula do jiného stavu na nástěnce (uvnitř obchodních fází, bez výhry a prohry). */
export const CRM_DEAL_STAGE = defineNotificationEvent({
  key: "crm.deal_stage",
  label: "Sledovaná zakázka: změna stavu",
  description: "Zakázka, kterou sledujete, se posunula do jiného stavu na nástěnce.",
  group: GROUP,
  severity: "normal",
  channels: { push: false, bell: true },
  audiences: AUDIENCES,
  recipients: ["followers"],
  params: {
    number: { label: "Číslo zakázky", example: "Z-2026-014" },
    title: { label: "Název zakázky", example: "Rekonstrukce koupelny" },
    from: { label: "Původní stav", example: "Kontaktováno" },
    to: { label: "Nový stav", example: "Nabídka odeslána" },
  },
  template: {
    title: "{number}: {to}",
    body: "{title}\nPůvodně: {from}",
    url: "/crm?record={entityId}",
  },
  entity: "job",
  mergeWindowSeconds: 300,
});

/** Sledovaná zakázka je vyhraná. */
export const CRM_DEAL_WON = defineNotificationEvent({
  key: "crm.deal_won",
  label: "Sledovaná zakázka: vyhráno",
  description: "Zakázku, kterou sledujete, někdo označil jako vyhranou.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: AUDIENCES,
  recipients: ["followers"],
  params: {
    number: { label: "Číslo zakázky", example: "Z-2026-014" },
    title: { label: "Název zakázky", example: "Rekonstrukce koupelny" },
  },
  template: {
    title: "Vyhráno: {number}",
    body: "{title}",
    url: "/zakazky/{entityId}",
  },
  entity: "job",
});

/** Sledovaná zakázka je prohraná (s důvodem). */
export const CRM_DEAL_LOST = defineNotificationEvent({
  key: "crm.deal_lost",
  label: "Sledovaná zakázka: prohráno",
  description: "Zakázku, kterou sledujete, někdo označil jako prohranou.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: AUDIENCES,
  recipients: ["followers"],
  params: {
    number: { label: "Číslo zakázky", example: "Z-2026-014" },
    title: { label: "Název zakázky", example: "Rekonstrukce koupelny" },
    reason: { label: "Důvod prohry", example: "Cena" },
  },
  template: {
    title: "Prohráno: {number}",
    body: "{title}\nDůvod: {reason}",
    url: "/crm?record={entityId}",
  },
  entity: "job",
});

export const CRM_BOARD_NOTIFICATIONS = [CRM_DEAL_STAGE, CRM_DEAL_WON, CRM_DEAL_LOST];
