"use client";

import { defineModuleUi } from "@rebar/ui";
import { CrmPage } from "./crm-page";
import { dealDialogExt } from "./deal-dialog";
import { DealCardBody, DealCardFooter, DealColumnHeader, dealRotting } from "./deal-card";

export { dealDialogExt };

/**
 * UI oblasti CRM „board“ (docs/CRM.md → Oblast D): stránka `/crm` (nástěnka a přepínač pohledů), karta zakázky
 * a hlavička sloupce na kanbanu zakázek. Detail v pop-upu je `dealDialogExt`, registrovaný jako `recordDialog` entity `job`
 * (každý seznam s `openMode="dialog"` ho otevře stejně: nástěnka, seznam, archiv);
 * hlavička zakázky z modulu Zakázky (`recordHeader`) zůstává pro stránku `/zakazky/<id>`.
 */
export const areaUi = defineModuleUi({
  pages: [{ path: "/crm", render: ({ query }) => <CrmPage query={query} /> }],
  kanbanCard: {
    job: { body: DealCardBody, rotting: dealRotting, footer: DealCardFooter },
  },
  kanbanColumnHeader: { job: DealColumnHeader },
  recordDialog: { job: dealDialogExt },
});
