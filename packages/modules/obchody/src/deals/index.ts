import { defineModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";
import {
  dealClientCard,
  dealEmailVars,
  dealMetrics,
  dealPrivatePaths,
  dealWidgets,
} from "./metrics";

/**
 * Serverová oblast „deals“ modulu „obchody“ (OBC-A): příkazy, události `deal.*` (přes háčky entity a přechody),
 * metriky a widgety nástěnek, příspěvky pro kartu klienta a proměnné e-mailů; zapojuje ji `server.ts` přes `mergeServers`.
 */
export const area = defineModuleServer({
  commands,
  dashboardMetrics: dealMetrics,
  widgets: [dealWidgets],
  contributions: { clientCard: [dealClientCard], emailVars: [dealEmailVars] },
  privatePaths: dealPrivatePaths,
});
