import { defineModuleServer, mergeServers } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";
import { area as core } from "./core";

export { entities, jobEntity, jobTemplateEntity } from "./entities";
export { job, jobMember, jobParticipant, jobPhase, jobTemplate } from "./schema";
export * from "./commands";

/** Serverová část modulu „zakazky“: společné entity a příkazy plus oblast `core` (ZAK-A). */
export const server = mergeServers(defineModuleServer({ entities, commands }), core);
