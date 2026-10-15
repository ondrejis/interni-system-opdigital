import { defineModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";

/** Serverová oblast „deals“ modulu „obchody“ (OBC-A): příkazy, události `deal.*`, metriky, příspěvky; zapojuje ji `server.ts` přes `mergeServers`. */
export const area = defineModuleServer({ commands });
