import { defineModuleServer, mergeServers } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";
import { area as google } from "./google";

/** Serverová část modulu „kalendar“: společné entity a příkazy plus oblast `google` (synchronizace s Google Kalendářem). */
export const server = mergeServers(defineModuleServer({ entities, commands }), google);

export { calendarAccount, calendar, calendarEvent, calendarPush } from "./schema";
