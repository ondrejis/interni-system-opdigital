import { defineModuleServer } from "@rebar/core/module-server";

/** Serverová oblast „data“ modulu „finance“; zapojuje ji `server.ts` přes `mergeServers`. */
export const area = defineModuleServer({});
