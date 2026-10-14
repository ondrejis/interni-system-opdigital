import { defineModuleServer } from "@rebar/core/module-server";

/** Serverová oblast „private“ modulu „muj-prostor“; zapojuje ji `server.ts` přes `mergeServers`. */
export const area = defineModuleServer({});
