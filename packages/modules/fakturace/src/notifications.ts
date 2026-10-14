import { defineNotificationEvent } from "@rebar/core/manifest";

/*
  Upozornění fakturace. Částky jsou citlivé (`money`): kdo nemá právo na peníze, dostane text bez nich.
  Příjemci „všichni, kdo fakturují“ jsou dáni oprávněním `fakturace.write`, takže je správce klienta může změnit
  v Nastavení bez zásahu do kódu.
*/

export const INVOICE_OVERDUE = defineNotificationEvent({
  key: "invoice.overdue",
  label: "Faktura po splatnosti",
  description: "Ráno po uplynutí splatnosti vydané faktury, kterou zákazník ještě neuhradil.",
  group: "Fakturace",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: {},
  recipients: ["perm:fakturace.write"],
  params: {
    number: { label: "Číslo (nebo název) faktury", example: "FV-2026-0042" },
    customer: { label: "Odběratel", example: "Stavby Novák s.r.o." },
    dueDate: { label: "Datum splatnosti", example: "5. 10. 2026" },
    remaining: { label: "Zbývá uhradit", example: "121 000 Kč", sensitive: "money" },
  },
  template: {
    title: "Faktura {number} je po splatnosti",
    body: "{customer}\nSplatnost byla {dueDate}\nZbývá uhradit {remaining}",
    url: "/fakturace/{entityId}",
  },
  entity: "invoice",
  dedupe: "record",
});

export const INVOICE_DUE_SOON = defineNotificationEvent({
  key: "invoice.due_soon",
  label: "Faktura brzy po splatnosti",
  description:
    "Pracovní den ráno, nejdéle 3 dny před splatností vydané faktury, která ještě není uhrazená (jednou za fakturu).",
  group: "Fakturace",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: {},
  recipients: ["perm:fakturace.write"],
  params: {
    number: { label: "Číslo (nebo název) faktury", example: "FV-2026-0042" },
    when: { label: "Za jak dlouho je splatnost", example: "za 3 dny" },
    customer: { label: "Odběratel", example: "Stavby Novák s.r.o." },
    dueDate: { label: "Datum splatnosti", example: "12. 10. 2026" },
    remaining: { label: "Zbývá uhradit", example: "121 000 Kč", sensitive: "money" },
  },
  template: {
    title: "Faktura {number} je splatná {when}",
    body: "{customer}\nSplatnost {dueDate}\nZbývá uhradit {remaining}",
    url: "/fakturace/{entityId}",
  },
  entity: "invoice",
  dedupe: "record",
  scheduled: true,
});

export const INVOICE_PAID = defineNotificationEvent({
  key: "invoice.paid",
  label: "Faktura zaplacena",
  description:
    "Vydaná faktura byla zaplacena celá. Dostane ji ten, kdo fakturu založil, vedoucí zakázky a všichni, kdo fakturují.",
  group: "Fakturace",
  severity: "normal",
  channels: { push: false, bell: true },
  audiences: {
    creator: "Ten, kdo fakturu založil",
    manager: "Vedoucí zakázky, ke které faktura patří",
  },
  recipients: ["creator", "manager", "perm:fakturace.write"],
  params: {
    number: { label: "Číslo (nebo název) faktury", example: "FV-2026-0042" },
    customer: { label: "Odběratel", example: "Stavby Novák s.r.o." },
    amount: { label: "Celková částka faktury", example: "121 000 Kč", sensitive: "money" },
  },
  template: {
    title: "Faktura {number} je zaplacená",
    body: "{customer}\nUhrazeno {amount}",
    url: "/fakturace/{entityId}",
  },
  entity: "invoice",
  dedupe: "none",
});

export const RECEIVED_INVOICE_OVERDUE = defineNotificationEvent({
  key: "received_invoice.overdue",
  label: "Přijatá faktura po splatnosti",
  description:
    "Ráno po uplynutí splatnosti schválené přijaté faktury, kterou jste ještě neuhradili.",
  group: "Fakturace",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: {},
  recipients: ["perm:fakturace.write"],
  params: {
    number: { label: "Číslo přijaté faktury", example: "2026123" },
    dueDate: { label: "Datum splatnosti", example: "5. 10. 2026" },
    remaining: { label: "K úhradě", example: "48 400 Kč", sensitive: "money" },
  },
  template: {
    title: "Přijatá faktura {number} je po splatnosti",
    body: "Splatnost byla {dueDate}\nK úhradě {remaining}",
    url: "/fakturace/prijate/{entityId}",
  },
  entity: "received_invoice",
  dedupe: "record",
});

export const INVOICE_MAIL_FAILED = defineNotificationEvent({
  key: "invoice.mail_failed",
  label: "E-mail s fakturou se nepodařilo odeslat",
  description:
    "E-mail s fakturou nebo upomínkou se nepodařilo doručit. Dostane ho ten, kdo e-mail odeslal.",
  group: "Fakturace",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { sender: "Ten, kdo e-mail odeslal" },
  recipients: ["sender"],
  params: {
    subject: { label: "Co se odesílalo", example: "E-mail s fakturou FV-2026-0042" },
    to: { label: "Adresa příjemce", example: "ucetni@firma.cz" },
    error: { label: "Důvod selhání", example: "Schránka neexistuje" },
  },
  template: {
    title: "{subject} se nepodařilo odeslat",
    body: "Příjemce {to}\n{error}",
    url: "/fakturace/{entityId}",
  },
  entity: "invoice",
});

export const FAKTURACE_NOTIFICATIONS = [
  INVOICE_OVERDUE,
  INVOICE_DUE_SOON,
  INVOICE_PAID,
  RECEIVED_INVOICE_OVERDUE,
  INVOICE_MAIL_FAILED,
];
