import { defineModuleServer, mergeServers } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";
import { area as deals } from "./deals";

/** Serverová část modulu „obchody“: společné entity a příkazy plus oblasti. */
export const server = mergeServers(defineModuleServer({ entities, commands }), deals);
