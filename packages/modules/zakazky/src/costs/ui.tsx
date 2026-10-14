"use client";

import type { ModulePage, RecordAction, RecordOverviewCard, RecordTab } from "@rebar/ui";
import { CostsTab, UnpairedCostsCard } from "./ui-list";
import { CostOverviewTab } from "./ui-plan";

export { UnpairedCostsCard };

/** Záložky skupiny Náklady na detailu zakázky (Materiál a Stroje přidávají moduly Sklad a Stroje, order 20 a 30). */
export const tabs: RecordTab[] = [
  {
    id: "prehled-nakladu",
    label: "Přehled nákladů",
    permission: "zakazky.economics",
    group: "naklady",
    order: 5,
    render: ({ id }) => <CostOverviewTab id={id} />,
  },
  {
    id: "naklady",
    label: "Náklady",
    permission: "zakazky.economics",
    group: "naklady",
    order: 10,
    render: ({ id }) => <CostsTab id={id} />,
  },
];
export const actions: RecordAction[] = [];
export const pages: ModulePage[] = [];

/** Karta Přehledu zakázky: nespárované náklady s rychlým párováním (jen když nějaké jsou). */
export const overviewCards: RecordOverviewCard[] = [
  {
    id: "unpaired-costs",
    order: 70,
    permission: "zakazky.economics",
    render: ({ id, openTab }) => (
      <UnpairedCostsCard jobId={id} onOpenAll={() => openTab("naklady", "naklady")} />
    ),
  },
];
