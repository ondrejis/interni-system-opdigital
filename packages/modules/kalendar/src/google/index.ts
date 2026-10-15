import { defineModuleServer } from "@rebar/core/module-server";
import { googleCommands } from "./commands";

/** Serverová oblast „google“ modulu „kalendar“ (synchronizace s Google Kalendářem); zapojuje ji `server.ts` přes `mergeServers`. */
export const area = defineModuleServer({ commands: googleCommands });
