import { z } from "zod";
import { defineModuleJob, defineModuleServer } from "@rebar/core/module-server";
import { googleCommands } from "./commands";
import { envOfJob } from "./env";
import { onTaskChanged } from "./events";
import { processPushQueue, pushJobDef } from "./push";
import { calendarLayer, rangeItems } from "./range";
import { pollAll, syncCalendar } from "./sync";
import { renewWatches, syncCalendarJobDef } from "./watch";

export { completeConnect } from "./connect";
export { handleGoogleWebhook, syncCalendarJobDef } from "./watch";
export { pushJobDef } from "./push";
export { setGoogleClientOverride } from "./env";

/**
 * Serverová oblast „google“ modulu „kalendar“ (synchronizace s Google Kalendářem); zapojuje ji `server.ts`.
 * Úlohy: `kalendar.sync` (každou minutu: záložní čtení kalendářů, které jsou na řadě), `kalendar.sync.calendar`
 * (po webhooku Googlu), `kalendar.push` (fronta zápisu do Googlu), `kalendar.watch.renew` (obnova push kanálů).
 */
export const area = defineModuleServer({
  commands: googleCommands,
  calendarLayers: [calendarLayer],
  eventHandlers: { "task.changed": onTaskChanged },
  jobs: [
    defineModuleJob({
      name: "kalendar.sync",
      schema: z.object({}),
      cron: "* * * * *",
      retryLimit: 0,
      async handler(deps) {
        await pollAll(deps.db, envOfJob(deps));
      },
    }),
    defineModuleJob({
      name: syncCalendarJobDef.name,
      schema: syncCalendarJobDef.schema,
      retryLimit: 2,
      async handler(deps, data) {
        await syncCalendar(
          deps.db,
          envOfJob(deps),
          data.calendarId,
          data.full ? { full: true } : {},
        );
      },
    }),
    defineModuleJob({
      name: pushJobDef.name,
      schema: pushJobDef.schema,
      cron: "* * * * *",
      retryLimit: 0,
      async handler(deps) {
        await processPushQueue(deps.db, envOfJob(deps));
      },
    }),
    defineModuleJob({
      name: "kalendar.watch.renew",
      schema: z.object({}),
      cron: "17 * * * *",
      retryLimit: 0,
      async handler(deps) {
        await renewWatches(deps.db, envOfJob(deps));
      },
    }),
  ],
  privatePaths: [
    {
      name: "kalendar.range.others",
      run: (ctx, deps) =>
        rangeItems(ctx, deps, { from: "2000-01-01", to: "2000-12-31", who: "all" }),
    },
    {
      name: "kalendar.layer",
      run: (ctx, deps) => calendarLayer.items(ctx, { from: "2000-01-01", to: "2030-12-31" }, deps),
    },
  ],
});
