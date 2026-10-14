import { defineNotificationEvent } from "@rebar/core/manifest";

/*
  Události upozornění modulu Docházka (katalog viz @rebar/core/notifications). Čistá data, bezpečná pro prohlížeč.
  Žádná z nich neobsahuje peníze; příjemci se berou z oprávnění (`perm:`) nebo je dodá úloha / příkaz (`to`).
*/

const GROUP = "Docházka";

/** Zaměstnanec odeslal týdenní výkaz: schvalovatelé. */
export const TIME_SUBMITTED = defineNotificationEvent({
  key: "time.submitted",
  label: "Docházka ke schválení",
  description: "Někdo odeslal týdenní výkaz hodin ke schválení.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: {},
  recipients: ["perm:dochazka.approve"],
  params: {
    name: { label: "Zaměstnanec", example: "Petr Novák" },
    period: { label: "Týden", example: "2. 3. 2026 – 8. 3. 2026" },
    hours: { label: "Odpracováno", example: "40:00 h" },
  },
  template: {
    title: "Docházka ke schválení: {name}",
    body: "{period} · {hours}",
    url: "/dochazka/schvalovani",
  },
  access: "dochazka.approve",
});

export const TIME_APPROVED = defineNotificationEvent({
  key: "time.approved",
  label: "Docházka schválena",
  description: "Vedoucí schválil váš týdenní výkaz hodin.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { person: "Zaměstnanec, jehož výkaz byl schválen" },
  recipients: ["person"],
  params: {
    period: { label: "Týden", example: "2. 3. 2026 – 8. 3. 2026" },
    hours: { label: "Odpracováno", example: "40:00 h" },
    week: { label: "První den týdne (pro odkaz)", example: "2026-03-02" },
  },
  template: {
    title: "Docházka schválena",
    body: "{period} · {hours}",
    url: "/dochazka?tyden={week}",
  },
  access: ["dochazka.own", "dochazka.approve"],
});

export const TIME_RETURNED = defineNotificationEvent({
  key: "time.returned",
  label: "Docházka vrácena k opravě",
  description: "Vedoucí vám vrátil týdenní výkaz hodin s poznámkou, co opravit.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { person: "Zaměstnanec, jehož výkaz byl vrácen" },
  recipients: ["person"],
  params: {
    period: { label: "Týden", example: "2. 3. 2026 – 8. 3. 2026" },
    note: { label: "Co opravit", example: "Chybí přestávka" },
    week: { label: "První den týdne (pro odkaz)", example: "2026-03-02" },
  },
  template: {
    title: "Docházka vrácena k opravě",
    body: "{period}\n{note}",
    url: "/dochazka?tyden={week}",
  },
  access: ["dochazka.own", "dochazka.approve"],
});

/** Večerní připomínka (17:30 v pracovní dny): dnes žádný záznam. */
export const TIME_REMINDER = defineNotificationEvent({
  key: "time.reminder",
  label: "Připomínka docházky",
  description: "Odpoledne vám přijde připomínka, když jste dnes ještě nezapsali žádnou docházku.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { person: "Zaměstnanec bez dnešního záznamu" },
  recipients: ["person"],
  params: {},
  template: {
    title: "Nezapomeňte zapsat docházku",
    body: "Dnes ještě nemáte žádný záznam.",
    url: "/dochazka",
  },
  access: "dochazka.own",
  dedupe: "day",
  scheduled: true,
  snooze: true,
});

/** Ráno v pracovní den: očekávaný zaměstnanec se ještě nepíchl. */
export const MISSING_CLOCK_IN = defineNotificationEvent({
  key: "dochazka.missing_clock_in",
  label: "Chybějící příchod",
  description:
    "V pracovní den kolem půl deváté ráno vám přijde upozornění, když nemáte zapsaný příchod ani absenci.",
  group: GROUP,
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { person: "Zaměstnanec bez dnešního záznamu" },
  recipients: ["person"],
  params: {},
  template: {
    title: "Chybí váš příchod",
    body: "Dnes nemáte zapsaný příchod. Píchněte se, nebo zapište dovolenou či nemoc.",
    url: "/dochazka",
  },
  access: "dochazka.own",
  dedupe: "day",
  scheduled: true,
  snooze: true,
});

/** Píchačka běží nepřiměřeně dlouho: upozornění samotnému zaměstnanci. */
export const FORGOT_CLOCK_OUT = defineNotificationEvent({
  key: "dochazka.forgot_clock_out",
  label: "Zapomenutý odchod",
  description:
    "Píchačka vám běží od dřívějška, přes noc nebo příliš dlouho: upozornění, ať zaznamenáte odchod.",
  group: GROUP,
  severity: "urgent",
  channels: { push: true, bell: true },
  audiences: { person: "Zaměstnanec s běžící píchačkou" },
  recipients: ["person"],
  params: {
    since: { label: "Od kdy píchačka běží", example: "včera v 7:02" },
    running: { label: "Jak dlouho už běží", example: "14:20 h" },
  },
  template: {
    title: "Zapomenutý odchod",
    body: "Píchačka běží od {since} ({running}).\nZaznamenejte odchod, ať se hodiny nezkreslí.",
    url: "/dochazka",
  },
  access: "dochazka.own",
  dedupe: "day",
  scheduled: true,
  snooze: true,
});

/** Totéž pro schvalovatele, ale až když píchačka běží od předchozího dne. */
export const FORGOT_CLOCK_OUT_TEAM = defineNotificationEvent({
  key: "dochazka.forgot_clock_out_team",
  label: "Zapomenutý odchod (vedoucí)",
  description:
    "Někomu běží píchačka od předchozího dne. Dostanou ho schvalovatelé, kteří vidí docházku všech.",
  group: GROUP,
  severity: "normal",
  channels: { push: false, bell: true },
  audiences: { approver: "Schvalovatelé s rozsahem „vše“" },
  recipients: ["approver"],
  params: {
    name: { label: "Zaměstnanec", example: "Petr Novák" },
    since: { label: "Od kdy píchačka běží", example: "včera v 7:02" },
    running: { label: "Jak dlouho už běží", example: "26:20 h" },
  },
  template: {
    title: "Zapomenutý odchod: {name}",
    body: "Píchačka běží od {since} ({running}).",
    url: "/dochazka/schvalovani",
  },
  access: "dochazka.approve",
  dedupe: "day",
  scheduled: true,
});

export const dochazkaNotifications = [
  TIME_SUBMITTED,
  TIME_APPROVED,
  TIME_RETURNED,
  TIME_REMINDER,
  MISSING_CLOCK_IN,
  FORGOT_CLOCK_OUT,
  FORGOT_CLOCK_OUT_TEAM,
];
