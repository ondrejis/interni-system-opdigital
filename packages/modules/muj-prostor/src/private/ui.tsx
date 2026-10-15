"use client";

import { defineModuleUi } from "@rebar/ui";
import { PrivatePage } from "./private-page";

/** UI oblasti „private“ modulu „muj-prostor“ (MPR-2): stránka Soukromé a akce „Nová soukromá poznámka“ v paletě. */
export const areaUi = defineModuleUi({
  pages: [
    {
      path: "/muj-prostor/soukrome",
      render: ({ query }) => <PrivatePage startNote={query.poznamka === "1"} />,
    },
  ],
  paletteActions: [
    {
      id: "muj-prostor.private.note",
      label: "Nová soukromá poznámka",
      keywords: "poznámka soukromé",
      icon: "lock",
      permission: "muj-prostor.private_overview",
      href: "/muj-prostor/soukrome?poznamka=1",
    },
  ],
});
