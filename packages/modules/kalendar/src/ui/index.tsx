import { defineModuleUi } from "@rebar/ui";
import { CalendarPage } from "./calendar-page";

export { GoogleCalendarSettings } from "./settings";

/**
 * UI oblast „ui“ modulu „kalendar“ (KAL-B): stránka Kalendář s pohledy Den, Týden, Měsíc a Agenda, vrstvami,
 * náhledem události a vytvořením schůzky; zapojuje ji `ui.tsx` přes `mergeModuleUi`. Nastavení → Google Kalendář je
 * komponenta `GoogleCalendarSettings` (stránku v `apps/web` nese KAL-B).
 */
export const areaUi = defineModuleUi({
  pages: [{ path: "/kalendar", render: () => <CalendarPage /> }],
  paletteActions: [
    {
      id: "kalendar.new-meeting",
      label: "Nová schůzka",
      keywords: "schuzka kalendar udalost nova meeting",
      icon: "calendar",
      permission: "kalendar.write",
      href: "/kalendar?nova=1",
    },
  ],
});
