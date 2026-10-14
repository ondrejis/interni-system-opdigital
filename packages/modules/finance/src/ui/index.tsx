import { Placeholder, defineModuleUi } from "@rebar/ui";

/** UI oblast „ui“ modulu „finance“; zapojuje ji `ui.tsx` přes `mergeModuleUi`. Zástupné stránky nahradí skutečné UI. */
export const areaUi = defineModuleUi({
  pages: [
    { path: "/finance/vyrovnani", render: () => <Placeholder title="Vyrovnání" icon="scale" /> },
    { path: "/finance", render: () => <Placeholder title="Platby a rozdělení" icon="wallet" /> },
  ],
});
