import { defineModuleServer } from "@rebar/core/module-server";
import { activitiesLayer } from "./calendar";
import { activityCommands } from "./commands";
import { activityEntities } from "./entities";
import { activityJobs } from "./jobs";

/**
 * Serverová část oblasti CRM „aktivity“ (docs/CRM.md → Oblast B): entity `crm_activity`, `crm_note`, `crm_activity_type`,
 * příkazy `crm.activity.*`, `crm.note.*`, `crm.timeline.get`, kalendářní vrstva a plánované úlohy (ranní přehledy, hnití).
 */
export const area = defineModuleServer({
  entities: activityEntities,
  commands: activityCommands,
  calendarLayers: [activitiesLayer],
  jobs: activityJobs,
});

export { activityEntity, noteEntity, activityTypeEntity } from "./entities";
