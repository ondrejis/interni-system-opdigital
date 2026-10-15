"use client";

import { useCommandQuery } from "@rebar/ui";
import type { ClientCardSummary, ClientTabsResult } from "../contract";

/** Souhrn karty klienta (`klienti.summary`): primární kontakt, počty, finanční souhrn a kontext. */
export function useClientSummary(companyId: string, enabled = true) {
  return useCommandQuery<ClientCardSummary, { companyId: string }>(
    "klienti.summary",
    { companyId },
    { enabled },
  );
}

/** Počty záložek karty a záložky bez dat (`klienti.tabCounts`). */
export function useClientTabs(companyId: string, enabled = true) {
  return useCommandQuery<ClientTabsResult, { companyId: string }>(
    "klienti.tabCounts",
    { companyId },
    { enabled },
  );
}
