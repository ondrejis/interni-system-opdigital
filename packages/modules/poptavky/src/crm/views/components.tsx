"use client";

/**
 * Veřejné komponenty oblasti Pohledy pro ostatní oblasti CRM (stránka `/crm` je složí do přepínače pohledů).
 * Názvy a tvar props jsou smlouva s oblastí Nástěnka a detail (docs/CRM.md → smlouvy). Každý pohled si sám obsluhuje
 * detail v pop-upu (`?record=`), takže stránka smí mít v jednu chvíli připojený jen jeden z nich.
 */
export type { OwnerFilter } from "./logic";
export { ForecastView } from "./forecast-view";
export { DealListView } from "./deal-list";
export { ArchiveView } from "./archive-view";
