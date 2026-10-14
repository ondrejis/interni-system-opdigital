import { Placeholder, defineModuleUi } from "@rebar/ui";

/**
 * UI oblast „ui“ modulu „kalendar“ (KAL-B: pohledy Den/Týden/Měsíc/Agenda); zapojuje ji `ui.tsx` přes `mergeModuleUi`.
 * Zástupná stránka čeká na skutečné UI.
 */
export const areaUi = defineModuleUi({
  pages: [{ path: "/kalendar", render: () => <Placeholder title="Kalendář" icon="calendar" /> }],
});
