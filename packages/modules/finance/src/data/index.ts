import { defineModuleServer } from "@rebar/core/module-server";
import { createFinanceService } from "../service";

/** Serverová oblast „data“ modulu „finance“ (FIN-B); zapojuje ji `server.ts` přes `mergeServers`. */
export const area = defineModuleServer({
  services: { finance: createFinanceService },
});
