import { defineModuleServer, mergeServers } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";
import { area as google } from "./google";
import { uiServer } from "./ui/widget";

/** Serverová část modulu „kalendar“: společné entity a příkazy plus oblast `google` (synchronizace s Google Kalendářem). */
export const server = mergeServers(defineModuleServer({ entities, commands }), google, uiServer);

export { calendarAccount, calendar, calendarEvent, calendarPush } from "./schema";
export {
  completeConnect,
  handleGoogleWebhook,
  pushJobDef,
  setGoogleClientOverride,
  syncCalendarJobDef,
} from "./google";
export { envOfDeps } from "./google/env";
