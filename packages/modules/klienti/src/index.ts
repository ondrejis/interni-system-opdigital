import { defineModule } from "@rebar/core/manifest";

/*
  Kostra S0 (docs/opsys/D-plan-a-kontrakty.md §1.2): manifest je úplný (navigace, oprávnění, závislosti, stránky).
  `entities` doplní S1 spolu s `entities.ts`; zástupné stránky (`pages` + `ui.tsx`) nahradí entity a skutečné UI.
*/
export const manifest = defineModule({
  id: "klienti",
  name: "Klienti",
  description:
    "Klienti agentury: stav (lead, aktivní, pozastavený, bývalý), služby, kontext a karta klienta složená z příspěvků ostatních modulů.",
  icon: "handshake",
  dependsOn: ["kontakty"],
  nav: [
    {
      label: "Klienti",
      href: "/klienti",
      icon: "handshake",
      permission: "klienti.read",
      group: "CRM",
      order: 20,
      bottom: true,
    },
  ],
  pages: [{ path: "/klienti", title: "Klienti", permission: "klienti.read" }],
  permissions: [
    { key: "klienti.read", label: "Vidí klienty a jejich karty" },
    {
      key: "klienti.write",
      label: "Upravuje klienty",
      description: "Stav klienta, služby a kontext",
    },
  ],
});
