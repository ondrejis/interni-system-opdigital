import { defineModule } from "@rebar/core/manifest";

/*
  Kostra S0 (docs/opsys/D-plan-a-kontrakty.md §1.2): manifest je úplný (navigace, oprávnění, závislosti, stránky).
  `entities` doplní S1 spolu s `entities.ts`; zástupné stránky (`pages` + `ui.tsx`) nahradí entity a skutečné UI.
*/
export const manifest = defineModule({
  id: "sablony-emailu",
  name: "Šablony e-mailů",
  description:
    "Šablony e-mailů s proměnnými z klienta, kontaktu, obchodu a zakázky; otevření připraveného e-mailu v Gmailu nebo kopie do schránky.",
  icon: "mail-template",
  dependsOn: ["kontakty"],
  nav: [
    {
      label: "Šablony e-mailů",
      href: "/sablony-emailu",
      icon: "mail-template",
      permission: "sablony-emailu.read",
      group: "Marketing",
      order: 20,
    },
  ],
  pages: [{ path: "/sablony-emailu", title: "Šablony e-mailů", permission: "sablony-emailu.read" }],
  permissions: [
    { key: "sablony-emailu.read", label: "Vidí šablony e-mailů" },
    { key: "sablony-emailu.create", label: "Zakládá šablony e-mailů" },
    { key: "sablony-emailu.write", label: "Upravuje šablony e-mailů" },
    { key: "sablony-emailu.delete", label: "Maže šablony e-mailů" },
  ],
});
