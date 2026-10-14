"use client";

import { Placeholder, defineModuleUi } from "@rebar/ui";

/** UI oblasti „library“ modulu „muj-prostor“; zapojuje ji `ui.tsx` přes `mergeModuleUi`. Zástupná stránka čeká na skutečné UI. */
export const areaUi = defineModuleUi({
  pages: [
    {
      path: "/muj-prostor/knihovna",
      render: () => <Placeholder title="E-mailová knihovna" icon="mail-template" />,
    },
  ],
});
