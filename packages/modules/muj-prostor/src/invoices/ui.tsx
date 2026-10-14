"use client";

import { Placeholder, defineModuleUi } from "@rebar/ui";

/** UI oblasti „invoices“ modulu „muj-prostor“; zapojuje ji `ui.tsx` přes `mergeModuleUi`. Zástupná stránka čeká na skutečné UI. */
export const areaUi = defineModuleUi({
  pages: [
    {
      path: "/muj-prostor/faktury",
      render: () => <Placeholder title="Opakované faktury" icon="receipt" />,
    },
  ],
});
