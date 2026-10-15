import { defineModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";
import {
  attention,
  calendarLayers,
  clientCard,
  dashboardMetrics,
  deleteBlockers,
  emailVars,
  privatePaths,
  widgets,
} from "./insights";

/**
 * Serverová oblast „core“ modulu „zakazky“ (ZAK-A): zakázka, fáze, stav, tým, události `project.*`, metriky a vrstvy
 * pro přehled, příspěvky ke kartě klienta a k šablonám e-mailů.
 */
export const area = defineModuleServer({
  commands,
  dashboardMetrics,
  widgets,
  attention,
  calendarLayers,
  deleteBlockers,
  privatePaths,
  contributions: { clientCard: [clientCard], emailVars: [emailVars] },
});
