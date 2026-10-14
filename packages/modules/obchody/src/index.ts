import { defineModule } from "@rebar/core/manifest";

/*
  Kostra S0 (docs/opsys/D-plan-a-kontrakty.md §1.2): manifest je úplný (navigace, oprávnění, závislosti, stránky).
  `entities` doplní S1 spolu s `entities.ts`; zástupné stránky (`pages` + `ui.tsx`) nahradí entity a skutečné UI.
*/
export const manifest = defineModule({
  id: "obchody",
  name: "Obchody",
  description:
    "Obchodní příležitosti: pipeline s pravděpodobnostmi, board se součty, výhra (založení zakázek) a prohra s důvodem.",
  icon: "target",
  dependsOn: ["kontakty", "zakazky"],
  nav: [
    {
      label: "Obchody",
      href: "/obchody",
      icon: "target",
      permission: "obchody.read",
      group: "CRM",
      order: 10,
      bottom: true,
    },
  ],
  pages: [{ path: "/obchody", title: "Obchody", permission: "obchody.read" }],
  permissions: [
    { key: "obchody.read", label: "Vidí obchody" },
    { key: "obchody.create", label: "Zakládá obchody" },
    {
      key: "obchody.write",
      label: "Upravuje obchody",
      description: "Přesun mezi fázemi, výhra, prohra, znovuotevření",
    },
    { key: "obchody.delete", label: "Maže obchody", description: "Do koše; obnovit smí každý své" },
    { key: "obchody.export", label: "Exportuje obchody" },
    {
      key: "obchody.pipelines",
      label: "Spravuje pipeline obchodů",
      description: "Fáze, pravděpodobnosti a lhůty",
    },
  ],
});
