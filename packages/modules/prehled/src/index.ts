import { defineModule } from "@rebar/core/manifest";

/*
  Kostra S0 (docs/opsys/D-plan-a-kontrakty.md §1.2): manifest je úplný (navigace, oprávnění, závislosti, stránky).
  `entities` doplní S1 spolu s `entities.ts`; zástupné stránky (`pages` + `ui.tsx`) nahradí entity a skutečné UI.
*/
export const manifest = defineModule({
  id: "prehled",
  name: "Přehled",
  description:
    "Úvodní přehled: nástěnky s čísly a seznamy z pohledů, poslední změny a rychlé odkazy.",
  icon: "layout-dashboard",
  nav: [
    {
      label: "Přehled",
      href: "/prehled",
      icon: "layout-dashboard",
      permission: "prehled.read",
      group: "Práce",
      order: 0,
    },
  ],
  pages: [{ path: "/prehled", title: "Přehled", permission: "prehled.read" }],
  permissions: [{ key: "prehled.read", label: "Vidí úvodní přehled" }],
});
