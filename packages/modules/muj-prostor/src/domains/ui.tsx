"use client";

import { Placeholder, defineModuleUi } from "@rebar/ui";

/** UI oblasti „domains“ modulu „muj-prostor“; zapojuje ji `ui.tsx` přes `mergeModuleUi`. Zástupná stránka čeká na skutečné UI. */
export const areaUi = defineModuleUi({
  pages: [
    { path: "/muj-prostor/domeny", render: () => <Placeholder title="Domény" icon="globe" /> },
  ],
});
