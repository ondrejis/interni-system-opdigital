"use client";

import { defineModuleUi } from "@rebar/ui";
import { DomainsPage } from "./domains-page";

/**
 * UI oblasti „domains“ modulu „muj-prostor“ (MPR-1): stránka Domény s barvami expirace, hromadným vložením a přiřazením
 * klienta. Zapojuje ji `ui.tsx` přes `mergeModuleUi`. Generický seznam s filtry a exportem je na `/muj-prostor/domeny/vse`.
 */
export const areaUi = defineModuleUi({
  pages: [{ path: "/muj-prostor/domeny", render: () => <DomainsPage /> }],
});
