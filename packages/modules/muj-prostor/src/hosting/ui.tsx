"use client";

import { Placeholder, defineModuleUi } from "@rebar/ui";

/** UI oblasti „hosting“ modulu „muj-prostor“; zapojuje ji `ui.tsx` přes `mergeModuleUi`. Zástupná stránka čeká na skutečné UI. */
export const areaUi = defineModuleUi({
  pages: [
    {
      path: "/muj-prostor/hosting",
      render: () => <Placeholder title="Hosting a údržba" icon="vault" />,
    },
  ],
});
