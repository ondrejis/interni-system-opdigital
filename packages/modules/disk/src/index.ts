import { defineModule } from "@rebar/core/manifest";

/*
  Kostra S0 (docs/opsys/D-plan-a-kontrakty.md §1.2): manifest je úplný (navigace, oprávnění, závislosti, stránky).
  `entities` doplní S1 spolu s `entities.ts`; zástupné stránky (`pages` + `ui.tsx`) nahradí entity a skutečné UI.
*/
export const manifest = defineModule({
  id: "disk",
  name: "Google Disk",
  description:
    "Složky klientů a zakázek na sdíleném Google Disku: požadavky na založení přes n8n, stav složek a strom složek v Nastavení.",
  icon: "google-drive",
  nav: [],
  pages: [],
  permissions: [
    { key: "disk.read", label: "Vidí stav složek na Google Disku" },
    {
      key: "disk.write",
      label: "Zakládá složky na Disku",
      description: "Vytvořit složku a zkusit znovu po chybě",
    },
    {
      key: "disk.manage",
      label: "Spravuje strukturu složek",
      description: "Strom složek klienta a test napojení",
    },
  ],
});
