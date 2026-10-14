import { defineNotificationEvent } from "@rebar/core/manifest";

/*
  Události upozornění modulu Zakázky (katalog jádra, ADR o upozorněních). Čistá data bez serverových závislostí,
  proto je smí číst i manifest v prohlížeči. Vyvolávají se přes `notify` / `notifyJobTeam` uvnitř transakce změny.
*/

const GROUP = "Zakázky";

/**
 * Skupiny příjemců pro události, které jdou přes `notifyJobTeam` (viz `team.ts`): vedoucí a členové týmu zakázky
 * (bez toho, kdo změnu udělal) a další zainteresovaní, které volající doplní (odpovědný za vadu…).
 */
export const JOB_TEAM_AUDIENCES = {
  team: "Vedoucí a tým zakázky",
  extra: "Další zainteresovaní (odpovědný, fakturace…)",
} as const;

/** Člověk, kterého někdo přidal do týmu zakázky. */
export const JOB_TEAM = defineNotificationEvent({
  key: "job.team",
  label: "Přidání do týmu zakázky",
  description: "Někdo vás přidal do týmu zakázky.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { member: "Ten, kdo byl přidán do týmu" },
  recipients: ["member"],
  params: {
    number: { label: "Číslo zakázky", example: "Z-2026-014" },
    title: { label: "Název zakázky", example: "Rekonstrukce koupelny" },
    role: { label: "Role v týmu", example: "montér" },
  },
  template: {
    title: "Jste v týmu zakázky {number}",
    body: "{title}\nRole: {role}",
    url: "/zakazky/{entityId}",
  },
  entity: "job",
});

/** Doklad čeká na schválení. Příjemci jsou ti, kdo o něm podle pravidel smějí rozhodnout. */
export const APPROVAL_REQUEST = defineNotificationEvent({
  key: "approval.request",
  label: "Doklad čeká na schválení",
  description:
    "Někdo poslal ke schválení změnu (vícepráci), soupis prací, objednávku nebo přijatou fakturu a vy o ní smíte rozhodnout.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { approvers: "Ti, kdo smějí o dokladu rozhodnout" },
  recipients: ["approvers"],
  params: {
    kind: { label: "Druh dokladu", example: "Změna" },
    number: { label: "Číslo zakázky", example: "Z-2026-014" },
    document: { label: "Doklad", example: "VP-3 Dodatečné rozvody" },
    amount: { label: "Částka bez DPH", example: "52 000 Kč", sensitive: "money" },
  },
  template: {
    title: "{kind} ke schválení · {number}",
    body: "{document}\nČástka: {amount}",
    url: "/zakazky/schvalovani",
  },
  access: ["zakazky.approve", "zakazky.approve_all"],
  snooze: true,
});

/** Doklad, který jste poslali ke schválení, je schválený. */
export const APPROVAL_APPROVED = defineNotificationEvent({
  key: "approval.approved",
  label: "Váš doklad byl schválen",
  description: "Doklad, který jste poslali ke schválení, někdo schválil.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { requester: "Ten, kdo doklad poslal ke schválení" },
  recipients: ["requester"],
  params: {
    number: { label: "Číslo zakázky", example: "Z-2026-014" },
    document: { label: "Doklad", example: "VP-3 Dodatečné rozvody" },
    comment: { label: "Poznámka schvalovatele", example: "Souhlasím" },
  },
  template: {
    title: "Schváleno: {document}",
    body: "Zakázka {number}\nPoznámka: {comment}",
    url: "/zakazky/schvalovani",
  },
  entity: "job",
});

/** Doklad, který jste poslali ke schválení, je zamítnutý. */
export const APPROVAL_REJECTED = defineNotificationEvent({
  key: "approval.rejected",
  label: "Váš doklad byl zamítnut",
  description: "Doklad, který jste poslali ke schválení, někdo zamítl (s důvodem).",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { requester: "Ten, kdo doklad poslal ke schválení" },
  recipients: ["requester"],
  params: {
    number: { label: "Číslo zakázky", example: "Z-2026-014" },
    document: { label: "Doklad", example: "VP-3 Dodatečné rozvody" },
    comment: { label: "Důvod zamítnutí", example: "Chybí rozpis materiálu" },
  },
  template: {
    title: "Zamítnuto: {document}",
    body: "Zakázka {number}\nDůvod: {comment}",
    url: "/zakazky/schvalovani",
  },
  entity: "job",
});

/** Soupis prací byl schválen: tým se to dozví, fakturace ví, co může fakturovat. */
export const JOB_STATEMENT_APPROVED = defineNotificationEvent({
  key: "job.statement.approved",
  label: "Soupis prací schválen",
  description:
    "Soupis prací zakázky byl schválen. Dostane ho vedoucí a tým zakázky a ti, kdo fakturují (částku vidí jen s právem na ekonomiku).",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: JOB_TEAM_AUDIENCES,
  recipients: ["team", "perm:fakturace.write"],
  params: {
    number: { label: "Číslo zakázky", example: "Z-2026-014" },
    statement: { label: "Soupis prací", example: "soupis č. 3" },
    amount: { label: "Částka k fakturaci", example: "393 960 Kč", sensitive: "money" },
  },
  template: {
    title: "{number}: {statement} je schválený",
    body: "K fakturaci: {amount}",
    url: "/zakazky/{entityId}?tab=fakturace",
  },
  entity: "job",
});

/** Soupis prací byl zamítnut. */
export const JOB_STATEMENT_REJECTED = defineNotificationEvent({
  key: "job.statement.rejected",
  label: "Soupis prací zamítnut",
  description: "Soupis prací zakázky byl zamítnut. Dostane ho vedoucí a tým zakázky.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: JOB_TEAM_AUDIENCES,
  recipients: ["team", "extra"],
  params: {
    number: { label: "Číslo zakázky", example: "Z-2026-014" },
    statement: { label: "Soupis prací", example: "soupis č. 3" },
    comment: { label: "Důvod zamítnutí", example: "Nesedí množství u obkladů" },
  },
  template: {
    title: "{number}: zamítnutý {statement}",
    body: "{comment}",
    url: "/zakazky/{entityId}?tab=fakturace",
  },
  entity: "job",
});

/** Změna (vícepráce, méněpráce) byla schválena: do rozpočtu a k fakturaci. */
export const JOB_CHANGE_APPROVED = defineNotificationEvent({
  key: "job.change.approved",
  label: "Vícepráce schválena",
  description:
    "Změna zakázky (vícepráce nebo méněpráce) byla schválena. Dostane ji vedoucí a tým zakázky a ti, kdo fakturují (částku vidí jen s právem na ekonomiku).",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: JOB_TEAM_AUDIENCES,
  recipients: ["team", "perm:fakturace.write"],
  params: {
    number: { label: "Číslo zakázky", example: "Z-2026-014" },
    kind: { label: "Druh změny", example: "vícepráce" },
    label: { label: "Označení změny", example: "VP-3" },
    changeTitle: { label: "Název změny", example: "Dodatečné rozvody" },
    amount: { label: "Dopad na cenu", example: "+52 000 Kč", sensitive: "money" },
  },
  template: {
    title: "{number}: schválená {kind}",
    body: "{label} {changeTitle}\nDopad: {amount}",
    url: "/zakazky/{entityId}?tab=zmeny",
  },
  entity: "job",
});

/** Změna (vícepráce, méněpráce) byla zamítnuta. */
export const JOB_CHANGE_REJECTED = defineNotificationEvent({
  key: "job.change.rejected",
  label: "Vícepráce zamítnuta",
  description:
    "Změna zakázky (vícepráce nebo méněpráce) byla zamítnuta. Dostane ji vedoucí a tým zakázky.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: JOB_TEAM_AUDIENCES,
  recipients: ["team", "extra"],
  params: {
    number: { label: "Číslo zakázky", example: "Z-2026-014" },
    label: { label: "Označení změny", example: "VP-3" },
    changeTitle: { label: "Název změny", example: "Dodatečné rozvody" },
    comment: { label: "Důvod zamítnutí", example: "Chybí rozpis materiálu" },
  },
  template: {
    title: "{number}: zamítnuto {label}",
    body: "{changeTitle}\nDůvod: {comment}",
    url: "/zakazky/{entityId}?tab=zmeny",
  },
  entity: "job",
});

/** Ráno v den zahájení: tým zakázky ví, že se dnes začíná. */
export const JOB_STARTS_TODAY = defineNotificationEvent({
  key: "zakazky.starts_today",
  label: "Zakázka dnes začíná",
  description:
    "V pracovní dny ráno: zakázka v přípravě nebo realizaci má dnes plánovaný začátek. Dostane ji vedoucí a tým zakázky.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { team: JOB_TEAM_AUDIENCES.team },
  recipients: ["team"],
  params: {
    number: { label: "Číslo zakázky", example: "Z-2026-014" },
    title: { label: "Název zakázky", example: "Rekonstrukce koupelny" },
    address: { label: "Adresa stavby", example: "Husova 12, Plzeň" },
  },
  template: {
    title: "Dnes začíná zakázka {number}",
    body: "{title}\n{address}",
    url: "/zakazky/{entityId}",
  },
  entity: "job",
  dedupe: "day",
  scheduled: true,
  snooze: true,
});

export const ZAKAZKY_NOTIFICATIONS = [
  JOB_TEAM,
  APPROVAL_REQUEST,
  APPROVAL_APPROVED,
  APPROVAL_REJECTED,
  JOB_STATEMENT_APPROVED,
  JOB_STATEMENT_REJECTED,
  JOB_CHANGE_APPROVED,
  JOB_CHANGE_REJECTED,
  JOB_STARTS_TODAY,
] as const;
