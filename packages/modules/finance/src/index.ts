import { defineModule } from "@rebar/core/manifest";

/*
  Kostra S0 (docs/opsys/D-plan-a-kontrakty.md §1.2): manifest je úplný (navigace, oprávnění, závislosti, stránky).
  `entities` doplní S1 spolu s `entities.ts`; zástupné stránky (`pages` + `ui.tsx`) nahradí entity a skutečné UI.
*/
export const manifest = defineModule({
  id: "finance",
  name: "Finance",
  description:
    "Platby zakázek a jejich rozdělení mezi dvě IČO, retainery, vyrovnání mezi partnery (saldo) a přehledy příjmů.",
  icon: "wallet",
  dependsOn: ["zakazky"],
  nav: [
    {
      label: "Platby a rozdělení",
      href: "/finance",
      icon: "wallet",
      permission: "finance.read",
      group: "Finance",
      order: 10,
    },
    {
      label: "Vyrovnání",
      href: "/finance/vyrovnani",
      icon: "scale",
      permission: "finance.read",
      group: "Finance",
      order: 20,
    },
  ],
  pages: [
    { path: "/finance/vyrovnani", title: "Vyrovnání", permission: "finance.read" },
    { path: "/finance", title: "Platby a rozdělení", permission: "finance.read" },
  ],
  permissions: [
    {
      key: "finance.read",
      label: "Vidí platby a přehledy financí",
      description: "Partner vidí jen sdílené zakázky",
    },
    {
      key: "finance.payments_write",
      label: "Zapisuje a upravuje platby",
      description: "Vystavení, úhrada, storno, retainery",
    },
    {
      key: "finance.splits_edit",
      label: "Upravuje rozdělení plateb",
      description: "Pravidla rozdělení mezi Ondřeje a Patrika",
    },
    {
      key: "finance.settlements_write",
      label: "Zapisuje vyrovnání",
      description: "Vzájemné vyrovnání (fakturou, převodem, zápočtem)",
    },
    { key: "finance.export", label: "Exportuje platby a přehledy" },
    {
      key: "finance.settings",
      label: "Spravuje nastavení financí",
      description: "Základ salda a výchozí rozdělení",
    },
  ],
});
