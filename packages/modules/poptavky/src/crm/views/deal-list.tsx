"use client";

import { EntityList, Skeleton, useEntityDescriptor } from "@rebar/ui";
import { useMemo } from "react";
import { DEAL_LIST_DEFAULT_FILTER, allOf, ownerCondition, type OwnerFilter } from "./logic";
import { DEAL_QUICK_CONDITIONS } from "./quick-conditions";
import { DEAL_FILTER_GROUPS, DEAL_VIEW_LAYOUT } from "./view-layout";

/** Uložený pohled z adresy (`?pohled=`); čte se až po načtení popisu entity, tedy jen v prohlížeči. */
function viewFromUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("pohled") ?? undefined;
}

/**
 * Pohled „Seznam“: tabulka zakázek (obchodů) se všemi možnostmi seznamu: nastavitelné sloupce, hromadný výběr, uložené
 * pohledy (Moje otevřené, Bez další aktivity, Zhnilé, čištění dat…), filtry s navrženými podmínkami a detail v pop-upu
 * (`?record=`). Výchozí filtr ukazuje otevřené (poptávka, nabídka) nearchivované obchody; filtr vlastníka je pevný
 * a platí i v uložených pohledech.
 */
export function DealListView({ owner }: { owner: OwnerFilter }) {
  const descriptor = useEntityDescriptor("job");
  const baseFilters = useMemo(() => allOf(ownerCondition(owner)), [owner]);
  const initialViewId = useMemo(viewFromUrl, []);
  if (!descriptor.data)
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  return (
    <EntityList
      entity={descriptor.data}
      openMode="dialog"
      basePath="/crm"
      baseFilters={baseFilters}
      defaultFilters={DEAL_LIST_DEFAULT_FILTER}
      allViewLabel="Otevřené obchody"
      quickConditions={DEAL_QUICK_CONDITIONS}
      filterGroups={DEAL_FILTER_GROUPS}
      viewLayout={DEAL_VIEW_LAYOUT}
      initialViewId={initialViewId}
    />
  );
}
