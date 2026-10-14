import { defineModule } from "@rebar/core/manifest";
import { CRM_BOARD_NOTIFICATIONS } from "./crm/board/notifications";
import { CRM_VIEWS } from "./crm/views/seed-views";
import { POPTAVKY_NOTIFICATIONS } from "./notifications";

export const manifest = defineModule({
  id: "poptavky",
  // zobrazený název je CRM; interní id zůstává `poptavky` (přejmenování je pozdější práce, nic není nasazeno)
  name: "CRM",
  description:
    "Obchod nad zakázkou: schránka poptávek (ručně, formulář, webhook), kvalifikace, nástěnka fází, aktivity, prognóza.",
  icon: "inbox",
  dependsOn: ["kontakty", "zakazky"],
  nav: [
    {
      label: "CRM",
      href: "/crm",
      icon: "handshake",
      permission: "poptavky.read",
      group: "Obchod",
    },
    {
      label: "Moje dnešní práce",
      href: "/crm/dnes",
      icon: "calendar-check",
      permission: "poptavky.read",
      group: "Obchod",
    },
    {
      label: "Schránka poptávek",
      href: "/poptavky",
      icon: "inbox",
      permission: "poptavky.read",
      group: "Obchod",
    },
    {
      label: "Import poptávek",
      href: "/poptavky/import",
      icon: "file-stack",
      permission: "poptavky.write",
      parent: "/poptavky",
    },
  ],
  pages: [
    { path: "/crm", title: "CRM", permission: "poptavky.read" },
    { path: "/crm/dnes", title: "Moje dnešní práce", permission: "poptavky.read" },
    { path: "/poptavky/prijem", title: "Příjem poptávek", permission: "poptavky.intake" },
    { path: "/poptavky/import", title: "Import poptávek", permission: "poptavky.write" },
  ],
  permissions: [
    { key: "poptavky.read", label: "Vidí poptávky" },
    { key: "poptavky.write", label: "Upravuje poptávky" },
    { key: "poptavky.convert", label: "Převádí poptávky na zakázky" },
    {
      key: "poptavky.intake",
      label: "Spravuje příjem poptávek",
      description: "Klíče pro formulář a webhook na webu, záznam příchozích požadavků",
    },
  ],
  entities: ["inquiry", "crm_activity", "crm_note", "crm_activity_type"],
  notifications: [...POPTAVKY_NOTIFICATIONS, ...CRM_BOARD_NOTIFICATIONS],
  seed: {
    // sdílené pohledy obchodů (Moje otevřené, Zhnilé…) a filtry čištění dat; zakládá je db:seed
    views: CRM_VIEWS,
    pipelines: [
      {
        entityType: "inquiry",
        key: "default",
        name: "Poptávky",
        // schránka: poptávka je buď nová, nebo kvalifikovaná (vznikla zakázka), nebo zamítnutá; obchod řeší zakázka
        stages: [
          { name: "Nová", color: "gray" },
          { name: "Kvalifikovaná", color: "green", kind: "won" },
          { name: "Zamítnutá", color: "red", kind: "lost" },
        ],
      },
    ],
    lookups: [
      {
        key: "inquiry.source",
        name: "Zdroj poptávky",
        items: [
          { value: "web", label: "Web", color: "blue" },
          { value: "phone", label: "Telefon", color: "green" },
          { value: "email", label: "E-mail", color: "indigo" },
          { value: "referral", label: "Doporučení", color: "purple" },
          { value: "personal", label: "Osobně", color: "teal" },
          { value: "other", label: "Jiný", color: "gray" },
        ],
      },
      {
        key: "inquiry.lost_reason",
        name: "Důvod prohry poptávky",
        items: [
          { value: "price", label: "Cena" },
          { value: "timing", label: "Termín" },
          { value: "competitor", label: "Vybrali konkurenci" },
          { value: "no_response", label: "Bez odezvy" },
          { value: "cancelled", label: "Klient zrušil záměr" },
          { value: "other", label: "Jiný důvod" },
        ],
      },
    ],
  },
});
