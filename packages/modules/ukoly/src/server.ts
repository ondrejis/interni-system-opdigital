import { defineModuleServer, mergeServers } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";
import { area as tasks } from "./tasks";
import { area as notes } from "./notes";

/** Serverová část modulu „ukoly“: společné entity a příkazy plus oblasti. */
export const server = mergeServers(defineModuleServer({ entities, commands }), tasks, notes);

export { taskEntity, noteEntity, taskTypeEntity, entities } from "./entities";
export { createTasksService } from "./service";
export { task, taskType, taskAttendee, note } from "./schema";
