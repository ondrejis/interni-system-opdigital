import { defineModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";
import { leadsIngest } from "./ingest";
import { jobs } from "./jobs";
import { adClientCard, adMetrics, adPrivatePaths, adWidgets } from "./providers";

/**
 * Serverová oblast „meta“ modulu „reklama“ (REK-A): příkazy, příjem leadů (`ingest leads`), denní synchronizace
 * s Meta (úloha), metriky a widgety nástěnek a příspěvek ke kartě klienta; zapojuje ji `server.ts` přes `mergeServers`.
 */
export const area = defineModuleServer({
  commands,
  ingests: [leadsIngest],
  jobs,
  dashboardMetrics: adMetrics,
  widgets: [adWidgets],
  contributions: { clientCard: [adClientCard] },
  privatePaths: adPrivatePaths,
});
