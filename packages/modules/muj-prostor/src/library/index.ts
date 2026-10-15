import { defineModuleServer } from "@rebar/core/module-server";
import { libraryCommands } from "./commands";

/** Serverová oblast „library“ modulu „muj-prostor“ (KNI-01, KNI-02); zapojuje ji `server.ts` přes `mergeServers`. */
export const area = defineModuleServer({ commands: libraryCommands });
