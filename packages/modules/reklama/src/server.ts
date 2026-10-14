import { defineModuleServer, mergeServers } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";
import { area as meta } from "./meta";

/** Serverová část modulu „reklama“: společné entity a příkazy plus oblasti. */
export const server = mergeServers(defineModuleServer({ entities, commands }), meta);

export { adAccountEntity, adCampaignEntity, entities } from "./entities";
export { ad, adAccount, adCampaign, adInsightDaily, adSet, leadFormMapping } from "./schema";
