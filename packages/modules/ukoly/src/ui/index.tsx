import { Placeholder, defineModuleUi } from "@rebar/ui";

/** UI oblast „ui“ modulu „ukoly“; zapojuje ji `ui.tsx` přes `mergeModuleUi`. Zástupné stránky nahradí skutečné UI. */
export const areaUi = defineModuleUi({
  pages: [{ path: "/ukoly", render: () => <Placeholder title="Moje úkoly" icon="check-square" /> }],
});
