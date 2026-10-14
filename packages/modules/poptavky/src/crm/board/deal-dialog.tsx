"use client";

import type { RecordDialogExt } from "@rebar/ui";
import { DealHeader } from "./deal-header";
import { DealOverview } from "./deal-overview";

/**
 * Podoba detailu zakázky v pop-upu CRM (hlavička s pásem stavů, levý sloupec s údaji, pravá pracovní plocha, záložky
 * Přehled, Rozpočet a Soubory). Předává se do `EntityList` / `RecordDialog` jako `recordDialog`; stránka zakázky
 * (`/zakazky/<id>`) se tím nemění. Pohledy Seznam a Archiv ji používají stejně jako nástěnka.
 */
export const dealDialogExt: RecordDialogExt = {
  header: DealHeader,
  overview: DealOverview,
  tabs: ["prehled", "rozpocet", "soubory"],
};
