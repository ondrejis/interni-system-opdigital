import { Placeholder, defineModuleUi } from "@rebar/ui";

/** UI oblast „ui“ modulu „reklama“; zapojuje ji `ui.tsx` přes `mergeModuleUi`. Zástupné stránky nahradí skutečné UI. */
export const areaUi = defineModuleUi({
  pages: [{ path: "/reklama", render: () => <Placeholder title="Reklama" icon="megaphone" /> }],
});
