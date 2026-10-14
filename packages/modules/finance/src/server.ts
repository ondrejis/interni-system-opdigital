import { defineModuleServer, mergeServers } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";
import { area as data } from "./data";

/** Serverová část modulu „finance“: společné entity a příkazy plus oblasti. */
export const server = mergeServers(defineModuleServer({ entities, commands }), data);

export { paymentEntity, settlementEntity, entities } from "./entities";
export { payment, paymentAllocation, retainer, settlement, splitRule } from "./schema";
