import { defineNotificationEvent } from "@rebar/core/manifest";

/*
  Události upozornění modulu Stroje a vozidla (katalog viz @rebar/core/notifications). Čistá data, bezpečná pro prohlížeč.
  Odkaz vede na kartu stroje (`{entityId}` = id stroje), u závad na detail závady.
  Příjemce, který stroj nesmí číst (`stroje.read`, u rozsahu „jen moje“ jen odpovědná osoba), upozornění nedostane.
*/

const GROUP = "Stroje a vozidla";
const ASSET_URL = "/stroje/evidence/{entityId}";

/** Blíží se STK, pojištění, známka nebo servisní interval (30 dní předem). */
export const STROJE_DEADLINE = defineNotificationEvent({
  key: "stroje.deadline",
  label: "Blíží se termín stroje",
  description:
    "Za 30 dní vyprší STK, ručení nebo známka, nebo se blíží servisní interval. Dostane ho odpovědná osoba a správci vozového parku.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { responsible: "Osoba odpovědná za stroj" },
  recipients: ["responsible", "perm:stroje.write"],
  params: {
    asset: { label: "Stroj", example: "Dodávka Iveco" },
    what: { label: "Co se blíží", example: "STK a emise za 28 dní" },
    detail: { label: "Podrobnosti", example: "STK a emise platí do 4. 11. 2026. SPZ 1A2 3456." },
  },
  template: { title: "{asset}: {what}", body: "{detail}", url: ASSET_URL },
  entity: "asset",
  scheduled: true,
});

/** Termín je za týden nebo už prošel; servisní interval je překročený. */
export const STROJE_DEADLINE_URGENT = defineNotificationEvent({
  key: "stroje.deadline_urgent",
  label: "Termín stroje je za dveřmi",
  description:
    "STK, ručení nebo známka vyprší do týdne nebo už vypršely, nebo je překročený servisní interval. Dostane ho odpovědná osoba a správci vozového parku.",
  group: GROUP,
  severity: "urgent",
  channels: { push: true, bell: true },
  audiences: { responsible: "Osoba odpovědná za stroj" },
  recipients: ["responsible", "perm:stroje.write"],
  params: {
    asset: { label: "Stroj", example: "Dodávka Iveco" },
    what: { label: "Co se blíží", example: "STK a emise za 5 dní" },
    detail: { label: "Podrobnosti", example: "STK a emise platí do 4. 11. 2026. SPZ 1A2 3456." },
  },
  template: { title: "{asset}: {what}", body: "{detail}", url: ASSET_URL },
  entity: "asset",
  scheduled: true,
  snooze: true,
});

/** Tankování se spotřebou o 30 % nad průměrem. */
export const STROJE_FUEL = defineNotificationEvent({
  key: "stroje.fuel",
  label: "Neobvyklá spotřeba",
  description:
    "Tankování ukázalo spotřebu aspoň o 30 % nad průměrem stroje. Dostanou ho správci vozového parku.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: {},
  recipients: ["perm:stroje.write"],
  params: {
    asset: { label: "Stroj", example: "Dodávka Iveco" },
    consumption: { label: "Spotřeba při tomto tankování", example: "12,0 l/100 km" },
    usual: { label: "Obvyklá spotřeba", example: "7,0 l/100 km" },
    who: { label: "Kdo tankoval", example: "Jan Řidič" },
  },
  template: {
    title: "Neobvyklá spotřeba: {asset}",
    body: "{consumption}, obvykle {usual}.\nTankoval(a) {who}.",
    url: ASSET_URL,
  },
  entity: "asset",
});

/** Stroj byl rezervován na obsluhu. */
export const STROJE_RESERVATION = defineNotificationEvent({
  key: "stroje.reservation",
  label: "Stroj je pro vás rezervovaný",
  description: "Někdo vám rezervoval stroj nebo vozidlo (nebo rezervaci upravil).",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { driver: "Obsluha, které je stroj rezervován" },
  recipients: ["driver"],
  params: {
    asset: { label: "Stroj", example: "Bagr JCB" },
    when: { label: "Kdy", example: "12. 10. 2026 – 14. 10. 2026" },
    detail: { label: "Zakázka nebo poznámka", example: "Výkopy" },
  },
  template: { title: "{asset} je váš {when}", body: "{detail}", url: ASSET_URL },
  entity: "asset",
});

/** Den předem: zítra začíná rezervace stroje. */
export const STROJE_RESERVATION_TOMORROW = defineNotificationEvent({
  key: "stroje.reservation_tomorrow",
  label: "Zítra máte rezervovaný stroj",
  description: "Odpoledne před začátkem rezervace vám připomene, že zítra máte stroj nebo vozidlo.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { driver: "Obsluha, které je stroj rezervován" },
  recipients: ["driver"],
  params: {
    asset: { label: "Stroj", example: "Bagr JCB" },
    detail: { label: "Poznámka k rezervaci", example: "Výkopy" },
  },
  template: { title: "Zítra: {asset}", body: "{detail}", url: ASSET_URL },
  entity: "asset",
  scheduled: true,
});

/** Nahlášena závada (stroj zůstává v provozu). */
export const STROJE_DEFECT = defineNotificationEvent({
  key: "stroje.defect",
  label: "Nahlášena závada",
  description: "Někdo z terénu nahlásil závadu stroje. Dostane ji řešitel a odpovědná osoba.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: {
    assignee: "Řešitel závady",
    responsible: "Osoba odpovědná za stroj",
  },
  recipients: ["assignee", "responsible"],
  params: {
    asset: { label: "Stroj", example: "Bagr JCB" },
    defect: { label: "Popis závady", example: "Netěsní hydraulika" },
    reporter: { label: "Kdo závadu nahlásil", example: "Jan Řidič" },
  },
  template: {
    title: "Závada: {asset}",
    body: "{defect} · nahlásil(a) {reporter}",
    url: "/stroje/zavady/{entityId}",
  },
  entity: "asset_defect",
});

/** Nahlášena blokující závada: stroj je mimo provoz. */
export const STROJE_DEFECT_BLOCKING = defineNotificationEvent({
  key: "stroje.defect_blocking",
  label: "Stroj mimo provoz",
  description:
    "Nahlášená závada stroj odstavila z provozu. Dostane ji řešitel, odpovědná osoba a všichni správci vozového parku.",
  group: GROUP,
  severity: "urgent",
  channels: { push: true, bell: true },
  audiences: {
    assignee: "Řešitel závady",
    responsible: "Osoba odpovědná za stroj",
  },
  recipients: ["assignee", "responsible", "perm:stroje.write"],
  params: {
    asset: { label: "Stroj", example: "Bagr JCB" },
    defect: { label: "Popis závady", example: "Netěsní hydraulika" },
    reporter: { label: "Kdo závadu nahlásil", example: "Jan Řidič" },
  },
  template: {
    title: "Stroj mimo provoz: {asset}",
    body: "{defect} · nahlásil(a) {reporter}",
    url: "/stroje/zavady/{entityId}",
  },
  entity: "asset_defect",
});

/** Závada byla vyřešena: zpráva tomu, kdo ji nahlásil. */
export const STROJE_DEFECT_RESOLVED = defineNotificationEvent({
  key: "stroje.defect_resolved",
  label: "Závada opravena",
  description: "Závada, kterou jste nahlásili, je vyřešená.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { reporter: "Ten, kdo závadu nahlásil" },
  recipients: ["reporter"],
  params: {
    asset: { label: "Stroj", example: "Bagr JCB" },
    detail: { label: "Jak byla vyřešena", example: "Vyměněno těsnění" },
  },
  template: {
    title: "Opraveno: {asset}",
    body: "{detail}",
    url: "/stroje/zavady/{entityId}",
  },
  entity: "asset_defect",
});

export const strojeNotifications = [
  STROJE_DEADLINE,
  STROJE_DEADLINE_URGENT,
  STROJE_FUEL,
  STROJE_RESERVATION,
  STROJE_RESERVATION_TOMORROW,
  STROJE_DEFECT,
  STROJE_DEFECT_BLOCKING,
  STROJE_DEFECT_RESOLVED,
];
