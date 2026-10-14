import { defineModule } from "@rebar/core/manifest";

/*
  Kostra S0 (docs/opsys/D-plan-a-kontrakty.md §1.2): manifest je úplný (navigace, oprávnění, závislosti, stránky).
  `entities` doplní S1 spolu s `entities.ts`; zástupné stránky (`pages` + `ui.tsx`) nahradí entity a skutečné UI.
*/
export const manifest = defineModule({
  id: "muj-prostor",
  name: "Můj prostor",
  description:
    "Soukromá sekce vlastníka: hosting a údržba webů, domény s expirací, soukromá e-mailová knihovna, opakované faktury (Fakturoid) a přehled soukromých záznamů.",
  icon: "vault",
  dependsOn: ["kontakty"],
  nav: [
    {
      label: "Hosting a údržba",
      href: "/muj-prostor/hosting",
      icon: "vault",
      permission: "muj-prostor.hosting",
      group: "Můj prostor",
      order: 10,
    },
    {
      label: "Domény",
      href: "/muj-prostor/domeny",
      icon: "globe",
      permission: "muj-prostor.domains",
      group: "Můj prostor",
      order: 20,
    },
    {
      label: "E-mailová knihovna",
      href: "/muj-prostor/knihovna",
      icon: "mail-template",
      permission: "muj-prostor.email_library",
      group: "Můj prostor",
      order: 30,
    },
    {
      label: "Opakované faktury",
      href: "/muj-prostor/faktury",
      icon: "receipt",
      permission: "muj-prostor.recurring_invoices",
      group: "Můj prostor",
      order: 40,
    },
    {
      label: "Soukromé",
      href: "/muj-prostor/soukrome",
      icon: "lock",
      permission: "muj-prostor.private_overview",
      group: "Můj prostor",
      order: 50,
    },
  ],
  pages: [
    { path: "/muj-prostor/hosting", title: "Hosting a údržba", permission: "muj-prostor.hosting" },
    { path: "/muj-prostor/domeny", title: "Domény", permission: "muj-prostor.domains" },
    {
      path: "/muj-prostor/knihovna",
      title: "E-mailová knihovna",
      permission: "muj-prostor.email_library",
    },
    {
      path: "/muj-prostor/faktury",
      title: "Opakované faktury",
      permission: "muj-prostor.recurring_invoices",
    },
    {
      path: "/muj-prostor/soukrome",
      title: "Soukromé",
      permission: "muj-prostor.private_overview",
    },
  ],
  permissions: [
    { key: "muj-prostor.hosting", label: "Spravuje hosting a údržbu webů" },
    { key: "muj-prostor.domains", label: "Spravuje domény" },
    { key: "muj-prostor.email_library", label: "Spravuje soukromou e-mailovou knihovnu" },
    {
      key: "muj-prostor.recurring_invoices",
      label: "Spravuje opakované faktury",
      description: "Návrhy, schválení a odeslání do Fakturoidu",
    },
    { key: "muj-prostor.private_overview", label: "Vidí přehled soukromých záznamů" },
  ],
});
