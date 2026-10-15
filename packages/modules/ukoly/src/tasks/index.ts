import { defineModuleServer } from "@rebar/core/module-server";
import { createTasksService } from "../service";
import { taskCommands } from "./commands";
import {
  attention,
  badge,
  calendarLayer,
  clientCard,
  metrics,
  privatePaths,
  widget,
} from "./providers";
import { onTaskChanged, onVisibilityChanged } from "./events";
import { ensureTaskTypes } from "./seed";

/**
 * Serverová oblast „tasks“ modulu „ukoly“ (úkoly a aktivity): příkazy `ukoly.*`, služba `tasks`, metriky a dlaždice,
 * odznak, vrstva kalendáře, příspěvek ke kartě klienta, obsluha událostí (systémová pole obchodu) a seed typů.
 * Zapojuje ji `server.ts` přes `mergeServers`.
 */
export const area = defineModuleServer({
  commands: taskCommands,
  services: { tasks: createTasksService },
  dashboardMetrics: metrics,
  widgets: [widget],
  attention: [attention],
  navBadges: [badge],
  calendarLayers: [calendarLayer],
  contributions: { clientCard: [clientCard] },
  eventHandlers: { "task.changed": onTaskChanged, "visibility.changed": onVisibilityChanged },
  ensure: [ensureTaskTypes],
  privatePaths,
});
