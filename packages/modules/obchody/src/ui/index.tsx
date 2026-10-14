import { Placeholder, defineModuleUi } from "@rebar/ui";

/** UI oblast „ui“ modulu „obchody“; zapojuje ji `ui.tsx` přes `mergeModuleUi`. Zástupné stránky nahradí skutečné UI. */
export const areaUi = defineModuleUi({
  pages: [{ path: "/obchody", render: () => <Placeholder title="Obchody" icon="target" /> }],
});
