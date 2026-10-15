import { defineModuleUi } from "@rebar/ui";
import { ObchodyPage } from "./board-page";
import { dealOverview } from "./deal-cards";
import { DealCardBody, DealCardFooter, DealColumnHeader } from "./deal-card";
import { DealHeaderBand } from "./deal-header";

/**
 * UI oblast „ui“ modulu „obchody“ (OBC-B): stránka `/obchody` (board a seznam; trasu `apps/web/src/app/(app)/obchody`
 * si drží modul, aby předběhla generický seznam entity), karta a hlavička sloupce kanbanu, hlavička detailu s pásem
 * fází a tlačítky Vyhráno/Prohráno a karty Přehledu (další aktivita, rychlé zápisy, časová osa, kontakty). Zapojuje ji
 * `ui.tsx` přes `mergeModuleUi`.
 */
export const areaUi = defineModuleUi({
  pages: [{ path: "/obchody", render: ({ query }) => <ObchodyPage query={query} /> }],
  kanbanCard: { deal: { body: DealCardBody, footer: DealCardFooter } },
  kanbanColumnHeader: { deal: DealColumnHeader },
  recordHeader: { deal: DealHeaderBand },
  recordOverview: { deal: dealOverview },
  paletteActions: [
    {
      id: "obchody.new",
      label: "Nový obchod",
      keywords: "obchod příležitost lead nový",
      icon: "target",
      permission: "obchody.create",
      href: "/obchody?novy=1",
    },
  ],
});
