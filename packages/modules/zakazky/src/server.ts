import { defineModuleServer, mergeServers } from "@rebar/core/module-server";
import { entities } from "./entities";
import { area as core } from "./core";
import { area as templates } from "./templates";

export { entities, jobEntity, jobTemplateEntity } from "./entities";
export { job, jobMember, jobParticipant, jobPhase, jobTemplate } from "./schema";

/** Serverová část modulu „zakazky“: entity plus oblasti `core` (zakázky) a `templates` (šablony), obojí ZAK-A. */
export const server = mergeServers(defineModuleServer({ entities }), core, templates);
