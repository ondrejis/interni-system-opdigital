import { defineNotificationEvent } from "@rebar/core/manifest";

/*
  Upozornění oblasti Aktivity (ADR 024). Čistá data bez serverových závislostí, aby je směl číst manifest v prohlížeči.
  Příjemce musí smět číst aktivitu (rozsah „jen moje“ = přiřazeno mně nebo vlastník zakázky); ranní souhrny a hlídání
  zakázek jsou plánované úlohy (`jobs.ts`), idempotentní přes `dedupe: "day"`.
*/

const GROUP = "CRM";

/** Někdo naplánoval nebo přidělil aktivitu jinému člověku. */
export const CRM_ACTIVITY_ASSIGNED = defineNotificationEvent({
  key: "crm.activity_assigned",
  label: "Přidělena aktivita",
  description: "Někdo vám naplánoval nebo přidělil aktivitu (hovor, schůzku, úkol, obhlídku…).",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { assignee: "Ten, komu je aktivita přidělena" },
  recipients: ["assignee"],
  params: {
    type: { label: "Typ aktivity", example: "Hovor" },
    subject: { label: "Předmět", example: "Zavolat investorovi" },
    due: { label: "Termín", example: "Dnes 14:30" },
    deal: { label: "Zakázka", example: "Rekonstrukce koupelny" },
  },
  template: {
    title: "{type}: {subject}",
    body: "Termín: {due}\n{deal}",
    url: "/crm/dnes",
  },
  entity: "crm_activity",
  dedupe: "none",
});

/** Ranní souhrn: aktivity na dnešek a po termínu. */
export const CRM_ACTIVITIES_TODAY = defineNotificationEvent({
  key: "crm.activities_today",
  label: "Aktivity na dnešek",
  description:
    "Ráno vám přijde přehled aktivit s dnešním termínem a těch, které jsou po termínu (hovory, schůzky, úkoly…).",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { assignee: "Ten, komu jsou aktivity přiděleny" },
  recipients: ["assignee"],
  params: {
    summary: { label: "Počty", example: "3 aktivity na dnes, 1 po termínu" },
    list: { label: "Výčet aktivit", example: "Zavolat Novákovi · Obhlídka Husova 12" },
  },
  template: { title: "Dnes: {summary}", body: "{list}", url: "/crm/dnes" },
  access: "poptavky.read",
  dedupe: "day",
  scheduled: true,
  snooze: true,
});

/** Zakázky v obchodní fázi bez naplánované další aktivity. */
export const CRM_DEALS_WITHOUT_ACTIVITY = defineNotificationEvent({
  key: "crm.deals_without_activity",
  label: "Zakázky bez další aktivity",
  description:
    "Ráno vám přijde přehled vašich otevřených obchodů, které nemají naplánovanou žádnou další aktivitu.",
  group: GROUP,
  severity: "normal",
  channels: { push: false, bell: true },
  audiences: { owner: "Vedoucí zakázky (obchodník)" },
  recipients: ["owner"],
  params: {
    summary: { label: "Počet", example: "2 zakázky bez další aktivity" },
    list: { label: "Výčet zakázek", example: "Rekonstrukce koupelny · Střecha Novák" },
  },
  template: { title: "{summary}", body: "{list}", url: "/crm" },
  access: "poptavky.read",
  dedupe: "day",
  scheduled: true,
  snooze: true,
});

/** Zakázky, které začaly „hnít“ (dlouho bez pohybu). */
export const CRM_DEALS_ROTTING = defineNotificationEvent({
  key: "crm.deals_rotting",
  label: "Zakázky, které hnijí",
  description:
    "Obchod ve vašem vedení dlouho nepostoupil ani se u něj neudála žádná aktivita (limit dnů nastavuje stav).",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { owner: "Vedoucí zakázky (obchodník)" },
  recipients: ["owner"],
  params: {
    summary: { label: "Počet", example: "2 zakázky hnijí" },
    list: { label: "Výčet zakázek", example: "Rekonstrukce koupelny · Střecha Novák" },
  },
  template: { title: "{summary}", body: "{list}", url: "/crm" },
  access: "poptavky.read",
  dedupe: "day",
  scheduled: true,
});

export const CRM_ACTIVITY_NOTIFICATIONS = [
  CRM_ACTIVITY_ASSIGNED,
  CRM_ACTIVITIES_TODAY,
  CRM_DEALS_WITHOUT_ACTIVITY,
  CRM_DEALS_ROTTING,
];
