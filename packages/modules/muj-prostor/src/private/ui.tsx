"use client";

import { Placeholder, defineModuleUi } from "@rebar/ui";

/** UI oblasti „private“ modulu „muj-prostor“; zapojuje ji `ui.tsx` přes `mergeModuleUi`. Zástupná stránka čeká na skutečné UI. */
export const areaUi = defineModuleUi({
  pages: [
    { path: "/muj-prostor/soukrome", render: () => <Placeholder title="Soukromé" icon="lock" /> },
  ],
});
