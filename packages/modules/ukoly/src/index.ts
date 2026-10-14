import { defineModule } from "@rebar/core/manifest";

/*
  Kostra S0 (docs/opsys/D-plan-a-kontrakty.md §1.2): manifest je úplný (navigace, oprávnění, závislosti, stránky).
  `entities` doplní S1 spolu s `entities.ts`; zástupné stránky (`pages` + `ui.tsx`) nahradí entity a skutečné UI.
*/
export const manifest = defineModule({
  id: "ukoly",
  name: "Úkoly a poznámky",
  description:
    "Úkoly (včetně hovorů, schůzek a termínů) s rychlým zadáním, podúkoly a poznámky s formátovaným textem navázané na obchody, klienty, kontakty a zakázky.",
  icon: "check-square",
  nav: [
    {
      label: "Moje úkoly",
      href: "/ukoly",
      icon: "check-square",
      permission: "ukoly.read",
      group: "Práce",
      order: 10,
      bottom: true,
    },
  ],
  pages: [
    { path: "/ukoly/typy", title: "Typy úkolů", permission: "ukoly.types" },
    { path: "/ukoly", title: "Moje úkoly", permission: "ukoly.read" },
  ],
  permissions: [
    {
      key: "ukoly.read",
      label: "Vidí úkoly a poznámky",
      description: "Rozsah „jen moje“ = jen přidělené a vlastní",
    },
    { key: "ukoly.create", label: "Zakládá úkoly a poznámky" },
    { key: "ukoly.write", label: "Upravuje úkoly a poznámky" },
    {
      key: "ukoly.delete",
      label: "Maže úkoly a poznámky",
      description: "Do koše; obnovit smí každý své",
    },
    { key: "ukoly.types", label: "Spravuje typy úkolů" },
  ],
});
