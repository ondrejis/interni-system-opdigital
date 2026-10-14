import { defineModuleServer } from "@rebar/core/module-server";

/**
 * Serverová oblast „core“ modulu „zakazky“ (ZAK-A: zakázka, fáze, tým, události `project.*`). Zatím prázdná a nezapojená:
 * ZAK-A ji přidá do `server.ts` přes `mergeServers`.
 */
export const area = defineModuleServer({});
