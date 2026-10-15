"use client";

import { defineModuleUi } from "@rebar/ui";
import { FakturoidPanel } from "./fakturoid-panel";
import { InvoicesPage } from "./invoices-page";

export { ClientInvoicesSection } from "./client-section";

/**
 * UI oblasti „invoices“ modulu „muj-prostor“ (MPR-3, v3): stránka Opakované faktury (návrhy, schválení a vytvoření ve
 * Fakturoidu) a panel Fakturoid v Nastavení → Integrace. Sekce faktur na kartě klienta je `ClientInvoicesSection`
 * (zapojuje ji záložka „Hosting a domény“). Zapojuje ji `ui.tsx` přes `mergeModuleUi`.
 */
export const areaUi = defineModuleUi({
  pages: [{ path: "/muj-prostor/faktury", render: () => <InvoicesPage /> }],
  slots: { "settings.integrations": FakturoidPanel },
});
